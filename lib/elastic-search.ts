import type { Client, estypes } from "@elastic/elasticsearch";
import {
  INDEX_NAME,
  type Captions,
  type CrowdEstimate,
  type NoiseEstimate,
  type Restriction,
  type RoomType,
  type SearchResponse,
  type Session,
  type SessionKind,
} from "./contract";
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

const ROOM_TYPES = ["keynote-hall", "ballroom", "breakout", "expo-floor", "other"] as const satisfies readonly RoomType[];
const SESSION_KINDS = [
  "talk", "keynote", "panel", "lightning", "demo", "workshop", "community", "colocated", "logistics",
] as const satisfies readonly SessionKind[];
const RESTRICTIONS = ["sold-out", "separate-registration", "all-access-pass"] as const satisfies readonly Restriction[];
const CROWD_ESTIMATES = ["large", "moderate", "unknown"] as const satisfies readonly CrowdEstimate[];
const NOISE_ESTIMATES = ["loud", "unknown"] as const satisfies readonly NoiseEstimate[];
const CAPTIONS = ["wordly-breakout", "unknown"] as const satisfies readonly Captions[];
type SummarySource = NonNullable<Session["summarySource"]>;
const SUMMARY_SOURCES = ["ai-reviewed"] as const satisfies readonly SummarySource[];

type Exhaustive<U, L extends readonly unknown[]> = [Exclude<U, L[number]>] extends [never] ? true : never;
const _roomTypesComplete: Exhaustive<RoomType, typeof ROOM_TYPES> = true;
const _sessionKindsComplete: Exhaustive<SessionKind, typeof SESSION_KINDS> = true;
const _restrictionsComplete: Exhaustive<Restriction, typeof RESTRICTIONS> = true;
const _crowdEstimatesComplete: Exhaustive<CrowdEstimate, typeof CROWD_ESTIMATES> = true;
const _noiseEstimatesComplete: Exhaustive<NoiseEstimate, typeof NOISE_ESTIMATES> = true;
const _captionsComplete: Exhaustive<Captions, typeof CAPTIONS> = true;
const _summarySourcesComplete: Exhaustive<SummarySource, typeof SUMMARY_SOURCES> = true;

export class ApiInputError extends Error {}

function parameter(params: URLSearchParams, name: string): string | null {
  if (params.getAll(name).length > 1) {
    throw new ApiInputError(`Provide ${name} only once.`);
  }
  return params.get(name);
}

function sourceObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Malformed session source");
  }
  return value as Record<string, unknown>;
}

function sourceString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Malformed session source");
  return value;
}

function sourceArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Malformed session source");
  return value;
}

function sourceEnum<const T extends string>(value: unknown, choices: readonly T[]): T {
  const match = choices.find((choice) => choice === value);
  if (match === undefined) throw new Error("Malformed session source");
  return match;
}

function sessionOnly(value: unknown): Session {
  const source = sourceObject(value);
  const session: Session = {
    id: sourceString(source.id),
    eventId: sourceString(source.eventId),
    title: sourceString(source.title),
    description: sourceString(source.description),
    speakers: sourceArray(source.speakers).map((value) => {
      const speaker = sourceObject(value);
      return { name: sourceString(speaker.name), company: sourceString(speaker.company) };
    }),
    startsAt: sourceString(source.startsAt),
    endsAt: sourceString(source.endsAt),
    day: sourceString(source.day),
    room: sourceString(source.room),
    venue: source.venue === null ? null : sourceString(source.venue),
    level: source.level === null ? null : sourceString(source.level),
    roomType: sourceEnum(source.roomType, ROOM_TYPES),
    kind: sourceEnum(source.kind, SESSION_KINDS),
    restrictions: sourceArray(source.restrictions).map((value) => sourceEnum(value, RESTRICTIONS)),
    crowdEstimate: sourceEnum(source.crowdEstimate, CROWD_ESTIMATES),
    crowdBasis: sourceString(source.crowdBasis),
    noiseEstimate: sourceEnum(source.noiseEstimate, NOISE_ESTIMATES),
    noiseBasis: sourceString(source.noiseBasis),
    captions: sourceEnum(source.captions, CAPTIONS),
    sourceUrl: sourceString(source.sourceUrl),
  };
  if (source.plainSummary !== undefined) session.plainSummary = sourceString(source.plainSummary);
  if (source.summarySource !== undefined) session.summarySource = sourceEnum(source.summarySource, SUMMARY_SOURCES);
  return session;
}

function requireComplete(result: estypes.SearchResponse<unknown>): Session[] {
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
    filter.push({ bool: { must_not: [{ terms: { restrictions: [...RESTRICTIONS] } }] } });
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
      const result = await client.search<unknown>({
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
  const result = await client.search<unknown>({ ...common, query, timeout: "4s" }, { requestTimeout: 5_000 });
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
  const result = await getElasticClient().mget<unknown>({
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
