import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("keeps notes collapsed, saves lines, undoes the last, and returns focus", async () => {
    seedPlan(["cur"]);
    mockSessions([current]);
    render(<NowScreen nowParam={DEMO} />);
    const toggle = await screen.findByRole("button", { name: "Quick notes" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/One line/)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const input = screen.getByLabelText(/One line/);
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "ask about etcd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    fireEvent.change(input, { target: { value: "second thought" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual([
      "ask about etcd",
      "second thought",
    ]);
    expect(JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) ?? "{}").notes.cur).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Note saved");

    fireEvent.click(screen.getByRole("button", { name: "Undo last note" }));
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual(["ask about etcd"]);
    expect(screen.getByRole("status")).toHaveTextContent("Last note removed");

    fireEvent.keyDown(screen.getByLabelText(/One line/), { key: "Escape" });
    expect(screen.queryByLabelText(/One line/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick notes" })).toHaveFocus();
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
    fireEvent.click(await screen.findByRole("button", { name: "Quick notes" }));
    fireEvent.change(screen.getByLabelText(/One line/), {
      target: { value: "follow up on tracing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close notes" }));
    expect(getLocalStateSnapshot().notes.cur.map((n) => n.text)).toEqual([
      "follow up on tracing",
    ]);
    expect(screen.getByRole("button", { name: "Quick notes" })).toHaveFocus();
  });

  it("keeps the transition note during a break after the previous session", async () => {
    seedPlan(["cur", "nxt"]);
    mockSessions([current, next]);
    render(<NowScreen nowParam="2026-11-10T11:35-07:00" />);
    expect(await screen.findByText(/level changes from Level 2 to Level 3/)).toBeInTheDocument();
    expect(screen.queryByText("Happening now")).not.toBeInTheDocument();
  });
});
