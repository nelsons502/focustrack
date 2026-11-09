import { describe, expect, it } from "vitest";
import type { Session } from "../contract";
import {
  describeStartsIn,
  formatDemoLabel,
  minutesUntil,
  resolveNow,
  selectCurrentAndNext,
  transitionNote,
  withNowParam,
} from "./now";
import { createDefaultLocalState } from "./local-state";
import {
  addNote,
  markNotAttending,
  undoLastNote,
  undoNotAttending,
} from "./now-actions";

function session(id: string, start: string, end: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    eventId: "kccncna2026",
    title: `Talk ${id}`,
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

const real = new Date("2026-11-10T20:00:00Z");

describe("resolveNow", () => {
  it("uses the demo param when valid", () => {
    const result = resolveNow("2026-11-10T11:15-07:00", real);
    expect(result.demo).toBe(true);
    expect(result.now.toISOString()).toBe("2026-11-10T18:15:00.000Z");
  });

  it("falls back to the real time without or with a bad param", () => {
    expect(resolveNow(null, real)).toEqual({ now: real, demo: false });
    expect(resolveNow("garbage", real)).toEqual({ now: real, demo: false });
  });

  it("labels demo time in event time", () => {
    const { now } = resolveNow("2026-11-10T11:15-07:00", real);
    expect(formatDemoLabel(now)).toBe("Demo time: Tue 11:15");
  });

  it("only carries a valid demo param into links", () => {
    expect(withNowParam("/", "2026-11-10T11:15-07:00")).toBe(
      "/?now=2026-11-10T11%3A15-07%3A00",
    );
    expect(withNowParam("/", "nope")).toBe("/");
    expect(withNowParam("/", undefined)).toBe("/");
  });
});

describe("selectCurrentAndNext", () => {
  const a = session("a", "10:00", "11:00");
  const b = session("b", "11:30", "12:15");
  const c = session("c", "13:00", "14:00");
  const all = [c, a, b];
  const plan = ["a", "b", "c"];

  it("finds the running session and the next one", () => {
    const now = new Date("2026-11-10T10:30:00-07:00");
    const result = selectCurrentAndNext(all, plan, now);
    expect(result.current?.id).toBe("a");
    expect(result.next?.id).toBe("b");
  });

  it("has no current session in a gap and picks the next", () => {
    const now = new Date("2026-11-10T11:15:00-07:00");
    const result = selectCurrentAndNext(all, plan, now);
    expect(result.current).toBeNull();
    expect(result.next?.id).toBe("b");
  });

  it("treats the end as exclusive", () => {
    const now = new Date("2026-11-10T11:00:00-07:00");
    expect(selectCurrentAndNext(all, plan, now).current).toBeNull();
  });

  it("ignores sessions that are not in the plan", () => {
    const now = new Date("2026-11-10T10:30:00-07:00");
    const result = selectCurrentAndNext(all, ["c"], now);
    expect(result.current).toBeNull();
    expect(result.next?.id).toBe("c");
  });

  it("returns nothing after the last session", () => {
    const now = new Date("2026-11-10T15:00:00-07:00");
    expect(selectCurrentAndNext(all, plan, now)).toEqual({
      current: null,
      next: null,
    });
  });
});

describe("timing helpers", () => {
  it("rounds minutes up and never goes negative", () => {
    const now = new Date("2026-11-10T11:15:30-07:00");
    expect(minutesUntil("2026-11-10T11:30:00-07:00", now)).toBe(15);
    expect(minutesUntil("2026-11-10T11:00:00-07:00", now)).toBe(0);
  });

  it("describes long waits in hours", () => {
    expect(describeStartsIn(15)).toBe("starts in 15 min");
    expect(describeStartsIn(60)).toBe("starts in 1 h");
    expect(describeStartsIn(75)).toBe("starts in 1 h 15 min");
  });
});

describe("transitionNote", () => {
  const from = session("a", "10:00", "11:00");

  it("stays quiet when nothing changes or data is missing", () => {
    expect(transitionNote(from, session("b", "11:00", "12:00"))).toBeNull();
    expect(transitionNote(null, session("b", "11:00", "12:00"))).toBeNull();
    expect(
      transitionNote(from, session("b", "11:00", "12:00", { level: null })),
    ).toBeNull();
  });

  it("names level and venue changes", () => {
    const note = transitionNote(
      from,
      session("b", "11:00", "12:00", { level: "Level 3", venue: "Hyatt" }),
    );
    expect(note).toContain("venue changes from Salt Palace to Hyatt");
    expect(note).toContain("level changes from Level 2 to Level 3");
  });
});

describe("now-actions", () => {
  it("adds trimmed notes and ignores blank ones", () => {
    const base = createDefaultLocalState();
    const at = new Date("2026-11-10T18:00:00Z");
    const saved = addNote(base, "a", "  ask about CRDs ", at);
    expect(saved.notes.a).toEqual([{ text: "ask about CRDs", at: at.toISOString() }]);
    expect(addNote(saved, "a", "   ", at)).toBe(saved);
  });

  it("undoes only the last note", () => {
    const at = new Date();
    let state = addNote(createDefaultLocalState(), "a", "one", at);
    state = addNote(state, "a", "two", at);
    state = undoLastNote(state, "a");
    expect(state.notes.a.map((n) => n.text)).toEqual(["one"]);
    expect(undoLastNote(createDefaultLocalState(), "a").notes).toEqual({});
  });

  it("moves a session to notAttending and restores it", () => {
    const base = createDefaultLocalState();
    base.plan.sessionIds = ["a", "b"];
    const skipped = markNotAttending(base, "a");
    expect(skipped.plan).toEqual({ sessionIds: ["b"], notAttending: ["a"] });
    const restored = undoNotAttending(skipped, "a");
    expect(restored.plan.sessionIds).toContain("a");
    expect(restored.plan.notAttending).toEqual([]);
  });
});
