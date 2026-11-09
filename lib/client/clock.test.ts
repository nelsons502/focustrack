import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNow,
  getSimClock,
  pauseSim,
  resumeSim,
  setSpeed,
  startSim,
  stopSim,
  useNow,
} from "./clock";

const KEY = "focustrack:clock";
const SIM_ISO = "2026-11-10T11:10:00-07:00";
const SIM_MS = new Date(SIM_ISO).getTime();
const REAL_T0 = new Date("2026-01-01T00:00:00.000Z").getTime();

function setUrl(path: string): void {
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(REAL_T0);
  window.sessionStorage.clear();
  setUrl("/");
  stopSim();
  vi.setSystemTime(REAL_T0);
});

afterEach(() => {
  stopSim();
  window.sessionStorage.clear();
  setUrl("/");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sim clock math", () => {
  it("advances sim time by elapsed real time times speed", () => {
    startSim(SIM_ISO, 60);
    expect(getNow().getTime()).toBe(SIM_MS);
    vi.setSystemTime(REAL_T0 + 1_000);
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    vi.setSystemTime(REAL_T0 + 2_500);
    expect(getNow().getTime()).toBe(SIM_MS + 150_000);
  });

  it("pause freezes the sim and resume continues without a jump", () => {
    startSim(SIM_ISO, 60);
    vi.setSystemTime(REAL_T0 + 1_000);
    pauseSim();
    expect(getSimClock()?.playing).toBe(false);
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    vi.setSystemTime(REAL_T0 + 10_000);
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    resumeSim();
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    vi.setSystemTime(REAL_T0 + 11_000);
    expect(getNow().getTime()).toBe(SIM_MS + 120_000);
  });

  it("setSpeed preserves the current instant and applies the new rate after", () => {
    startSim(SIM_ISO, 60);
    vi.setSystemTime(REAL_T0 + 1_000);
    setSpeed(1);
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    vi.setSystemTime(REAL_T0 + 3_000);
    expect(getNow().getTime()).toBe(SIM_MS + 62_000);
  });

  it("setSpeed on a paused sim keeps it frozen at the same instant", () => {
    startSim(SIM_ISO, 60);
    vi.setSystemTime(REAL_T0 + 1_000);
    pauseSim();
    setSpeed(300);
    vi.setSystemTime(REAL_T0 + 5_000);
    expect(getNow().getTime()).toBe(SIM_MS + 60_000);
    expect(getSimClock()).toMatchObject({ playing: false, speed: 300 });
  });

  it("startSim seeks an existing sim while preserving its paused state", () => {
    startSim(SIM_ISO, 60);
    pauseSim();
    const seekIso = "2026-11-10T13:00:00-07:00";
    startSim(seekIso, 60);
    vi.setSystemTime(REAL_T0 + 5_000);
    expect(getNow().getTime()).toBe(new Date(seekIso).getTime());
    expect(getSimClock()?.playing).toBe(false);
  });
});

describe("persistence", () => {
  it("persists to sessionStorage and reads back through getSimClock", () => {
    startSim(SIM_ISO, 60);
    const raw = window.sessionStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toEqual({
      playing: true,
      speed: 60,
      simStartMs: SIM_MS,
      realStartMs: REAL_T0,
    });
    expect(getSimClock()).toEqual({
      playing: true,
      speed: 60,
      simStartMs: SIM_MS,
      realStartMs: REAL_T0,
    });
  });

  it("stopSim clears storage and getSimClock", () => {
    startSim(SIM_ISO, 60);
    stopSim();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(getSimClock()).toBeNull();
    expect(getNow().getTime()).toBe(REAL_T0);
  });

  it("getSimClock returns a copy callers cannot mutate into the clock", () => {
    startSim(SIM_ISO, 60);
    const clock = getSimClock();
    if (clock) clock.speed = 999;
    expect(getSimClock()?.speed).toBe(60);
  });

  it("remains usable from memory when sessionStorage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    try {
      expect(() => startSim(SIM_ISO, 60)).not.toThrow();
      vi.setSystemTime(REAL_T0 + 1_000);
      expect(getNow().getTime()).toBe(SIM_MS + 60_000);
      expect(() => stopSim()).not.toThrow();
      expect(getSimClock()).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  });
});

describe("stale storage after a failed write", () => {
  it("pause, speed, seek and stop honor memory, not stale stored state, until a write succeeds", () => {
    startSim(SIM_ISO, 60);
    expect(getSimClock()?.playing).toBe(true);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const removeItem = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      // getItem still returns the stale playing clock throughout.
      vi.setSystemTime(REAL_T0 + 1_000);
      pauseSim();
      expect(getSimClock()).toMatchObject({ playing: false, speed: 60 });
      expect(getNow().getTime()).toBe(SIM_MS + 60_000);
      vi.setSystemTime(REAL_T0 + 10_000);
      expect(getNow().getTime()).toBe(SIM_MS + 60_000);

      setSpeed(300);
      expect(getSimClock()).toMatchObject({ playing: false, speed: 300 });
      vi.setSystemTime(REAL_T0 + 20_000);
      expect(getNow().getTime()).toBe(SIM_MS + 60_000);

      const seekIso = "2026-11-10T13:00:00-07:00";
      startSim(seekIso, 300);
      expect(getSimClock()).toMatchObject({ playing: false, speed: 300 });
      vi.setSystemTime(REAL_T0 + 30_000);
      expect(getNow().getTime()).toBe(new Date(seekIso).getTime());

      stopSim();
      expect(getSimClock()).toBeNull();
      expect(getNow().getTime()).toBe(REAL_T0 + 30_000);
    } finally {
      setItem.mockRestore();
      removeItem.mockRestore();
    }
    // A later successful write makes storage authoritative again.
    startSim(SIM_ISO, 60);
    expect(getSimClock()).toMatchObject({ playing: true, speed: 60 });
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}")).toMatchObject({
      playing: true,
      speed: 60,
      simStartMs: SIM_MS,
    });
  });
});

describe("getNow precedence and invalid state", () => {
  it("paused sim still beats ?now=, which beats real time", () => {
    setUrl(`/?now=${encodeURIComponent("2026-11-10T09:00:00-07:00")}`);
    startSim(SIM_ISO, 60);
    pauseSim();
    vi.setSystemTime(REAL_T0 + 10_000);
    expect(getNow().getTime()).toBe(SIM_MS);
    stopSim();
    expect(getNow().getTime()).toBe(
      new Date("2026-11-10T09:00:00-07:00").getTime(),
    );
  });

  it("falls back to real time when ?now= is invalid or absent", () => {
    setUrl("/?now=not-a-date");
    expect(getNow().getTime()).toBe(REAL_T0);
    setUrl("/");
    expect(getNow().getTime()).toBe(REAL_T0);
  });

  it("ignores invalid stored state without throwing", () => {
    for (const bad of [
      "not-json",
      JSON.stringify({ playing: true, speed: 0, simStartMs: SIM_MS, realStartMs: REAL_T0 }),
      JSON.stringify({ playing: true, speed: -1, simStartMs: SIM_MS, realStartMs: REAL_T0 }),
      JSON.stringify({ playing: "yes", speed: 60, simStartMs: SIM_MS, realStartMs: REAL_T0 }),
      JSON.stringify({ playing: true, speed: 60, simStartMs: "soon", realStartMs: REAL_T0 }),
      JSON.stringify(null),
    ]) {
      window.sessionStorage.setItem(KEY, bad);
      expect(() => getSimClock()).not.toThrow();
      expect(getSimClock()).toBeNull();
      expect(getNow().getTime()).toBe(REAL_T0);
    }
  });

  it("ignores invalid startSim and setSpeed inputs without throwing", () => {
    expect(() => startSim("not-a-date", 60)).not.toThrow();
    expect(() => startSim(SIM_ISO, 0)).not.toThrow();
    expect(() => startSim(SIM_ISO, Number.NaN)).not.toThrow();
    expect(getSimClock()).toBeNull();
    startSim(SIM_ISO, 60);
    expect(() => setSpeed(-5)).not.toThrow();
    expect(() => setSpeed(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(getSimClock()?.speed).toBe(60);
  });

  it("pause, resume and setSpeed are no-ops with no active sim", () => {
    expect(() => {
      pauseSim();
      resumeSim();
      setSpeed(10);
    }).not.toThrow();
    expect(getSimClock()).toBeNull();
  });
});

describe("clock change event and useNow", () => {
  it("dispatches focustrack:clock on sim changes", () => {
    const seen: string[] = [];
    const onClock = (event: Event) => seen.push(event.type);
    window.addEventListener("focustrack:clock", onClock);
    try {
      startSim(SIM_ISO, 60);
      pauseSim();
      resumeSim();
      setSpeed(300);
      stopSim();
    } finally {
      window.removeEventListener("focustrack:clock", onClock);
    }
    expect(seen).toEqual([
      "focustrack:clock",
      "focustrack:clock",
      "focustrack:clock",
      "focustrack:clock",
      "focustrack:clock",
    ]);
  });

  it("useNow returns current time after mount and updates on tick", () => {
    startSim(SIM_ISO, 60);
    const { result } = renderHook(() => useNow(1_000));
    expect(result.current.getTime()).toBe(SIM_MS);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.getTime()).toBe(SIM_MS + 60_000);
  });

  it("useNow updates immediately on the clock event, before the next tick", () => {
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current.getTime()).toBe(REAL_T0);
    act(() => {
      startSim(SIM_ISO, 60);
    });
    expect(result.current.getTime()).toBe(SIM_MS);
    act(() => {
      stopSim();
    });
    expect(result.current.getTime()).toBe(REAL_T0);
  });
});
