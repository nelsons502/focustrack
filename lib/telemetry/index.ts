export { traceElasticOperation } from "./trace-elastic";
export type { TraceElasticControls } from "./trace-elastic";
export { logTelemetry, buildLogRecord } from "./log";
export type { LogLevel, LogRecord } from "./log";
export { resolveTelemetryConfig, signalExporterUrl, traceExporterUrl, metricExporterUrl, logExporterUrl } from "./config";
export type { TelemetryConfig, TelemetryEnv, TelemetrySignal } from "./config";
export { FOCUSTRACK_SCOPE, safeErrorCode, toSafeExportAttributes, toSafeSpanAttributes } from "./sanitize";
export type { ElasticOperation, SafeElasticAttributes, SafeSpanAttributes } from "./sanitize";
export {
  SafeLogExporter,
  SafeMetricExporter,
  SafeSpanExporter,
  sanitizeLogRecordForExport,
  sanitizeResourceMetricsForExport,
  sanitizeSpanForExport,
} from "./exporters";
export { buildTelemetryOtelOptions } from "./otel-options";
export type { TelemetryOtelOptions } from "./otel-options";
export { initNodeTelemetry } from "./node-cli";
export type { NodeTelemetry, NodeTelemetryExporters } from "./node-cli";
