import { resolveTelemetryConfig } from "./lib/telemetry/config";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const config = resolveTelemetryConfig({
    DASH0_OTLP_ENDPOINT: process.env.DASH0_OTLP_ENDPOINT,
    DASH0_AUTH_TOKEN: process.env.DASH0_AUTH_TOKEN,
  });
  if (!config.enabled) {
    return;
  }
  const token = process.env.DASH0_AUTH_TOKEN?.trim();
  if (!token) {
    return;
  }
  const [{ registerOTel }, { buildTelemetryOtelOptions }] = await Promise.all([
    import("@vercel/otel"),
    import("./lib/telemetry/otel-options"),
  ]);
  registerOTel(buildTelemetryOtelOptions(config.endpoint, token));
}
