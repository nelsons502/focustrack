import type { LocalState, Reflection, Session } from "../contract";
import { EVENT_TIME_ZONE } from "../event";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const MAX_ANSWER_LENGTH = 2000;

export function eventDay(date: Date): string {
  return dayFormatter.format(date);
}

export function selectEndedToday(
  sessions: Session[],
  state: LocalState,
  now: Date,
): Session[] {
  const today = eventDay(now);
  const planned = new Set(state.plan.sessionIds);
  const skipped = new Set(state.plan.notAttending);
  return sessions
    .filter((session) => {
      if (!planned.has(session.id) || skipped.has(session.id)) return false;
      const end = new Date(session.endsAt).getTime();
      if (Number.isNaN(end) || end > now.getTime()) return false;
      return session.day === today;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function withReflection(
  state: LocalState,
  sessionId: string,
  prompt: string,
  answer: string,
  now: Date,
): LocalState {
  const reflection: Reflection = {
    prompt,
    answer: answer.trim().slice(0, MAX_ANSWER_LENGTH),
    at: now.toISOString(),
  };
  return {
    ...state,
    reflections: { ...state.reflections, [sessionId]: reflection },
  };
}

export function savedReflections(
  sessions: Session[],
  state: LocalState,
): { session: Session; reflection: Reflection }[] {
  const saved = state.reflections ?? {};
  return sessions.flatMap((session) => {
    const reflection = saved[session.id];
    return reflection && reflection.answer.trim() ? [{ session, reflection }] : [];
  });
}
