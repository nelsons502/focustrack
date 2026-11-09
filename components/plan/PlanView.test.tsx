import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalState, PlanBreak, Session } from "../../lib/contract";
import { QUIET_ROOM_260A } from "../../lib/contract";
import { LOCAL_STATE_KEY } from "../../lib/contract";
import {
  createDefaultLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import PlanView from "./PlanView";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Morning Talk",
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

function mockSessions(sessions: Session[]) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const ids = String(input).split("ids=")[1]?.split(",") ?? [];
    return jsonResponse(
      ids.flatMap((id) => {
        const session = byId.get(decodeURIComponent(id));
        return session ? [session] : [];
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function savePlan(
  sessionIds: string[],
  extra: Partial<LocalState> = {},
  breaks: PlanBreak[] = [],
) {
  const base = createDefaultLocalState();
  updateLocalState({
    ...base,
    ...extra,
    plan: { sessionIds, notAttending: [], breaks },
    energy: extra.energy ?? base.energy,
  });
}

const gapBreak: PlanBreak = {
  id: "quiet-break-test",
  startsAt: "2026-11-10T16:30:00.000Z",
  endsAt: "2026-11-10T16:50:00.000Z",
  room: QUIET_ROOM_260A,
};

function storedState(): LocalState {
  return JSON.parse(
    window.localStorage.getItem(LOCAL_STATE_KEY) ?? "{}",
  ) as LocalState;
}

beforeEach(() => {
  window.localStorage.clear();
  updateLocalState(createDefaultLocalState());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PlanView", () => {
  it("shows an honest empty plan without any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanView />);
    expect(
      (await screen.findAllByText(/Your plan is empty/)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /Find a session/ }),
    ).toHaveAttribute("href", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains that saved session IDs are sent for schedule lookups", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<PlanView />);
    expect(await screen.findByText(/stored only on this device/)).toBeInTheDocument();
    expect(screen.getByText(/sends the session IDs you saved/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Nothing about your plan is sent/),
    ).not.toBeInTheDocument();
  });

  it("loads saved sessions by ID and shows a Denver timeline", async () => {
    savePlan(["s2", "s1"]);
    const fetchMock = mockSessions([
      makeSession(),
      makeSession({
        id: "s2",
        title: "Later Keynote",
        startsAt: "2026-11-10T18:15:00Z",
        endsAt: "2026-11-10T19:00:00Z",
        room: "Main Hall",
        restrictions: ["all-access-pass"],
        kind: "keynote",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Morning Talk" }),
    ).toBeInTheDocument();
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Morning Talk", "Later Keynote"]);
    expect(screen.getByText(/9:00\s?AM/)).toBeInTheDocument();
    expect(screen.getByText(/11:15\s?AM/)).toBeInTheDocument();
    expect(screen.getByText(/250 A/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ada Example/)).toHaveLength(2);
    expect(screen.getByText(/All-access pass/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/sessions?ids=s2,s1",
    );
  });

  it("shows a friendly error and a working retry", async () => {
    savePlan(["s1"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValue(jsonResponse([makeSession()]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanView />);
    expect(
      await screen.findByText(/temporarily unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(
      await screen.findByRole("heading", { name: "Morning Talk" }),
    ).toBeInTheDocument();
  });

  it("names saved sessions missing from the schedule and can remove them", async () => {
    savePlan(["s1", "gone1"]);
    mockSessions([makeSession()]);
    render(<PlanView />);
    expect(
      await screen.findByText(/no longer in the schedule/),
    ).toBeInTheDocument();
    expect(screen.getByText(/gone1/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove unavailable saved session gone1 from plan",
      }),
    );
    await waitFor(() =>
      expect(storedState().plan.sessionIds).toEqual(["s1"]),
    );
  });

  it("removes a timeline session from the on-device plan", async () => {
    savePlan(["s1"]);
    mockSessions([makeSession()]);
    render(<PlanView />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove from plan: Morning Talk",
      }),
    );
    await waitFor(() =>
      expect(storedState().plan.sessionIds).toEqual([]),
    );
    expect(
      await screen.findByText(/Morning Talk removed from your plan/),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText(/Your plan is empty/)).length,
    ).toBeGreaterThan(0);
  });

  it("shows a loading state while saved sessions load", async () => {
    savePlan(["s1"]);
    let resolveFetch: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    render(<PlanView />);
    expect(
      (await screen.findAllByText(/Loading your saved sessions/)).length,
    ).toBeGreaterThan(0);
    resolveFetch(jsonResponse([makeSession()]));
    expect(
      await screen.findByRole("heading", { name: "Morning Talk" }),
    ).toBeInTheDocument();
  });

  it("checks energy only for the chosen day", async () => {
    savePlan(["tue1", "wed1"]);
    mockSessions([
      makeSession({ id: "tue1", title: "Tuesday Talk" }),
      makeSession({
        id: "wed1",
        title: "Wednesday Loud Talk",
        day: "2026-11-11",
        startsAt: "2026-11-11T16:00:00Z",
        endsAt: "2026-11-11T16:30:00Z",
        noiseEstimate: "loud",
        noiseBasis: "expo-floor room",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Tuesday Talk" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is in a room estimated to be loud/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Day/), {
      target: { value: "2026-11-11" },
    });
    expect(
      await screen.findByText(/is in a room estimated to be loud/),
    ).toBeInTheDocument();
    expect(screen.getByText(/expo-floor room/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Tuesday Talk" }),
    ).not.toBeInTheDocument();
  });

  it("drops the suggested session with one tap when sessions run together", async () => {
    savePlan(["a", "b", "c", "d"]);
    mockSessions([
      makeSession({ id: "a", title: "Talk A" }),
      makeSession({
        id: "b",
        title: "Talk B",
        startsAt: "2026-11-10T16:30:00Z",
        endsAt: "2026-11-10T17:00:00Z",
      }),
      makeSession({
        id: "c",
        title: "Talk C",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
      makeSession({
        id: "d",
        title: "Talk D",
        startsAt: "2026-11-10T17:30:00Z",
        endsAt: "2026-11-10T18:00:00Z",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByText(/4 sessions in a row/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Drop Talk D from plan" }),
    );
    await waitFor(() =>
      expect(storedState().plan.sessionIds).toEqual(["a", "b", "c"]),
    );
  });

  it("explains overlaps, tight moves and long days concretely", async () => {
    savePlan(["a", "b"]);
    mockSessions([
      makeSession({
        id: "a",
        title: "Long Workshop",
        startsAt: "2026-11-10T16:00:00Z",
        endsAt: "2026-11-10T22:30:00Z",
      }),
      makeSession({
        id: "b",
        title: "Nested Talk",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
    ]);
    render(<PlanView />);
    expect(await screen.findByText(/overlap in time/)).toBeInTheDocument();
    expect(screen.getByText(/hours of sessions this day/)).toBeInTheDocument();
    expect(screen.getByText(/Your limit is 5 hours/)).toBeInTheDocument();
  });

  it("warns when the gap between sessions is under the move threshold", async () => {
    savePlan(["a", "b"]);
    mockSessions([
      makeSession({ id: "a", title: "First Talk" }),
      makeSession({
        id: "b",
        title: "Next Talk",
        startsAt: "2026-11-10T16:35:00Z",
        endsAt: "2026-11-10T17:05:00Z",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByText(/Only 5 minutes between/),
    ).toBeInTheDocument();
    expect(screen.getByText(/at least 10 minutes/)).toBeInTheDocument();
  });

  it("saves a suggested quiet-room break into the timeline, once", async () => {
    savePlan(["a", "b"]);
    mockSessions([
      makeSession({
        id: "a",
        title: "Expo Talk",
        noiseEstimate: "loud",
        noiseBasis: "expo-floor room",
      }),
      makeSession({
        id: "b",
        title: "Later Talk",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByText(/20 minutes in the quiet room/),
    ).toBeInTheDocument();
    expect(screen.getByText(/260A/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Add quiet-room break/ }),
    );
    await waitFor(() =>
      expect(storedState().plan.breaks).toEqual([
        {
          id: "quiet-break-2026-11-10T16:30:00.000Z-2026-11-10T16:50:00.000Z",
          startsAt: "2026-11-10T16:30:00.000Z",
          endsAt: "2026-11-10T16:50:00.000Z",
          room: QUIET_ROOM_260A,
        },
      ]),
    );
    expect(storedState().plan.sessionIds).toEqual(["a", "b"]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Expo Talk", "Quiet-room break", "Later Talk"]);
    expect(
      await screen.findByText(/already in your plan/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add quiet-room break/ }),
    ).not.toBeInTheDocument();
  });

  it("reloads a saved break, removes it, and undoes the removal", async () => {
    savePlan(["a", "b"], {}, [gapBreak]);
    mockSessions([
      makeSession({ id: "a", title: "Expo Talk" }),
      makeSession({
        id: "b",
        title: "Later Talk",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
    ]);
    const view = render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
    // Simulate a reload: unmount and render again from stored state.
    view.unmount();
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Remove quiet-room break/ }),
    );
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    expect(
      screen.queryByRole("heading", { name: "Quiet-room break" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await waitFor(() =>
      expect(storedState().plan.breaks).toEqual([gapBreak]),
    );
    expect(
      await screen.findByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
  });

  it("keeps an overlapping saved break visible, explained, and removable", async () => {
    savePlan(["a"], {}, [
      { ...gapBreak, startsAt: "2026-11-10T16:10:00.000Z", endsAt: "2026-11-10T16:40:00.000Z" },
    ]);
    mockSessions([makeSession({ id: "a", title: "Solo Talk" })]);
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Solo Talk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/overlaps a saved session/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Remove quiet-room break/ }),
    );
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    expect(
      screen.queryByRole("heading", { name: "Quiet-room break" }),
    ).not.toBeInTheDocument();
  });

  it("omits energy interventions while a new session lookup is pending", async () => {
    savePlan(["a", "b", "c", "d"]);
    const four = [
      makeSession({ id: "a", title: "Talk A" }),
      makeSession({
        id: "b",
        title: "Talk B",
        startsAt: "2026-11-10T16:30:00Z",
        endsAt: "2026-11-10T17:00:00Z",
      }),
      makeSession({
        id: "c",
        title: "Talk C",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
      makeSession({
        id: "d",
        title: "Talk D",
        startsAt: "2026-11-10T17:30:00Z",
        endsAt: "2026-11-10T18:00:00Z",
      }),
    ];
    const evening = makeSession({
      id: "e",
      title: "Evening Talk",
      startsAt: "2026-11-10T23:00:00Z",
      endsAt: "2026-11-10T23:30:00Z",
    });
    let releaseSecond: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) return jsonResponse(four);
      return new Promise<Response>((resolve) => {
        releaseSecond = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanView />);
    expect(
      await screen.findByRole("button", { name: "Drop Talk D from plan" }),
    ).toBeInTheDocument();
    act(() => {
      const current = storedState();
      updateLocalState({
        ...current,
        plan: { ...current.plan, sessionIds: [...current.plan.sessionIds, "e"] },
      });
    });
    expect(
      await screen.findByText(/Loading your saved sessions/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Talk A" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Drop .* from plan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add quiet-room break/ }),
    ).not.toBeInTheDocument();
    act(() => {
      releaseSecond?.(jsonResponse([...four, evening]));
    });
    expect(
      await screen.findByRole("button", { name: "Drop Talk D from plan" }),
    ).toBeInTheDocument();
  });

  it("does not restore a removed break while a new lookup is pending", async () => {
    savePlan(["a", "b"], {}, [gapBreak]);
    const a = makeSession({ id: "a", title: "Expo Talk" });
    const b = makeSession({
      id: "b",
      title: "Later Talk",
      startsAt: "2026-11-10T17:00:00Z",
      endsAt: "2026-11-10T17:30:00Z",
    });
    const evening = makeSession({
      id: "e",
      title: "Evening Talk",
      startsAt: "2026-11-10T23:00:00Z",
      endsAt: "2026-11-10T23:30:00Z",
    });
    let releaseSecond: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) return jsonResponse([a, b]);
      return new Promise<Response>((resolve) => {
        releaseSecond = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Remove quiet-room break/ }),
    );
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    act(() => {
      const current = storedState();
      updateLocalState({
        ...current,
        plan: { ...current.plan, sessionIds: [...current.plan.sessionIds, "e"] },
      });
    });
    expect(
      await screen.findByText(/Loading your saved sessions/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    act(() => {
      releaseSecond?.(jsonResponse([a, b, evening]));
    });
    expect(
      await screen.findByRole("button", { name: /Undo/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await waitFor(() =>
      expect(storedState().plan.breaks).toEqual([gapBreak]),
    );
  });

  it("does not restore a removed break that no longer sits in a real gap", async () => {
    savePlan(["a", "b"], {}, [gapBreak]);
    mockSessions([
      makeSession({ id: "a", title: "Expo Talk" }),
      makeSession({
        id: "b",
        title: "Later Talk",
        startsAt: "2026-11-10T17:00:00Z",
        endsAt: "2026-11-10T17:30:00Z",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByRole("heading", { name: "Quiet-room break" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Remove quiet-room break/ }),
    );
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from plan: Later Talk" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Loading your saved sessions/),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(storedState().plan.breaks).toEqual([]));
    expect(screen.getByText(/no longer fits between/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Undo/ }),
    ).not.toBeInTheDocument();
  });

  it("persists bounded energy settings through shared state", async () => {
    savePlan(["a", "b"]);
    mockSessions([
      makeSession({ id: "a", title: "First Talk" }),
      makeSession({
        id: "b",
        title: "Second Talk",
        startsAt: "2026-11-10T16:30:00Z",
        endsAt: "2026-11-10T17:00:00Z",
      }),
    ]);
    render(<PlanView />);
    await screen.findByRole("heading", { name: "First Talk" });
    expect(
      screen.queryByText(/sessions in a row/),
    ).not.toBeInTheDocument();
    const maxConsecutive = screen.getByLabelText(/Sessions in a row/);
    expect(maxConsecutive).toHaveAttribute("min", "1");
    expect(maxConsecutive).toHaveAttribute("max", "10");
    fireEvent.change(maxConsecutive, { target: { value: "1" } });
    await waitFor(() =>
      expect(storedState().energy.maxConsecutive).toBe(1),
    );
    expect(
      await screen.findByText(/2 sessions in a row/),
    ).toBeInTheDocument();
    fireEvent.change(maxConsecutive, { target: { value: "99" } });
    await waitFor(() =>
      expect(storedState().energy.maxConsecutive).toBe(10),
    );
  });

  it("stops flagging loud rooms when the toggle is off", async () => {
    savePlan(["a"]);
    mockSessions([
      makeSession({
        id: "a",
        title: "Expo Talk",
        noiseEstimate: "loud",
        noiseBasis: "expo-floor room",
      }),
    ]);
    render(<PlanView />);
    expect(
      await screen.findByText(/is in a room estimated to be loud/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Flag rooms estimated to be loud/));
    await waitFor(() =>
      expect(storedState().energy.flagLoudRooms).toBe(false),
    );
    expect(
      screen.queryByText(/is in a room estimated to be loud/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/No energy concerns for this day/),
    ).toBeInTheDocument();
  });
});
