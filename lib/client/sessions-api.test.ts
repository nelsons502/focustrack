import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../contract";
import { buildSessionsUrl, fetchSessionsByIds } from "./sessions-api";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Saved Talk",
    description: "A test description.",
    speakers: [{ name: "Ada Example", company: "Example Co" }],
    startsAt: "2026-11-10T16:00:00Z",
    endsAt: "2026-11-10T16:30:00Z",
    day: "2026-11-10",
    room: "250 A",
    venue: "Salt Palace",
    level: "Level 2",
    roomType: "breakout",
    kind: "talk",
    restrictions: [],
    crowdEstimate: "unknown",
    crowdBasis: "",
    noiseEstimate: "unknown",
    noiseBasis: "",
    captions: "unknown",
    sourceUrl: "https://example.test/session",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sessions lookup API client", () => {
  it("makes no network request for an empty plan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchSessionsByIds([], new AbortController().signal),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks up only session IDs, deduplicated, in one request", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        void input;
        return jsonResponse([makeSession(), makeSession({ id: "s2" })]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchSessionsByIds(
      ["s1", "s2", "s1"],
      new AbortController().signal,
    );
    expect(result.map((session) => session.id)).toEqual(["s1", "s2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe("/api/sessions?ids=s1,s2");
  });

  it("batches lookups at 50 IDs per request", async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `id${index + 1}`);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input).split("ids=")[1]?.split(",") ?? [];
      return jsonResponse(
        requested.map((id) => makeSession({ id })),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchSessionsByIds(
      ids,
      new AbortController().signal,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstIds = String(fetchMock.mock.calls[0]?.[0]).split("ids=")[1];
    const secondIds = String(fetchMock.mock.calls[1]?.[0]).split("ids=")[1];
    expect(firstIds?.split(",")).toHaveLength(50);
    expect(secondIds?.split(",")).toEqual(["id51"]);
    expect(result).toHaveLength(51);
  });

  it("builds a sessions URL with only the ids parameter", () => {
    expect(buildSessionsUrl(["a", "b c"])).toBe("/api/sessions?ids=a,b%20c");
  });

  it("filters malformed sessions and keeps valid ones", async () => {
    const malformed: unknown = { ...makeSession({ id: "bad" }), speakers: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([malformed, makeSession()])),
    );
    const result = await fetchSessionsByIds(
      ["bad", "s1"],
      new AbortController().signal,
    );
    expect(result.map((session) => session.id)).toEqual(["s1"]);
  });

  it("does not send malformed stored IDs to the API", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        void input;
        return jsonResponse([makeSession()]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchSessionsByIds(
      ["s1", "not a valid id!", ""],
      new AbortController().signal,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/sessions?ids=s1",
    );
  });

  it("surfaces the friendly server message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "SESSIONS_UNAVAILABLE",
              message:
                "Sessions are temporarily unavailable. Please try again shortly.",
            },
          },
          503,
        ),
      ),
    );
    await expect(
      fetchSessionsByIds(["s1"], new AbortController().signal),
    ).rejects.toThrow(
      "Sessions are temporarily unavailable. Please try again shortly.",
    );
  });

  it("hides raw network errors behind a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      fetchSessionsByIds(["s1"], new AbortController().signal),
    ).rejects.toThrow(/could not be loaded.*try again/i);
  });

  it("rejects a non-array response with a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [] })),
    );
    await expect(
      fetchSessionsByIds(["s1"], new AbortController().signal),
    ).rejects.toThrow(/could not be loaded.*try again/i);
  });
});
