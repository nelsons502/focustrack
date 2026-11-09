import { describe, expect, it } from "vitest";
import type { PlanBreak, Session } from "../../lib/contract";
import { QUIET_ROOM_260A } from "../../lib/contract";
import { createDefaultLocalState } from "../../lib/client/local-state";
import {
  applyNotepadText,
  findTakeoverSession,
  isHeadsUp,
  notesToDraft,
  selectNowTimeline,
} from "./now-helpers";

function makeSession(id: string, start: string, end: string): Session {
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
  };
}

const talk = makeSession("a", "10:30", "11:30");
const later = makeSession("b", "12:00", "12:30");
const planBreak: PlanBreak = {
  id: "br1",
  startsAt: "2026-11-10T11:30:00-07:00",
  endsAt: "2026-11-10T11:50:00-07:00",
  room: QUIET_ROOM_260A,
};

function at(time: string): Date {
  return new Date(`2026-11-10T${time}:00-07:00`);
}

describe("selectNowTimeline", () => {
  it("shows a planned break as the current item and the next talk after it", () => {
    const result = selectNowTimeline([talk, later], ["a", "b"], [planBreak], at("11:40"));
    expect(result.currentTalk).toBeNull();
    expect(result.currentBreak?.id).toBe("br1");
    expect(result.nextItem).toEqual({ kind: "talk", session: later, startsAt: later.startsAt });
  });

  it("picks a break as the next item when it comes before the next talk", () => {
    const result = selectNowTimeline([talk, later], ["a", "b"], [planBreak], at("11:00"));
    expect(result.currentTalk?.id).toBe("a");
    expect(result.nextItem?.kind).toBe("break");
  });

  it("offers reflect for the last talk within 15 minutes, even with no next talk", () => {
    const within = selectNowTimeline([talk], ["a"], [], at("11:44"));
    expect(within.reflectCandidate?.id).toBe("a");
    const after = selectNowTimeline([talk], ["a"], [], at("11:46"));
    expect(after.reflectCandidate).toBeNull();
  });

  it("flags the 10 minute heads-up window", () => {
    expect(isHeadsUp(at("11:50"), later.startsAt)).toBe(true);
    expect(isHeadsUp(at("11:49"), later.startsAt)).toBe(false);
  });
});

describe("findTakeoverSession", () => {
  it("returns an in-progress planned talk and respects notAttending", () => {
    expect(
      findTakeoverSession([talk], { sessionIds: ["a"], notAttending: [] }, at("11:00"))?.id,
    ).toBe("a");
    expect(
      findTakeoverSession([talk], { sessionIds: ["a"], notAttending: ["a"] }, at("11:00")),
    ).toBeNull();
    expect(
      findTakeoverSession([talk], { sessionIds: ["a"], notAttending: [] }, at("11:30")),
    ).toBeNull();
  });
});

describe("notepad notes migration", () => {
  it("joins old entries with newlines and writes back as one entry", () => {
    const entries = [
      { text: "first", at: "2026-11-10T17:00:00.000Z" },
      { text: "second", at: "2026-11-10T17:05:00.000Z" },
    ];
    expect(notesToDraft(entries)).toBe("first\nsecond");
    const state = createDefaultLocalState();
    state.notes.a = entries;
    state.plan.sessionIds = ["a"];
    const next = applyNotepadText(state, "a", "first\nsecond\nthird", at("11:00"));
    expect(next.notes.a).toEqual([{ text: "first\nsecond\nthird", at: at("11:00").toISOString() }]);
    expect(next.plan.sessionIds).toEqual(["a"]);
  });

  it("persists clearing as an empty notes array and leaves unchanged text untouched", () => {
    const state = createDefaultLocalState();
    state.notes.a = [{ text: "keep?", at: "2026-11-10T17:00:00.000Z" }];
    expect(applyNotepadText(state, "a", "", at("11:00")).notes.a).toEqual([]);
    expect(applyNotepadText(state, "a", "keep?", at("11:00"))).toBe(state);
  });
});
