import { QUIET_ROOM_260A, type Session } from "../contract";

export type PlanBreak = {
  startsAt: string;
  endsAt: string;
  room?: string;
};

export type IcsOptions = {
  notAttending?: readonly string[];
  breaks?: readonly PlanBreak[];
  now?: Date;
};

const encoder = new TextEncoder();
const MAX_OCTETS = 75;

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

export function foldLine(line: string): string {
  const chunks: string[] = [];
  let current = "";
  let used = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space that counts toward the limit.
    const limit = chunks.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (used + size > limit) {
      chunks.push(current);
      current = "";
      used = 0;
    }
    current += char;
    used += size;
  }
  chunks.push(current);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function toUtcStamp(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sessionDescription(session: Session): string {
  const parts: string[] = [];
  if (session.speakers.length > 0) {
    parts.push(
      `Speakers: ${session.speakers
        .map((speaker) =>
          speaker.company ? `${speaker.name} (${speaker.company})` : speaker.name,
        )
        .join(", ")}`,
    );
  }
  parts.push(`Source: ${session.sourceUrl}`);
  if (session.captions === "wordly-breakout") parts.push("Live captions: Wordly");
  return parts.join("\n");
}

type EventFields = {
  uid: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  location: string;
  description?: string;
};

function buildEvent(fields: EventFields, stamp: string): string[] | null {
  const start = toUtcStamp(fields.startsAt);
  const end = toUtcStamp(fields.endsAt);
  if (!start || !end) return null;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${fields.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(fields.summary)}`,
    `LOCATION:${escapeText(fields.location)}`,
  ];
  if (fields.description) {
    lines.push(`DESCRIPTION:${escapeText(fields.description)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(sessions: Session[], options: IcsOptions = {}): string {
  const stamp = toUtcStamp(options.now ?? new Date()) ?? "19700101T000000Z";
  const skipped = new Set(options.notAttending ?? []);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FocusTrack//Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const session of sessions) {
    if (skipped.has(session.id)) continue;
    const event = buildEvent(
      {
        uid: `${session.id}@focustrack`,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        summary: session.title,
        location: session.room,
        description: sessionDescription(session),
      },
      stamp,
    );
    if (event) lines.push(...event);
  }
  for (const quietBreak of options.breaks ?? []) {
    const event = buildEvent(
      {
        uid: `break-${toUtcStamp(quietBreak.startsAt) ?? "unknown"}@focustrack`,
        startsAt: quietBreak.startsAt,
        endsAt: quietBreak.endsAt,
        summary: "Quiet break",
        location: quietBreak.room ?? QUIET_ROOM_260A,
      },
      stamp,
    );
    if (event) lines.push(...event);
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
