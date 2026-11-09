import { describe, expect, it } from "vitest";
import type { Session } from "../contract";
import { QUIET_ROOM_260A } from "../contract";
import { buildIcs, foldLine, escapeText } from "./ics";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    eventId: "kccncna2026",
    title: "Kubernetes Basics",
    description: "Desc",
    speakers: [{ name: "Ada Example", company: "Example Co" }],
    startsAt: "2026-11-10T09:15:00-07:00",
    endsAt: "2026-11-10T10:00:00-07:00",
    day: "2026-11-10",
    room: "Salt Palace, 250 A",
    venue: null,
    level: null,
    roomType: "breakout",
    kind: "talk",
    restrictions: [],
    crowdEstimate: "unknown",
    crowdBasis: "",
    noiseEstimate: "unknown",
    noiseBasis: "",
    captions: "unknown",
    sourceUrl: "https://example.test/s1",
    ...overrides,
  };
}

const OPTIONS = { now: new Date("2026-11-09T20:00:00Z") };

describe("escapeText", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("folds at 75 octets with a CRLF and space continuation", () => {
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      `SUMMARY:${"x".repeat(200)}`,
    );
  });

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"é".repeat(100)}`;
    const parts = foldLine(line).split("\r\n");
    const joined = parts.map((p, i) => (i ? p.slice(1) : p)).join("");
    expect(joined).toBe(line);
    for (const part of parts) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("buildIcs", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = buildIcs([makeSession()], OPTIONS);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("DTSTAMP:20261109T200000Z");
    expect(ics).not.toContain("VALARM");
  });

  it("converts -07:00 times to UTC", () => {
    const ics = buildIcs([makeSession()], OPTIONS);
    expect(ics).toContain("DTSTART:20261110T161500Z");
    expect(ics).toContain("DTEND:20261110T170000Z");
    expect(ics).toContain("UID:s1@focustrack");
  });

  it("fills summary, location and description with escaping", () => {
    const ics = buildIcs(
      [makeSession({ title: "A, B; C", captions: "wordly-breakout" })],
      OPTIONS,
    ).replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:A\\, B\\; C");
    expect(ics).toContain("LOCATION:Salt Palace\\, 250 A");
    expect(ics).toContain("Ada Example (Example Co)");
    expect(ics).toContain("https://example.test/s1");
    expect(ics).toContain("Live captions: Wordly");
  });

  it("omits the captions line when captions are unknown", () => {
    expect(buildIcs([makeSession()], OPTIONS)).not.toContain("Wordly");
  });

  it("skips sessions in notAttending", () => {
    const ics = buildIcs(
      [makeSession(), makeSession({ id: "s2" })],
      { ...OPTIONS, notAttending: ["s2"] },
    );
    expect(ics).toContain("UID:s1@focustrack");
    expect(ics).not.toContain("UID:s2@focustrack");
  });

  it("includes quiet breaks", () => {
    const ics = buildIcs([], {
      ...OPTIONS,
      breaks: [
        { startsAt: "2026-11-10T11:00:00-07:00", endsAt: "2026-11-10T11:20:00-07:00" },
      ],
    });
    expect(ics).toContain("SUMMARY:Quiet break");
    expect(ics).toContain(`LOCATION:${escapeText(QUIET_ROOM_260A)}`);
    expect(ics).toContain("DTSTART:20261110T180000Z");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
  });
});
