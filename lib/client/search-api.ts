import type { SearchResponse, Session } from "../contract";

export type SearchRequest = {
  q: string;
  day: string;
  excludeRestricted: boolean;
};

export function buildSearchUrl(request: SearchRequest): string {
  const params = new URLSearchParams();
  const q = request.q.trim().slice(0, 300);
  if (q) params.set("q", q);
  if (request.day) params.set("day", request.day);
  if (request.excludeRestricted) params.set("excludeRestricted", "true");
  const query = params.toString();
  return query ? `/api/search?${query}` : "/api/search";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.some((option) => option === value);
}

const SESSION_KINDS = [
  "talk",
  "keynote",
  "panel",
  "lightning",
  "demo",
  "workshop",
  "community",
  "colocated",
  "logistics",
] as const;
const ROOM_TYPES = [
  "keynote-hall",
  "ballroom",
  "breakout",
  "expo-floor",
  "other",
] as const;
const RESTRICTIONS = [
  "sold-out",
  "separate-registration",
  "all-access-pass",
] as const;

function isSpeaker(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.company === "string"
  );
}

export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.eventId === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    Array.isArray(value.speakers) &&
    value.speakers.every(isSpeaker) &&
    typeof value.startsAt === "string" &&
    typeof value.endsAt === "string" &&
    typeof value.day === "string" &&
    typeof value.room === "string" &&
    (typeof value.venue === "string" || value.venue === null) &&
    (typeof value.level === "string" || value.level === null) &&
    isOneOf(value.roomType, ROOM_TYPES) &&
    isOneOf(value.kind, SESSION_KINDS) &&
    Array.isArray(value.restrictions) &&
    value.restrictions.every((restriction) =>
      isOneOf(restriction, RESTRICTIONS),
    ) &&
    isOneOf(value.crowdEstimate, ["large", "moderate", "unknown"] as const) &&
    typeof value.crowdBasis === "string" &&
    isOneOf(value.noiseEstimate, ["loud", "unknown"] as const) &&
    typeof value.noiseBasis === "string" &&
    isOneOf(value.captions, ["wordly-breakout", "unknown"] as const) &&
    (value.plainSummary === undefined ||
      typeof value.plainSummary === "string") &&
    (value.summarySource === undefined || value.summarySource === "ai-reviewed") &&
    typeof value.sourceUrl === "string"
  );
}

function friendlyError(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error)) {
    const message = body.error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (status === 400) return "That search could not be understood. Check it and try again.";
  return "Search is temporarily unavailable. Please try again shortly.";
}

export async function fetchSearch(
  request: SearchRequest,
  signal: AbortSignal,
): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch(buildSearchUrl(request), {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Search is temporarily unavailable. Please try again shortly.");
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new Error(
      "Search is temporarily unavailable. Please try again shortly.",
    );
  }
  if (!response.ok) throw new Error(friendlyError(body, response.status));
  if (
    !isRecord(body) ||
    !Array.isArray(body.results) ||
    (body.mode !== "hybrid" && body.mode !== "lexical-fallback")
  ) {
    throw new Error(
      "Search is temporarily unavailable. Please try again shortly.",
    );
  }
  const results = body.results.filter(isSession);
  if (body.results.length > 0 && results.length === 0) {
    throw new Error(
      "Search is temporarily unavailable. Please try again shortly.",
    );
  }
  return {
    results,
    mode: body.mode,
    tookMs: typeof body.tookMs === "number" ? body.tookMs : 0,
  };
}

export async function fetchSessionsByIds(
  ids: string[],
  signal: AbortSignal,
): Promise<Session[]> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (unique.length === 0) return [];
  const message = "Your sessions could not be loaded. Please try again shortly.";
  let response: Response;
  try {
    response = await fetch(`/api/sessions?ids=${unique.map(encodeURIComponent).join(",")}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(message);
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new Error(message);
  }
  if (!response.ok || !Array.isArray(body)) throw new Error(message);
  return body.filter(isSession);
}
