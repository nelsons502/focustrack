import { EVENT_UTC_OFFSET } from "../contract";
import { EVENT_TIME_ZONE } from "../event";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  hour: "numeric",
  timeZoneName: "short",
});

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zoneName(date: Date): string {
  const part = zoneFormatter
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName");
  return part ? ` ${part.value}` : "";
}

export function formatEventRange(startsAt: string, endsAt: string): string {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);
  if (!start || !end) return "Time unknown (event time)";
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const range =
    startDate === endDate
      ? `${startDate}, ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
      : `${startDate}, ${timeFormatter.format(start)} – ${endDate}, ${timeFormatter.format(end)}`;
  return `${range}${zoneName(start)}`;
}

export function formatEventInstant(date: Date): string {
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}${zoneName(date)}`;
}

export function parseDemoNow(raw: string | null): Date | null {
  if (!raw) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    )
  ) {
    return null;
  }
  const withOffset = /(Z|[+-]\d{2}:\d{2})$/.test(raw)
    ? raw
    : `${raw}${EVENT_UTC_OFFSET}`;
  return parseDate(withOffset);
}
