import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalState, SearchResponse, Session } from "../lib/contract";
import { LOCAL_STATE_KEY } from "../lib/contract";
import FindSearch from "./FindSearch";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Kubernetes Basics Test Session",
    description: "A test description.",
    speakers: [{ name: "Ada Example", company: "Example Co" }],
    startsAt: "2026-11-10T18:15:00Z",
    endsAt: "2026-11-10T19:00:00Z",
    day: "2026-11-10",
    room: "250 A",
    venue: null,
    level: null,
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

function mockSearch(body: SearchResponse) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL): Promise<Response> => {
      void input;
      return jsonResponse(body);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FindSearch", () => {
  it("browses the default Tuesday on load and labels it browsing", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 3,
    });
    render(<FindSearch />);
    expect(
      await screen.findByRole("heading", {
        name: "Kubernetes Basics Test Session",
      }),
    ).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/search");
    expect(url).toContain("day=2026-11-10");
    expect(url).not.toContain("q=");
    expect(screen.getByText(/Browsing schedule/)).toBeInTheDocument();
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
  });

  it("shows event-local time, room, speakers and chips on a card", async () => {
    mockSearch({
      results: [
        makeSession({
          restrictions: ["sold-out", "all-access-pass"],
          captions: "wordly-breakout",
          crowdEstimate: "large",
          crowdBasis: "keynote hall",
          roomType: "keynote-hall",
          kind: "keynote",
        }),
      ],
      mode: "hybrid",
      tookMs: 3,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    expect(screen.getByText(/11:15\s?AM/)).toBeInTheDocument();
    expect(screen.getByText(/250 A/)).toBeInTheDocument();
    expect(screen.getByText(/Ada Example/)).toBeInTheDocument();
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText(/All-access pass/)).toBeInTheDocument();
    expect(screen.getByText(/Wordly/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /accessibility/i }),
    ).toHaveAttribute(
      "href",
      "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/",
    );
    expect(screen.getByText(/Crowd estimate: large/)).toBeInTheDocument();
    expect(screen.getByText(/keynote hall/)).toBeInTheDocument();
    expect(screen.getByText(/Noise estimate: unknown/)).toBeInTheDocument();
  });

  it("does not claim captions when captions are unknown", async () => {
    mockSearch({ results: [makeSession()], mode: "hybrid", tookMs: 1 });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    expect(screen.queryByText(/Wordly/)).not.toBeInTheDocument();
  });

  it("ignores malformed sessions without breaking valid search results", async () => {
    const malformed: unknown = {
      ...makeSession({ title: "Malformed Session" }),
      speakers: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [malformed, makeSession()],
          mode: "hybrid",
          tookMs: 1,
        }),
      ),
    );
    render(<FindSearch />);
    expect(
      await screen.findByRole("heading", {
        name: "Kubernetes Basics Test Session",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Malformed Session" }),
    ).not.toBeInTheDocument();
  });

  it("submits an explicit search and labels keyword fallback honestly", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 2,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "kubernetes" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /restricted/i }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain("q=kubernetes");
    expect(lastUrl).toContain("excludeRestricted=true");
    expect(
      await screen.findByText(/Keyword search fallback/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI-assisted/)).not.toBeInTheDocument();
  });

  it("shows a loading state and then an empty state", async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<FindSearch />);
    expect(await screen.findByText(/Searching/)).toBeInTheDocument();
    resolveFetch(
      jsonResponse({ results: [], mode: "lexical-fallback", tookMs: 1 }),
    );
    expect(await screen.findByText(/No sessions found/)).toBeInTheDocument();
  });

  it("shows a friendly message when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<FindSearch />);
    expect(
      await screen.findByText(
        "Search is temporarily unavailable. Please try again shortly.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it("shows a friendly error with a working retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "SEARCH_UNAVAILABLE",
              message:
                "Search is temporarily unavailable. Please try again shortly.",
            },
          },
          503,
        ),
      )
      .mockResolvedValue(
        jsonResponse({
          results: [makeSession()],
          mode: "hybrid",
          tookMs: 1,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<FindSearch />);
    expect(
      await screen.findByText(/temporarily unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(
      await screen.findByRole("heading", {
        name: "Kubernetes Basics Test Session",
      }),
    ).toBeInTheDocument();
  });

  it("saves a session to the on-device plan", async () => {
    mockSearch({ results: [makeSession()], mode: "hybrid", tookMs: 1 });
    render(<FindSearch />);
    const add = await screen.findByRole("button", {
      name: "Add to plan: Kubernetes Basics Test Session",
    });
    expect(add).not.toHaveAttribute("aria-pressed");
    fireEvent.click(add);
    const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw ?? "{}") as LocalState;
    expect(saved.plan.sessionIds).toEqual(["s1"]);
    expect(saved.energy.buildingChangeMinutes).toBe(20);
    expect(saved.energy.flagLoudRooms).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "In your plan — remove: Kubernetes Basics Test Session",
      }),
    ).toHaveTextContent("In your plan — remove");
    expect(screen.getByText(/added to your plan/)).toBeInTheDocument();
  });

  it("shows a demo time banner for a valid now pin and stays safe when invalid", async () => {
    window.history.replaceState(
      null,
      "",
      "/?now=2026-11-10T11%3A15-07%3A00",
    );
    mockSearch({ results: [], mode: "lexical-fallback", tookMs: 1 });
    render(<FindSearch />);
    expect(await screen.findByText(/Demo time/)).toBeInTheDocument();
    expect(screen.getByText(/11:15\s?AM/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Clear demo time/ }),
    ).toBeInTheDocument();
  });

  it("interprets a bare demo time in the event time zone", async () => {
    window.history.replaceState(null, "", "/?now=2026-11-10T11%3A15");
    mockSearch({ results: [], mode: "lexical-fallback", tookMs: 1 });
    render(<FindSearch />);
    expect(await screen.findByText(/Demo time/)).toBeInTheDocument();
    expect(screen.getByText(/11:15\s?AM/)).toBeInTheDocument();
  });

  it("ignores a stale response that arrives after a newer search", async () => {
    const resolvers: ((value: Response) => void)[] = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<FindSearch />);
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "fresh" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(resolvers.length).toBe(2));
    resolvers[1]?.(
      jsonResponse({
        results: [makeSession({ id: "new", title: "Fresh Result Session" })],
        mode: "hybrid",
        tookMs: 1,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Fresh Result Session" }),
    ).toBeInTheDocument();
    resolvers[0]?.(
      jsonResponse({
        results: [makeSession({ id: "old", title: "Stale Result Session" })],
        mode: "hybrid",
        tookMs: 1,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Stale Result Session" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Fresh Result Session" }),
    ).toBeInTheDocument();
  });

  it("ignores an invalid now pin without breaking search", async () => {
    window.history.replaceState(null, "", "/?now=not-a-time");
    mockSearch({ results: [makeSession()], mode: "hybrid", tookMs: 1 });
    render(<FindSearch />);
    expect(
      await screen.findByRole("heading", {
        name: "Kubernetes Basics Test Session",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Demo time:/)).not.toBeInTheDocument();
  });
});
