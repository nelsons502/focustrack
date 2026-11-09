# Search and sessions API

`GET /api/search?q=kubernetes&day=2026-11-10&excludeRestricted=true`

- `q` is optional, trimmed, and limited to 300 characters. Empty or omitted means browse, sorted by start time.
- `day` is optional and must be a real `YYYY-MM-DD` date. Omission searches all days.
- `excludeRestricted` is optional (`true` or `false`, default `false`). `true` excludes sold-out, separate-registration, and all-access-pass sessions.
- At most 30 results. No pagination parameters. Both hybrid subqueries apply the same filters.
- Response: `{"results": [], "mode": "hybrid", "tookMs": 24}`. Each result is a complete `Session` from `lib/contract.ts` (`SessionCard` is the same type).
- Semantic failure retries lexical search with identical filters and returns `mode: "lexical-fallback"`. Browse also returns `lexical-fallback` because it does not run semantic search.

`GET /api/sessions?ids=1,2,3`

- `ids` is required: 1–50 comma-separated identifiers, each 1–128 letters, numbers, underscores, or hyphens. Surrounding whitespace is trimmed.
- Returns a `Session[]`, preserving requested order, removing repeated IDs, and omitting missing documents.
- Internal Elastic fields are never returned by either endpoint.

Both routes return HTTP 400 for invalid parameters and HTTP 503 when Elastic cannot serve the request. Friendly error shape: `{"error":{"code":"INVALID_INPUT","message":"Enter a valid day using YYYY-MM-DD."}}` or `{"error":{"code":"SEARCH_UNAVAILABLE","message":"Search is temporarily unavailable. Please try again shortly."}}`. Sessions outages use `SESSIONS_UNAVAILABLE`. No upstream error details are returned.

Operation seams for telemetry: `searchSessions` and `getSessionsByIds` in `lib/elastic-search.ts`; search returns the contract `mode`, `tookMs`, and `results`.

`lib/event.ts` exports `EVENT_TIME_ZONE`, `DEMO_DAY`, `ACCESSIBILITY_SOURCE_URL`, `SCHEDULE_SOURCE_URL`, `SCHEDULE_CREDIT`, and the aggregate `EVENT` object (quiet rooms, caption instructions, and source links).
