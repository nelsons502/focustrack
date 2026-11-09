import {
  DEFAULT_ENERGY_SETTINGS,
  QUIET_ROOM_260A,
  type EnergySettings,
  type PlanBreak,
} from "../contract";

export type NumericEnergyKey = Exclude<keyof EnergySettings, "flagLoudRooms">;

export const ENERGY_SETTING_BOUNDS: Record<
  NumericEnergyKey,
  { min: number; max: number; step: number }
> = {
  maxConsecutive: { min: 1, max: 10, step: 1 },
  minBreakMinutes: { min: 0, max: 120, step: 5 },
  transitionMinutes: { min: 0, max: 60, step: 5 },
  levelChangeMinutes: { min: 0, max: 90, step: 5 },
  buildingChangeMinutes: { min: 0, max: 120, step: 5 },
  maxDailyHours: { min: 1, max: 12, step: 0.5 },
};

function clampValue(key: NumericEnergyKey, value: number): number {
  const bounds = ENERGY_SETTING_BOUNDS[key];
  if (!Number.isFinite(value)) return DEFAULT_ENERGY_SETTINGS[key];
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function clampEnergySettings(settings: EnergySettings): EnergySettings {
  return {
    maxConsecutive: clampValue(
      "maxConsecutive",
      Math.round(settings.maxConsecutive),
    ),
    minBreakMinutes: clampValue("minBreakMinutes", settings.minBreakMinutes),
    transitionMinutes: clampValue(
      "transitionMinutes",
      settings.transitionMinutes,
    ),
    levelChangeMinutes: clampValue(
      "levelChangeMinutes",
      settings.levelChangeMinutes,
    ),
    buildingChangeMinutes: clampValue(
      "buildingChangeMinutes",
      settings.buildingChangeMinutes,
    ),
    maxDailyHours: clampValue("maxDailyHours", settings.maxDailyHours),
    flagLoudRooms: settings.flagLoudRooms,
  };
}

export function formatMinutes(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatHours(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

type TimeRange = { startsAt: string; endsAt: string };

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasInstantOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

export function normalizePlanBreaks(value: unknown): PlanBreak[] {
  if (!Array.isArray(value)) return [];
  const valid: PlanBreak[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.id !== "string" || entry.id.trim() === "") continue;
    if (entry.room !== QUIET_ROOM_260A) continue;
    if (typeof entry.startsAt !== "string" || typeof entry.endsAt !== "string") {
      continue;
    }
    if (!hasInstantOffset(entry.startsAt) || !hasInstantOffset(entry.endsAt)) {
      continue;
    }
    const start = Date.parse(entry.startsAt);
    const end = Date.parse(entry.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    valid.push({
      id: entry.id,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      room: QUIET_ROOM_260A,
    });
  }
  valid.sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      Date.parse(a.endsAt) - Date.parse(b.endsAt),
  );
  const kept: PlanBreak[] = [];
  const seenIds = new Set<string>();
  for (const entry of valid) {
    if (seenIds.has(entry.id)) continue;
    const start = Date.parse(entry.startsAt);
    const end = Date.parse(entry.endsAt);
    const clashes = kept.some((other) =>
      rangesOverlap(start, end, Date.parse(other.startsAt), Date.parse(other.endsAt)),
    );
    if (clashes) continue;
    seenIds.add(entry.id);
    kept.push(entry);
  }
  return kept;
}

export function breakOverlapsSessions(
  sessions: TimeRange[],
  planBreak: TimeRange,
): boolean {
  const breakStart = Date.parse(planBreak.startsAt);
  const breakEnd = Date.parse(planBreak.endsAt);
  if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd)) return true;
  return sessions.some((session) => {
    const start = Date.parse(session.startsAt);
    const end = Date.parse(session.endsAt);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      rangesOverlap(breakStart, breakEnd, start, end)
    );
  });
}

export function hasRealBreakGap(
  sessions: TimeRange[],
  startsAt: string,
  minutes: number,
): boolean {
  const breakStart = Date.parse(startsAt);
  if (!Number.isFinite(breakStart)) return false;
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  const breakEnd = breakStart + minutes * 60_000;
  if (
    breakOverlapsSessions(sessions, {
      startsAt: new Date(breakStart).toISOString(),
      endsAt: new Date(breakEnd).toISOString(),
    })
  ) {
    return false;
  }
  const hasSessionBefore = sessions.some(
    (session) => Date.parse(session.endsAt) <= breakStart,
  );
  const hasSessionAfter = sessions.some(
    (session) => Date.parse(session.startsAt) >= breakEnd,
  );
  return hasSessionBefore && hasSessionAfter;
}

export function createPlanBreak(
  sessions: TimeRange[],
  existingBreaks: PlanBreak[],
  startsAt: string,
  minutes: number,
): PlanBreak | null {
  if (!hasRealBreakGap(sessions, startsAt, minutes)) return null;
  const breakStart = Date.parse(startsAt);
  const breakEnd = breakStart + minutes * 60_000;
  const clash = normalizePlanBreaks(existingBreaks).some((other) =>
    rangesOverlap(
      breakStart,
      breakEnd,
      Date.parse(other.startsAt),
      Date.parse(other.endsAt),
    ),
  );
  if (clash) return null;
  const startIso = new Date(breakStart).toISOString();
  const endIso = new Date(breakEnd).toISOString();
  return {
    id: `quiet-break-${startIso}-${endIso}`,
    startsAt: startIso,
    endsAt: endIso,
    room: QUIET_ROOM_260A,
  };
}
