import type { SearchMode } from "../contract.ts";

export type ElasticOperation = "search" | "lookup" | "ingest" | "index" | "health";

export type SafeElasticAttributes = {
  operation: string;
  searchMode?: string;
  tookMs?: number;
  resultCount?: number;
  fallbackUsed?: boolean;
};

export type SafeSpanAttributes = Record<string, string | number | boolean>;

const OPERATIONS: ReadonlySet<string> = new Set(["search", "lookup", "ingest", "index", "health"]);
const SEARCH_MODES: ReadonlySet<string> = new Set<SearchMode>(["hybrid", "lexical-fallback"]);
const EVENT_NAMES: ReadonlySet<string> = new Set(["elastic_operation_completed", "elastic_operation_failed"]);
const SPAN_NAMES: ReadonlySet<string> = new Set([
  "elastic.search",
  "elastic.lookup",
  "elastic.ingest",
  "elastic.index",
  "elastic.health",
  "elastic.operation",
]);
const ERROR_CODES: ReadonlySet<string> = new Set([
  "ApiInputError",
  "ConfigurationError",
  "ConnectionError",
  "ElasticsearchClientError",
  "NoLivingConnectionsError",
  "ProductNotSupportedError",
  "RangeError",
  "ReferenceError",
  "RequestAbortedError",
  "ResponseError",
  "SerializationError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);

function isNonNegativeFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function toSafeSpanAttributes(input: SafeElasticAttributes): SafeSpanAttributes {
  const attributes: SafeSpanAttributes = {};
  if (OPERATIONS.has(input.operation)) {
    attributes["elastic.operation"] = input.operation;
  }
  if (input.searchMode !== undefined && SEARCH_MODES.has(input.searchMode)) {
    attributes["search.mode"] = input.searchMode;
  }
  if (isNonNegativeFinite(input.tookMs)) {
    attributes["search.took_ms"] = input.tookMs;
  }
  if (input.resultCount !== undefined && Number.isInteger(input.resultCount) && input.resultCount >= 0) {
    attributes["search.result_count"] = input.resultCount;
  }
  if (typeof input.fallbackUsed === "boolean") {
    attributes["search.fallback_used"] = input.fallbackUsed;
  }
  return attributes;
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (ERROR_CODES.has(error.name)) {
      return error.name;
    }
    if (ERROR_CODES.has(error.constructor.name)) {
      return error.constructor.name;
    }
  }
  return "unknown_error";
}

export function safeErrorCodeValue(value: unknown): string {
  return typeof value === "string" && ERROR_CODES.has(value) ? value : "unknown_error";
}

export function safeEventName(event: string): string {
  return EVENT_NAMES.has(event) ? event : "unknown_event";
}

export function safeSpanNameValue(name: string): string {
  return SPAN_NAMES.has(name) ? name : "elastic.operation";
}

export const FOCUSTRACK_SCOPE = "focustrack-elastic";

export function isSafeOperation(value: unknown): value is ElasticOperation {
  return typeof value === "string" && OPERATIONS.has(value);
}

export function safeSpanName(attributes: Record<string, unknown>): string {
  const operation = attributes["elastic.operation"];
  return isSafeOperation(operation) ? `elastic.${operation}` : "elastic.operation";
}

export type SafeSpanContext = {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
};

export function safeSpanContext(
  value: { traceId: string; spanId: string; traceFlags: number; isRemote?: boolean } | undefined,
): SafeSpanContext | undefined {
  if (!value) {
    return undefined;
  }
  const safe: SafeSpanContext = { traceId: value.traceId, spanId: value.spanId, traceFlags: value.traceFlags };
  if (typeof value.isRemote === "boolean") {
    safe.isRemote = value.isRemote;
  }
  return safe;
}

const ERROR_CODE_KEYS: ReadonlySet<string> = new Set(["error.code", "error_code"]);
const OUTCOMES: ReadonlySet<string> = new Set(["success", "error"]);

export function toSafeExportAttributes(
  input: Record<string, unknown>,
  options: { metric?: boolean } = {},
): SafeSpanAttributes {
  const attributes: SafeSpanAttributes = {};
  const operation = input["elastic.operation"];
  if (isSafeOperation(operation)) {
    attributes["elastic.operation"] = operation;
  }
  const mode = input["search.mode"];
  if (typeof mode === "string" && SEARCH_MODES.has(mode)) {
    attributes["search.mode"] = mode;
  }
  const tookMs = input["search.took_ms"];
  if (typeof tookMs === "number" && isNonNegativeFinite(tookMs)) {
    attributes["search.took_ms"] = tookMs;
  }
  const resultCount = input["search.result_count"];
  if (typeof resultCount === "number" && Number.isInteger(resultCount) && resultCount >= 0) {
    attributes["search.result_count"] = resultCount;
  }
  const fallbackUsed = input["search.fallback_used"];
  if (typeof fallbackUsed === "boolean") {
    attributes["search.fallback_used"] = fallbackUsed;
  }
  for (const key of ERROR_CODE_KEYS) {
    if (input[key] !== undefined) {
      attributes[key] = safeErrorCodeValue(input[key]);
    }
  }
  if (options.metric) {
    const outcome = input.outcome;
    if (typeof outcome === "string" && OUTCOMES.has(outcome)) {
      attributes.outcome = outcome;
    }
  }
  return attributes;
}
