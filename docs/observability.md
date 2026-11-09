# Observability (contract04 PR1, server only)

## What this does, in plain words

When the server starts, it can send timing traces, request counts and durations, and structured logs to Dash0 so a judge or operator can see that a search happened, whether it used the hybrid path or the lexical fallback, how long Elastic reported it took, and how many results came back. It never sends what the person typed, their plan, their notes, or any schedule text. If Dash0 credentials are not set, telemetry quietly does nothing and the app works exactly as before.

## How signals are exported

- `instrumentation.ts` exports Next.js `register()`. It returns immediately unless the runtime is `nodejs` (no Edge or browser OTel runtime) and both server env keys below are present and valid.
- When configured, it lazily loads `@vercel/otel` `registerOTel(...)` with service name `focustrack` for all signals, built by `lib/telemetry/otel-options.ts`:
  - Traces: `spanProcessors: []` suppresses the SDK automatic raw exporter path; only the configured safe `OTLPHttpProtoTraceExporter` to `<endpoint>/v1/traces`.
  - Metrics: a `PeriodicExportingMetricReader` over `OTLPMetricExporter` to `<endpoint>/v1/metrics`, so the counter and histogram actually reach Dash0.
  - Logs: a `BatchLogRecordProcessor` over `OTLPLogExporter` to `<endpoint>/v1/logs`.
- Signal URLs are derived by `signalExporterUrl()` in `lib/telemetry/config.ts`. If the endpoint already ends in a signal path such as `/v1/traces`, that suffix is replaced per signal rather than appended to, so `/v1/traces/v1/metrics` can never occur.
- Authentication is one `Authorization: Bearer <token>` header per exporter, built server-side only.
- No network call or exporter is created at build time. A missing, blank, non-HTTPS, credential-bearing, or query/hash-bearing endpoint disables telemetry instead of failing the build or request path.

## Privacy is enforced at the exporter boundary, not the wrapper

Next.js and `@vercel/otel` automatic request/fetch spans can carry full URLs including query strings, plus exception messages and stacks. Filtering only in our wrapper cannot stop that, so every exporter is wrapped (`lib/telemetry/exporters.ts`):

- `SafeSpanExporter` drops every span whose instrumentation scope is not `focustrack-elastic`. That suppresses all automatic Next/fetch spans. Even our own spans are rebuilt before export: the name is derived from the allowlisted operation (`elastic.search`, `elastic.ingest`, … or `elastic.operation`), only allowlisted attributes survive, events and links are removed, the status keeps only its code (no message), and the resource is reduced to safe keys with `service.name` forced to `focustrack`. Trace and span ids are preserved, so trace correlation still works; a manual span may appear without its dropped automatic parent.
- `SafeMetricExporter` keeps only the `focustrack-elastic` scope and strips data-point attributes to the allowlist (operation, search mode, outcome), preserving the measured values.
- `SafeLogExporter` keeps only our scope, rebuilds the body/event name through the safe-name allowlist, derives severity text from the severity number, strips attributes to the allowlist, and preserves the trace context.
- Regression tests feed URL-with-query spans, raw exception events, status messages, and polluted attributes through these exporters, and through real SDK providers, and assert none of it reaches the delegate exporter.

## Environment keys (names only, server-side only)

- `DASH0_OTLP_ENDPOINT` — HTTPS Dash0 ingress base URL (or a URL already ending in `/v1/traces`, `/v1/metrics`, or `/v1/logs`).
- `DASH0_AUTH_TOKEN` — Dash0 auth token. Read only in `instrumentation.ts`. Never rename to a `NEXT_PUBLIC_` key, never pass to any component, and never log it. `resolveTelemetryConfig()` deliberately returns only `{ enabled, endpoint }` so the token cannot leak through the config object.

### Kubernetes wiring: separate optional Secret

`deploy/deployment.yaml` maps both keys into the `app` container from a new Secret, `dash0-credentials`, which is separate from `app-credentials` (that one still supplies only `ES_URL` and `ES_API_KEY`):

- `DASH0_OTLP_ENDPOINT` ← Secret `dash0-credentials`, key `dash0-endpoint`, `optional: true`
- `DASH0_AUTH_TOKEN` ← Secret `dash0-credentials`, key `dash0-token`, `optional: true`

Because both references are optional, pods start normally if the Secret or either key does not exist; the variables are then unset and telemetry stays a no-op. Telemetry turns on only once an operator creates `dash0-credentials` with both keys (values are never committed) and the pods restart. This wiring does not depend on any other environment-reference change. At 14:02 MT the orchestrator confirmed both Secret keys exist and the deployed pods started after the Secret.

## What is and is not captured

Allowed span/log/metric attributes (allowlisted in `lib/telemetry/sanitize.ts`, re-validated at export in `toSafeExportAttributes`):

- `elastic.operation`: one of `search`, `lookup`, `ingest`, `index`, `health`
- `search.mode`: one of `hybrid`, `lexical-fallback`
- `search.took_ms`: non-negative finite number
- `search.result_count`: non-negative integer
- `search.fallback_used`: boolean
- Metric data points only: `outcome`, one of `success`, `error`
- On failure only: `error.code` / log `error_code`, a class name from a finite allowlist (or `unknown_error`). Error messages, stacks, and upstream error objects are discarded.

Anything else — unknown operations or modes, negative/fractional numbers, free-text event names, URLs, query text, notes/plan content, personal data, schedule descriptions, raw errors, and secret headers — is dropped or replaced with `unknown_event` before export, for every signal.

Metrics: `traceElasticOperation` records a counter `focustrack.elastic.operations` and a histogram `focustrack.elastic.duration_ms` with only operation, search mode, and outcome labels. The meter is resolved at record time because the metrics API has no proxy meter; a meter captured before SDK registration would stay a no-op.

Logs: `logTelemetry()` emits an OpenTelemetry log record (severity, safe event name as body, allowlisted attributes, active trace context) through the configured logger provider, and also writes the same safe fields as one JSON line to stdout/stderr as a local mirror, including `trace_id`/`span_id` from the active span when there is one.

## Integration seam for the manager (API / ingest wiring)

Import from `@/lib/telemetry`:

```ts
traceElasticOperation<T>(
  name: string,
  safeAttributes: SafeElasticAttributes,
  callback: (controls: TraceElasticControls) => Promise<T> | T,
): Promise<T>
```

- `SafeElasticAttributes`: `{ operation: string; searchMode?: string; tookMs?: number; resultCount?: number; fallbackUsed?: boolean }` (sanitized again inside, so a bad value is dropped, not exported).
- The callback may ignore `controls`. If result facts are only known afterwards, call `controls.setSafeAttributes({ searchMode, tookMs, resultCount, fallbackUsed })` inside the callback; the merged safe values land on the span, the final log record, and the metrics labels.
- The callback's return value is returned unchanged and its errors are rethrown unchanged after a coarse error code is recorded. With no OTel SDK registered it is a transparent pass-through (still emits the safe structured log line).
- Typical wiring (manager, in API/ingest code): wrap the Elastic call as `traceElasticOperation("elastic.search", { operation: "search" }, async (controls) => { const res = await search(...); controls.setSafeAttributes({ searchMode: res.mode, tookMs: res.tookMs, resultCount: res.results.length, fallbackUsed: res.mode === "lexical-fallback" }); return res; })`. Keep the raw query and documents out of every argument.

`instrumentation.ts` sits at the repo root (Next.js discovers it automatically); no layout or config change is needed for PR1.

## Browser monitoring (PR2, not included)

No browser telemetry ships in PR1, and the server auth token must never reach the browser. Browser monitoring needs its own public-safe Dash0 website/dataset decision first. When that exists, the manager adds one telemetry component line to the root layout; Worker D does not edit the layout and `@dash0/sdk-web` is not installed in PR1.

## Verification status

Verified locally (no credentials): config no-op cases and per-signal URL derivation, allowlist sanitizing, safe error codes, log emission shape, exporter-boundary privacy regressions (auto-span URL/query/exception data cannot escape; safe custom data passes), real SDK provider flow (manual span, counter/histogram values, trace-correlated log), `register()` wiring with a metric reader and log processor plus no-op behaviour when env is absent or invalid, and wrapper pass-through/rethrow are covered by `lib/telemetry/telemetry.test.ts`, `lib/telemetry/exporters.test.ts`, and `lib/telemetry/registration.test.ts`; typecheck, lint, the existing test suite, and production build pass with telemetry disabled.

Live manager proof (2026-11-09, local Node CLI): one healthy real Elastic lookup exported a trace, two metric series and a correlated log, with zero rejected records. Dash0's service catalog shows `focustrack`; the span explorer shows `elastic.lookup` with OK status (trace `4aeb76ece4645d4cfae70ca8f46535d5`). The metric catalog contains `focustrack.elastic.duration_ms` and `focustrack.elastic.operations`; the log explorer contains `elastic_operation_completed` with the same trace context. This verifies CLI export, not a deployed HTTP request. No incident was staged.

The real `@vercel/otel` registration regression also proves the automatic exporter bypass: removing the explicit empty processor list exports a synthetic URL and exception; retaining it exports only the sanitized custom span.

Deployed proof (2026-11-09, via Dash0 MCP, read-only): a synthetic public `GET /api/search` at `2026-11-09T21:03:02.379Z` produced trace `613ad13785bb4e2f8f4f0147096dcbca` span `97e3fbfce7af263a`, status OK, hybrid path, 30 results, Elasticsearch `took 155 ms`, wrapper `187 ms`. The exact correlated log `3729831062491317748_1794258182_368c8aec-c0b5-53b0-8dc9-ad033751316c` at `21:03:02.565Z` carries the same trace/span. Custom counter and histogram_count each increased 1 → 2 by 21:05Z, showing actual search labels/scope (`elastic_operation=search`, `otel_scope_name=focustrack-elastic`, hybrid, success). The live metric catalog had blank units before this fix; this PR declares trusted units locally, with deployed confirmation pending its rollout. Default dataset is `org 6253f83c-e6f1-4036-8586-aa61fb04a524 / dataset default`. Deep links use exact normal Dash0 URLs (no secret); [Open the correlated search trace](https://app.dash0.com/goto/traces/explorer?org=6253f83c-e6f1-4036-8586-aa61fb04a524&dataset=default&trace_id=613ad13785bb4e2f8f4f0147096dcbca&span_id=97e3fbfce7af263a). Rollout context (Radar orchestrator 14:02, not performed by manager): image `674cfea`, 2/2, 0 restarts, Secret present and pods started after it, checks 4 → 0. Public `/plan` now 200 per orchestrator. Vercel remains a cold fallback; no stale Vercel-telemetry claim is made.

Created and verified by authenticated API PUT plus GET readback at 14:19 MT: [FocusTrack Search dashboard](https://app.dash0.com/dashboards?org=6253f83c-e6f1-4036-8586-aa61fb04a524) (`55f70fff-e467-4304-8768-e0d0af826a68`, four panels) and [FocusTrack Search availability SLO](https://app.dash0.com/alerting/slos?org=6253f83c-e6f1-4036-8586-aa61fb04a524) (`slo_01m712wzzrftgtabvkepvsb4sk`, enabled, 99% target, rolling 28 days). Dash0 MCP catalog reads independently confirmed both entities. The JSON files in this directory reproduce their definitions. All selectors exclude collided legacy series and intentionally show no data until the instance-identity fix rolls out. No mature reliability history, notification policy, or alert channel is claimed. Browser SDK monitoring is still not installed, and browser access was unavailable for a visual dashboard check.

## Agent0 investigation (13:24 MT)

[Read-only Agent0 investigation](https://app.dash0.com/goto/agent0?thread_id=76f98ea3-8207-4333-a8b8-671832d05095&dataset=default&org=6253f83c-e6f1-4036-8586-aa61fb04a524) confirmed the CLI trace/log correlation and agreement between span, histogram and Elastic timings within 5 ms. It found no search traffic yet, no FocusTrack dashboard/SLO, and no metric units or deployment/entrypoint distinction. These are honest follow-up gaps; one lookup cannot establish search reliability or latency. The exporter fix in this PR concerns a separate code-review privacy finding, not a staged incident.

Historical 13:24 disposition: missing search evidence awaited rollout (now verified below); missing units were a confirmed follow-up (fixed by this PR); environment/entrypoint labels are PLAUSIBLE for a later production SLO. Automatic HTTP URLs, exception events and host/index identifiers remain excluded by the privacy boundary; Agent0's suggestion to expose them does not override that design. A dashboard can filter `elastic_operation="search"` and `outcome` after real deployed searches arrive. No SLO or dashboard is claimed created by this investigation.

## Created dashboard and SLO definitions

- `docs/focustrack-search-dashboard.json`: Dash0 Dashboard REST format (NOT a Kubernetes CR). Title `FocusTrack Search`, duration 1h, refresh 30s, 24-column grid with four 12×8 panels (2 rows). All four charts are backend Elastic-operation signals, not full HTTP/browser latency. Queries use proven custom metric names with dots preserved via `otel_metric_name` selectors plus `elastic_operation="search"` and `otel_scope_name="focustrack-elastic"`. No `service_name` matcher on custom metrics (Prometheus mapping emits `job=focustrack`). Error/fallback percentages use `(numerator or vector(0)) / total` with no denominator clamping, so missing numerator series read 0 only when total traffic is positive and no traffic renders empty.
- `docs/focustrack-search-slo.json`: OpenSLO v1 `focustrack-search-availability` (`FocusTrack Search: 99% successful Elastic operations`, service `focustrack`, Occurrences, rolling 28d, target 0.99, fixed 5m settling delay). SLI is `counter: true` with good = operations + search + scope + `outcome=success` and total = same without outcome. This is backend-operation availability, not full HTTP availability. No notifications or alert policies. No 28-day reliability is claimed for this new SLO.
- Datasource/privacy caveats: the privacy sanitizer intentionally drops automatic parent spans, so a manual span may appear without its automatic parent; that is by design. Missing automatic parents are REJECTED as a bug finding.

## New Agent0 finding: cumulative custom metrics collide across replicas (must read before using dashboard/SLO)

Follow-up read-only investigation `98a56203-49c5-41b5-9f78-6c5d3178f1a8` is complete. It found cumulative custom metrics collide across replicas (evidence: 86 → 85 histogram-sum decrease, 1 count for three searches, multiple export phases). This PR fixes random per-process `service.instance.id` and metric units as described below. Dashboard queries keep `sum` after `rate`, and the availability SLO is kept, but both require the identity-fix rollout: historical pre-fix window data remains unreliable, and SLO validity must not be claimed before the fix.

The dashboard and SLO selectors require `instance!=""`, the Prometheus mapping of `service.instance.id`. This excludes the collided legacy series even after the fix rolls out; pre-fix counts never enter the new 28-day SLO. Panels and SLO will have no matching data until the identity fix exports a nonempty random instance ID. This is an intentional no-data state, not a successful reliability measurement. [OpenTelemetry documents the resource-label mapping](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/).

## Agent0 multi-writer finding and fix (2026-11-09)

The manager's [deployed Agent0 investigation](https://app.dash0.com/goto/agent0?thread_id=98a56203-49c5-41b5-9f78-6c5d3178f1a8&dataset=default&org=6253f83c-e6f1-4036-8586-aa61fb04a524) reported three ordinary public searches at 21:01:04, 21:01:34 and 21:03:02 UTC. Their cumulative metric samples each had count 1, with histogram sums of 86, 85 and 185 ms under the same resource identity. The declining raw sum is inconsistent with a single healthy cumulative writer. `safeResource` discarded `service.instance.id`, collapsing independent replicas into one series.

The safe export boundary now stamps every signal with one cryptographically random UUID v4 owned by the Node process. A process-level symbol keeps it stable across module reloads and bundled module copies; independent processes generate independent identities. Both Next.js and the Node CLI already use these safe exporters. Incoming `service.instance.id` values are always replaced, including UUID-shaped values: accepting arbitrary upstream UUIDs would not prove they were generated safely. No hostname, pod name, IP address or user data contributes to this identifier, and `service.name` remains `focustrack`. Restarts intentionally create new cumulative series; this adds one series per writer lifetime and does not repair historical samples.

The instruments and trusted descriptor rewrite now declare `focustrack.elastic.duration_ms` in `ms` and `focustrack.elastic.operations` in `{operation}`. Values stay in milliseconds, names stay unchanged, and untrusted descriptions/units remain discarded. Trace/span correlation is unchanged. Automatic spans, events, links, tracestate, raw queries and secrets remain blocked; dropping automatic parent spans is an intentional privacy boundary, not a bug to fix.

Local regression coverage includes module reload stability, separate Node processes and module copies, rejection of upstream host/UUID identities, real SDK export with the same identity on metrics/spans/logs, units at instrument creation and final export, and existing privacy tests. The runtime author performed no live traffic, ingest, production mutation or rollout verification. Manager verification subsequently passed all 399 tests, typecheck, lint and build, plus a cached Linux Node 22 child-process/module-copy identity and trusted-unit smoke check. A Linux Vitest npm install stalled and was stopped; no full Linux suite pass is claimed. Production verification of the new identity remains pending this PR rollout.
