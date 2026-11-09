import type { Session } from "../contract";
import { EVENT_TIME_ZONE } from "../event";
import { parseDemoNow } from "./time";

export type ResolvedNow = { now: Date; demo: boolean };

export function resolveNow(
  raw: string | null | undefined,
  real: Date,
): ResolvedNow {
  const demo = parseDemoNow(raw ?? null);
  return demo ? { now: demo, demo: true } : { now: real, demo: false };
}

const demoFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDemoLabel(date: Date): string {
  const parts = Object.fromEntries(
    demoFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `Demo time: ${parts.weekday} ${parts.hour}:${parts.minute}`;
}

export function withNowParam(path: string, raw: string | null | undefined): string {
  if (!parseDemoNow(raw ?? null) || !raw) return path;
  return `${path}?now=${encodeURIComponent(raw)}`;
}

function time(value: string): number {
  return new Date(value).getTime();
}

export type NowSelection = { current: Session | null; next: Session | null };

export function selectCurrentAndNext(
  sessions: Session[],
  planIds: string[],
  now: Date,
): NowSelection {
  const at = now.getTime();
  const inPlan = new Set(planIds);
  const valid = sessions.filter(
    (session) =>
      inPlan.has(session.id) &&
      Number.isFinite(time(session.startsAt)) &&
      Number.isFinite(time(session.endsAt)),
  );
  const running = valid
    .filter((s) => time(s.startsAt) <= at && at < time(s.endsAt))
    .sort((a, b) => time(b.startsAt) - time(a.startsAt));
  const current = running[0] ?? null;
  const upcoming = valid
    .filter((s) => time(s.startsAt) > at && s.id !== current?.id)
    .sort((a, b) => time(a.startsAt) - time(b.startsAt));
  return { current, next: upcoming[0] ?? null };
}

export function minutesUntil(startsAt: string, now: Date): number {
  return Math.max(0, Math.ceil((time(startsAt) - now.getTime()) / 60_000));
}

export function describeStartsIn(minutes: number): string {
  if (minutes < 60) return `starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `starts in ${hours} h`
    : `starts in ${hours} h ${rest} min`;
}

export function transitionNote(
  from: Session | null,
  to: Session,
): string | null {
  if (!from) return null;
  const changes: string[] = [];
  if (from.venue && to.venue && from.venue !== to.venue) {
    changes.push(`venue changes from ${from.venue} to ${to.venue}`);
  }
  if (from.level && to.level && from.level !== to.level) {
    changes.push(`level changes from ${from.level} to ${to.level}`);
  }
  if (changes.length === 0) return null;
  const text = changes.join(" and ");
  return `Heads up: ${text}. Leave a little extra time.`;
}
