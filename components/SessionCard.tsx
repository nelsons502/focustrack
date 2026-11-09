import type { Restriction, Session, SessionKind } from "../lib/contract";
import { formatEventRange } from "../lib/client/time";

export const ACCESSIBILITY_URL =
  "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/";

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
  const crowd = session.crowdBasis.trim()
    ? `Crowd estimate: ${session.crowdEstimate}, based on ${session.crowdBasis.trim()}`
    : `Crowd estimate: ${session.crowdEstimate}`;
  const noise = session.noiseBasis.trim()
    ? `Noise estimate: ${session.noiseEstimate}, based on ${session.noiseBasis.trim()}`
    : `Noise estimate: ${session.noiseEstimate}`;
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
      {session.description.trim() ? (
        <p className="card-desc">{session.description.trim()}</p>
      ) : null}
      <ul className="card-facts">
        <li>{crowd}</li>
        <li>{noise}</li>
        {session.captions === "wordly-breakout" ? (
          <li>
            Captions: Wordly live captions for breakout sessions.{" "}
            <a href={ACCESSIBILITY_URL}>Official accessibility information</a>
          </li>
        ) : null}
      </ul>
      <div className="card-actions">
        <button
          type="button"
          className={inPlan ? "button button-saved" : "button button-add"}
          aria-pressed={inPlan}
          aria-label={
            inPlan
              ? `Remove from plan: ${session.title}`
              : `Add to plan: ${session.title}`
          }
          onClick={() => onTogglePlan(session)}
        >
          {inPlan ? "In your plan — remove" : "Add to plan"}
        </button>
        {session.sourceUrl ? (
          <a className="card-link" href={session.sourceUrl}>
            Session source
          </a>
        ) : null}
      </div>
    </article>
  );
}
