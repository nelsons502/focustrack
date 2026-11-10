import { NOW_OPT_OUT_KEY, type LocalState, type NoteEntry, type PlanBreak, type Session } from "../../lib/contract";

export { NOW_OPT_OUT_KEY } from "../../lib/contract";
export const HEADS_UP_WINDOW_MS = 10 * 60_000;
export const REFLECT_WINDOW_MS = 15 * 60_000;

function reflectDismissKey(sessionId: string): string {
  return `focustrack:reflect-dismissed:${sessionId}`;
}

function readSessionFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, "1");
  } catch {
    // Session flags are a convenience; losing one must never break the screen.
  }
}

export function hasNowOptOut(): boolean {
  return readSessionFlag(NOW_OPT_OUT_KEY);
}

export function setNowOptOut(): void {
  writeSessionFlag(NOW_OPT_OUT_KEY);
}

export function isReflectDismissed(sessionId: string): boolean {
  return readSessionFlag(reflectDismissKey(sessionId));
}

export function dismissReflect(sessionId: string): void {
  writeSessionFlag(reflectDismissKey(sessionId));
}

export function clearReflectDismissed(sessionId: string): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(reflectDismissKey(sessionId));
  } catch {
    // Session flags are a convenience; losing one must never break the screen.
  }
}

function time(value: string): number {
  return new Date(value).getTime();
}

function validSessions(sessions: Session[], planIds: string[]): Session[] {
  const inPlan = new Set(planIds);
  return sessions.filter(
    (session) =>
      inPlan.has(session.id) &&
      Number.isFinite(time(session.startsAt)) &&
      Number.isFinite(time(session.endsAt)),
  );
}

function validBreaks(breaks: PlanBreak[]): PlanBreak[] {
  return breaks.filter(
    (entry) => Number.isFinite(time(entry.startsAt)) && Number.isFinite(time(entry.endsAt)),
  );
}

export type NextItem =
  | { kind: "talk"; session: Session; startsAt: string }
  | { kind: "break"; planBreak: PlanBreak; startsAt: string };

export type NowTimeline = {
  currentTalk: Session | null;
  currentBreak: PlanBreak | null;
  nextTalk: Session | null;
  nextItem: NextItem | null;
  previousTalk: Session | null;
  reflectCandidate: Session | null;
};

export function selectNowTimeline(
  sessions: Session[],
  planIds: string[],
  breaks: PlanBreak[],
  now: Date,
): NowTimeline {
  const at = now.getTime();
  const valid = validSessions(sessions, planIds);
  const plannedBreaks = validBreaks(breaks);

  const currentTalk =
    valid
      .filter((s) => time(s.startsAt) <= at && at < time(s.endsAt))
      .sort((a, b) => time(b.startsAt) - time(a.startsAt))[0] ?? null;
  const currentBreak =
    plannedBreaks
      .filter((b) => time(b.startsAt) <= at && at < time(b.endsAt))
      .sort((a, b) => time(b.startsAt) - time(a.startsAt))[0] ?? null;
  const nextTalk =
    valid
      .filter((s) => time(s.startsAt) > at && s.id !== currentTalk?.id)
      .sort((a, b) => time(a.startsAt) - time(b.startsAt))[0] ?? null;
  const nextBreak =
    plannedBreaks
      .filter((b) => time(b.startsAt) > at)
      .sort((a, b) => time(a.startsAt) - time(b.startsAt))[0] ?? null;

  let nextItem: NextItem | null = null;
  if (nextTalk && nextBreak) {
    nextItem =
      time(nextBreak.startsAt) < time(nextTalk.startsAt)
        ? { kind: "break", planBreak: nextBreak, startsAt: nextBreak.startsAt }
        : { kind: "talk", session: nextTalk, startsAt: nextTalk.startsAt };
  } else if (nextTalk) {
    nextItem = { kind: "talk", session: nextTalk, startsAt: nextTalk.startsAt };
  } else if (nextBreak) {
    nextItem = { kind: "break", planBreak: nextBreak, startsAt: nextBreak.startsAt };
  }

  // The shared selectCurrentAndNext only reports a previous talk when a next
  // talk exists, so the most recently ended talk is found here directly.
  const previousTalk =
    valid
      .filter((s) => time(s.endsAt) <= at)
      .sort((a, b) => time(b.endsAt) - time(a.endsAt))[0] ?? null;
  const reflectCandidate =
    previousTalk && at - time(previousTalk.endsAt) <= REFLECT_WINDOW_MS
      ? previousTalk
      : null;

  return { currentTalk, currentBreak, nextTalk, nextItem, previousTalk, reflectCandidate };
}

export function isHeadsUp(now: Date, startsAt: string): boolean {
  const diff = time(startsAt) - now.getTime();
  return diff > 0 && diff <= HEADS_UP_WINDOW_MS;
}

export function findTakeoverSession(
  sessions: Session[],
  plan: { sessionIds: string[]; notAttending: string[] },
  now: Date,
): Session | null {
  const skipped = new Set(plan.notAttending);
  const eligible = plan.sessionIds.filter((id) => !skipped.has(id));
  return selectNowTimeline(sessions, eligible, [], now).currentTalk;
}

export function notesToDraft(entries: NoteEntry[] | undefined): string {
  return (entries ?? []).map((entry) => entry.text).join("\n");
}

export function applyNotepadText(
  state: LocalState,
  sessionId: string,
  text: string,
  at: Date,
): LocalState {
  if (notesToDraft(state.notes[sessionId]) === text) return state;
  const entries: NoteEntry[] = text.trim() ? [{ text, at: at.toISOString() }] : [];
  return { ...state, notes: { ...state.notes, [sessionId]: entries } };
}
