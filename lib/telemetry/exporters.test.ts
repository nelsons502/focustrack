import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { context, metrics, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Context, ContextManager } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logExporterUrl, metricExporterUrl, signalExporterUrl, traceExporterUrl } from "./config";
import {
  SafeLogExporter,
  SafeMetricExporter,
  SafeSpanExporter,
  safeResource,
  sanitizeLogRecordForExport,
  sanitizeResourceMetricsForExport,
  sanitizeSpanForExport,
} from "./exporters";
import { logTelemetry } from "./log";
import { traceElasticOperation } from "./trace-elastic";

const SECRET_QUERY = "secret-query-text";
const TOKEN_SECRET = "PRIVATE_ERROR_MARKER";
const PRIVATE_TRACESTATE = "vendor=private-header-text-hunter2";

function fakeTraceState() {
  return {
    set: () => fakeTraceState(),
    get: () => "private-header-text-hunter2",
    unset: () => fakeTraceState(),
    serialize: () => PRIVATE_TRACESTATE,
  };
}
const SECRET_URL = `https://elastic.example.test/focustrack/_search?q=${SECRET_QUERY}&token=hunter2`;

function fakeResource(attributes: Record<string, string> = {}) {
  return {
    attributes: {
      "service.name": "focustrack",
      "telemetry.sdk.name": "opentelemetry",
      "vercel.host": "deployment.example.test",
      "custom.url": SECRET_URL,
      ...attributes,
    },
  } as unknown as ReadableSpan["resource"];
}

function fakeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: `GET ${SECRET_URL}`,
    kind: SpanKind.CLIENT,
    spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
    parentSpanContext: { traceId: "a".repeat(32), spanId: "c".repeat(16), traceFlags: 1 },
    startTime: [1, 0],
    endTime: [1, 500],
    status: { code: SpanStatusCode.ERROR, message: `fetch failed for ${SECRET_URL} hunter2` },
    attributes: {
      "url.full": SECRET_URL,
      "url.query": `q=${SECRET_QUERY}`,
      "http.url": SECRET_URL,
      "elastic.operation": "search",
      "search.mode": "hybrid",
      "search.took_ms": 42,
      "search.result_count": 3,
      "search.fallback_used": false,
      "error.code": "ConnectionError",
      "db.statement": SECRET_QUERY,
    },
    links: [{ context: { traceId: "a".repeat(32), spanId: "d".repeat(16), traceFlags: 1 }, attributes: { url: SECRET_URL } }],
    events: [
      {
        name: "exception",
        attributes: {
          "exception.type": "Error",
          "exception.message": `boom ${SECRET_QUERY} hunter2`,
          "exception.stacktrace": `Error: boom\n at ${SECRET_URL}`,
        },
        time: [1, 100],
        droppedAttributesCount: 0,
      },
    ],
    duration: [0, 500],
    ended: true,
    resource: fakeResource(),
    instrumentationScope: { name: "focustrack-elastic" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ...overrides,
  } as ReadableSpan;
}

describe("process-owned export resource identity", () => {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("reuses our UUID across resource sanitization and module reloads, replacing upstream identifiers", async () => {
    const first = safeResource(fakeResource()).attributes["service.instance.id"];
    expect(first).toMatch(uuidV4);
    for (const untrusted of ["private-pod-hostname", "11111111-1111-4111-8111-111111111111"]) {
      const safe = safeResource(fakeResource({ "service.name": "private-user", "service.instance.id": untrusted }));
      expect(safe.attributes["service.instance.id"]).toBe(first);
      expect(safe.attributes["service.name"]).toBe("focustrack");
      expect(JSON.stringify(safe.attributes)).not.toContain(untrusted);
    }
    vi.resetModules();
    const reloaded = await import("./exporters");
    expect(reloaded.safeResource(fakeResource()).attributes["service.instance.id"]).toBe(first);
  });

  it("gives independent Node processes distinct writer identities, stable across module copies", () => {
    const resourceUrl = pathToFileURL(`${process.cwd()}/lib/telemetry/resource.ts`).href;
    const script = `
      const a = await import(${JSON.stringify(resourceUrl + "?a")});
      const b = await import(${JSON.stringify(resourceUrl + "?b")});
      console.log(JSON.stringify([a.processInstanceId(), b.processInstanceId()]));
    `;
    const run = () => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8" })) as string[];
    const first = run();
    const second = run();
    expect(first[0]).toMatch(uuidV4);
    expect(second[0]).toMatch(uuidV4);
    expect(first[1]).toBe(first[0]);
    expect(second[1]).toBe(second[0]);
    expect(second[0]).not.toBe(first[0]);
  });
});

describe("signal exporter URLs", () => {
  it("derives traces, metrics and logs URLs from a base endpoint", () => {
    expect(traceExporterUrl("https://ingress.example.test")).toBe("https://ingress.example.test/v1/traces");
    expect(metricExporterUrl("https://ingress.example.test")).toBe("https://ingress.example.test/v1/metrics");
    expect(logExporterUrl("https://ingress.example.test/")).toBe("https://ingress.example.test/v1/logs");
    expect(signalExporterUrl("https://ingress.example.test", "metrics")).toBe(
      "https://ingress.example.test/v1/metrics",
    );
  });

  it("does not append after an existing signal path", () => {
    expect(metricExporterUrl("https://ingress.example.test/v1/traces")).toBe(
      "https://ingress.example.test/v1/metrics",
    );
    expect(logExporterUrl("https://ingress.example.test/v1/metrics")).toBe("https://ingress.example.test/v1/logs");
    expect(traceExporterUrl("https://ingress.example.test/v1/logs")).toBe("https://ingress.example.test/v1/traces");
    expect(traceExporterUrl("https://ingress.example.test/v1/traces/")).toBe(
      "https://ingress.example.test/v1/traces",
    );
  });
});

describe("sanitizeSpanForExport (privacy regression)", () => {
  it("drops automatic spans from any other instrumentation scope entirely", () => {
    for (const scope of ["@vercel/otel/fetch", "next.js", "http", "@opentelemetry/instrumentation-fetch"]) {
      expect(sanitizeSpanForExport(fakeSpan({ instrumentationScope: { name: scope } }))).toBeNull();
    }
  });

  it("rebuilds a safe span: name from operation, allowlisted attributes, no events/links/status message", () => {
    const safe = sanitizeSpanForExport(fakeSpan());
    expect(safe).not.toBeNull();
    expect(safe?.name).toBe("elastic.search");
    expect(safe?.attributes).toEqual({
      "elastic.operation": "search",
      "search.mode": "hybrid",
      "search.took_ms": 42,
      "search.result_count": 3,
      "search.fallback_used": false,
      "error.code": "ConnectionError",
    });
    expect(safe?.events).toEqual([]);
    expect(safe?.links).toEqual([]);
    expect(safe?.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(safe?.spanContext().traceId).toBe("a".repeat(32));
    const serialized = JSON.stringify({
      name: safe?.name,
      attributes: safe?.attributes,
      status: safe?.status,
      resource: safe?.resource.attributes,
      scope: safe?.instrumentationScope,
    });
    expect(serialized).not.toContain(SECRET_QUERY);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("elastic.example.test");
    expect(safe?.resource.attributes["service.name"]).toBe("focustrack");
  });

  it("falls back to a generic name and drops invalid allowlisted values", () => {
    const safe = sanitizeSpanForExport(
      fakeSpan({
        attributes: {
          "elastic.operation": SECRET_QUERY,
          "search.mode": "other",
          "search.took_ms": -1,
          "search.result_count": 1.5,
          "search.fallback_used": "yes" as unknown as boolean,
          "error.code": `raw message with spaces ${SECRET_QUERY}`,
        },
      }),
    );
    expect(safe?.name).toBe("elastic.operation");
    expect(safe?.attributes).toEqual({ "error.code": "unknown_error" });
  });

  it("strips inbound tracestate from span and parent contexts and rebuilds the scope", () => {
    const safe = sanitizeSpanForExport(
      fakeSpan({
        spanContext: () => ({
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          traceFlags: 1,
          isRemote: true,
          traceState: fakeTraceState(),
        }),
        parentSpanContext: {
          traceId: "a".repeat(32),
          spanId: "c".repeat(16),
          traceFlags: 1,
          isRemote: true,
          traceState: fakeTraceState(),
        },
        instrumentationScope: { name: "focustrack-elastic", version: TOKEN_SECRET, schemaUrl: SECRET_URL },
      }),
    );
    expect(safe?.spanContext()).toEqual({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      traceFlags: 1,
      isRemote: true,
    });
    expect(safe?.parentSpanContext).toEqual({
      traceId: "a".repeat(32),
      spanId: "c".repeat(16),
      traceFlags: 1,
      isRemote: true,
    });
    expect(safe?.spanContext().traceState).toBeUndefined();
    expect(safe?.parentSpanContext?.traceState).toBeUndefined();
    expect(safe?.instrumentationScope).toEqual({ name: "focustrack-elastic" });
    expect(JSON.stringify(safe?.instrumentationScope)).not.toContain(TOKEN_SECRET);
    expect(JSON.stringify(safe?.instrumentationScope)).not.toContain("elastic.example.test");
  });

  it("maps token-shaped secret event and error strings to fixed unknown values", () => {
    const safe = sanitizeSpanForExport(fakeSpan({ attributes: { "elastic.operation": "search", "error.code": TOKEN_SECRET } }));
    expect(safe?.attributes).toEqual({ "elastic.operation": "search", "error.code": "unknown_error" });
    expect(JSON.stringify(safe?.attributes)).not.toContain(TOKEN_SECRET);
  });

  it("SafeSpanExporter exports only sanitized custom spans and succeeds silently when none remain", () => {
    const seen: ReadableSpan[][] = [];
    const delegate = {
      export: vi.fn((spans: ReadableSpan[], cb: (r: { code: number }) => void) => {
        seen.push(spans);
        cb({ code: 0 });
      }),
      shutdown: vi.fn(async () => undefined),
    };
    const exporter = new SafeSpanExporter(delegate);
    const callback = vi.fn();
    exporter.export(
      [fakeSpan({ instrumentationScope: { name: "next.js" } }), fakeSpan()],
      callback,
    );
    expect(delegate.export).toHaveBeenCalledOnce();
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]?.[0]?.name).toBe("elastic.search");
    expect(JSON.stringify(seen[0]?.[0]?.attributes)).not.toContain(SECRET_QUERY);

    exporter.export([fakeSpan({ instrumentationScope: { name: "next.js" } })], callback);
    expect(delegate.export).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenLastCalledWith({ code: 0 });
  });
});

describe("sanitizeResourceMetricsForExport (privacy regression)", () => {
  function fakeMetrics(): ResourceMetrics {
    return {
      resource: fakeResource(),
      scopeMetrics: [
        {
          scope: { name: "next.js" },
          metrics: [
            {
              descriptor: { name: "http.requests", description: "", unit: "", valueType: 0 },
              aggregationTemporality: 1,
              dataPointType: DataPointType.SUM,
              isMonotonic: true,
              dataPoints: [{ attributes: { "url.full": SECRET_URL }, startTime: [1, 0], endTime: [2, 0], value: 1 }],
            },
          ],
        },
        {
          scope: { name: "focustrack-elastic" },
          metrics: [
            {
              descriptor: { name: "focustrack.elastic.operations", description: "", unit: "", valueType: 0 },
              aggregationTemporality: 1,
              dataPointType: DataPointType.SUM,
              isMonotonic: true,
              dataPoints: [
                {
                  attributes: {
                    "elastic.operation": "search",
                    "search.mode": "hybrid",
                    outcome: "success",
                    "url.full": SECRET_URL,
                    query: SECRET_QUERY,
                  },
                  startTime: [1, 0],
                  endTime: [2, 0],
                  value: 5,
                },
              ],
            },
          ],
        },
      ],
    } as ResourceMetrics;
  }

  it("keeps only the focustrack scope and allowlisted data point attributes, preserving values", () => {
    const safe = sanitizeResourceMetricsForExport(fakeMetrics());
    expect(safe.scopeMetrics).toHaveLength(1);
    expect(safe.scopeMetrics[0]?.scope.name).toBe("focustrack-elastic");
    const point = safe.scopeMetrics[0]?.metrics[0]?.dataPoints[0];
    expect(point?.attributes).toEqual({ "elastic.operation": "search", "search.mode": "hybrid", outcome: "success" });
    expect(point?.value).toBe(5);
    expect(JSON.stringify(safe)).not.toContain(SECRET_QUERY);
    expect(JSON.stringify(safe)).not.toContain("hunter2");
    expect(safe.resource.attributes["service.name"]).toBe("focustrack");
  });

  it("rebuilds contaminated scopes and descriptors, drops unknown instruments and exemplar metadata", () => {
    const contaminated = {
      resource: fakeResource(),
      scopeMetrics: [
        {
          scope: { name: "focustrack-elastic", version: TOKEN_SECRET, schemaUrl: SECRET_URL },
          metrics: [
            {
              descriptor: { name: TOKEN_SECRET, description: SECRET_QUERY, unit: SECRET_QUERY, valueType: 0 },
              aggregationTemporality: 1,
              dataPointType: DataPointType.SUM,
              isMonotonic: true,
              dataPoints: [{ attributes: {}, startTime: [1, 0], endTime: [2, 0], value: 99 }],
            },
            {
              descriptor: { name: "focustrack.elastic.duration_ms", description: SECRET_QUERY, unit: TOKEN_SECRET, valueType: 1 },
              aggregationTemporality: 1,
              dataPointType: DataPointType.HISTOGRAM,
              dataPoints: [
                {
                  attributes: { "elastic.operation": "search", outcome: "success", query: SECRET_QUERY },
                  startTime: [1, 0],
                  endTime: [2, 0],
                  value: { count: 2, sum: 30, buckets: { boundaries: [10], counts: [1, 1] } },
                  exemplars: [
                    {
                      filteredAttributes: { query: SECRET_QUERY, token: TOKEN_SECRET },
                      value: 12,
                      timestamp: [1, 5],
                      spanId: "b".repeat(16),
                      traceId: "a".repeat(32),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as ResourceMetrics;
    const safe = sanitizeResourceMetricsForExport(contaminated);
    expect(safe.scopeMetrics).toHaveLength(1);
    expect(safe.scopeMetrics[0]?.scope).toEqual({ name: "focustrack-elastic" });
    expect(safe.scopeMetrics[0]?.metrics).toHaveLength(1);
    expect(safe.scopeMetrics[0]?.metrics[0]?.descriptor).toEqual({
      name: "focustrack.elastic.duration_ms",
      description: "",
      unit: "ms",
      valueType: 1,
    });
    const point = safe.scopeMetrics[0]?.metrics[0]?.dataPoints[0] as unknown as Record<string, unknown>;
    expect(point?.attributes).toEqual({ "elastic.operation": "search", outcome: "success" });
    expect(point?.value).toMatchObject({ count: 2, sum: 30 });
    expect(point).not.toHaveProperty("exemplars");
    expect(JSON.stringify(safe)).not.toContain(SECRET_QUERY);
    expect(JSON.stringify(safe)).not.toContain(TOKEN_SECRET);
    expect(JSON.stringify(safe)).not.toContain("elastic.example.test");
  });

  it("SafeMetricExporter delegates sanitized metrics", () => {
    const delegate = {
      export: vi.fn((_m: ResourceMetrics, cb: (r: { code: number }) => void) => cb({ code: 0 })),
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
    };
    const exporter = new SafeMetricExporter(delegate);
    exporter.export(fakeMetrics(), vi.fn());
    const exported = delegate.export.mock.calls[0]?.[0] as ResourceMetrics;
    expect(exported.scopeMetrics).toHaveLength(1);
    expect(exported.scopeMetrics[0]?.metrics[0]?.descriptor.unit).toBe("{operation}");
    expect(JSON.stringify(exported)).not.toContain(SECRET_QUERY);
  });
});

describe("sanitizeLogRecordForExport (privacy regression)", () => {
  function fakeLog(overrides: Partial<ReadableLogRecord> = {}): ReadableLogRecord {
    return {
      hrTime: [1, 0],
      hrTimeObserved: [1, 0],
      spanContext: { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 },
      severityText: `ERROR ${SECRET_QUERY}`,
      severityNumber: SeverityNumber.ERROR,
      body: `failed query ${SECRET_QUERY} at ${SECRET_URL}`,
      eventName: `raw event ${SECRET_QUERY}`,
      resource: fakeResource(),
      instrumentationScope: { name: "focustrack-elastic" },
      attributes: {
        "elastic.operation": "search",
        "search.result_count": 0,
        error_code: "ConnectionError",
        "url.full": SECRET_URL,
        notes: SECRET_QUERY,
      },
      droppedAttributesCount: 0,
      ...overrides,
    } as ReadableLogRecord;
  }

  it("drops log records from other scopes and sanitizes ours, keeping trace context", () => {
    expect(sanitizeLogRecordForExport(fakeLog({ instrumentationScope: { name: "other" } }))).toBeNull();
    const safe = sanitizeLogRecordForExport(fakeLog());
    expect(safe).not.toBeNull();
    expect(safe?.body).toBe("unknown_event");
    expect(safe?.eventName).toBe("unknown_event");
    expect(safe?.severityText).toBe("ERROR");
    expect(safe?.severityNumber).toBe(SeverityNumber.ERROR);
    expect(safe?.attributes).toEqual({
      "elastic.operation": "search",
      "search.result_count": 0,
      error_code: "ConnectionError",
    });
    expect(safe?.spanContext?.traceId).toBe("a".repeat(32));
    expect(JSON.stringify({ ...safe, resource: safe?.resource.attributes })).not.toContain(SECRET_QUERY);
  });

  it("strips tracestate from log context, rebuilds scope and maps token secrets to unknown values", () => {
    const safe = sanitizeLogRecordForExport(
      fakeLog({
        spanContext: {
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          traceFlags: 1,
          isRemote: true,
          traceState: fakeTraceState(),
        },
        body: TOKEN_SECRET,
        eventName: TOKEN_SECRET,
        instrumentationScope: { name: "focustrack-elastic", version: TOKEN_SECRET, schemaUrl: SECRET_URL },
        attributes: { "elastic.operation": "search", error_code: TOKEN_SECRET },
      }),
    );
    expect(safe?.spanContext).toEqual({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      traceFlags: 1,
      isRemote: true,
    });
    expect(safe?.spanContext?.traceState).toBeUndefined();
    expect(safe?.body).toBe("unknown_event");
    expect(safe?.eventName).toBe("unknown_event");
    expect(safe?.instrumentationScope).toEqual({ name: "focustrack-elastic" });
    expect(safe?.attributes).toEqual({ "elastic.operation": "search", error_code: "unknown_error" });
    expect(JSON.stringify({ ...safe, resource: safe?.resource.attributes })).not.toContain(TOKEN_SECRET);
  });

  it("SafeLogExporter delegates only sanitized records", () => {
    const delegate = {
      export: vi.fn((_l: ReadableLogRecord[], cb: (r: { code: number }) => void) => cb({ code: 0 })),
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
    };
    const exporter = new SafeLogExporter(delegate);
    const callback = vi.fn();
    exporter.export([fakeLog({ instrumentationScope: { name: "other" } }), fakeLog()], callback);
    const exported = delegate.export.mock.calls[0]?.[0] as ReadableLogRecord[];
    expect(exported).toHaveLength(1);
    exporter.export([fakeLog({ instrumentationScope: { name: "other" } })], callback);
    expect(delegate.export).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenLastCalledWith({ code: 0 });
  });
});

describe("logTelemetry OTel emission", () => {
  afterEach(() => {
    logs.disable();
    vi.restoreAllMocks();
  });

  it("emits an allowlisted OTel log record (and keeps the safe console mirror)", () => {
    const emitted: unknown[] = [];
    logs.setGlobalLoggerProvider({
      getLogger: () => ({
        emit: (record: unknown) => {
          emitted.push(record);
        },
        enabled: () => true,
      }),
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logTelemetry("info", "elastic_operation_completed", {
      operation: "search",
      searchMode: "hybrid",
      tookMs: 9,
      resultCount: 2,
      fallbackUsed: false,
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "elastic_operation_completed",
      eventName: "elastic_operation_completed",
      attributes: {
        "elastic.operation": "search",
        "search.mode": "hybrid",
        "search.took_ms": 9,
        "search.result_count": 2,
        "search.fallback_used": false,
      },
    });
    expect(JSON.stringify(emitted[0])).not.toContain(SECRET_QUERY);
    expect(info).toHaveBeenCalledOnce();
  });

  it("emits only a coarse error code for failures, never the error message", () => {
    const emitted: unknown[] = [];
    logs.setGlobalLoggerProvider({
      getLogger: () => ({
        emit: (record: unknown) => {
          emitted.push(record);
        },
        enabled: () => true,
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    class BoomError extends Error {}
    logTelemetry("error", "elastic_operation_failed", { operation: "search" }, new BoomError(`hunter2 ${SECRET_QUERY}`));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      attributes: { "elastic.operation": "search", error_code: "unknown_error" },
    });
    expect(JSON.stringify(emitted[0])).not.toContain("hunter2");
    expect(JSON.stringify(emitted[0])).not.toContain(SECRET_QUERY);
  });
});

class AlsContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();
  active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }
  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(ctx, () => fn.apply(thisArg, args));
  }
  bind<T>(ctx: Context, target: T): T {
    if (typeof target === "function") {
      const storage = this.storage;
      return function (this: unknown, ...args: unknown[]) {
        return storage.run(ctx, () => (target as (...a: unknown[]) => unknown).apply(this, args));
      } as T;
    }
    return target;
  }
  enable(): this {
    return this;
  }
  disable(): this {
    this.storage.disable();
    return this;
  }
}

describe("real SDK providers through the safe exporters", () => {
  afterEach(async () => {
    trace.disable();
    metrics.disable();
    logs.disable();
    context.disable();
    vi.restoreAllMocks();
  });

  it("exports the manual span, counter/histogram values and a trace-correlated log; drops auto spans", async () => {
    const resource = resourceFromAttributes({ "service.name": "focustrack" });
    const spanExporter = new InMemorySpanExporter();
    const tracerProvider = new BasicTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(new SafeSpanExporter(spanExporter))],
    });
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new SafeMetricExporter(metricExporter),
          exportIntervalMillis: 60_000,
        }),
      ],
    });
    const logExporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [new SimpleLogRecordProcessor({ exporter: new SafeLogExporter(logExporter) })],
    });
    context.setGlobalContextManager(new AlsContextManager());
    trace.setGlobalTracerProvider(tracerProvider);
    metrics.setGlobalMeterProvider(meterProvider);
    logs.setGlobalLoggerProvider(loggerProvider);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const autoSpan = trace.getTracer("next.js").startSpan(`GET ${SECRET_URL}`, {
      attributes: { "url.full": SECRET_URL },
    });
    autoSpan.recordException(new Error(`boom hunter2 ${SECRET_QUERY}`));
    autoSpan.end();

    await traceElasticOperation("elastic.search", { operation: "search" }, async (controls) => {
      controls.setSafeAttributes({ searchMode: "hybrid", tookMs: 12, resultCount: 2, fallbackUsed: false });
      return "ok";
    });

    await tracerProvider.forceFlush();
    await meterProvider.forceFlush();
    await loggerProvider.forceFlush();

    const spans = spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("elastic.search");
    expect(spans[0]?.attributes).toMatchObject({
      "elastic.operation": "search",
      "search.mode": "hybrid",
      "search.took_ms": 12,
      "search.result_count": 2,
    });
    expect(JSON.stringify(spans)).not.toContain(SECRET_QUERY);

    const exportedMetrics = metricExporter.getMetrics();
    const allMetrics = exportedMetrics.flatMap((rm) => rm.scopeMetrics.flatMap((sm) => sm.metrics));
    const counter = allMetrics.find((m) => m.descriptor.name === "focustrack.elastic.operations");
    const histogram = allMetrics.find((m) => m.descriptor.name === "focustrack.elastic.duration_ms");
    expect(counter?.descriptor.unit).toBe("{operation}");
    expect(histogram?.descriptor.unit).toBe("ms");
    const writer = exportedMetrics[0]?.resource.attributes["service.instance.id"];
    expect(writer).toMatch(/^[0-9a-f-]{36}$/);
    expect(spans[0]?.resource.attributes["service.instance.id"]).toBe(writer);
    expect(counter?.dataPoints[0]?.value).toBe(1);
    expect(counter?.dataPoints[0]?.attributes).toEqual({
      "elastic.operation": "search",
      "search.mode": "hybrid",
      outcome: "success",
    });
    const histogramPoint = histogram?.dataPoints[0]?.value as { count: number } | undefined;
    expect(histogramPoint?.count).toBe(1);

    const records = logExporter.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.resource.attributes["service.instance.id"]).toBe(writer);
    expect(records[0]?.body).toBe("elastic_operation_completed");
    expect(records[0]?.attributes).toMatchObject({ "elastic.operation": "search", "search.took_ms": 12 });
    expect(records[0]?.spanContext?.traceId).toBe(spans[0]?.spanContext().traceId);
    expect(records[0]?.spanContext?.spanId).toBe(spans[0]?.spanContext().spanId);

    await tracerProvider.shutdown();
    await meterProvider.shutdown();
    await loggerProvider.shutdown();
  });

  it("strips inherited tracestate carrying private text from the exported span and log contexts", async () => {
    const resource = resourceFromAttributes({ "service.name": "focustrack" });
    const spanExporter = new InMemorySpanExporter();
    const tracerProvider = new BasicTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(new SafeSpanExporter(spanExporter))],
    });
    const logExporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [new SimpleLogRecordProcessor({ exporter: new SafeLogExporter(logExporter) })],
    });
    const contextManager = new AlsContextManager();
    context.setGlobalContextManager(contextManager);
    contextManager.enable();
    trace.setGlobalTracerProvider(tracerProvider);
    logs.setGlobalLoggerProvider(loggerProvider);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const parentContext = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "a".repeat(32),
      spanId: "c".repeat(16),
      traceFlags: 1,
      isRemote: true,
      traceState: fakeTraceState(),
    });
    await context.with(parentContext, async () => {
      await traceElasticOperation("elastic.search", { operation: "search" }, async (controls) => {
        controls.setSafeAttributes({ resultCount: 1 });
        return "ok";
      });
    });
    await tracerProvider.forceFlush();
    await loggerProvider.forceFlush();

    const spans = spanExporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.spanContext().traceId).toBe("a".repeat(32));
    expect(spans[0]?.spanContext().traceState).toBeUndefined();
    expect(spans[0]?.parentSpanContext?.traceState).toBeUndefined();
    expect(spans[0]?.spanContext().traceState?.serialize() ?? "").not.toContain("private-header-text");
    expect(spans[0]?.parentSpanContext).toMatchObject({ traceId: "a".repeat(32), spanId: "c".repeat(16) });
    expect(spans[0]?.instrumentationScope).toEqual({ name: "focustrack-elastic" });

    const records = logExporter.getFinishedLogRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.spanContext?.traceState).toBeUndefined();
    expect(records[0]?.spanContext?.traceId).toBe("a".repeat(32));

    await tracerProvider.shutdown();
    await loggerProvider.shutdown();
  });
});
