import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { LogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { MetricReader } from "@opentelemetry/sdk-metrics";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { logExporterUrl, metricExporterUrl, traceExporterUrl } from "./config.ts";
import { SafeLogExporter, SafeMetricExporter, SafeSpanExporter } from "./exporters.ts";

export type TelemetryOtelOptions = {
  serviceName: "focustrack";
  // Explicitly empty: @vercel/otel defaults omitted spanProcessors to
  // ["auto"], which registers automatic exporter-backed processors alongside
  // traceExporter and would ship unfiltered spans past SafeSpanExporter.
  spanProcessors: SpanProcessor[];
  traceExporter: SafeSpanExporter;
  metricReaders: MetricReader[];
  logRecordProcessors: LogRecordProcessor[];
};

export function buildTelemetryOtelOptions(endpoint: string, token: string): TelemetryOtelOptions {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    serviceName: "focustrack",
    spanProcessors: [],
    traceExporter: new SafeSpanExporter(
      new OTLPHttpProtoTraceExporter({ url: traceExporterUrl(endpoint), headers }),
    ),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new SafeMetricExporter(new OTLPMetricExporter({ url: metricExporterUrl(endpoint), headers })),
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new SafeLogExporter(new OTLPLogExporter({ url: logExporterUrl(endpoint), headers })),
      }),
    ],
  };
}
