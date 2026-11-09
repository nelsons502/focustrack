import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Counter, Histogram, Meter } from "@opentelemetry/api";
import { logTelemetry } from "./log.ts";
import { FOCUSTRACK_SCOPE, safeErrorCode, safeSpanNameValue, toSafeSpanAttributes } from "./sanitize.ts";
import type { SafeElasticAttributes } from "./sanitize.ts";

let cachedMeter: Meter | undefined;
let operationCounter: Counter | undefined;
let operationDuration: Histogram | undefined;

function recordMetrics(attributes: SafeElasticAttributes, startedAt: number, failed: boolean): void {
  const meter = metrics.getMeter(FOCUSTRACK_SCOPE);
  if (meter !== cachedMeter) {
    cachedMeter = meter;
    operationCounter = meter.createCounter("focustrack.elastic.operations", { unit: "{operation}" });
    operationDuration = meter.createHistogram("focustrack.elastic.duration_ms", { unit: "ms" });
  }
  if (!operationCounter || !operationDuration) {
    return;
  }
  const safe = toSafeSpanAttributes(attributes);
  const labels: Record<string, string> = {};
  const operation = safe["elastic.operation"];
  const mode = safe["search.mode"];
  if (typeof operation === "string") {
    labels["elastic.operation"] = operation;
  }
  if (typeof mode === "string") {
    labels["search.mode"] = mode;
  }
  labels.outcome = failed ? "error" : "success";
  operationCounter.add(1, labels);
  operationDuration.record(Math.max(0, Date.now() - startedAt), labels);
}

export type TraceElasticControls = {
  setSafeAttributes: (updates: Partial<SafeElasticAttributes>) => void;
};

export async function traceElasticOperation<T>(
  name: string,
  safeAttributes: SafeElasticAttributes,
  callback: (controls: TraceElasticControls) => Promise<T> | T,
): Promise<T> {
  const spanName = safeSpanNameValue(name);
  const startedAt = Date.now();
  return trace.getTracer(FOCUSTRACK_SCOPE).startActiveSpan(spanName, { attributes: toSafeSpanAttributes(safeAttributes) }, async (span) => {
    let effective: SafeElasticAttributes = { ...safeAttributes };
    const controls: TraceElasticControls = {
      setSafeAttributes: (updates) => {
        effective = { ...effective, ...updates };
        span.setAttributes(toSafeSpanAttributes(effective));
      },
    };
    try {
      const result = await callback(controls);
      span.setStatus({ code: SpanStatusCode.OK });
      recordMetrics(effective, startedAt, false);
      logTelemetry("info", "elastic_operation_completed", effective);
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute("error.code", safeErrorCode(error));
      recordMetrics(effective, startedAt, true);
      logTelemetry("error", "elastic_operation_failed", effective, error);
      throw error;
    } finally {
      span.end();
    }
  });
}
