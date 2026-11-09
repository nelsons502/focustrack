import { ValueType } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { Resource } from "@opentelemetry/resources";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { DataPointType } from "@opentelemetry/sdk-metrics";
import type { MetricData, PushMetricExporter, ResourceMetrics } from "@opentelemetry/sdk-metrics";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { FOCUSTRACK_SCOPE, safeEventName, safeSpanContext, safeSpanName, toSafeExportAttributes } from "./sanitize.ts";

const SAFE_RESOURCE_KEYS: ReadonlySet<string> = new Set([
  "service.name",
  "service.namespace",
  "service.version",
  "telemetry.sdk.language",
  "telemetry.sdk.name",
  "telemetry.sdk.version",
  "deployment.environment.name",
]);

const SAFE_RESOURCE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/;

export function safeResource(resource: Resource): Resource {
  const attributes: Record<string, string | number | boolean> = { "service.name": "focustrack" };
  for (const [key, value] of Object.entries(resource.attributes)) {
    if (key === "service.name" || !SAFE_RESOURCE_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "string" && SAFE_RESOURCE_VALUE.test(value)) {
      attributes[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      attributes[key] = value;
    }
  }
  return resourceFromAttributes(attributes);
}

export function sanitizeSpanForExport(span: ReadableSpan): ReadableSpan | null {
  if (span.instrumentationScope.name !== FOCUSTRACK_SCOPE) {
    return null;
  }
  const attributes = toSafeExportAttributes(span.attributes);
  const droppedAttributes = Object.keys(span.attributes).length - Object.keys(attributes).length;
  const spanContext = safeSpanContext(span.spanContext()) ?? span.spanContext();
  return {
    name: safeSpanName(span.attributes),
    kind: span.kind,
    spanContext: () => spanContext,
    parentSpanContext: safeSpanContext(span.parentSpanContext),
    startTime: span.startTime,
    endTime: span.endTime,
    status: { code: span.status.code },
    attributes,
    links: [],
    events: [],
    duration: span.duration,
    ended: span.ended,
    resource: safeResource(span.resource),
    instrumentationScope: { name: FOCUSTRACK_SCOPE },
    droppedAttributesCount: span.droppedAttributesCount + Math.max(0, droppedAttributes),
    droppedEventsCount: span.droppedEventsCount + span.events.length,
    droppedLinksCount: span.droppedLinksCount + span.links.length,
  };
}

export class SafeSpanExporter implements SpanExporter {
  readonly delegate: SpanExporter;

  constructor(delegate: SpanExporter) {
    this.delegate = delegate;
  }

  export(spans: ReadableSpan[], resultCallback: (result: { code: 0 | 1; error?: Error }) => void): void {
    const safe = spans
      .map((span) => sanitizeSpanForExport(span))
      .filter((span): span is ReadableSpan => span !== null);
    if (safe.length === 0) {
      resultCallback({ code: 0 });
      return;
    }
    this.delegate.export(safe, resultCallback);
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush?.();
  }
}

const SAFE_METRIC_DESCRIPTORS: ReadonlyMap<string, MetricData["descriptor"]> = new Map([
  [
    "focustrack.elastic.operations",
    { name: "focustrack.elastic.operations", description: "", unit: "", valueType: ValueType.INT },
  ],
  [
    "focustrack.elastic.duration_ms",
    { name: "focustrack.elastic.duration_ms", description: "", unit: "", valueType: ValueType.DOUBLE },
  ],
]);

function sanitizeMetricForExport(metric: MetricData): MetricData | null {
  const descriptor = SAFE_METRIC_DESCRIPTORS.get(metric.descriptor.name);
  if (!descriptor) {
    return null;
  }
  if (metric.dataPointType === DataPointType.SUM) {
    return {
      descriptor,
      aggregationTemporality: metric.aggregationTemporality,
      dataPointType: DataPointType.SUM,
      isMonotonic: true,
      dataPoints: metric.dataPoints.map((point) => ({
        startTime: point.startTime,
        endTime: point.endTime,
        attributes: toSafeExportAttributes(point.attributes, { metric: true }),
        value: point.value,
      })),
    };
  }
  if (metric.dataPointType === DataPointType.GAUGE) {
    return {
      descriptor,
      aggregationTemporality: metric.aggregationTemporality,
      dataPointType: DataPointType.GAUGE,
      dataPoints: metric.dataPoints.map((point) => ({
        startTime: point.startTime,
        endTime: point.endTime,
        attributes: toSafeExportAttributes(point.attributes, { metric: true }),
        value: point.value,
      })),
    };
  }
  if (metric.dataPointType === DataPointType.EXPONENTIAL_HISTOGRAM) {
    return {
      descriptor,
      aggregationTemporality: metric.aggregationTemporality,
      dataPointType: DataPointType.EXPONENTIAL_HISTOGRAM,
      dataPoints: metric.dataPoints.map((point) => ({
        startTime: point.startTime,
        endTime: point.endTime,
        attributes: toSafeExportAttributes(point.attributes, { metric: true }),
        value: point.value,
      })),
    };
  }
  return {
    descriptor,
    aggregationTemporality: metric.aggregationTemporality,
    dataPointType: DataPointType.HISTOGRAM,
    dataPoints: metric.dataPoints.map((point) => ({
      startTime: point.startTime,
      endTime: point.endTime,
      attributes: toSafeExportAttributes(point.attributes, { metric: true }),
      value: point.value,
    })),
  };
}

export function sanitizeResourceMetricsForExport(metrics: ResourceMetrics): ResourceMetrics {
  return {
    resource: safeResource(metrics.resource),
    scopeMetrics: metrics.scopeMetrics
      .filter((scopeMetrics) => scopeMetrics.scope.name === FOCUSTRACK_SCOPE)
      .map((scopeMetrics) => ({
        scope: { name: FOCUSTRACK_SCOPE },
        metrics: scopeMetrics.metrics
          .map((metric) => sanitizeMetricForExport(metric))
          .filter((metric): metric is MetricData => metric !== null),
      }))
      .filter((scopeMetrics) => scopeMetrics.metrics.length > 0),
  } as ResourceMetrics;
}

export class SafeMetricExporter implements PushMetricExporter {
  declare selectAggregationTemporality?: PushMetricExporter["selectAggregationTemporality"];
  declare selectAggregation?: PushMetricExporter["selectAggregation"];
  readonly delegate: PushMetricExporter;

  constructor(delegate: PushMetricExporter) {
    this.delegate = delegate;
    if (delegate.selectAggregationTemporality) {
      const select = delegate.selectAggregationTemporality.bind(delegate);
      this.selectAggregationTemporality = (instrumentType) => select(instrumentType);
    }
    if (delegate.selectAggregation) {
      const select = delegate.selectAggregation.bind(delegate);
      this.selectAggregation = (instrumentType) => select(instrumentType);
    }
  }

  export(metrics: ResourceMetrics, resultCallback: (result: { code: 0 | 1; error?: Error }) => void): void {
    this.delegate.export(sanitizeResourceMetricsForExport(metrics), resultCallback);
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }
}

function safeSeverityText(record: ReadableLogRecord): string | undefined {
  switch (record.severityNumber) {
    case SeverityNumber.TRACE:
    case SeverityNumber.TRACE2:
    case SeverityNumber.TRACE3:
    case SeverityNumber.TRACE4:
      return "TRACE";
    case SeverityNumber.DEBUG:
    case SeverityNumber.DEBUG2:
    case SeverityNumber.DEBUG3:
    case SeverityNumber.DEBUG4:
      return "DEBUG";
    case SeverityNumber.INFO:
    case SeverityNumber.INFO2:
    case SeverityNumber.INFO3:
    case SeverityNumber.INFO4:
      return "INFO";
    case SeverityNumber.WARN:
    case SeverityNumber.WARN2:
    case SeverityNumber.WARN3:
    case SeverityNumber.WARN4:
      return "WARN";
    case SeverityNumber.ERROR:
    case SeverityNumber.ERROR2:
    case SeverityNumber.ERROR3:
    case SeverityNumber.ERROR4:
      return "ERROR";
    case SeverityNumber.FATAL:
    case SeverityNumber.FATAL2:
    case SeverityNumber.FATAL3:
    case SeverityNumber.FATAL4:
      return "FATAL";
    default:
      return undefined;
  }
}

export function sanitizeLogRecordForExport(record: ReadableLogRecord): ReadableLogRecord | null {
  if (record.instrumentationScope.name !== FOCUSTRACK_SCOPE) {
    return null;
  }
  const body = safeEventName(typeof record.body === "string" ? record.body : "");
  return {
    hrTime: record.hrTime,
    hrTimeObserved: record.hrTimeObserved,
    spanContext: safeSpanContext(record.spanContext),
    severityText: safeSeverityText(record),
    severityNumber: record.severityNumber,
    body,
    eventName: safeEventName(typeof record.eventName === "string" ? record.eventName : body),
    resource: safeResource(record.resource),
    instrumentationScope: { name: FOCUSTRACK_SCOPE },
    attributes: toSafeExportAttributes(record.attributes),
    droppedAttributesCount: record.droppedAttributesCount,
  };
}

export class SafeLogExporter implements LogRecordExporter {
  readonly delegate: LogRecordExporter;

  constructor(delegate: LogRecordExporter) {
    this.delegate = delegate;
  }

  export(logs: ReadableLogRecord[], resultCallback: (result: { code: 0 | 1; error?: Error }) => void): void {
    const safe = logs
      .map((record) => sanitizeLogRecordForExport(record))
      .filter((record): record is ReadableLogRecord => record !== null);
    if (safe.length === 0) {
      resultCallback({ code: 0 });
      return;
    }
    this.delegate.export(safe, resultCallback);
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush();
  }
}
