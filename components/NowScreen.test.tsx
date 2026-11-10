import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../lib/contract";
import { LOCAL_STATE_KEY } from "../lib/contract";
import {
  createDefaultLocalState,
  getLocalStateSnapshot,
  updateLocalState,
} from "../lib/client/local-state";
import NowScreen from "./NowScreen";

const DEMO = "2026-11-10T11:15-07:00";

function makeSession(id: string, start: string, end: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    eventId: "kccncna2026",
    title: `Session ${id}`,
    description: "",
    speakers: [],
    startsAt: `2026-11-10T${start}:00-07:00`,
    endsAt: `2026-11-10T${end}:00-07:00`,
    day: "2026-11-10",
    room: `Room ${id}`,
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
    sourceUrl: "",
    ...extra,
  };
}

const current = makeSession("cur", "10:30", "11:30");
const next = makeSession("nxt", "11:45", "12:30", { level: "Level 3" });

function mockSessions(sessions: Session[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    void input;
    return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(sessions),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedPlan(ids: string[]) {
  const state = createDefaultLocalState();
  state.plan.sessionIds = ids;
  updateLocalState(state);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  updateLocalState(createDefaultLocalState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NowScreen", () => {
  it("shows an empty state with a link to Find when the plan is empty", async () => {
    mockSessions([]);
    render(<NowScreen nowParam={DEMO} />);
    expect(await screen.findByText(/Your plan is empty/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a session" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/\?now=/),
    );
  });

  it("shows the demo label and the current and next sessions", async () => {
    seedPlan(["cur", "nxt"]);
    const fetchMock = mockSessions([current, next]);
    render(<NowScreen nowParam={DEMO} />);
    expect(screen.getByText("Demo time: Tue 11:15")).toBeInTheDocument();
    expect(await screen.findByText("Session cur")).toBeInTheDocument();
    expect(screen.getByText("Room cur · Level 2 · Salt Palace")).toBeInTheDocument();
    expect(screen.getByText(/Ends at/)).toHaveTextContent("11:30");
    expect(screen.getByText("Session nxt")).toBeInTheDocument();
    expect(screen.getByText(/starts in 30 min/)).toBeInTheDocument();
    expect(screen.getByText(/level changes from Level 2 to Level 3/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/sessions?ids=");
  });

  it("only shows captions when the data sources them", async () => {
    seedPlan(["cur"]);
    mockSessions([makeSession("cur", "10:30", "11:30", { captions: "wordly-breakout" })]);
    render(<NowScreen nowParam={DEMO} />);
    expect(await screen.findByText(/Wordly live captions/)).toBeInTheDocument();
    expect(screen.queryByText(/quiet room is/i)).not.toBeInTheDocument();
  });

  it("moves to what is next when not attending, and can undo", async () => {
    seedPlan(["cur", "nxt"]);
    mockSessions([current, next]);
    render(<NowScreen nowParam={DEMO} />);
    fireEvent.click(await screen.findByRole("button", { name: /not attending/ }));
    expect(getLocalStateSnapshot().plan.notAttending).toEqual(["cur"]);
    expect(getLocalStateSnapshot().plan.sessionIds).toEqual(["nxt"]);
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();
    expect(screen.getByText("Session nxt")).toBeInTheDocument();
    const undo = screen.getByRole("button", { name: /Undo, I am going/ });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(getLocalStateSnapshot().plan.notAttending).toEqual([]);
    expect(await screen.findByText("Happening now")).toBeInTheDocument();
  });

  it("keeps notes collapsed, autosaves the notepad after a pause, and returns focus", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    const toggle = await screen.findByRole("button", { name: "Notes" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/Write freely/)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const input = screen.getByLabelText(/Write freely/);
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "ask about etcd\nsecond thought" } });
    expect(getLocalStateSnapshot().notes.cur).toBeUndefined();
    await waitFor(
      () =>
        expect(getLocalStateSnapshot().notes.cur?.map((n) => n.text)).toEqual([
          "ask about etcd\nsecond thought",
        ]),
      { timeout: 3000 },
    );
    expect(JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) ?? "{}").notes.cur).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    fireEvent.keyDown(screen.getByLabelText(/Write freely/), { key: "Escape" });
    expect(screen.queryByLabelText(/Write freely/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toHaveFocus();
  });

  it("labels the Notes button, traps focus in the sheet, and locks body scroll", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    const toggle = await screen.findByRole("button", { name: "Notes" });
    expect(toggle).toHaveAttribute("aria-controls", "now-notes-sheet");
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog", { name: "Session cur" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    const done = screen.getByRole("button", { name: "Done" });
    done.focus();
    fireEvent.keyDown(done, { key: "Tab", shiftKey: true });
    expect(screen.getByLabelText(/Write freely/)).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText(/Write freely/), { key: "Tab" });
    expect(done).toHaveFocus();
    fireEvent.keyDown(done, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Notes" })).toHaveFocus();
  });

  describe("on a large screen", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        })),
      );
    });

    it("docks the notepad in a panel headed by the session title and autosaves", async () => {
      seedPlan(["cur"]);
      mockSessions([current]);
      render(<NowScreen nowParam={DEMO} />);
      const panel = await screen.findByRole("complementary", { name: "Session cur" });
      expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
      const input = screen.getByLabelText(/Write freely/);
      expect(panel).toContainElement(input);
      fireEvent.change(input, { target: { value: "panel note" } });
      await waitFor(
        () => expect(getLocalStateSnapshot().notes.cur?.map((n) => n.text)).toEqual(["panel note"]),
        { timeout: 3000 },
      );
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
    });

    it("shows the last ended session's notes, and saves a draft to its own session at the boundary", async () => {
      const state = createDefaultLocalState();
      state.plan.sessionIds = ["cur", "nxt"];
      state.notes.nxt = [{ text: "next note", at: "2026-11-10T18:50:00.000Z" }];
      updateLocalState(state);
      mockSessions([current, next]);
      const view = render(<NowScreen nowParam="2026-11-10T11:25-07:00" />);
      fireEvent.change(await screen.findByLabelText(/Write freely/), {
        target: { value: "late thought" },
      });
      view.rerender(<NowScreen nowParam="2026-11-10T11:50-07:00" />);
      expect(await screen.findByRole("complementary", { name: "Session nxt" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Write freely/)).toHaveValue("next note");
      await waitFor(() =>
        expect(getLocalStateSnapshot().notes.cur?.map((n) => n.text)).toEqual(["late thought"]),
      );
      expect(getLocalStateSnapshot().notes.nxt?.map((n) => n.text)).toEqual(["next note"]);

      view.rerender(<NowScreen nowParam="2026-11-10T13:00-07:00" />);
      expect(await screen.findByRole("complementary", { name: "Session nxt" })).toBeInTheDocument();
    });

    it("shows a calm empty state with no session", async () => {
      mockSessions([]);
      render(<NowScreen nowParam={DEMO} />);
      expect(await screen.findByText(/Nothing to write yet/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Write freely/)).not.toBeInTheDocument();
    });
  });

  it("shows a retryable error when sessions fail to load", async () => {
    seedPlan(["cur"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => ({ ok: false, status: 503, json: () => Promise.resolve({}) }) as Response),
    );
    render(<NowScreen nowParam={DEMO} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("autosaves an unsent line when the drawer closes", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByLabelText(/Write freely/), {
      target: { value: "follow up on tracing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual([
      "follow up on tracing",
    ]);
    expect(screen.getByRole("button", { name: "Notes" })).toHaveFocus();
  });

  it("keeps an unsent line focused on its original session when the next session starts", async () => {
    seedPlan(["cur", "nxt"]);
    mockSessions([current, next]);
    const { rerender } = render(<NowScreen nowParam={DEMO} />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByLabelText(/Write freely/), {
      target: { value: "ask about the next session" },
    });

    rerender(<NowScreen nowParam="2026-11-10T11:50-07:00" />);

    expect(await screen.findByText("Session nxt")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Session cur" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Write freely/)).toHaveValue("ask about the next session");
    expect(screen.getByLabelText(/Write freely/)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getLocalStateSnapshot().notes.cur.map((note) => note.text)).toEqual([
      "ask about the next session",
    ]);
    expect(getLocalStateSnapshot().notes.nxt).toBeUndefined();
    expect(screen.queryByLabelText(/Write freely/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toHaveFocus();
  });

  it("keeps the transition note during a break after the previous session", async () => {
    seedPlan(["cur", "nxt"]);
    mockSessions([current, next]);
    render(<NowScreen nowParam="2026-11-10T11:35-07:00" />);
    expect(await screen.findByText(/level changes from Level 2 to Level 3/)).toBeInTheDocument();
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();
  });

  it("keeps the drawer and draft when the talk ends mid-typing, then saves to that talk", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    const view = render(<NowScreen nowParam="2026-11-10T11:25-07:00" />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByLabelText(/Write freely/), { target: { value: "last thought" } });
    view.rerender(<NowScreen nowParam="2026-11-10T11:35-07:00" />);
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Session cur" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Write freely/)).toHaveValue("last thought");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual(["last thought"]);
    expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("flushes a pending draft to its own session, not the new current session", async () => {
    const a = makeSession("a", "10:30", "11:30");
    const b = makeSession("b", "11:30", "12:30");
    const state = createDefaultLocalState();
    state.plan.sessionIds = ["a", "b"];
    state.notes.b = [{ text: "b note", at: "2026-11-10T18:31:00.000Z" }];
    updateLocalState(state);
    mockSessions([a, b]);
    const view = render(<NowScreen nowParam="2026-11-10T11:25-07:00" />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByLabelText(/Write freely/), { target: { value: "a note" } });
    view.rerender(<NowScreen nowParam="2026-11-10T11:31-07:00" />);
    expect(screen.getByRole("dialog", { name: "Session a" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getLocalStateSnapshot().notes.a.map((n) => n.text)).toEqual(["a note"]);
    expect(getLocalStateSnapshot().notes.b.map((n) => n.text)).toEqual(["b note"]);

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByRole("dialog", { name: "Session b" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Write freely/)).toHaveValue("b note");
    expect(getLocalStateSnapshot().notes.a.map((note) => note.text)).toEqual(["a note"]);
  });

  it("migrates old note entries into the notepad and persists clearing it", async () => {
    const state = createDefaultLocalState();
    state.plan.sessionIds = ["cur"];
    state.notes.cur = [
      { text: "first line", at: "2026-11-10T17:00:00.000Z" },
      { text: "second line", at: "2026-11-10T17:05:00.000Z" },
    ];
    updateLocalState(state);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    expect(screen.getByLabelText(/Write freely/)).toHaveValue("first line\nsecond line");
    fireEvent.change(screen.getByLabelText(/Write freely/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getLocalStateSnapshot().notes.cur).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByLabelText(/Write freely/)).toHaveValue("");
  });

  it("shows a planned break as the current item with its room and end", async () => {
    const state = createDefaultLocalState();
    state.plan.sessionIds = ["cur", "nxt"];
    state.plan.breaks = [
      {
        id: "br1",
        startsAt: "2026-11-10T11:30:00-07:00",
        endsAt: "2026-11-10T11:50:00-07:00",
        room: "Salt Palace, Level 2, 260A",
      },
    ];
    updateLocalState(state);
    mockSessions([current, next]);
    render(<NowScreen nowParam="2026-11-10T11:40-07:00" />);
    expect(await screen.findByText("On a break")).toBeInTheDocument();
    expect(screen.getByText("Salt Palace, Level 2, 260A")).toBeInTheDocument();
    expect(screen.getByText(/Ends at/)).toHaveTextContent("11:50");
  });

  it("shows a heads-up within 10 minutes with transition advice", async () => {
    seedPlan(["cur", "nxt"]);
    mockSessions([current, next]);
    render(<NowScreen nowParam="2026-11-10T11:38-07:00" />);
    expect(
      await screen.findByText(/Next: Session nxt in 7 min · Room nxt · Level 3/),
    ).toBeInTheDocument();
    expect(screen.getByText(/level changes from Level 2 to Level 3/)).toBeInTheDocument();
  });

  it("offers reflect within 15 minutes after the last talk, dismissibly", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam="2026-11-10T11:40-07:00" />);
    expect(await screen.findByText("Reflect on Session cur?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reflect on Session cur" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/reflect\?now=/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Reflect on Session cur?")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("focustrack:reflect-dismissed:cur")).toBe("1");
  });

  it("flushes a pending draft on unmount", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    const view = render(<NowScreen nowParam={DEMO} />);
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByLabelText(/Write freely/), {
      target: { value: "typed just before leaving" },
    });
    view.unmount();
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual([
      "typed just before leaving",
    ]);
  });

  it("sets the session opt-out from Browse talks instead", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    const link = await screen.findByRole("link", { name: "Browse talks instead" });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/\?now=/));
    fireEvent.click(link);
    expect(window.sessionStorage.getItem("focustrack:now-opt-out")).toBe("1");
  });

  it("sets the session opt-out from the bottom Find sessions link", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    const link = await screen.findByRole("link", { name: "Find sessions" });
    fireEvent.click(link);
    expect(window.sessionStorage.getItem("focustrack:now-opt-out")).toBe("1");
  });
});

it.each(["Done", "Escape"])("returns focus to the main content after a talk ends and Notes closes with %s", async (action) => {
  seedPlan(["cur"]);
  mockSessions([current]);
  const view = render(<NowScreen nowParam="2026-11-10T11:25-07:00" />);
  fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
  fireEvent.change(screen.getByLabelText(/Write freely/), { target: { value: "final thought" } });
  view.rerender(<NowScreen nowParam="2026-11-10T11:35-07:00" />);
  if (action === "Done") fireEvent.click(screen.getByRole("button", { name: "Done" }));
  else fireEvent.keyDown(screen.getByLabelText(/Write freely/), { key: "Escape" });
  expect(getLocalStateSnapshot().notes.cur.map((note) => note.text)).toEqual(["final thought"]);
  await waitFor(() => expect(document.getElementById("main")).toHaveFocus());
});

it("moves the desktop notepad to the next talk after a whitespace-only draft", async () => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  seedPlan(["cur", "nxt"]);
  mockSessions([current, next]);
  const view = render(<NowScreen nowParam="2026-11-10T11:25-07:00" />);
  fireEvent.change(await screen.findByLabelText(/Write freely/), { target: { value: " \n " } });
  fireEvent(window, new Event("pagehide"));
  view.rerender(<NowScreen nowParam="2026-11-10T11:50-07:00" />);
  expect(await screen.findByRole("complementary", { name: "Session nxt" })).toBeInTheDocument();
});

it("does not reopen the notes sheet after resizing to desktop and back", async () => {
  let wide = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    get matches() { return wide; }, media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })));
  seedPlan(["cur"]);
  mockSessions([current]);
  render(<NowScreen nowParam={DEMO} />);
  fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => { wide = true; listeners.forEach((listener) => listener()); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(() => { wide = false; listeners.forEach((listener) => listener()); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});
