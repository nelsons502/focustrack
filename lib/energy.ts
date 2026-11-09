import { EVENT_UTC_OFFSET, QUIET_ROOM_260A } from './contract';
import type { EnergyResult, EnergySettings, Session, Warning } from './contract';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const EVENT_OFFSET = -Date.parse(`1970-01-01T00:00:00${EVENT_UTC_OFFSET}`);

function dayStart(time: number): number {
  return Math.floor((time + EVENT_OFFSET) / DAY) * DAY - EVENT_OFFSET;
}

export function checkEnergy(sessions: Session[], settings: EnergySettings): EnergyResult {
  const sorted = sessions.map(session => ({
    session,
    start: Date.parse(session.startsAt),
    end: Math.max(Date.parse(session.startsAt), Date.parse(session.endsAt)),
  })).sort((a, b) => a.start - b.start || a.session.id.localeCompare(b.session.id));
  const warnings: Warning[] = [];
  let overlapDrop: string | undefined;
  let runDrop: string | undefined;
  let dailyDrop: string | undefined;
  let breakStart: string | undefined;
  let run: string[] = [];
  let busyEnd = -Infinity;
  let busyEndAt = '';
  const daily = new Map<number, { start: number; end: number; sessionId: string }[]>();

  function finishRun() {
    if (run.length > settings.maxConsecutive) {
      warnings.push({ type: 'consecutive', sessionIds: run, count: run.length });
      runDrop ??= run[run.length - 1];
    }
  }

  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index];
    const { session, start, end } = current;
    const previous = sorted[index - 1];
    const sameDay = previous && dayStart(previous.start) === dayStart(start);

    if (!sameDay || (start - busyEnd) / MINUTE >= settings.minBreakMinutes) {
      finishRun();
      run = [];
    }
    run.push(session.id);

    if (previous) {
      const gapMinutes = (start - previous.end) / MINUTE;
      const from = previous.session;
      const buildingChanged = Boolean(from.venue && session.venue && from.venue !== session.venue);
      const levelChanged = Boolean(from.level && session.level && from.level !== session.level);
      const neededMinutes = buildingChanged ? settings.buildingChangeMinutes
        : levelChanged ? settings.levelChangeMinutes : settings.transitionMinutes;
      if (gapMinutes < neededMinutes) {
        warnings.push({ type: 'tight-transition', fromId: from.id, toId: session.id, gapMinutes, neededMinutes });
      }
      if (!breakStart && sameDay && warnings.length && (start - busyEnd) / MINUTE >= settings.minBreakMinutes) {
        breakStart = busyEndAt;
      }
    }

    if (end > busyEnd) {
      busyEnd = end;
      busyEndAt = session.endsAt;
    }

    if (settings.flagLoudRooms && session.noiseEstimate === 'loud') {
      warnings.push({ type: 'loud-room', sessionId: session.id });
    }

    if (end <= start) continue;

    for (let earlier = 0; earlier < index; earlier++) {
      const other = sorted[earlier];
      if (other.end > other.start && other.end > start) {
        warnings.push({ type: 'overlap', sessionIds: [other.session.id, session.id] });
        overlapDrop ??= session.id;
      }
    }

    for (let cursor = start; cursor < end;) {
      const day = dayStart(cursor);
      const segmentEnd = Math.min(end, day + DAY);
      const segments = daily.get(day) ?? [];
      segments.push({ start: cursor, end: segmentEnd, sessionId: session.id });
      daily.set(day, segments);
      cursor = segmentEnd;
    }
  }
  finishRun();

  for (const [, segments] of [...daily.entries()].sort(([a], [b]) => a - b)) {
    let total = 0;
    let coveredUntil = -Infinity;
    let candidate: string | undefined;
    let largestContribution = 0;
    for (const segment of segments) {
      const contribution = Math.max(0, segment.end - Math.max(segment.start, coveredUntil));
      total += contribution;
      coveredUntil = Math.max(coveredUntil, segment.end);
      if (contribution > largestContribution) {
        largestContribution = contribution;
        candidate = segment.sessionId;
      }
    }
    const hours = total / (60 * MINUTE);
    if (hours > settings.maxDailyHours) {
      warnings.push({ type: 'long-day', hours, maxHours: settings.maxDailyHours });
      dailyDrop ??= candidate;
    }
  }

  const drop = overlapDrop ?? runDrop ?? dailyDrop;
  if (drop !== undefined) {
    return { warnings, suggestion: { kind: 'drop', sessionId: drop, room: QUIET_ROOM_260A } };
  }
  if (warnings.length && breakStart) {
    return { warnings, suggestion: { kind: 'break', startsAt: breakStart, room: QUIET_ROOM_260A } };
  }
  return { warnings };
}
