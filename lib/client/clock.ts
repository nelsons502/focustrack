import { useEffect, useState } from "react";
import { parseDemoNow } from "./time";

export type SimClock = {
  playing: boolean;
  speed: number;
  simStartMs: number;
  realStartMs: number;
};

const STORAGE_KEY = "focustrack:clock";
const CLOCK_EVENT = "focustrack:clock";

// Memory mirror so the clock stays usable when sessionStorage is unavailable
// (private mode, storage denied). On-device plan data is never touched here.
let memoryClock: SimClock | null = null;
let memoryIsAuthoritative = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSpeed(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseClock(value: unknown): SimClock | null {
  if (!isRecord(value)) return null;
  if (typeof value.playing !== "boolean") return null;
  if (!isValidSpeed(value.speed)) return null;
  if (typeof value.simStartMs !== "number" || !Number.isFinite(value.simStartMs)) return null;
  if (typeof value.realStartMs !== "number" || !Number.isFinite(value.realStartMs)) return null;
  return {
    playing: value.playing,
    speed: value.speed,
    simStartMs: value.simStartMs,
    realStartMs: value.realStartMs,
  };
}

function readClock(): SimClock | null {
  // A failed write leaves storage stale (possibly still playing, or still
  // holding a clock stop tried to remove), so memory — including null —
  // wins until another write succeeds and clears this flag.
  if (memoryIsAuthoritative) return memoryClock;
  try {
    if (typeof window === "undefined") return memoryClock;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseClock(JSON.parse(raw) as unknown);
      memoryClock = parsed;
      memoryIsAuthoritative = false;
      return parsed;
    }
    // A stored value was removed (or never written) in a working storage;
    // only fall back to memory when storage previously failed us.
    return memoryIsAuthoritative ? memoryClock : null;
  } catch {
    memoryIsAuthoritative = true;
    return memoryClock;
  }
}

function notify(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLOCK_EVENT));
    }
  } catch {
    // A clock change must never throw into the calling screen.
  }
}

function writeClock(clock: SimClock | null): void {
  memoryClock = clock ? { ...clock } : null;
  try {
    if (typeof window === "undefined") {
      memoryIsAuthoritative = true;
    } else if (clock) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clock));
      memoryIsAuthoritative = false;
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
      memoryIsAuthoritative = false;
    }
  } catch {
    memoryIsAuthoritative = true;
  }
  notify();
}

function simNowMs(clock: SimClock, realMs: number): number {
  return clock.simStartMs + (clock.playing ? (realMs - clock.realStartMs) * clock.speed : 0);
}

export function getSimClock(): SimClock | null {
  const clock = readClock();
  return clock ? { ...clock } : null;
}

export function getNow(): Date {
  const clock = readClock();
  if (clock) return new Date(simNowMs(clock, Date.now()));
  try {
    if (typeof window !== "undefined") {
      const demo = parseDemoNow(new URLSearchParams(window.location.search).get("now"));
      if (demo) return demo;
    }
  } catch {
    // Fall through to real time.
  }
  return new Date();
}

export function startSim(simStartIso: string, speed: number): void {
  const simStart = parseDemoNow(simStartIso);
  if (!simStart || !isValidSpeed(speed)) return;
  const simStartMs = simStart.getTime();
  const existing = readClock();
  writeClock({
    // Seeking an existing sim (jump to a moment) keeps its play/pause state,
    // so a paused demo stays paused at the new instant.
    playing: existing ? existing.playing : true,
    speed,
    simStartMs,
    realStartMs: Date.now(),
  });
}

export function pauseSim(): void {
  const clock = readClock();
  if (!clock || !clock.playing) return;
  const realMs = Date.now();
  writeClock({ ...clock, playing: false, simStartMs: simNowMs(clock, realMs), realStartMs: realMs });
}

export function resumeSim(): void {
  const clock = readClock();
  if (!clock || clock.playing) return;
  writeClock({ ...clock, playing: true, realStartMs: Date.now() });
}

export function setSpeed(speed: number): void {
  if (!isValidSpeed(speed)) return;
  const clock = readClock();
  if (!clock) return;
  const realMs = Date.now();
  writeClock({ ...clock, speed, simStartMs: simNowMs(clock, realMs), realStartMs: realMs });
}

export function stopSim(): void {
  writeClock(null);
}

export function useNow(tickMs = 1000): Date {
  // Epoch placeholder on the server and the first client render, so SSR and
  // hydration agree; the effect replaces it immediately after mount.
  const [now, setNow] = useState<Date>(() => new Date(0));

  useEffect(() => {
    const update = () => {
      const next = getNow();
      setNow((previous) => (previous.getTime() === next.getTime() ? previous : next));
    };
    update();
    const intervalMs = Number.isFinite(tickMs) && tickMs > 0 ? tickMs : 1000;
    const timer = window.setInterval(update, intervalMs);
    window.addEventListener(CLOCK_EVENT, update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(CLOCK_EVENT, update);
    };
  }, [tickMs]);

  return now;
}
