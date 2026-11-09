import { context, metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../contract";
import { SafeLogExporter, SafeMetricExporter, SafeSpanExporter } from "./exporters";
import { initNodeTelemetry } from "./node-cli";
import { traceElasticOperation } from "./trace-elastic";

const elastic = vi.hoisted(() => ({ search: vi.fn(), mget: vi.fn(), close: vi.fn() }));
const createElasticClient = vi.hoisted(() => vi.fn());
vi.mock("../elastic", () => ({ createElasticClient }));

const PRIVATE_QUERY = "private-search-text";

const session: Session = {
  id: "1", eventId: "kccncna2026", title: "Sample talk", description: "A short test excerpt.",
  speakers: [{ name: "Example Speaker", company: "Example" }],
  startsAt: "2026-11-10T09:00:00-07:00", endsAt: "2026-11-10T09:30:00-07:00",
  day: "2026-11-10", room: "250 A-C", venue: "Salt Palace", level: "2",
  roomType: "breakout", kind: "talk", restrictions: [], crowdEstimate: "moderate",
  crowdBasis: "Combined breakout room", noiseEstimate: "unknown", noiseBasis: "Unknown",
  captions: "wordly-breakout", sourceUrl: "https://example.com/session/1",
};
const hit = { _source: { ...session } };
const searchResponse = { took: 3, timed_out: false, _shards: { failed: 0 }, hits: { hits: [hit] } };

describe("Elastic operations emit safe spans through real providers", () => {
  let spanExporter: InMemorySpanExporter;
  let metricExporter: InMemoryMetricExporter;
  let logExporter: InMemoryLogRecordExporter;
  let providers: { forceFlush: () => Promise<void>; shutdown: () => Promise<void> }[];

  beforeEach(async () => {
    vi.resetModules();
    createElasticClient.mockReset();
    elastic.search.mockReset();
    elastic.mget.mockReset();
    createElasticClient.mockReturnValue(elastic);
    elastic.search.mockResolvedValue(searchResponse);
    elastic.mget.mockResolvedValue({ docs: [{ _id: "1", found: true, ...hit }] });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resource = resourceFromAttributes({ "service.name": "focustrack" });
    spanExporter = new InMemorySpanExporter();
    const tracerProvider = new BasicTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(new SafeSpanExporter(spanExporter))],
    });
    metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new SafeMetricExporter(metricExporter),
          exportIntervalMillis: 60_000,
        }),
      ],
    });
    logExporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      resource,
      processors: [new SimpleLogRecordProcessor({ exporter: new SafeLogExporter(logExporter) })],
    });
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    trace.setGlobalTracerProvider(tracerProvider);
    metrics.setGlobalMeterProvider(meterProvider);
    logs.setGlobalLoggerProvider(loggerProvider);
    providers = [tracerProvider, meterProvider, loggerProvider];
  });

  afterEach(async () => {
    for (const provider of providers) {
      await provider.shutdown();
    }
    trace.disable();
    metrics.disable();
    logs.disable();
    context.disable();
    vi.restoreAllMocks();
  });

  async function flushAll(): Promise<void> {
    for (const provider of providers) {
      await provider.forceFlush();
    }
  }

  it("emits a safe elastic.search span with mode, count and took from searchSessions", async () => {
    const { searchSessions } = await import("../elastic-search");
    const result = await searchSessions(new URLSearchParams(`q=${PRIVATE_QUERY}`));
    expect(result.mode).toBe("hybrid");
    await flushAll();
    const spans = spanExporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["elastic.search"]);
    expect(spans[0]?.attributes).toMatchObject({
      "elastic.operation": "search",
      "search.mode": "hybrid",
      "search.result_count": 1,
      "search.fallback_used": false,
    });
    expect(typeof spans[0]?.attributes["search.took_ms"]).toBe("number");
    const exported = JSON.stringify({
      spans: spans.map((span) => ({ name: span.name, attributes: span.attributes })),
      logs: logExporter.getFinishedLogRecords().map((record) => ({ body: record.body, attributes: record.attributes })),
    });
    expect(exported).not.toContain(PRIVATE_QUERY);
  });

  it("marks fallback_used when hybrid search fails over to lexical", async () => {
    elastic.search.mockRejectedValueOnce(new Error(`upstream failed for ${PRIVATE_QUERY} hunter2`));
    const { searchSessions } = await import("../elastic-search");
    const result = await searchSessions(new URLSearchParams(`q=${PRIVATE_QUERY}`));
    expect(result.mode).toBe("lexical-fallback");
    await flushAll();
    const spans = spanExporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["elastic.search"]);
    expect(spans[0]?.attributes).toMatchObject({
      "elastic.operation": "search",
      "search.mode": "lexical-fallback",
      "search.fallback_used": true,
    });
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain(PRIVATE_QUERY);
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain("hunter2");
  });

  it("emits a safe elastic.lookup span from getSessionsByIds without the requested ids", async () => {
    const { getSessionsByIds } = await import("../elastic-search");
    const result = await getSessionsByIds(new URLSearchParams("ids=1"));
    expect(result).toHaveLength(1);
    await flushAll();
    const spans = spanExporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["elastic.lookup"]);
    expect(spans[0]?.attributes).toMatchObject({ "elastic.operation": "lookup", "search.result_count": 1 });
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain(PRIVATE_QUERY);
  });
});

describe("initNodeTelemetry for the ingest CLI", () => {
  afterEach(() => {
    trace.disable();
    metrics.disable();
    logs.disable();
    context.disable();
    vi.restoreAllMocks();
  });

  it("is a safe no-op when Dash0 env is missing", async () => {
    const telemetry = initNodeTelemetry({});
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
  });

  it("exports an ingest span on shutdown flush when env is configured", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const exportedSpans: { name: string; attributes: Record<string, unknown> }[] = [];
    const exportedLogBodies: unknown[] = [];
    const telemetry = initNodeTelemetry(
      { DASH0_OTLP_ENDPOINT: "https://ingress.example.test", DASH0_AUTH_TOKEN: "test-token-value" },
      {
        spanExporter: {
          export: (spans, callback) => {
            for (const span of spans) {
              exportedSpans.push({ name: span.name, attributes: { ...span.attributes } });
            }
            callback({ code: 0 });
          },
          shutdown: async () => undefined,
          forceFlush: async () => undefined,
        },
        metricExporter: {
          export: (_metrics, callback) => callback({ code: 0 }),
          forceFlush: async () => undefined,
          shutdown: async () => undefined,
        },
        logExporter: {
          export: (records, callback) => {
            for (const record of records) {
              exportedLogBodies.push(record.body);
            }
            callback({ code: 0 });
          },
          shutdown: async () => undefined,
          forceFlush: async () => undefined,
        },
      },
    );
    await traceElasticOperation("elastic.ingest", { operation: "ingest" }, async (controls) => {
      controls.setSafeAttributes({ resultCount: 6, tookMs: 25 });
      return 6;
    });
    await telemetry.shutdown();
    expect(exportedSpans.map((span) => span.name)).toEqual(["elastic.ingest"]);
    expect(exportedSpans[0]?.attributes).toMatchObject({
      "elastic.operation": "ingest",
      "search.result_count": 6,
      "search.took_ms": 25,
    });
    expect(JSON.stringify(exportedSpans)).not.toContain(PRIVATE_QUERY);
    expect(exportedLogBodies).toEqual(["elastic_operation_completed"]);
  });
});
