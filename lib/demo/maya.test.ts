import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNow, getSimClock, pauseSim, startSim, stopSim } from "../client/clock";
import {
  createDefaultLocalState,
  getLocalStateSnapshot,
  loadLocalState,
  updateLocalState,
} from "../client/local-state";
import {
  NOW_OPT_OUT_KEY,
  QUIET_ROOM_260A,
  type LocalState,
} from "../contract";
import {
  applyMayaPlan,
  MAYA_BREAK,
  MAYA_DEMO_SPEED,
  MAYA_DEMO_START_ISO,
  MAYA_SESSION_IDS,
  MAYA_SESSION_TIMES,
  nextDemoMoment,
  startMayaDemo,
} from "./maya";

function seededState(): LocalState {
  return {
    plan: {
      sessionIds: ["111", "1233585"],
      notAttending: ["1233585", "999"],
      breaks: [],
    },
    notes: { "111": [{ text: "keep me", at: "2026-11-10T10:00:00.000Z" }] },
    energy: { ...createDefaultLocalState().energy, maxConsecutive: 2 },
    reflections: {
      "111": { prompt: "p", answer: "a", at: "2026-11-10T10:00:00.000Z" },
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  stopSim();
  updateLocalState(createDefaultLocalState());
});

afterEach(() => {
  stopSim();
});

describe("Maya demo data", () => {
  it("uses the five verified Tuesday session IDs in order", () => {
    expect(MAYA_SESSION_IDS).toEqual([
      "1233585",
      "1334816",
      "1244963",
      "1362597",
      "1248040",
    ]);
    expect(MAYA_SESSION_TIMES.map((entry) => entry.id)).toEqual(
      MAYA_SESSION_IDS,
    );
  });

  it("puts a 20-minute Quiet Room 260A break between the first and second talk", () => {
    const [first, second] = MAYA_SESSION_TIMES;
    expect(MAYA_BREAK.room).toBe(QUIET_ROOM_260A);
    expect(Date.parse(MAYA_BREAK.startsAt)).toBeGreaterThanOrEqual(
      Date.parse(first.endsAt),
    );
    expect(Date.parse(MAYA_BREAK.endsAt)).toBeLessThanOrEqual(
      Date.parse(second.startsAt),
    );
    expect(
      Date.parse(MAYA_BREAK.endsAt) - Date.parse(MAYA_BREAK.startsAt),
    ).toBe(20 * 60_000);
  });

  it("starts at 11:10 MT on Tuesday at 60x", () => {
    expect(MAYA_DEMO_START_ISO).toBe("2026-11-10T11:10:00-07:00");
    expect(MAYA_DEMO_SPEED).toBe(60);
  });
});

describe("applyMayaPlan", () => {
  it("replaces the plan but keeps notes, settings and reflections", () => {
    const before = seededState();
    const next = applyMayaPlan(before);
    expect(next.plan.sessionIds).toEqual(MAYA_SESSION_IDS);
    expect(next.plan.breaks).toEqual([MAYA_BREAK]);
    expect(next.plan.notAttending).toEqual(["999"]);
    expect(next.notes).toEqual(before.notes);
    expect(next.energy).toEqual(before.energy);
    expect(next.reflections).toEqual(before.reflections);
    expect(before.plan.sessionIds).toEqual(["111", "1233585"]);
  });
});

describe("nextDemoMoment", () => {
  it("finds the next start or end after the given instant", () => {
    expect(nextDemoMoment(Date.parse("2026-11-10T11:10:00-07:00"))).toBe(
      MAYA_SESSION_TIMES[0].startsAt,
    );
    expect(nextDemoMoment(Date.parse(MAYA_SESSION_TIMES[0].startsAt))).toBe(
      MAYA_SESSION_TIMES[0].endsAt,
    );
    expect(nextDemoMoment(Date.parse("2026-11-10T12:05:00-07:00"))).toBe(
      MAYA_BREAK.endsAt,
    );
  });

  it("returns null after the last moment and for invalid input", () => {
    expect(nextDemoMoment(Date.parse("2026-11-10T17:10:00-07:00"))).toBeNull();
    expect(nextDemoMoment(Number.NaN)).toBeNull();
  });
});

describe("startMayaDemo", () => {
  it("loads the plan, restarts a paused clock playing, and clears only the opt-out", () => {
    updateLocalState(seededState());
    window.sessionStorage.setItem(NOW_OPT_OUT_KEY, "1");
    window.sessionStorage.setItem("unrelated", "keep");
    startSim("2026-11-10T09:00:00-07:00", 1);
    pauseSim();

    startMayaDemo();

    const saved = loadLocalState();
    expect(saved.plan.sessionIds).toEqual(MAYA_SESSION_IDS);
    expect(saved.notes).toEqual(seededState().notes);
    const clock = getSimClock();
    expect(clock?.playing).toBe(true);
    expect(clock?.speed).toBe(60);
    expect(clock?.simStartMs).toBe(Date.parse(MAYA_DEMO_START_ISO));
    expect(getNow().getTime()).toBeGreaterThanOrEqual(
      Date.parse(MAYA_DEMO_START_ISO),
    );
    expect(window.sessionStorage.getItem(NOW_OPT_OUT_KEY)).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("preserves in-memory notes, settings and reflections when persisting them failed", () => {
    const seeded = seededState();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    try {
      updateLocalState(seeded);
      expect(getLocalStateSnapshot().notes).toEqual(seeded.notes);
      expect(loadLocalState().notes).toEqual({});

      startMayaDemo();

      const current = getLocalStateSnapshot();
      expect(current.plan.sessionIds).toEqual(MAYA_SESSION_IDS);
      expect(current.notes).toEqual(seeded.notes);
      expect(current.energy).toEqual(seeded.energy);
      expect(current.reflections).toEqual(seeded.reflections);
    } finally {
      setItem.mockRestore();
    }
  });
});
