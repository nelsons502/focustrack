import { describe, expect, it } from "vitest";
import { LOCAL_STATE_KEY, QUIET_ROOM_260A, type PlanBreak } from "../contract";
import {
  addBreakToPlan,
  addSessionToPlan,
  createDefaultLocalState,
  loadLocalState,
  removeBreakFromPlan,
  removeSessionFromPlan,
  saveLocalState,
} from "./local-state";

const sampleBreak: PlanBreak = {
  id: "quiet-break-1",
  startsAt: "2026-11-10T16:30:00.000Z",
  endsAt: "2026-11-10T16:50:00.000Z",
  room: QUIET_ROOM_260A,
};

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("local state helper", () => {
  it("defaults include the approved energy settings", () => {
    const state = createDefaultLocalState();
    expect(state.plan.sessionIds).toEqual([]);
    expect(state.energy.buildingChangeMinutes).toBe(20);
    expect(state.energy.flagLoudRooms).toBe(true);
  });

  it("returns defaults for invalid JSON instead of throwing", () => {
    const storage = memoryStorage({ [LOCAL_STATE_KEY]: "{not json" });
    expect(loadLocalState(storage)).toEqual(createDefaultLocalState());
  });

  it("returns defaults when storage is missing or throws", () => {
    expect(loadLocalState(null)).toEqual(createDefaultLocalState());
    const throwing: Storage = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadLocalState(throwing)).toEqual(createDefaultLocalState());
  });

  it("fills newer energy fields from defaults when older state lacks them", () => {
    const stored = {
      plan: { sessionIds: ["s1"], notAttending: [] },
      notes: {},
      energy: { maxConsecutive: 2 },
    };
    const storage = memoryStorage({
      [LOCAL_STATE_KEY]: JSON.stringify(stored),
    });
    const loaded = loadLocalState(storage);
    expect(loaded.plan.sessionIds).toEqual(["s1"]);
    expect(loaded.energy.maxConsecutive).toBe(2);
    expect(loaded.energy.buildingChangeMinutes).toBe(20);
    expect(loaded.energy.flagLoudRooms).toBe(true);
  });

  it("round-trips through storage and reports save failure calmly", () => {
    const storage = memoryStorage();
    const state = addSessionToPlan(createDefaultLocalState(), "abc");
    expect(saveLocalState(state, storage)).toBe(true);
    expect(loadLocalState(storage).plan.sessionIds).toEqual(["abc"]);
    const throwing: Storage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(saveLocalState(state, throwing)).toBe(false);
  });

  it("adds once and removes from the plan", () => {
    const once = addSessionToPlan(createDefaultLocalState(), "x");
    const twice = addSessionToPlan(once, "x");
    expect(twice.plan.sessionIds).toEqual(["x"]);
    expect(removeSessionFromPlan(twice, "x").plan.sessionIds).toEqual([]);
  });

  it("defaults breaks to empty for legacy state without plan.breaks", () => {
    expect(createDefaultLocalState().plan.breaks).toEqual([]);
    const stored = {
      plan: { sessionIds: ["s1"], notAttending: [] },
      notes: {},
      energy: {},
    };
    const storage = memoryStorage({
      [LOCAL_STATE_KEY]: JSON.stringify(stored),
    });
    const loaded = loadLocalState(storage);
    expect(loaded.plan.sessionIds).toEqual(["s1"]);
    expect(loaded.plan.breaks).toEqual([]);
  });

  it("preserves breaks when saving or removing a talk (Find helpers)", () => {
    const withBreak = addBreakToPlan(createDefaultLocalState(), sampleBreak);
    const added = addSessionToPlan(withBreak, "talk-1");
    expect(added.plan.sessionIds).toEqual(["talk-1"]);
    expect(added.plan.breaks).toEqual([sampleBreak]);
    const removed = removeSessionFromPlan(added, "talk-1");
    expect(removed.plan.sessionIds).toEqual([]);
    expect(removed.plan.breaks).toEqual([sampleBreak]);
    expect(added.plan.sessionIds).not.toContain(sampleBreak.id);
  });

  it("keeps only valid, non-duplicate, non-overlapping breaks on load", () => {
    const stored = {
      plan: {
        sessionIds: ["s1"],
        notAttending: [],
        breaks: [
          { ...sampleBreak, id: "bad-room", room: "Somewhere else" },
          { ...sampleBreak, id: "bad-end", endsAt: sampleBreak.startsAt },
          { ...sampleBreak, id: "bad-time", startsAt: "not-a-time" },
          { ...sampleBreak, id: "" },
          "nonsense",
          sampleBreak,
          { ...sampleBreak, id: "dup-range" },
          {
            ...sampleBreak,
            id: "overlaps",
            startsAt: "2026-11-10T16:40:00.000Z",
            endsAt: "2026-11-10T17:00:00.000Z",
          },
          {
            ...sampleBreak,
            id: "later",
            startsAt: "2026-11-10T18:00:00.000Z",
            endsAt: "2026-11-10T18:20:00.000Z",
          },
        ],
      },
      notes: {},
      energy: {},
    };
    const storage = memoryStorage({
      [LOCAL_STATE_KEY]: JSON.stringify(stored),
    });
    expect(loadLocalState(storage).plan.breaks).toEqual([
      sampleBreak,
      {
        ...sampleBreak,
        id: "later",
        startsAt: "2026-11-10T18:00:00.000Z",
        endsAt: "2026-11-10T18:20:00.000Z",
      },
    ]);
  });

  it("defaults non-array breaks to empty and round-trips valid breaks", () => {
    const bad = memoryStorage({
      [LOCAL_STATE_KEY]: JSON.stringify({
        plan: { sessionIds: [], notAttending: [], breaks: "nope" },
        notes: {},
        energy: {},
      }),
    });
    expect(loadLocalState(bad).plan.breaks).toEqual([]);
    const storage = memoryStorage();
    const state = addBreakToPlan(createDefaultLocalState(), sampleBreak);
    expect(saveLocalState(state, storage)).toBe(true);
    expect(loadLocalState(storage).plan.breaks).toEqual([sampleBreak]);
  });

  it("adds a break once, rejects overlaps, and removes it", () => {
    const once = addBreakToPlan(createDefaultLocalState(), sampleBreak);
    expect(addBreakToPlan(once, sampleBreak)).toBe(once);
    expect(
      addBreakToPlan(once, { ...sampleBreak, id: "other-id" }).plan.breaks,
    ).toEqual([sampleBreak]);
    expect(
      addBreakToPlan(once, {
        ...sampleBreak,
        id: "clash",
        startsAt: "2026-11-10T16:45:00.000Z",
        endsAt: "2026-11-10T17:05:00.000Z",
      }).plan.breaks,
    ).toEqual([sampleBreak]);
    expect(removeBreakFromPlan(once, sampleBreak.id).plan.breaks).toEqual([]);
    expect(removeBreakFromPlan(once, "missing")).toBe(once);
  });
});
