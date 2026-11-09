# Sessionize ingest

Set `ES_URL` and `ES_API_KEY` in the process environment. The script does not load env files or print credentials.

```sh
node --experimental-strip-types scripts/ingest.ts --day=2026-11-10 --recreate
node --experimental-strip-types scripts/ingest.ts --recreate
```

Requires Node 22+ and the approved `@elastic/elasticsearch` dependency. Omit `--day` to include every event day. The script refuses an existing `sessions` index unless `--recreate` is supplied; that flag deletes the existing index and documents after source downloads finish. Tuesday and all-day runs replace one another, rather than append.

List and detail downloads are cached under ignored `.cache/`. Uncached requests run sequentially, at most once per second. Delete individual cache files to fetch fresh versions. Full schedule data must stay out of git; committed fixtures contain only short excerpts.

The parser retains title restrictions, drops registration/coat check/meal/coffee logistics, preserves Mountain Standard Time offsets, and enriches each entry with its detail-page description and speaker affiliations. Sessionize provides free-form speaker affiliations, so `company` preserves that text verbatim; it is not a verified employer field. Hall DE identifies keynote sessions. Rooms used by keynotes become `keynote-hall`; actual ballrooms exclude foyers, numbered rooms become `breakout`, and Solutions Showcase/Exhibit Hall rooms become `expo-floor`. Crowd estimates are large for keynote halls and ballrooms, moderate for combined numbered breakouts such as 250 A-C, and unknown elsewhere. Noise is estimated loud only on the expo floor; it remains unknown elsewhere. The basis fields describe room proxies, not measured attendance or noise. No small, quiet, or factual accessibility claims are inferred. Captions are marked for recognizable Salt Palace breakout rooms; other rooms remain unknown.

Explicit mappings keep descriptions available for ordinary text search and copy them to `description_semantic`. Elastic generates semantic representations using its default built-in inference endpoint; no additional model service or inference identifier is configured. See [Elastic's semantic text documentation](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration).

Bulk batches use Sessionize IDs as document IDs. Any failed bulk item, request error, empty selection, or final count mismatch causes a nonzero exit. Logs report confirmed document counts, bulk/inference wall time, Elastic's bulk `took`, and total download-plus-ingest time. Bulk `took` includes inference; it is not an isolated model execution metric.

Classification follows the authoritative `lib/contract.ts` parse rules. Overlaps resolve in this order: logistics (dropped), keynotes, colocated events/restrictions, clear community events (gatherings, meetups, mentoring, documentaries), Demo Theater title prefix, Tutorial/ContribFest title, other showcase/pavilion/in-booth community entries, lightning duration (at most 10 minutes), workshop duration (at least 75 minutes), Panel title, then talk. This keeps actual event categories ahead of incidental duration; explicit demo/workshop titles win over generic showcase words, and duration wins over a Panel mention. Overnight durations use the next calendar day.

The cache is validated before reuse: schedules must match their advertised unique entry count and parse successfully; detail pages must match their requested Session ID. Fresh downloads are validated and atomically renamed into place. Existing cached data is reused without a network request. The new `roomType`, `noiseEstimate`, and `noiseBasis` fields have explicit keyword mappings.

Schedule data: CNCF / Sessionize.

## Judge explanation

FocusTrack reads the public conference schedule and removes routine logistics. It adds descriptions, speakers, local times, and attendance restrictions, then stores each session in Elastic. Elastic prepares those descriptions for meaning-based search, so attendees can find relevant talks without knowing the exact keywords.
