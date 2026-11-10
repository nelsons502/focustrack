import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.sessionStorage.clear();
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
    expect(screen.getByText(/Live captions: Wordly/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /inclusion & accessibility/i }),
    ).toHaveAttribute(
      "href",
      "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/",
    );
    expect(screen.getByText(/Crowd: likely large \(estimate: keynote hall\)/)).toBeInTheDocument();
    expect(screen.getByText(/Noise: unknown/)).toBeInTheDocument();
  });

  it("does not claim captions when captions are unknown", async () => {
    mockSearch({ results: [makeSession()], mode: "hybrid", tookMs: 1 });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    expect(screen.queryByText(/Live captions/)).not.toBeInTheDocument();
    expect(screen.getByText("Captions: not confirmed")).toBeInTheDocument();
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

  it("shows a retryable error when every returned session is malformed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ id: "s1", title: "Incomplete session", speakers: [] }],
        mode: "hybrid",
        tookMs: 1,
      }))
      .mockResolvedValue(jsonResponse({
        results: [makeSession()], mode: "hybrid", tookMs: 1,
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FindSearch />);
    expect(await screen.findByText(
      "Search is temporarily unavailable. Please try again shortly.",
    )).toBeInTheDocument();
    expect(screen.queryByText(/No sessions found/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry search/ }));
    expect(await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    })).toBeInTheDocument();
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
    expect(add).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(add);
    const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw ?? "{}") as LocalState;
    expect(saved.plan.sessionIds).toEqual(["s1"]);
    expect(saved.energy.buildingChangeMinutes).toBe(20);
    expect(saved.energy.flagLoudRooms).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Add to plan: Kubernetes Basics Test Session",
      }),
    ).toHaveAttribute("aria-pressed", "true");
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

  it("applies a day filter automatically after a short debounce without submit", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText(/Day/), {
      target: { value: "2026-11-09" },
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    await waitFor(
      () => expect(fetchMock.mock.calls.length).toBe(callsBefore + 1),
      { timeout: 2000 },
    );
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("day=2026-11-09");
  });

  it("coalesces rapid filter changes into one debounced search", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText(/Day/), {
      target: { value: "2026-11-09" },
    });
    fireEvent.change(screen.getByLabelText(/Day/), {
      target: { value: "2026-11-11" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /restricted/i }));
    await waitFor(
      () => expect(fetchMock.mock.calls.length).toBe(callsBefore + 1),
      { timeout: 2000 },
    );
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("day=2026-11-11");
    expect(url).toContain("excludeRestricted=true");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("does not search or persist a query on typing alone; the query needs Search", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "kubernetes" },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(window.sessionStorage.getItem("focustrack:find:v1")).toContain('"q":""');
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBe(callsBefore + 1),
    );
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("q=kubernetes");
  });

  it("persists query and filters and restores them on remount", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "hybrid",
      tookMs: 1,
    });
    const first = render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "platform" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("q=platform"),
    );
    fireEvent.change(screen.getByLabelText(/Day/), {
      target: { value: "2026-11-12" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /restricted/i }));
    await waitFor(
      () => {
        const stored = window.sessionStorage.getItem("focustrack:find:v1");
        expect(stored).toContain('"q":"platform"');
        expect(stored).toContain("2026-11-12");
        expect(stored).toContain('"excludeRestricted":true');
      },
      { timeout: 2000 },
    );
    first.unmount();
    const callsBefore = fetchMock.mock.calls.length;
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    expect(screen.getByLabelText(/Search sessions/)).toHaveValue("platform");
    expect(screen.getByLabelText(/Day/)).toHaveValue("2026-11-12");
    expect(
      screen.getByRole("checkbox", { name: /restricted/i }),
    ).toBeChecked();
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("q=platform");
    expect(url).toContain("day=2026-11-12");
    expect(url).toContain("excludeRestricted=true");
  });

  it("falls back to defaults when stored find state is corrupt", async () => {
    window.sessionStorage.setItem("focustrack:find:v1", "{not json");
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "hybrid",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    expect(screen.getByLabelText(/Day/)).toHaveValue("2026-11-10");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("day=2026-11-10");
  });

  it("restores stored search state after hydration without a mismatch", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "hybrid",
      tookMs: 1,
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<FindSearch />);
    document.body.append(container);
    window.sessionStorage.setItem(
      "focustrack:find:v1",
      JSON.stringify({
        q: "platform",
        day: "2026-11-12",
        excludeRestricted: true,
      }),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot> | null = null;

    try {
      await act(async () => {
        root = hydrateRoot(container, <FindSearch />);
      });
      expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(
        /hydration|did not match|server html/i,
      );
      expect(screen.getByLabelText(/Search sessions/)).toHaveValue("platform");
      expect(screen.getByLabelText(/Day/)).toHaveValue("2026-11-12");
      expect(screen.getByRole("checkbox", { name: /restricted/i })).toBeChecked();
      await waitFor(() =>
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=platform"),
      );
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it("shows Showing N of M and reveals 30 more without refetching", async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      makeSession({ id: `s${i}`, title: `Paginated Session ${i}` }),
    );
    const fetchMock = mockSearch({
      results: many,
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    expect(
      await screen.findByText(/Showing 30 sessions/, {
        selector: "p.results-meta",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      /Showing 30 sessions/,
    );
    expect(
      screen.queryByRole("heading", { name: "Paginated Session 44" }),
    ).not.toBeInTheDocument();
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Show 30 more" }));
    expect(
      await screen.findByText(/Showing 45 sessions/, {
        selector: "p.results-meta",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Paginated Session 44" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show 30 more" }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("announces the showing count through the live region for small sets", async () => {
    mockSearch({
      results: [makeSession(), makeSession({ id: "s2", title: "Second Session" })],
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", { name: "Second Session" });
    expect(screen.getByText("Showing 2 of 2 sessions")).toBeInTheDocument();
    const statuses = screen.getAllByRole("status");
    expect(statuses[0]).toHaveTextContent("Showing 2 of 2 sessions.");
    expect(
      screen.queryByRole("button", { name: "Show 30 more" }),
    ).not.toBeInTheDocument();
  });

  it("uses the last submitted query, not the draft, when a filter changes", async () => {
    const fetchMock = mockSearch({
      results: [makeSession()],
      mode: "lexical-fallback",
      tookMs: 1,
    });
    render(<FindSearch />);
    await screen.findByRole("heading", {
      name: "Kubernetes Basics Test Session",
    });
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "kubernetes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(
        String(fetchMock.mock.calls.at(-1)?.[0]),
      ).toContain("q=kubernetes"),
    );
    fireEvent.change(screen.getByLabelText(/Search sessions/), {
      target: { value: "unsubmitted draft" },
    });
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox", { name: /restricted/i }));
    await waitFor(
      () => expect(fetchMock.mock.calls.length).toBe(callsBefore + 1),
      { timeout: 2000 },
    );
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("q=kubernetes");
    expect(url).not.toContain("unsubmitted");
    expect(url).toContain("excludeRestricted=true");
  });

  it("does not claim a total when the API returns a full page of results", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeSession({ id: `s${i}`, title: `Capped Session ${i}` }),
    );
    mockSearch({ results: many, mode: "lexical-fallback", tookMs: 1 });
    render(<FindSearch />);
    expect(
      await screen.findByText(/Showing 30 sessions/, {
        selector: "p.results-meta",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "Showing 30 sessions. Showing the first 30 — narrow your search to see others.",
    );
    expect(
      screen.getByText("Showing the first 30 — narrow your search to see others.", {
        selector: "p.results-meta",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Showing 30 of 30 sessions"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show 30 more" }),
    ).not.toBeInTheDocument();
  });

  it("moves focus to the first newly revealed result when showing more", async () => {
    const many = Array.from({ length: 75 }, (_, i) =>
      makeSession({ id: `s${i}`, title: `Focus Session ${i}` }),
    );
    mockSearch({ results: many, mode: "lexical-fallback", tookMs: 1 });
    render(<FindSearch />);
    await screen.findByRole("heading", { name: "Focus Session 0" });
    const showMore = screen.getByRole("button", { name: "Show 30 more" });
    showMore.focus();
    fireEvent.click(showMore);
    await screen.findByRole("heading", { name: "Focus Session 44" });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.textContent).toContain("Focus Session 30");
    const showMoreAgain = screen.getByRole("button", {
      name: "Show 30 more",
    });
    showMoreAgain.focus();
    fireEvent.click(showMoreAgain);
    await screen.findByRole("heading", { name: "Focus Session 74" });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.textContent).toContain("Focus Session 60");
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
