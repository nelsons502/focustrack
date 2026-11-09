import { describe, expect, it } from "vitest";
import { createDefaultLocalState, loadLocalState, saveLocalState } from "./local-state";
import { savedReflections, selectEndedToday, withReflection } from "./reflection";
import type { LocalState, Session } from "../contract";

function session(id: string, startsAt: string, endsAt: string, day = "2026-11-10"): Session {
  return {
    id, eventId: "kccncna2026", title: `Talk ${id}`, description: "", speakers: [],
    startsAt, endsAt, day, room: "250 A", venue: null, level: null, roomType: "breakout",
    kind: "talk", restrictions: [], crowdEstimate: "unknown", crowdBasis: "",
    noiseEstimate: "unknown", noiseBasis: "", captions: "unknown", sourceUrl: "https://example.com",
  };
}

const early = session("early", "2026-11-10T16:00:00Z", "2026-11-10T16:45:00Z");
const late = session("late", "2026-11-10T18:00:00Z", "2026-11-10T18:45:00Z");
const other = session("other", "2026-11-11T16:00:00Z", "2026-11-11T16:45:00Z", "2026-11-11");
const unplanned = session("unplanned", "2026-11-10T15:00:00Z", "2026-11-10T15:45:00Z");

function stateWith(ids: string[], notAttending: string[] = []): LocalState {
  const state = createDefaultLocalState();
  return { ...state, plan: { sessionIds: ids, notAttending } };
}

const all = [late, early, other, unplanned];

describe("selectEndedToday", () => {
  const now = new Date("2026-11-10T17:00:00Z");

  it("returns only planned sessions that ended today, in time order", () => {
    const state = stateWith(["late", "early", "other"]);
    expect(selectEndedToday(all, state, now).map((s) => s.id)).toEqual(["early"]);
    const later = new Date("2026-11-10T19:00:00Z");
    expect(selectEndedToday(all, state, later).map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("skips sessions marked not attending", () => {
    const state = stateWith(["early"], ["early"]);
    expect(selectEndedToday(all, state, now)).toEqual([]);
  });

  it("is empty when nothing has ended yet", () => {
    const before = new Date("2026-11-10T15:00:00Z");
    expect(selectEndedToday(all, stateWith(["early"]), before)).toEqual([]);
  });

  it("excludes sessions from another day", () => {
    const next = new Date("2026-11-11T20:00:00Z");
    expect(selectEndedToday(all, stateWith(["early", "other"]), next).map((s) => s.id)).toEqual(["other"]);
  });
});

describe("reflections persistence", () => {
  it("saves and loads a reflection through local storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    } as unknown as Storage;
    const next = withReflection(stateWith(["early"]), "early", "Prompt?", "  My answer  ", new Date("2026-11-10T17:00:00Z"));
    expect(saveLocalState(next, storage)).toBe(true);
    const loaded = loadLocalState(storage);
    expect(loaded.reflections?.early).toEqual({
      prompt: "Prompt?",
      answer: "My answer",
      at: "2026-11-10T17:00:00.000Z",
    });
    expect(loaded.plan.sessionIds).toEqual(["early"]);
  });

  it("lists only saved non-empty reflections for the given sessions", () => {
    let state = stateWith(["early", "late"]);
    state = withReflection(state, "early", "P", "Answer", new Date());
    state = withReflection(state, "late", "P", "   ", new Date());
    expect(savedReflections([early, late], state).map((entry) => entry.session.id)).toEqual(["early"]);
  });
});
