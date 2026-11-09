import { context, metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import type { LogRecordExporter } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import { logExporterUrl, metricExporterUrl, resolveTelemetryConfig, traceExporterUrl } from "./config.ts";
import type { TelemetryEnv } from "./config.ts";
import { SafeLogExporter, SafeMetricExporter, SafeSpanExporter } from "./exporters.ts";

export type NodeTelemetry = {
  shutdown: () => Promise<void>;
};

export type NodeTelemetryExporters = {
  spanExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  logExporter?: LogRecordExporter;
};

const NOOP_TELEMETRY: NodeTelemetry = {
  shutdown: async () => undefined,
};

export function initNodeTelemetry(env: TelemetryEnv, exporters: NodeTelemetryExporters = {}): NodeTelemetry {
  const config = resolveTelemetryConfig(env);
  if (!config.enabled) {
    return NOOP_TELEMETRY;
  }
  const token = env.DASH0_AUTH_TOKEN?.trim();
  if (!token) {
    return NOOP_TELEMETRY;
  }
  const headers = { Authorization: `Bearer ${token}` };
  const resource = resourceFromAttributes({ "service.name": "focustrack" });
  const spanExporter = new SafeSpanExporter(
    exporters.spanExporter ?? new OTLPTraceExporter({ url: traceExporterUrl(config.endpoint), headers }),
  );
  const metricExporter = new SafeMetricExporter(
    exporters.metricExporter ?? new OTLPMetricExporter({ url: metricExporterUrl(config.endpoint), headers }),
  );
  const logExporter = new SafeLogExporter(
    exporters.logExporter ?? new OTLPLogExporter({ url: logExporterUrl(config.endpoint), headers }),
  );
  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(spanExporter)],
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: logExporter })],
  });
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(tracerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
  logs.setGlobalLoggerProvider(loggerProvider);
  let closed = false;
  return {
    shutdown: async () => {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await tracerProvider.forceFlush();
        await meterProvider.forceFlush();
        await loggerProvider.forceFlush();
      } finally {
        await tracerProvider.shutdown();
        await meterProvider.shutdown();
        await loggerProvider.shutdown();
        trace.disable();
        metrics.disable();
        logs.disable();
        context.disable();
      }
    },
  };
}
