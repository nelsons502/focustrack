export type TelemetryEnv = {
  DASH0_OTLP_ENDPOINT?: string;
  DASH0_AUTH_TOKEN?: string;
};

export type TelemetryConfig = { enabled: false } | { enabled: true; endpoint: string };

export function resolveTelemetryConfig(env: TelemetryEnv): TelemetryConfig {
  const endpoint = env.DASH0_OTLP_ENDPOINT?.trim();
  const token = env.DASH0_AUTH_TOKEN?.trim();
  if (!endpoint || !token) {
    return { enabled: false };
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { enabled: false };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { enabled: false };
  }
  return { enabled: true, endpoint: parsed.toString().replace(/\/$/, "") };
}

export type TelemetrySignal = "traces" | "metrics" | "logs";

const SIGNAL_PATH = /\/v1\/(traces|metrics|logs)$/;

export function signalExporterUrl(endpoint: string, signal: TelemetrySignal): string {
  const base = endpoint.replace(/\/+$/, "");
  return SIGNAL_PATH.test(base) ? base.replace(SIGNAL_PATH, `/v1/${signal}`) : `${base}/v1/${signal}`;
}

export function traceExporterUrl(endpoint: string): string {
  return signalExporterUrl(endpoint, "traces");
}

export function metricExporterUrl(endpoint: string): string {
  return signalExporterUrl(endpoint, "metrics");
}

export function logExporterUrl(endpoint: string): string {
  return signalExporterUrl(endpoint, "logs");
}
