import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./contract";

const elastic = vi.hoisted(() => ({ search: vi.fn(), mget: vi.fn(), close: vi.fn() }));
const createElasticClient = vi.hoisted(() => vi.fn());
vi.mock("./elastic", () => ({ createElasticClient }));
let search: typeof import("../app/api/search/route").GET;
let sessions: typeof import("../app/api/sessions/route").GET;

const session: Session = {
  id: "1", eventId: "kccncna2026", title: "Sample talk", description: "A short test excerpt.",
  speakers: [{ name: "Example Speaker", company: "Example" }],
  startsAt: "2026-11-10T09:00:00-07:00", endsAt: "2026-11-10T09:30:00-07:00",
  day: "2026-11-10", room: "250 A-C", venue: "Salt Palace", level: "2",
  roomType: "breakout", kind: "talk", restrictions: [], crowdEstimate: "moderate",
  crowdBasis: "Combined breakout room", noiseEstimate: "unknown", noiseBasis: "Unknown",
  captions: "wordly-breakout", sourceUrl: "https://example.com/session/1",
};
const hit = { _source: { ...session, description_semantic: "internal", secretExtra: "internal" } };
const response = { took: 3, timed_out: false, _shards: { failed: 0 }, hits: { hits: [hit] } };
const request = (path: string) => new Request(`http://localhost${path}`);
const filters = [
  { term: { day: "2026-11-10" } },
  { bool: { must_not: [{ terms: { restrictions: ["sold-out", "separate-registration", "all-access-pass"] } }] } },
];

const malformedSources = [
  ["missing speakers", { ...session, speakers: undefined }],
  ["non-array speakers", { ...session, speakers: "private upstream detail" }],
  ["null speaker", { ...session, speakers: [null] }],
  ["missing speaker name", { ...session, speakers: [{ company: "Example" }] }],
  ["invalid speaker company", { ...session, speakers: [{ name: "Example", company: 42 }] }],
  ...["id", "eventId", "title", "description", "startsAt", "endsAt", "day", "room",
    "crowdBasis", "noiseBasis", "sourceUrl", "venue", "level", "roomType", "kind",
    "restrictions", "crowdEstimate", "noiseEstimate", "captions"].map((key) =>
    [`missing ${key}`, { ...session, [key]: undefined }] as const),
  ...["id", "eventId", "title", "description", "startsAt", "endsAt", "day", "room",
    "crowdBasis", "noiseBasis", "sourceUrl", "venue", "level", "plainSummary"].map((key) =>
    [`invalid ${key}`, { ...session, [key]: 42 }] as const),
  ...["roomType", "kind", "crowdEstimate", "noiseEstimate", "captions", "summarySource"].map((key) =>
    [`invalid ${key}`, { ...session, [key]: "private upstream detail" }] as const),
  ["non-array restrictions", { ...session, restrictions: "sold-out" }],
  ["invalid restriction", { ...session, restrictions: ["private upstream detail"] }],
  ["null source", null],
] as const;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  createElasticClient.mockReturnValue(elastic);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  elastic.search.mockResolvedValue(response);
  elastic.mget.mockResolvedValue({ docs: [] });
  ({ GET: search } = await import("../app/api/search/route"));
  ({ GET: sessions } = await import("../app/api/sessions/route"));
});

afterEach(() => vi.restoreAllMocks());

describe("search API", () => {
  it("shares one factory-created client across sequential search and mget requests", async () => {
    const results = [
      await search(request("/api/search?q=cluster")),
      await sessions(request("/api/sessions?ids=1")),
      await search(request("/api/search")),
      await sessions(request("/api/sessions?ids=2")),
    ];
    expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200]);
    expect(createElasticClient).toHaveBeenCalledTimes(1);
    expect(elastic.search).toHaveBeenCalledTimes(2);
    expect(elastic.mget).toHaveBeenCalledTimes(2);
    expect(elastic.close).not.toHaveBeenCalled();
  });

  it("warns once with only a coarse event when semantic search fails", async () => {
    const privateQuery = "private-search-text";
    const upstreamDetail = "private upstream detail https://upstream.example Authorization: Bearer secret-token";
    elastic.search.mockRejectedValueOnce(new Error(upstreamDetail));
    const result = await search(request(`/api/search?q=${privateQuery}`));
    expect((await result.json()).mode).toBe("lexical-fallback");
    expect(console.warn).toHaveBeenCalledTimes(1);
    const warning = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(warning).not.toContain(privateQuery);
    expect(warning).not.toContain(upstreamDetail);
    expect(vi.mocked(console.warn).mock.calls).toEqual([[{ event: "search_lexical_fallback" }]]);
  });

  it("runs RRF with identical filters in both branches and returns only Session fields", async () => {
    const result = await search(request("/api/search?q=cluster&day=2026-11-10&excludeRestricted=true"));
    expect(result.status).toBe(200);
    expect(elastic.search.mock.calls[0][0]).toMatchObject({ index: "sessions", size: 30,
      retriever: { rrf: { retrievers: [
        { standard: { query: { bool: { must: [{ multi_match: { query: "cluster", fields: ["title^2", "description"] } }], filter: filters } } } },
        { standard: { query: { bool: { must: [{ semantic: { field: "description_semantic", query: "cluster" } }], filter: filters } } } },
      ] } },
    });
    expect(await result.json()).toEqual({ results: [session], mode: "hybrid", tookMs: expect.any(Number) });
  });

  it("retries lexical search with identical filters when semantic search fails", async () => {
    elastic.search.mockRejectedValueOnce(new Error("private upstream detail"));
    const result = await search(request("/api/search?q=cluster&day=2026-11-10&excludeRestricted=true"));
    expect(elastic.search.mock.calls[1][0]).toMatchObject({ query: { bool: {
      must: [{ multi_match: { query: "cluster", fields: ["title^2", "description"] } }], filter: filters,
    } } });
    expect(await result.json()).toEqual({ results: [session], mode: "lexical-fallback", tookMs: expect.any(Number) });
  });

  it.each(["", "?q=%20%20"])("browses without semantic or hidden day for %s", async (query) => {
    const result = await search(request(`/api/search${query}`));
    expect(elastic.search.mock.calls[0][0]).toMatchObject({ query: { bool: { must: [{ match_all: {} }], filter: [] } }, sort: [{ startsAt: "asc" }, { id: "asc" }] });
    expect(elastic.search.mock.calls[0][0]).not.toHaveProperty("retriever");
    expect((await result.json()).mode).toBe("lexical-fallback");
    expect(elastic.search).toHaveBeenCalledTimes(1);
  });

  it.each(["q=" + "x".repeat(301), "day=2026-02-30", "day=11-10", "excludeRestricted=yes", "q=a&q=b"])("rejects invalid input %s", async (query) => {
    const result = await search(request(`/api/search?${query}`));
    expect(result.status).toBe(400);
    expect((await result.json()).error.code).toBe("INVALID_INPUT");
    expect(elastic.search).not.toHaveBeenCalled();
  });

  it("returns safe 503 when both searches fail", async () => {
    elastic.search.mockRejectedValue(new Error("private upstream detail"));
    const result = await search(request("/api/search?q=cluster"));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: { code: "SEARCH_UNAVAILABLE", message: "Search is temporarily unavailable. Please try again shortly." } });
  });

  it("does not label partial hybrid results hybrid", async () => {
    elastic.search.mockResolvedValueOnce({ ...response, timed_out: true });
    const result = await search(request("/api/search?q=cluster"));
    expect((await result.json()).mode).toBe("lexical-fallback");
    expect(elastic.search).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed session sources returned by search", async () => {
    elastic.search.mockResolvedValue({ ...response, hits: { hits: [{ _source: { speakers: [] } }] } });
    const result = await search(request("/api/search"));
    expect(result.status).toBe(503);
  });
});

describe("sessions API", () => {
  it("uses mget, removes duplicates, omits missing docs and preserves requested order", async () => {
    elastic.mget.mockResolvedValue({ docs: [
      { _id: "1", found: true, ...hit }, { _id: "missing", found: false },
      { _id: "2", found: true, _source: { ...hit._source, id: "2" } },
    ] });
    const result = await sessions(request("/api/sessions?ids=2,missing,1,2"));
    expect(elastic.mget.mock.calls[0][0]).toMatchObject({ index: "sessions", ids: ["2", "missing", "1"] });
    expect(await result.json()).toEqual([{ ...session, id: "2" }, session]);
  });

  it.each(["", "?ids=", "?ids=1,,2", "?ids=a/b", "?ids=" + "a".repeat(129), "?ids=" + Array.from({ length: 51 }, (_, i) => i).join(",")])("rejects invalid ids %s", async (query) => {
    const result = await sessions(request(`/api/sessions${query}`));
    expect(result.status).toBe(400);
    expect(elastic.mget).not.toHaveBeenCalled();
  });

  it("returns safe 503 on upstream failure", async () => {
    elastic.mget.mockRejectedValue(new Error("private upstream detail"));
    const result = await sessions(request("/api/sessions?ids=1"));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: { code: "SESSIONS_UNAVAILABLE", message: "Sessions are temporarily unavailable. Please try again shortly." } });
  });

  it("treats a per-document upstream error as an outage rather than a missing session", async () => {
    elastic.mget.mockResolvedValue({ docs: [{ _id: "1", error: { reason: "private upstream detail" } }] });
    const result = await sessions(request("/api/sessions?ids=1"));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private upstream detail");
  });

  it("rejects malformed session sources returned by mget", async () => {
    elastic.mget.mockResolvedValue({ docs: [{ _id: "1", found: true, _source: { speakers: [] } }] });
    const result = await sessions(request("/api/sessions?ids=1"));
    expect(result.status).toBe(503);
  });
});

describe("untrusted Elastic sources", () => {
  it.each(malformedSources)("rejects %s through search and mget with safe 503 responses", async (_label, source) => {
    elastic.search.mockResolvedValue({ ...response, hits: { hits: [{ _source: source }] } });
    elastic.mget.mockResolvedValue({ docs: [{ _id: "1", found: true, _source: source }] });
    for (const path of ["/api/search", "/api/search?q=cluster"]) {
      const result = await search(request(path));
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ error: { code: "SEARCH_UNAVAILABLE", message: "Search is temporarily unavailable. Please try again shortly." } });
    }
    const result = await sessions(request("/api/sessions?ids=1"));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: { code: "SESSIONS_UNAVAILABLE", message: "Sessions are temporarily unavailable. Please try again shortly." } });
  });

  it("preserves nullable metadata and typed summaries while stripping nested internal fields", async () => {
    const expected: Session = { ...session, venue: null, level: null,
      restrictions: ["sold-out", "separate-registration", "all-access-pass"],
      plainSummary: "A reviewed summary.", summarySource: "ai-reviewed" };
    const source = { ...expected, secretExtra: "internal",
      speakers: [{ ...session.speakers[0], secretExtra: "internal" }] };
    elastic.search.mockResolvedValue({ ...response, hits: { hits: [{ _source: source }] } });
    elastic.mget.mockResolvedValue({ docs: [{ _id: "1", found: true, _source: source }] });
    const searchResult = await search(request("/api/search?q=cluster"));
    expect(await searchResult.json()).toEqual({ results: [expected], mode: "hybrid", tookMs: expect.any(Number) });
    const sessionsResult = await sessions(request("/api/sessions?ids=1"));
    expect(await sessionsResult.json()).toEqual([expected]);
  });
});
