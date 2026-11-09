import { context, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { FOCUSTRACK_SCOPE, safeErrorCode, safeEventName, toSafeSpanAttributes } from "./sanitize.ts";
import type { SafeElasticAttributes } from "./sanitize.ts";

export type LogLevel = "info" | "warn" | "error";

export type LogRecord = Record<string, string | number | boolean>;

export function buildLogRecord(level: LogLevel, event: string, fields: SafeElasticAttributes, error?: unknown): LogRecord {
  const record: LogRecord = {
    level,
    event: safeEventName(event),
    ...toSafeSpanAttributes(fields),
  };
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (spanContext && spanContext.traceId !== "00000000000000000000000000000000") {
    record.trace_id = spanContext.traceId;
    record.span_id = spanContext.spanId;
  }
  if (error !== undefined) {
    record.error_code = safeErrorCode(error);
  }
  return record;
}

const SEVERITY: Record<LogLevel, { number: SeverityNumber; text: string }> = {
  info: { number: SeverityNumber.INFO, text: "INFO" },
  warn: { number: SeverityNumber.WARN, text: "WARN" },
  error: { number: SeverityNumber.ERROR, text: "ERROR" },
};

function emitOtelLog(level: LogLevel, event: string, fields: SafeElasticAttributes, error?: unknown): void {
  try {
    const attributes: Record<string, string | number | boolean> = { ...toSafeSpanAttributes(fields) };
    if (error !== undefined) {
      attributes.error_code = safeErrorCode(error);
    }
    const safeName = safeEventName(event);
    logs.getLogger(FOCUSTRACK_SCOPE).emit({
      severityNumber: SEVERITY[level].number,
      severityText: SEVERITY[level].text,
      body: safeName,
      eventName: safeName,
      attributes,
      context: context.active(),
    });
  } catch {
    return;
  }
}

export function logTelemetry(level: LogLevel, event: string, fields: SafeElasticAttributes, error?: unknown): void {
  emitOtelLog(level, event, fields, error);
  const line = JSON.stringify(buildLogRecord(level, event, fields, error));
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
