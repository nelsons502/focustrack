import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SafeLogExporter, SafeMetricExporter, SafeSpanExporter } from "./exporters";

const captured = vi.hoisted(() => ({
  registerOTel: vi.fn(),
  traceExporterConfigs: [] as unknown[],
  metricExporterConfigs: [] as unknown[],
  logExporterConfigs: [] as unknown[],
}));

vi.mock("@vercel/otel", () => ({
  registerOTel: captured.registerOTel,
  OTLPHttpProtoTraceExporter: class {
    constructor(config: unknown) {
      captured.traceExporterConfigs.push(config);
    }
    export(_spans: unknown, cb: (r: { code: number }) => void) {
      cb({ code: 0 });
    }
    async shutdown() {
      return undefined;
    }
  },
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: class {
    constructor(config: unknown) {
      captured.metricExporterConfigs.push(config);
    }
    export(_metrics: unknown, cb: (r: { code: number }) => void) {
      cb({ code: 0 });
    }
    async forceFlush() {
      return undefined;
    }
    async shutdown() {
      return undefined;
    }
  },
}));

vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({
  OTLPLogExporter: class {
    constructor(config: unknown) {
      captured.logExporterConfigs.push(config);
    }
    export(_logs: unknown, cb: (r: { code: number }) => void) {
      cb({ code: 0 });
    }
    async forceFlush() {
      return undefined;
    }
    async shutdown() {
      return undefined;
    }
  },
}));

type FakeConfig = { url?: string; headers?: Record<string, string> };

describe("instrumentation register() wiring", () => {
  const saved = {
    runtime: process.env.NEXT_RUNTIME,
    endpoint: process.env.DASH0_OTLP_ENDPOINT,
    token: process.env.DASH0_AUTH_TOKEN,
  };

  beforeEach(() => {
    captured.registerOTel.mockClear();
    captured.traceExporterConfigs.length = 0;
    captured.metricExporterConfigs.length = 0;
    captured.logExporterConfigs.length = 0;
  });

  afterEach(() => {
    for (const [key, value] of [
      ["NEXT_RUNTIME", saved.runtime],
      ["DASH0_OTLP_ENDPOINT", saved.endpoint],
      ["DASH0_AUTH_TOKEN", saved.token],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("configures safe trace, metric reader and log processor exporters when Dash0 env is set", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DASH0_OTLP_ENDPOINT = "https://ingress.example.test";
    process.env.DASH0_AUTH_TOKEN = "test-token-value";

    const { register } = await import("../../instrumentation");
    await register();

    expect(captured.registerOTel).toHaveBeenCalledOnce();
    const options = captured.registerOTel.mock.calls[0]?.[0] as {
      serviceName?: string;
      traceExporter?: unknown;
      metricReaders?: unknown[];
      logRecordProcessors?: unknown[];
    };
    expect(options.serviceName).toBe("focustrack");
    expect(options.traceExporter).toBeInstanceOf(SafeSpanExporter);
    expect(options.metricReaders).toHaveLength(1);
    expect(options.logRecordProcessors).toHaveLength(1);

    expect(captured.traceExporterConfigs).toEqual([
      { url: "https://ingress.example.test/v1/traces", headers: { Authorization: "Bearer test-token-value" } },
    ]);
    expect(captured.metricExporterConfigs).toEqual([
      { url: "https://ingress.example.test/v1/metrics", headers: { Authorization: "Bearer test-token-value" } },
    ]);
    expect(captured.logExporterConfigs).toEqual([
      { url: "https://ingress.example.test/v1/logs", headers: { Authorization: "Bearer test-token-value" } },
    ]);
    expect((options.traceExporter as SafeSpanExporter).delegate).toBeDefined();
  });

  it("derives each signal URL when the endpoint already carries a signal path", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DASH0_OTLP_ENDPOINT = "https://ingress.example.test/v1/traces";
    process.env.DASH0_AUTH_TOKEN = "test-token-value";

    const { register } = await import("../../instrumentation");
    await register();

    expect((captured.traceExporterConfigs[0] as FakeConfig).url).toBe("https://ingress.example.test/v1/traces");
    expect((captured.metricExporterConfigs[0] as FakeConfig).url).toBe("https://ingress.example.test/v1/metrics");
    expect((captured.logExporterConfigs[0] as FakeConfig).url).toBe("https://ingress.example.test/v1/logs");
  });

  it("is a no-op (no reader, processor or exporter created) when Dash0 env is absent or invalid", async () => {
    const { register } = await import("../../instrumentation");
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.DASH0_OTLP_ENDPOINT;
    delete process.env.DASH0_AUTH_TOKEN;
    await register();
    process.env.DASH0_OTLP_ENDPOINT = "http://ingress.example.test";
    process.env.DASH0_AUTH_TOKEN = "test-token-value";
    await register();
    process.env.NEXT_RUNTIME = "edge";
    process.env.DASH0_OTLP_ENDPOINT = "https://ingress.example.test";
    await register();
    expect(captured.registerOTel).not.toHaveBeenCalled();
    expect(captured.traceExporterConfigs).toEqual([]);
    expect(captured.metricExporterConfigs).toEqual([]);
    expect(captured.logExporterConfigs).toEqual([]);
  });

  it("exposes typed safe wrapper classes for metrics/logs used by the builder", () => {
    expect(typeof SafeMetricExporter).toBe("function");
    expect(typeof SafeLogExporter).toBe("function");
  });
});
