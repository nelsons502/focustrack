"use client";

import "./plan.css";
import Link from "next/link";
import { EVENT_TIME_ZONE } from "../../lib/contract";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  EnergySettings,
  PlanBreak,
  Restriction,
  Session,
} from "../../lib/contract";
import {
  addBreakToPlan,
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  removeBreakFromPlan,
  removeSessionFromPlan,
  subscribeLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import {
  breakOverlapsSessions,
  clampEnergySettings,
  formatMinutes,
  hasRealBreakGap,
} from "../../lib/client/plan";
import { useNow } from "../../lib/client/clock";
import { fetchSessionsByIds } from "../../lib/client/sessions-api";
import {
  formatEventDayLabel,
  formatEventRange,
  formatEventTime,
  getEventDayKey,
} from "../../lib/client/time";
import { checkEnergy } from "../../lib/energy";
import EnergyPanel from "./EnergyPanel";

type LoadedPlan = {
  key: string;
  sessions: Session[];
  error: string | null;
};

const RESTRICTION_LABELS: Record<Restriction, string> = {
  "sold-out": "Sold out",
  "separate-registration": "Separate registration",
  "all-access-pass": "All-access pass required",
};

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.id.localeCompare(b.id),
  );
}

type TimelineEntry =
  | { kind: "session"; startsAt: string; endsAt: string; session: Session }
  | { kind: "break"; startsAt: string; endsAt: string; planBreak: PlanBreak };

function gapText(previous: TimelineEntry, next: TimelineEntry): string | null {
  const gap = (Date.parse(next.startsAt) - Date.parse(previous.endsAt)) / 60_000;
  if (!Number.isFinite(gap)) return null;
  if (previous.kind === "break" && next.kind === "session") {
    if (gap === 0) return "Starts as your quiet-room break ends.";
    if (gap > 0) return `${formatMinutes(gap)} minutes after your quiet-room break.`;
    return null;
  }
  if (gap < 0) return "Overlaps the session above.";
  if (gap === 0) return "Starts as the session above ends.";
  return `${formatMinutes(gap)} minutes between sessions.`;
}

export default function PlanView() {
  const now = useNow(30_000);
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const sessionIds = localState.plan.sessionIds;
  const planBreaks = useMemo(
    () => localState.plan.breaks ?? [],
    [localState.plan.breaks],
  );
  const [loaded, setLoaded] = useState<LoadedPlan | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [removedBreak, setRemovedBreak] = useState<PlanBreak | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${retryNonce}:${sessionIds.join(",")}`;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchSessionsByIds(sessionIds, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setLoaded({ key: requestKey, sessions: data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({
          key: requestKey,
          sessions: [],
          error:
            error instanceof Error && error.message
              ? error.message
              : "Your saved sessions could not be loaded. Please try again shortly.",
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionIds, requestKey]);

  const isCurrent = loaded !== null && loaded.key === requestKey;
  const loading =
    sessionIds.length > 0 && !isCurrent;
  const errorMessage = isCurrent ? loaded.error : null;
  const savedIdSet = useMemo(() => new Set(sessionIds), [sessionIds]);
  const sessions = useMemo(
    () =>
      (loaded?.sessions ?? []).filter((session) =>
        savedIdSet.has(session.id),
      ),
    [loaded, savedIdSet],
  );

  const foundIds = useMemo(
    () => new Set(sessions.map((session) => session.id)),
    [sessions],
  );
  const missingIds = useMemo(
    () =>
      isCurrent && !errorMessage
        ? sessionIds.filter((id) => !foundIds.has(id))
        : [],
    [isCurrent, errorMessage, sessionIds, foundIds],
  );
  const canIntervene = isCurrent && !errorMessage;
  const conflictingBreakIds = useMemo(
    () =>
      new Set(
        planBreaks
          .filter((entry) => breakOverlapsSessions(sessions, entry))
          .map((entry) => entry.id),
      ),
    [planBreaks, sessions],
  );
  const days = useMemo(() => {
    const all = new Set(sessions.map((session) => session.day));
    for (const entry of planBreaks) {
      const day = getEventDayKey(entry.startsAt);
      if (day) all.add(day);
    }
    return [...all].sort();
  }, [sessions, planBreaks]);
  const selectedDay =
    chosenDay && days.includes(chosenDay) ? chosenDay : (days[0] ?? null);
  const daySessions = useMemo(
    () =>
      selectedDay
        ? sortSessions(sessions.filter((session) => session.day === selectedDay))
        : [],
    [sessions, selectedDay],
  );
  const dayBreaks = useMemo(
    () =>
      selectedDay
        ? planBreaks.filter(
            (entry) => getEventDayKey(entry.startsAt) === selectedDay,
          )
        : [],
    [planBreaks, selectedDay],
  );
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...daySessions.map(
        (session): TimelineEntry => ({
          kind: "session",
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          session,
        }),
      ),
      ...dayBreaks.map(
        (planBreak): TimelineEntry => ({
          kind: "break",
          startsAt: planBreak.startsAt,
          endsAt: planBreak.endsAt,
          planBreak,
        }),
      ),
    ];
    return entries.sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
        a.kind.localeCompare(b.kind),
    );
  }, [daySessions, dayBreaks]);
  const clockReady = now.getTime() !== 0;
  const isSelectedToday =
    clockReady &&
    selectedDay !== null &&
    getEventDayKey(now.toISOString()) === selectedDay;
  const nowMs = now.getTime();
  const nextEntry = isSelectedToday
    ? (timelineEntries.find((entry) => Date.parse(entry.startsAt) > nowMs) ?? null)
    : null;

  const settings = useMemo(
    () => clampEnergySettings(localState.energy),
    [localState.energy],
  );
  const energyResult = useMemo(
    () => checkEnergy(daySessions, settings),
    [daySessions, settings],
  );

  function removeById(id: string, label: string) {
    const saved = updateLocalState(removeSessionFromPlan(localState, id));
    setAnnouncement(
      saved
        ? `${label} removed from your plan.`
        : `${label} removed for now, but saving on this device failed.`,
    );
  }

  function sessionsOnBreakDay(planBreak: PlanBreak): Session[] {
    const day = getEventDayKey(planBreak.startsAt);
    return day ? sessions.filter((session) => session.day === day) : [];
  }

  function handleAddBreak(planBreak: PlanBreak) {
    if (!canIntervene) {
      setAnnouncement(
        "Your saved sessions are still loading. Try adding the quiet-room break again in a moment.",
      );
      return;
    }
    if (breakOverlapsSessions(sessions, planBreak)) {
      setAnnouncement(
        "That quiet-room break overlaps a saved session, so it was not added.",
      );
      return;
    }
    const minutes =
      (Date.parse(planBreak.endsAt) - Date.parse(planBreak.startsAt)) / 60_000;
    if (
      !Number.isFinite(minutes) ||
      !hasRealBreakGap(
        sessionsOnBreakDay(planBreak),
        planBreak.startsAt,
        minutes,
      )
    ) {
      setAnnouncement(
        "That quiet-room break no longer fits between your saved sessions, so it was not added.",
      );
      return;
    }
    const next = addBreakToPlan(localState, planBreak);
    if (next === localState) {
      setAnnouncement("This quiet-room break is already in your plan.");
      return;
    }
    setRemovedBreak(null);
    const saved = updateLocalState(next);
    setAnnouncement(
      saved
        ? "Quiet-room break added to your plan."
        : "Quiet-room break added for now, but saving on this device failed.",
    );
  }

  function handleRemoveBreak(planBreak: PlanBreak) {
    const saved = updateLocalState(removeBreakFromPlan(localState, planBreak.id));
    setRemovedBreak(planBreak);
    setAnnouncement(
      saved
        ? "Quiet-room break removed from your plan."
        : "Quiet-room break removed for now, but saving on this device failed.",
    );
  }

  function handleUndoRemoveBreak() {
    if (!removedBreak) return;
    if (!canIntervene) {
      setAnnouncement(
        "Your saved sessions are still loading. Try undoing again in a moment.",
      );
      return;
    }
    if (breakOverlapsSessions(sessions, removedBreak)) {
      setRemovedBreak(null);
      setAnnouncement(
        "That break no longer fits: it overlaps a saved session now.",
      );
      return;
    }
    const minutes =
      (Date.parse(removedBreak.endsAt) - Date.parse(removedBreak.startsAt)) /
      60_000;
    if (
      !Number.isFinite(minutes) ||
      !hasRealBreakGap(
        sessionsOnBreakDay(removedBreak),
        removedBreak.startsAt,
        minutes,
      )
    ) {
      setRemovedBreak(null);
      setAnnouncement(
        "That break no longer fits between your saved sessions.",
      );
      return;
    }
    const next = addBreakToPlan(localState, removedBreak);
    setRemovedBreak(null);
    if (next === localState) {
      setAnnouncement("This quiet-room break is already in your plan.");
      return;
    }
    const saved = updateLocalState(next);
    setAnnouncement(
      saved
        ? "Quiet-room break restored to your plan."
        : "Quiet-room break restored for now, but saving on this device failed.",
    );
  }

  function handleSettingsChange(nextSettings: EnergySettings) {
    const clamped = clampEnergySettings(nextSettings);
    const saved = updateLocalState({ ...localState, energy: clamped });
    setAnnouncement(
      saved
        ? "Energy settings saved on this device."
        : "Energy settings changed for now, but saving on this device failed.",
    );
  }

  const isPlanEmpty = sessionIds.length === 0 && planBreaks.length === 0;
  const statusText =
    isPlanEmpty
      ? "Your plan is empty."
      : errorMessage
        ? "Your saved sessions could not be loaded."
        : loading
            ? "Loading your saved sessions…"
            : `${sessions.length} saved session${sessions.length === 1 ? "" : "s"} loaded.`;

  return (
    <section aria-labelledby="plan-view-heading" className="plan">
      <h2 id="plan-view-heading" className="visually-hidden">
        Your saved sessions
      </h2>
      <p className="plan-intro">
        Your plan and notes are stored only on this device. The schedule service
        receives public session IDs to look up their times and rooms. Your notes, quiet-room breaks and settings
        are not sent.
      </p>
      <p className="plan-settings-row">
        <span>Energy limits and data on this device:</span>{" "}
        <Link className="plan-settings-link" href="/settings">
          Settings
        </Link>
      </p>
      <p className="status" role="status" aria-live="polite" aria-atomic="true">
        {statusText}
      </p>
      <p
        className="save-note"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      {removedBreak ? (
        <p className="break-undo">
          <button
            type="button"
            className="button"
            onClick={handleUndoRemoveBreak}
          >
            Undo removing quiet-room break
          </button>
        </p>
      ) : null}

      {isPlanEmpty ? (
        <div className="state-box">
          <p>Your plan is empty.</p>
          <p>
            <Link className="card-link" href="/">
              Find a session
            </Link>{" "}
            and add it to your plan to see it here.
          </p>
        </div>
      ) : null}

      {loading && sessions.length === 0 ? (
        <div className="state-box">
          <p>Loading your saved sessions…</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="state-box state-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setRetryNonce((value) => value + 1)}
          >
            Retry loading your plan
          </button>
        </div>
      ) : null}

      {!errorMessage && days.length > 0 && selectedDay ? (
        <>
          <div className="field plan-day-field">
            <label htmlFor="plan-day">Day</label>
            <select
              id="plan-day"
              value={selectedDay}
              onChange={(event) => setChosenDay(event.target.value)}
            >
              {days.map((day) => {
                const count = sessions.filter(
                  (session) => session.day === day,
                ).length;
                return (
                  <option key={day} value={day}>
                    {formatEventDayLabel(day)} · {count} session
                    {count === 1 ? "" : "s"}
                  </option>
                );
              })}
            </select>
          </div>

          <h2 className="plan-heading">
            Timeline for {formatEventDayLabel(selectedDay)}
          </h2>
          <p className="plan-intro">
            Times are shown in event time for Salt Lake City
            ({EVENT_TIME_ZONE}).
          </p>
          {isSelectedToday ? (
            <p className="plan-now-line">
              It is currently {formatEventTime(now.toISOString())} (event
              time). Your day is below, in order.
            </p>
          ) : null}
          <ol className="timeline">
            {timelineEntries.map((entry, index) => {
              const previous = timelineEntries[index - 1];
              const gap = previous ? gapText(previous, entry) : null;
              const phase = !isSelectedToday
                ? null
                : nowMs >= Date.parse(entry.startsAt) &&
                    nowMs < Date.parse(entry.endsAt)
                  ? "current"
                  : entry === nextEntry
                    ? "next"
                    : Date.parse(entry.endsAt) <= nowMs
                      ? "past"
                      : null;
              const phaseLabel =
                phase === "current"
                  ? "Happening now"
                  : phase === "next"
                    ? "Up next"
                    : phase === "past"
                      ? "Finished earlier"
                      : null;
              if (entry.kind === "break") {
                const planBreak = entry.planBreak;
                const range = formatEventRange(
                  planBreak.startsAt,
                  planBreak.endsAt,
                );
                const conflicts =
                  canIntervene && conflictingBreakIds.has(planBreak.id);
                return (
                  <li
                    key={planBreak.id}
                    className={`timeline-item timeline-item-break${phase ? ` timeline-item-${phase}` : ""}`}
                  >
                    {gap ? <p className="timeline-gap">{gap}</p> : null}
                    {conflicts ? (
                      <p className="timeline-gap">
                        This quiet-room break overlaps a saved session, so it
                        does not count as time off. Remove it to clear the
                        overlap.
                      </p>
                    ) : null}
                    <article
                      className="card card-break"
                      aria-current={phase === "current" ? "time" : undefined}
                    >
                      <p className="break-eyebrow">Rest break</p>
                      {phaseLabel ? (
                        <p className="timeline-phase">{phaseLabel}</p>
                      ) : null}
                      <h3 className="card-title">Quiet-room break</h3>
                      <p className="card-time">
                        <time dateTime={planBreak.startsAt}>{range}</time>
                      </p>
                      <p className="card-place">{planBreak.room}</p>
                      <p className="break-note">
                        Time to rest in the quiet room.
                        {canIntervene && !conflictingBreakIds.has(planBreak.id)
                          ? " No session is scheduled here."
                          : null}
                      </p>
                      <div className="card-actions">
                        <button
                          type="button"
                          className="button button-saved"
                          aria-label={`Remove quiet-room break, ${range}`}
                          onClick={() => handleRemoveBreak(planBreak)}
                        >
                          Remove quiet-room break
                        </button>
                      </div>
                    </article>
                  </li>
                );
              }
              const session = entry.session;
              const place = [session.room, session.level, session.venue]
                .filter((part): part is string => Boolean(part && part.trim()))
                .join(" · ");
              return (
                <li
                  key={session.id}
                  className={`timeline-item timeline-item-session${phase ? ` timeline-item-${phase}` : ""}`}
                >
                  {gap ? <p className="timeline-gap">{gap}</p> : null}
                  <article
                    className="card timeline-card"
                    aria-current={phase === "current" ? "time" : undefined}
                  >
                    {phaseLabel ? (
                      <p className="timeline-phase">{phaseLabel}</p>
                    ) : null}
                    <h3 className="card-title">{session.title}</h3>
                    {session.restrictions.length > 0 ? (
                      <ul className="chips" aria-label="Session restrictions">
                        {session.restrictions.map((restriction) => (
                          <li key={restriction} className="chip chip-restriction">
                            {RESTRICTION_LABELS[restriction]}
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
                    <div className="card-actions">
                      <button
                        type="button"
                        className="button button-saved"
                        aria-label={`Remove from plan: ${session.title}`}
                        onClick={() => removeById(session.id, session.title)}
                      >
                        Remove from plan
                      </button>
                      {session.sourceUrl ? (
                        <a className="card-link" href={session.sourceUrl}>
                          Session source
                        </a>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>

          <EnergyPanel
            sessions={daySessions}
            dayLabel={formatEventDayLabel(selectedDay)}
            settings={settings}
            result={energyResult}
            canIntervene={canIntervene}
            breaks={planBreaks}
            onDrop={(session) => removeById(session.id, session.title)}
            onAddBreak={handleAddBreak}
            onSettingsChange={handleSettingsChange}
          />
        </>
      ) : null}

      {missingIds.length > 0 ? (
        <section aria-labelledby="missing-heading" className="missing">
          <h2 id="missing-heading" className="plan-heading">
            Saved sessions we could not find
          </h2>
          <p className="plan-intro">
            These saved sessions are no longer in the schedule data we can
            look up. They stay on this device until you remove them.
          </p>
          <ul className="missing-list">
            {missingIds.map((id) => (
              <li key={id} className="missing-item">
                <span>Saved session (ID: {id})</span>
                <button
                  type="button"
                  className="button"
                  aria-label={`Remove unavailable saved session ${id} from plan`}
                  onClick={() => removeById(id, `Saved session ${id}`)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
