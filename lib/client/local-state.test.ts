import { describe, expect, it } from "vitest";
import { LOCAL_STATE_KEY } from "../contract";
import {
  addSessionToPlan,
  createDefaultLocalState,
  loadLocalState,
  removeSessionFromPlan,
  saveLocalState,
} from "./local-state";

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
});
