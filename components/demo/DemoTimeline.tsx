"use client";

import { formatEventInstant, formatEventRange } from "../../lib/client/time";
import {
  MAYA_BREAK,
  MAYA_DEMO_START_ISO,
  MAYA_SESSION_TIMES,
} from "../../lib/demo/maya";

type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  startsAt: string;
  endsAt: string;
};

const TIMELINE: readonly TimelineEntry[] = [
  ...MAYA_SESSION_TIMES.map((session, index) => ({
    id: session.id,
    label: `Talk ${index + 1}`,
    detail: "From Maya's plan",
    startsAt: session.startsAt,
    endsAt: session.endsAt,
  })),
  {
    id: MAYA_BREAK.id,
    label: "Quiet break",
    detail: MAYA_BREAK.room,
    startsAt: MAYA_BREAK.startsAt,
    endsAt: MAYA_BREAK.endsAt,
  },
].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

export default function DemoTimeline() {
  return (
    <section aria-labelledby="demo-preview-heading" className="demo-section">
      <h2 id="demo-preview-heading" className="demo-heading">
        A preview of Maya&apos;s Tuesday
      </h2>
      <p className="demo-note">
        Demo time starts at{" "}
        {formatEventInstant(new Date(MAYA_DEMO_START_ISO))}. Then the day
        runs in this order:
      </p>
      <ol className="demo-timeline">
        {TIMELINE.map((entry) => (
          <li key={entry.id} className="demo-timeline-item">
            <span className="demo-timeline-dot" aria-hidden="true" />
            <div>
              <p className="demo-timeline-label">{entry.label}</p>
              <p className="demo-timeline-time">
                {formatEventRange(entry.startsAt, entry.endsAt)}
              </p>
              <p className="demo-timeline-detail">{entry.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
