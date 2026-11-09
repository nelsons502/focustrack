# Sessionize ingest

Set `ES_URL` and `ES_API_KEY` in the process environment. The script does not load env files or print credentials.

```sh
node --experimental-strip-types scripts/ingest.ts --day=2026-11-10 --recreate
node --experimental-strip-types scripts/ingest.ts --recreate
```

Requires Node 22+ and the approved `@elastic/elasticsearch` dependency. Omit `--day` to include every event day. The script refuses an existing `sessions` index unless `--recreate` is supplied; that flag deletes the existing index and documents after source downloads finish. Tuesday and all-day runs replace one another, rather than append.

List and detail downloads are cached under ignored `.cache/`. Uncached requests run sequentially, at most once per second. Delete individual cache files to fetch fresh versions. Full schedule data must stay out of git; committed fixtures contain only short excerpts.

The parser retains title restrictions, drops registration/coat check/meal/coffee logistics, preserves Mountain Standard Time offsets, and enriches each entry with its detail-page description and speaker affiliations. Sessionize provides free-form speaker affiliations, so `company` preserves that text verbatim; it is not a verified employer field. Hall DE identifies keynote sessions; ballroom crowd estimates are room-based heuristics. Captions are marked for recognizable Salt Palace breakout rooms; other rooms remain unknown.

Explicit mappings keep descriptions available for ordinary text search and copy them to `description_semantic`. Elastic generates semantic representations using its default built-in inference endpoint; no additional model service or inference identifier is configured. See [Elastic's semantic text documentation](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration).

Bulk batches use Sessionize IDs as document IDs. Any failed bulk item, request error, empty selection, or final count mismatch causes a nonzero exit. Logs report confirmed document counts, bulk/inference wall time, Elastic's bulk `took`, and total download-plus-ingest time. Bulk `took` includes inference; it is not an isolated model execution metric.

The temporary package, TypeScript configuration, and `lib/contract.ts` are intended to be reconciled with Worker A's scaffold. No new dependency beyond TypeScript, Vitest, and the Elastic client was added.

Schedule data: CNCF / Sessionize.

## Judge explanation

FocusTrack reads the public conference schedule and removes routine logistics. It adds descriptions, speakers, local times, and attendance restrictions, then stores each session in Elastic. Elastic prepares those descriptions for meaning-based search, so attendees can find relevant talks without knowing the exact keywords.
