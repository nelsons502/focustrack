import type { SearchResponse } from "../contract";

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
  const response = await fetch(buildSearchUrl(request), {
    signal,
    headers: { Accept: "application/json" },
  });
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
  return {
    results: body.results as SearchResponse["results"],
    mode: body.mode,
    tookMs: typeof body.tookMs === "number" ? body.tookMs : 0,
  };
}
