import { trace } from "@opentelemetry/api";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTelemetryOtelOptions } from "./otel-options";
import { FOCUSTRACK_SCOPE } from "./sanitize";

const UNSAFE_URL = "https://secret.example/sensitive?token=abc123";
const UNSAFE_EXCEPTION_MARKER = "UNSAFE_EXCEPTION_MARKER";

// Guards the MAJOR: @vercel/otel resolves `spanProcessors` as
// `(configured ?? ["auto"])`, so omitting it always registers automatic
// exporter-backed processors next to our SafeSpanExporter. When the runtime
// env carries OTLP settings (e.g. OTEL_EXPORTER_OTLP_ENDPOINT, as in our
// Dash0/K8s environments), the auto branch builds a RAW OTLP exporter that
// ships unfiltered URLs, exceptions and tracestate past the privacy boundary.
// This test registers the REAL SDK (no @vercel/otel mock) with fetch stubbed
// at the transport layer, and proves an unsafe span never leaves the process
// while the safe path still exports.
describe("automatic span processor guard (real @vercel/otel registration)", () => {
  const bodies: string[] = [];
  let realFetch: typeof fetch | undefined;
  let savedOtlpEndpoint: string | undefined;

  beforeEach(() => {
    bodies.length = 0;
    savedOtlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // OTLP env present (as in our runtime) arms the SDK's automatic raw path.
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://capture.local";
    realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
      const body = (init as { body?: unknown } | undefined)?.body;
      if (typeof body === "string") {
        bodies.push(body);
      } else if (body instanceof Uint8Array) {
        bodies.push(Buffer.from(body).toString("utf8"));
      } else if (body instanceof ArrayBuffer) {
        bodies.push(Buffer.from(body).toString("utf8"));
      }
      return new Response("{}");
    }) as typeof fetch;
  });

  afterAll(async () => {
    if (savedOtlpEndpoint === undefined) {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    } else {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedOtlpEndpoint;
    }
    if (realFetch) {
      globalThis.fetch = realFetch;
    }
    const provider = (trace.getTracerProvider() as unknown as { getDelegate(): { shutdown(): Promise<void> } }).getDelegate();
    await provider.shutdown().catch(() => undefined);
    vi.unstubAllGlobals?.();
  });

  it("exports only safe spans through the configured exporter", async () => {
    const options = buildTelemetryOtelOptions("http://capture.local", "test-token");


    const { registerOTel } = await import("@vercel/otel");
    registerOTel(options);

    const unsafe = trace.getTracer("untrusted-third-party").startSpan("untrusted.operation", {
      attributes: { "http.url": UNSAFE_URL, "http.target": "/sensitive?token=abc123" },
    });
    unsafe.recordException(new Error(`${UNSAFE_EXCEPTION_MARKER} failure`));
    unsafe.end();

    trace
      .getTracer(FOCUSTRACK_SCOPE)
      .startSpan("elastic.search", { attributes: { "elastic.operation": "search" } })
      .end();

    const provider = (trace.getTracerProvider() as unknown as { getDelegate(): { forceFlush(): Promise<void> } }).getDelegate();
    await provider.forceFlush();
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && bodies.length === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const payload = bodies.join("\n");
    expect(payload).toContain("elastic.search");
    expect(payload).not.toContain("secret.example");
    expect(payload).not.toContain(UNSAFE_EXCEPTION_MARKER);
    expect(payload).not.toContain("http.url");
  }, 30000);
});
