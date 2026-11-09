"use client";

import { useId, useState } from "react";
import type { Restriction, Session, SessionKind } from "../lib/contract";
import {
  ACCESSIBILITY_FACTS,
  ACCESSIBILITY_SOURCE_LABEL,
  ACCESSIBILITY_SOURCE_URL,
} from "../lib/event";
import { formatEventRange } from "../lib/client/time";

const RESTRICTION_LABELS: Record<Restriction, string> = {
  "sold-out": "Sold out",
  "separate-registration": "Separate registration",
  "all-access-pass": "All-access pass required",
};

const KIND_LABELS: Record<SessionKind, string> = {
  talk: "Talk",
  keynote: "Keynote",
  panel: "Panel",
  lightning: "Lightning talk",
  demo: "Demo",
  workshop: "Workshop",
  community: "Community",
  colocated: "Co-located event",
  logistics: "Logistics",
};

const CROWD_LABELS: Record<Session["crowdEstimate"], string> = {
  large: "likely large",
  moderate: "likely moderate",
  unknown: "unknown",
};

const NOISE_LABELS: Record<Session["noiseEstimate"], string> = {
  loud: "likely loud",
  unknown: "unknown",
};

function estimateText(
  name: string,
  label: string,
  estimate: string,
  basis: string,
): string {
  const trimmed = basis.trim();
  if (estimate === "unknown" || !trimmed) return `${name}: unknown`;
  return `${name}: ${label} (estimate: ${trimmed})`;
}

type SessionCardProps = {
  session: Session;
  inPlan: boolean;
  onTogglePlan: (session: Session) => void;
};

export default function SessionCard({
  session,
  inPlan,
  onTogglePlan,
}: SessionCardProps) {
  const place = [session.room, session.level, session.venue]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  const [expanded, setExpanded] = useState(false);
  const descId = useId();
  const description = session.description.trim();
  const crowd = estimateText(
    "Crowd",
    CROWD_LABELS[session.crowdEstimate],
    session.crowdEstimate,
    session.crowdBasis,
  );
  const noise = estimateText(
    "Noise",
    NOISE_LABELS[session.noiseEstimate],
    session.noiseEstimate,
    session.noiseBasis,
  );
  const quietRoom = ACCESSIBILITY_FACTS.nearestQuietRoom.replace(
    /^Nearest quiet room:/,
    "Quiet room:",
  );
  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">{session.title}</h3>
        <ul className="chips" aria-label="Session details">
          <li className="chip chip-kind">{KIND_LABELS[session.kind]}</li>
          {session.restrictions.map((restriction) => (
            <li key={restriction} className="chip chip-restriction">
              {RESTRICTION_LABELS[restriction]}
            </li>
          ))}
        </ul>
      </div>
      <p className="card-time">
        <time dateTime={session.startsAt}>
          {formatEventRange(session.startsAt, session.endsAt)}
        </time>
      </p>
      {place ? <p className="card-place">{place}</p> : null}
      {session.speakers.length > 0 ? (
        <p className="card-speakers">
          {session.speakers
            .map((speaker) =>
              speaker.company
                ? `${speaker.name} (${speaker.company})`
                : speaker.name,
            )
            .join(", ")}
        </p>
      ) : null}
      {description ? (
        <>
          <p
            id={descId}
            className={expanded ? "card-desc" : "card-desc card-desc-clamped"}
          >
            {description}
          </p>
          <button
              type="button"
              className="button button-quiet"
              aria-expanded={expanded}
              aria-controls={descId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Hide full description" : "Show full description"}
            </button>
        </>
      ) : null}
      <ul className="card-facts">
        <li>{crowd}</li>
        <li>{noise}</li>
        <li>
          {session.captions === "wordly-breakout"
            ? ACCESSIBILITY_FACTS.captionsWordly
            : ACCESSIBILITY_FACTS.captionsUnconfirmed}
        </li>
        <li>{ACCESSIBILITY_FACTS.seating}</li>
        <li>{quietRoom}</li>
      </ul>
      <details className="card-details">
        <summary>About quiet rooms</summary>
        <p>{ACCESSIBILITY_FACTS.quietRoomAbout}</p>
      </details>
      <p className="card-source">
        Source:{" "}
        <a href={ACCESSIBILITY_SOURCE_URL}>{ACCESSIBILITY_SOURCE_LABEL}</a>
      </p>
      <div className="card-actions">
        <button
          type="button"
          className={inPlan ? "button button-saved" : "button button-add"}
          aria-pressed={inPlan}
          onClick={() => onTogglePlan(session)}
        >
          {inPlan ? <span aria-hidden="true">✓ </span> : null}
          Add to plan
          <span className="visually-hidden">: {session.title}</span>
        </button>
        {inPlan ? (
          <span className="plan-state" aria-hidden="true">
            In your plan
          </span>
        ) : null}
        {session.sourceUrl ? (
          <a className="card-link" href={session.sourceUrl}>
            Session source
          </a>
        ) : null}
      </div>
    </article>
  );
}
