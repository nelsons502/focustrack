import type { Client, estypes } from "@elastic/elasticsearch";
import { INDEX_NAME, type SearchResponse, type Session } from "./contract";
import { createElasticClient } from "./elastic";

let cachedClient: Client | undefined;

function getElasticClient(): Client {
  return cachedClient ??= createElasticClient();
}

const SESSION_FIELDS = [
  "id", "eventId", "title", "description", "speakers", "startsAt", "endsAt",
  "day", "room", "venue", "level", "roomType", "kind", "restrictions",
  "crowdEstimate", "crowdBasis", "noiseEstimate", "noiseBasis", "captions",
  "plainSummary", "summarySource", "sourceUrl",
] as const satisfies readonly (keyof Session)[];

export class ApiInputError extends Error {}

function parameter(params: URLSearchParams, name: string): string | null {
  if (params.getAll(name).length > 1) {
    throw new ApiInputError(`Provide ${name} only once.`);
  }
  return params.get(name);
}

function sessionOnly(source: Session): Session {
  const session = Object.fromEntries(
    SESSION_FIELDS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  ) as Session;
  session.speakers = source.speakers.map(({ name, company }) => ({ name, company }));
  return session;
}

function requireComplete(result: estypes.SearchResponse<Session>): Session[] {
  if (result.timed_out || (result._shards?.failed ?? 0) > 0) {
    throw new Error("Incomplete search");
  }
  return result.hits.hits.map((hit) => {
    if (!hit._source) throw new Error("Missing session source");
    return sessionOnly(hit._source);
  });
}

export async function searchSessions(params: URLSearchParams): Promise<SearchResponse> {
  const started = performance.now();
  const rawQuery = parameter(params, "q") ?? "";
  if (rawQuery.length > 300) throw new ApiInputError("Keep your search to 300 characters or fewer.");
  const q = rawQuery.trim();
  const day = parameter(params, "day");
  if (day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) {
    throw new ApiInputError("Enter a valid day using YYYY-MM-DD.");
  }
  const excludeRestricted = parameter(params, "excludeRestricted");
  if (excludeRestricted !== null && excludeRestricted !== "true" && excludeRestricted !== "false") {
    throw new ApiInputError("excludeRestricted must be true or false.");
  }
  const filter: estypes.QueryDslQueryContainer[] = [];
  if (day !== null) filter.push({ term: { day } });
  if (excludeRestricted === "true") {
    filter.push({ bool: { must_not: [{ terms: { restrictions: [
      "sold-out", "separate-registration", "all-access-pass",
    ] } }] } });
  }
  const lexical: estypes.QueryDslQueryContainer = q
    ? { multi_match: { query: q, fields: ["title^2", "description"] } }
    : { match_all: {} };
  const query: estypes.QueryDslQueryContainer = { bool: { must: [lexical], filter } };
  const common: estypes.SearchRequest = {
    index: INDEX_NAME,
    size: 30,
    _source: [...SESSION_FIELDS],
    allow_partial_search_results: false,
  };
  const client = getElasticClient();
  if (q) {
    try {
      const result = await client.search<Session>({
        ...common,
        timeout: "8s",
        retriever: { rrf: { rank_window_size: 60, rank_constant: 60, retrievers: [
          { standard: { query } },
          { standard: { query: { bool: {
            must: [{ semantic: { field: "description_semantic", query: q } }], filter,
          } } } },
        ] } },
      }, { requestTimeout: 10_000 });
      return { results: requireComplete(result), mode: "hybrid", tookMs: elapsed(started) };
    } catch {
      console.warn({ event: "search_lexical_fallback" });
      return lexicalSearch(client, common, query, started);
    }
  }
  return lexicalSearch(client, { ...common, sort: [{ startsAt: "asc" }, { id: "asc" }] }, query, started);
}

function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

async function lexicalSearch(
  client: Client,
  common: estypes.SearchRequest,
  query: estypes.QueryDslQueryContainer,
  started: number,
): Promise<SearchResponse> {
  const result = await client.search<Session>({ ...common, query, timeout: "4s" }, { requestTimeout: 5_000 });
  return { results: requireComplete(result), mode: "lexical-fallback", tookMs: elapsed(started) };
}

export async function getSessionsByIds(params: URLSearchParams): Promise<Session[]> {
  const rawIds = parameter(params, "ids");
  if (!rawIds || rawIds.length > 6_449) throw new ApiInputError("Provide between 1 and 50 session IDs.");
  const requested = rawIds.split(",").map((id) => id.trim());
  if (requested.length > 50 || requested.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    throw new ApiInputError("Provide up to 50 valid session IDs separated by commas.");
  }
  const ids = [...new Set(requested)];
  const result = await getElasticClient().mget<Session>({
    index: INDEX_NAME, ids, _source: [...SESSION_FIELDS],
  }, { requestTimeout: 5_000 });
  const found = new Map<string, Session>();
  for (const doc of result.docs) {
    if ("error" in doc) throw new Error("Session retrieval failed");
    if (doc.found) {
      if (!doc._source) throw new Error("Missing session source");
      found.set(doc._id, sessionOnly(doc._source));
    }
  }
  return ids.flatMap((id) => {
    const session = found.get(id);
    return session ? [session] : [];
  });
}
