import { describe, expect, it } from "vitest";
import { DEFAULT_ENERGY_SETTINGS } from "../contract";
import {
  clampEnergySettings,
  createPlanBreak,
  ENERGY_SETTING_BOUNDS,
  formatMinutes,
  hasRealBreakGap,
  normalizePlanBreaks,
} from "./plan";
import { QUIET_ROOM_260A } from "../contract";

describe("plan helpers", () => {
  it("keeps the approved defaults inside the setting bounds", () => {
    expect(clampEnergySettings(DEFAULT_ENERGY_SETTINGS)).toEqual(
      DEFAULT_ENERGY_SETTINGS,
    );
    expect(ENERGY_SETTING_BOUNDS.maxConsecutive).toEqual({
      min: 1,
      max: 10,
      step: 1,
    });
  });

  it("clamps out-of-range and non-finite settings to sensible bounds", () => {
    const clamped = clampEnergySettings({
      ...DEFAULT_ENERGY_SETTINGS,
      maxConsecutive: 99,
      minBreakMinutes: -5,
      maxDailyHours: Number.NaN,
    });
    expect(clamped.maxConsecutive).toBe(10);
    expect(clamped.minBreakMinutes).toBe(0);
    expect(clamped.maxDailyHours).toBe(DEFAULT_ENERGY_SETTINGS.maxDailyHours);
  });

  it("keeps the consecutive-session limit a whole number of sessions", () => {
    expect(
      clampEnergySettings({ ...DEFAULT_ENERGY_SETTINGS, maxConsecutive: 2.5 })
        .maxConsecutive,
    ).toBe(3);
    expect(
      clampEnergySettings({ ...DEFAULT_ENERGY_SETTINGS, maxConsecutive: 0.4 })
        .maxConsecutive,
    ).toBe(1);
  });

  it("formats minute counts without needless decimals", () => {
    expect(formatMinutes(20)).toBe("20");
    expect(formatMinutes(5.5)).toBe("5.5");
  });

  it("only accepts a break that fits inside a real gap", () => {
    const sessions = [
      { startsAt: "2026-11-10T16:00:00Z", endsAt: "2026-11-10T16:30:00Z" },
      { startsAt: "2026-11-10T17:00:00Z", endsAt: "2026-11-10T17:30:00Z" },
    ];
    expect(
      hasRealBreakGap(sessions, "2026-11-10T16:30:00Z", 20),
    ).toBe(true);
    expect(
      hasRealBreakGap(sessions, "2026-11-10T16:30:00Z", 31),
    ).toBe(false);
    expect(hasRealBreakGap(sessions, "2026-11-10T17:30:00Z", 20)).toBe(false);
    expect(hasRealBreakGap(sessions, "not-a-time", 20)).toBe(false);
  });

  it("creates a quiet-room break of minBreakMinutes inside a real gap only", () => {
    const sessions = [
      { startsAt: "2026-11-10T16:00:00Z", endsAt: "2026-11-10T16:30:00Z" },
      { startsAt: "2026-11-10T17:00:00Z", endsAt: "2026-11-10T17:30:00Z" },
    ];
    const created = createPlanBreak(sessions, [], "2026-11-10T16:30:00Z", 20);
    expect(created).toEqual({
      id: "quiet-break-2026-11-10T16:30:00.000Z-2026-11-10T16:50:00.000Z",
      startsAt: "2026-11-10T16:30:00.000Z",
      endsAt: "2026-11-10T16:50:00.000Z",
      room: QUIET_ROOM_260A,
    });
    // Too long for the gap, inside a session, after the last session,
    // before the first, and a zero-length break are all refused.
    expect(createPlanBreak(sessions, [], "2026-11-10T16:30:00Z", 31)).toBeNull();
    expect(createPlanBreak(sessions, [], "2026-11-10T16:15:00Z", 20)).toBeNull();
    expect(createPlanBreak(sessions, [], "2026-11-10T17:30:00Z", 20)).toBeNull();
    expect(createPlanBreak(sessions, [], "2026-11-10T15:30:00Z", 20)).toBeNull();
    expect(createPlanBreak(sessions, [], "2026-11-10T16:30:00Z", 0)).toBeNull();
    expect(createPlanBreak(sessions, [], "not-a-time", 20)).toBeNull();
    // Duplicate or overlapping an existing break is refused.
    expect(
      createPlanBreak(sessions, [created!], "2026-11-10T16:30:00Z", 20),
    ).toBeNull();
    expect(
      createPlanBreak(sessions, [created!], "2026-11-10T16:40:00Z", 10),
    ).toBeNull();
  });

  it("rejects bare local break dates without an offset", () => {
    const bare = {
      id: "bare-local",
      startsAt: "2026-11-10T16:30:00",
      endsAt: "2026-11-10T16:50:00",
      room: QUIET_ROOM_260A,
    };
    expect(normalizePlanBreaks([bare])).toEqual([]);
  });

  it("rejects a break when either end is missing an offset", () => {
    const missingEnd = {
      id: "missing-end-offset",
      startsAt: "2026-11-10T16:30:00.000Z",
      endsAt: "2026-11-10T16:50:00",
      room: QUIET_ROOM_260A,
    };
    const missingStart = {
      id: "missing-start-offset",
      startsAt: "2026-11-10T16:30:00",
      endsAt: "2026-11-10T16:50:00.000Z",
      room: QUIET_ROOM_260A,
    };
    expect(normalizePlanBreaks([missingEnd])).toEqual([]);
    expect(normalizePlanBreaks([missingStart])).toEqual([]);
  });

  it("keeps valid Z and numeric-offset breaks with a UTC round-trip", () => {
    expect(
      normalizePlanBreaks([
        {
          id: "zulu",
          startsAt: "2026-11-10T16:30:00Z",
          endsAt: "2026-11-10T16:50:00Z",
          room: QUIET_ROOM_260A,
        },
      ]),
    ).toEqual([
      {
        id: "zulu",
        startsAt: "2026-11-10T16:30:00.000Z",
        endsAt: "2026-11-10T16:50:00.000Z",
        room: QUIET_ROOM_260A,
      },
    ]);
    expect(
      normalizePlanBreaks([
        {
          id: "offset",
          startsAt: "2026-11-10T09:30:00-07:00",
          endsAt: "2026-11-10T09:50:00-07:00",
          room: QUIET_ROOM_260A,
        },
      ]),
    ).toEqual([
      {
        id: "offset",
        startsAt: "2026-11-10T16:30:00.000Z",
        endsAt: "2026-11-10T16:50:00.000Z",
        room: QUIET_ROOM_260A,
      },
    ]);
  });
});
