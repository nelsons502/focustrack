import { resumeSim, startSim, stopSim } from "../client/clock";
import { getLocalStateSnapshot, updateLocalState } from "../client/local-state";
import { clearReflectDismissed } from "../../components/now/now-helpers";
import {
  NOW_OPT_OUT_KEY,
  QUIET_ROOM_260A,
  type LocalState,
  type PlanBreak,
} from "../contract";

// Session IDs and times verified against the live schedule for Tuesday
// 2026-11-10 (event time, -07:00). Titles and abstracts stay out of the repo.
export const MAYA_SESSION_TIMES: ReadonlyArray<{
  id: string;
  startsAt: string;
  endsAt: string;
}> = [
  { id: "1233585", startsAt: "2026-11-10T11:30:00-07:00", endsAt: "2026-11-10T12:00:00-07:00" },
  { id: "1334816", startsAt: "2026-11-10T15:15:00-07:00", endsAt: "2026-11-10T15:40:00-07:00" },
  { id: "1244963", startsAt: "2026-11-10T15:40:00-07:00", endsAt: "2026-11-10T16:10:00-07:00" },
  { id: "1362597", startsAt: "2026-11-10T16:15:00-07:00", endsAt: "2026-11-10T16:35:00-07:00" },
  { id: "1248040", startsAt: "2026-11-10T16:40:00-07:00", endsAt: "2026-11-10T17:10:00-07:00" },
];

export const MAYA_SESSION_IDS: readonly string[] = MAYA_SESSION_TIMES.map(
  (entry) => entry.id,
);

export const MAYA_BREAK: PlanBreak = {
  id: "maya-quiet-break-2026-11-10",
  startsAt: "2026-11-10T12:00:00-07:00",
  endsAt: "2026-11-10T12:20:00-07:00",
  room: QUIET_ROOM_260A,
};

export const MAYA_DEMO_START_ISO = "2026-11-10T11:10:00-07:00";
export const MAYA_DEMO_SPEED = 60;

const MAYA_MOMENTS: readonly string[] = [
  ...new Set(
    [
      ...MAYA_SESSION_TIMES.flatMap((entry) => [entry.startsAt, entry.endsAt]),
      MAYA_BREAK.startsAt,
      MAYA_BREAK.endsAt,
    ].sort((a, b) => Date.parse(a) - Date.parse(b)),
  ),
];

export function applyMayaPlan(state: LocalState): LocalState {
  const demoIds = new Set(MAYA_SESSION_IDS);
  return {
    ...state,
    plan: {
      sessionIds: [...MAYA_SESSION_IDS],
      notAttending: state.plan.notAttending.filter((id) => !demoIds.has(id)),
      breaks: [{ ...MAYA_BREAK }],
    },
  };
}

export function nextDemoMoment(nowMs: number): string | null {
  if (!Number.isFinite(nowMs)) return null;
  for (const moment of MAYA_MOMENTS) {
    if (Date.parse(moment) > nowMs) return moment;
  }
  return null;
}

export function startMayaDemo(): void {
  updateLocalState(applyMayaPlan(getLocalStateSnapshot()));
  try {
    window.sessionStorage.removeItem(NOW_OPT_OUT_KEY);
    MAYA_SESSION_IDS.forEach(clearReflectDismissed);
  } catch {
    // Storage may be unavailable; the demo still starts.
  }
  // Stop first so a paused earlier sim cannot keep the new demo paused.
  stopSim();
  startSim(MAYA_DEMO_START_ISO, MAYA_DEMO_SPEED);
  resumeSim();
}
