# FocusTrack review conventions

## TypeScript
- Strict mode. Flag any use of `any`, non-null assertions on external data, or unchecked casts of API or Elasticsearch responses.
- Shared request and response types live in one module that the API routes and the UI both import. Flag duplicated or drifting type definitions.
- No secrets in code. Elasticsearch and OpenAI credentials come from environment variables only.

## Time and dates
- Event times are stored as ISO 8601 strings with an explicit offset. Display them in the event's own time zone (taken from event data, never hardcoded), never in the server's or browser's local zone.
- Flag date math done on formatted strings, and any comparison of times from different zones without normalizing first.

## Elasticsearch is the data layer
- Search, filtering and aggregation happen in Elasticsearch queries, not by loading documents into memory and filtering in JavaScript. The one exception is the explicitly labelled offline fallback.
- Hybrid search uses an RRF retriever combining a lexical query with a semantic query on the `semantic_text` field. Flag changes that silently drop either side.
- Index mappings are explicit. Flag reliance on dynamic mapping for fields we query.
