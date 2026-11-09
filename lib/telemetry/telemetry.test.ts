import { describe, expect, it, vi } from "vitest";
import { resolveTelemetryConfig, traceExporterUrl } from "./config";
import { safeErrorCode, safeEventName, toSafeSpanAttributes } from "./sanitize";
import { buildLogRecord } from "./log";
import { traceElasticOperation } from "./trace-elastic";

describe("resolveTelemetryConfig", () => {
  it("is a safe no-op when env is absent or partial", () => {
    expect(resolveTelemetryConfig({}).enabled).toBe(false);
    expect(resolveTelemetryConfig({ DASH0_OTLP_ENDPOINT: "https://ingress.example.test" }).enabled).toBe(false);
    expect(resolveTelemetryConfig({ DASH0_AUTH_TOKEN: "test-token-value" }).enabled).toBe(false);
    expect(resolveTelemetryConfig({ DASH0_OTLP_ENDPOINT: "  ", DASH0_AUTH_TOKEN: "test-token-value" }).enabled).toBe(false);
    expect(resolveTelemetryConfig({ DASH0_OTLP_ENDPOINT: "not a url", DASH0_AUTH_TOKEN: "test-token-value" }).enabled).toBe(false);
    expect(resolveTelemetryConfig({ DASH0_OTLP_ENDPOINT: "http://ingress.example.test", DASH0_AUTH_TOKEN: "test-token-value" }).enabled).toBe(false);
  });

  it("enables only with an https endpoint and a token, without exposing the token", () => {
    const config = resolveTelemetryConfig({
      DASH0_OTLP_ENDPOINT: "https://ingress.eu-west-1.aws.dash0.com",
      DASH0_AUTH_TOKEN: "test-token-value",
    });
    expect(config).toEqual({ enabled: true, endpoint: "https://ingress.eu-west-1.aws.dash0.com" });
    expect(JSON.stringify(config)).not.toContain("test-token-value");
  });

  it("builds an OTLP traces URL without duplicating the suffix", () => {
    expect(traceExporterUrl("https://ingress.example.test")).toBe("https://ingress.example.test/v1/traces");
    expect(traceExporterUrl("https://ingress.example.test/")).toBe("https://ingress.example.test/v1/traces");
    expect(traceExporterUrl("https://ingress.example.test/v1/traces")).toBe("https://ingress.example.test/v1/traces");
  });
});

describe("safe attributes and errors", () => {
  it("keeps only allowlisted fields and drops query-like input smuggled as strings", () => {
    expect(
      toSafeSpanAttributes({
        operation: "search",
        searchMode: "hybrid",
        tookMs: 42,
        resultCount: 3,
        fallbackUsed: false,
      }),
    ).toEqual({
      "elastic.operation": "search",
      "search.mode": "hybrid",
      "search.took_ms": 42,
      "search.result_count": 3,
      "search.fallback_used": false,
    });
    expect(toSafeSpanAttributes({ operation: "my secret query text with spaces" })).toEqual({});
    expect(toSafeSpanAttributes({ operation: "search", searchMode: "other" })).toEqual({
      "elastic.operation": "search",
    });
    expect(toSafeSpanAttributes({ operation: "search", tookMs: -5, resultCount: 1.5 })).toEqual({
      "elastic.operation": "search",
    });
  });

  it("maps errors to a coarse code and never includes messages", () => {
    class BoomError extends Error {}
    expect(safeErrorCode(new BoomError("token hunter2 query text"))).toBe("unknown_error");
    expect(safeErrorCode(new BoomError("token hunter2 query text"))).not.toContain("hunter2");
    expect(safeErrorCode("raw string failure")).toBe("unknown_error");
    expect(safeErrorCode(null)).toBe("unknown_error");
    expect(safeErrorCode({ name: "not an error" })).toBe("unknown_error");
    class ConnectionError extends Error {}
    expect(safeErrorCode(new ConnectionError("token hunter2 query text"))).toBe("ConnectionError");
  });

  it("rejects token-shaped secret strings as event and error names", () => {
    const tokenSecret = "PRIVATE_ERROR_MARKER";
    expect(safeEventName(tokenSecret)).toBe("unknown_event");
    expect(safeEventName("elastic_operation_completed")).toBe("elastic_operation_completed");
    expect(safeEventName("elastic_operation_failed")).toBe("elastic_operation_failed");
    expect(safeEventName("https://elastic.example.test/search?q=secret")).toBe("unknown_event");
    const renamed = new Error("boom");
    renamed.name = tokenSecret;
    expect(safeErrorCode(renamed)).toBe("unknown_error");
  });

  it("builds log records with only safe fields", () => {
    expect(
      buildLogRecord("info", "elastic_operation_completed", {
        operation: "search",
        searchMode: "lexical-fallback",
        tookMs: 10,
        resultCount: 0,
        fallbackUsed: true,
      }),
    ).toMatchObject({
      level: "info",
      event: "elastic_operation_completed",
      "elastic.operation": "search",
      "search.fallback_used": true,
    });
    expect(buildLogRecord("error", "bad event with query text", { operation: "search" }).event).toBe(
      "unknown_event",
    );
  });
});

describe("traceElasticOperation", () => {
  it("runs the callback and returns its result when telemetry is a no-op", async () => {
    const callback = vi.fn(async () => 7);
    await expect(traceElasticOperation("elastic.search", { operation: "search" }, callback)).resolves.toBe(7);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("rethrows callback errors unchanged", async () => {
    const failure = new Error("upstream failed");
    await expect(
      traceElasticOperation("elastic.search", { operation: "search" }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it("supports synchronous callbacks", async () => {
    await expect(traceElasticOperation("elastic.ingest", { operation: "ingest" }, () => "ok")).resolves.toBe("ok");
  });

  it("lets the callback add result fields after the operation, safely", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await traceElasticOperation("elastic.search", { operation: "search" }, async (controls) => {
        controls.setSafeAttributes({ searchMode: "hybrid", tookMs: 12, resultCount: 2, fallbackUsed: false });
        return "done";
      });
      const line = String(info.mock.calls.at(-1)?.[0] ?? "");
      expect(line).toContain('"search.took_ms":12');
      expect(line).toContain('"search.result_count":2');
      expect(line).not.toContain("query");
    } finally {
      info.mockRestore();
    }
  });

  it("register is a no-op without nodejs runtime or Dash0 env", async () => {
    const { register } = await import("../../instrumentation");
    const previousRuntime = process.env.NEXT_RUNTIME;
    const previousEndpoint = process.env.DASH0_OTLP_ENDPOINT;
    const previousToken = process.env.DASH0_AUTH_TOKEN;
    try {
      delete process.env.DASH0_OTLP_ENDPOINT;
      delete process.env.DASH0_AUTH_TOKEN;
      delete process.env.NEXT_RUNTIME;
      await expect(register()).resolves.toBeUndefined();
      process.env.NEXT_RUNTIME = "edge";
      await expect(register()).resolves.toBeUndefined();
      process.env.NEXT_RUNTIME = "nodejs";
      await expect(register()).resolves.toBeUndefined();
    } finally {
      if (previousRuntime === undefined) {
        delete process.env.NEXT_RUNTIME;
      } else {
        process.env.NEXT_RUNTIME = previousRuntime;
      }
      if (previousEndpoint === undefined) {
        delete process.env.DASH0_OTLP_ENDPOINT;
      } else {
        process.env.DASH0_OTLP_ENDPOINT = previousEndpoint;
      }
      if (previousToken === undefined) {
        delete process.env.DASH0_AUTH_TOKEN;
      } else {
        process.env.DASH0_AUTH_TOKEN = previousToken;
      }
    }
  });
});
