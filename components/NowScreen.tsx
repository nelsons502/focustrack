"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import "./now/now.css";
import type { Session } from "../lib/contract";
import {
  ACCESSIBILITY_SOURCE_URL,
  EVENT,
  SCHEDULE_CREDIT,
  SCHEDULE_SOURCE_URL,
} from "../lib/event";
import {
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
  updateLocalState,
} from "../lib/client/local-state";
import { getNow, getSimClock, useNow } from "../lib/client/clock";
import {
  describeStartsIn,
  formatDemoLabel,
  minutesUntil,
  resolveNow,
  transitionNote,
  withNowParam,
} from "../lib/client/now";
import { markNotAttending, undoNotAttending } from "../lib/client/now-actions";
import {
  applyNotepadText,
  dismissReflect,
  isHeadsUp,
  isReflectDismissed,
  notesToDraft,
  selectNowTimeline,
  setNowOptOut,
} from "./now/now-helpers";
import { fetchSessionsByIds } from "../lib/client/sessions-api";
import { formatEventTime } from "../lib/client/time";
import PrimaryNav from "./plan/PrimaryNav";
import { LARGE_SCREEN_QUERY, useLargeScreen } from "./now/useLargeScreen";

const NOTE_DEBOUNCE_MS = 500;

function subscribeNothing(): () => void {
  return () => undefined;
}

function place(session: Session): string {
  return [session.room, session.level, session.venue]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
}

type NowScreenProps = { nowParam?: string };

export default function NowScreen({ nowParam }: NowScreenProps) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const liveNow = useNow();
  const [known, setKnown] = useState<Record<string, Session>>({});
  const [loadError, setLoadError] = useState("");
  const [loadingIds, setLoadingIds] = useState(false);
  const requested = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const isLarge = useLargeScreen();
  const [notesSession, setNotesSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState({ text: "", sessionId: "" });
  const draftRef = useRef(draft);
  const [skipped, setSkipped] = useState<Session | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [reflectTick, setReflectTick] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const restoreNotesFocus = useRef(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const undoSkipRef = useRef<HTMLButtonElement>(null);
  const focusAfterSkip = useRef<"undo" | "skip" | null>(null);

  // An active sim outranks an explicit ?now= param, matching getNow(); the
  // param still drives SSR/tests when no sim is running. useNow re-renders
  // every second and on clock events, so this read stays current.
  const simActive = mounted && getSimClock() !== null;
  const resolved = useMemo(() => resolveNow(nowParam, liveNow), [nowParam, liveNow]);
  const now = simActive ? liveNow : resolved.now;
  const demo = simActive || resolved.demo;
  const clockReady = now.getTime() !== 0;

  const planIds = localState.plan.sessionIds;
  const planKey = planIds.join(",");

  useEffect(() => {
    if (!mounted) return undefined;
    const requestedIds = requested.current;
    const missing = planIds.filter((id) => !requestedIds.has(id));
    if (missing.length === 0) return undefined;
    missing.forEach((id) => requestedIds.add(id));
    const controller = new AbortController();
    let finished = false;
    setLoadingIds(true);
    setLoadError("");
    fetchSessionsByIds(missing, controller.signal)
      .then((sessions) => {
        setKnown((previous) => {
          const next = { ...previous };
          for (const session of sessions) next[session.id] = session;
          return next;
        });
        finished = true;
        setLoadingIds(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        missing.forEach((id) => requestedIds.delete(id));
        setLoadError(error instanceof Error ? error.message : "Could not load your sessions.");
        setLoadingIds(false);
      });
    return () => {
      controller.abort();
      if (!finished) missing.forEach((id) => requestedIds.delete(id));
    };
    // planKey stands in for planIds so the effect re-runs only when ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, planKey, retryToken]);

  const sessions = useMemo(() => Object.values(known), [known]);
  const planBreaks = useMemo(() => localState.plan.breaks ?? [], [localState.plan.breaks]);
  const timeline = useMemo(
    () => selectNowTimeline(sessions, planIds, planBreaks, now),
    [sessions, planIds, planBreaks, now],
  );
  const current = timeline.currentTalk;
  const currentBreak = timeline.currentBreak;
  const next = timeline.nextTalk;
  const nextItem = timeline.nextItem;
  const previous = timeline.previousTalk;

  useEffect(() => {
    if (focusAfterSkip.current === "undo" && skipped) {
      undoSkipRef.current?.focus();
      focusAfterSkip.current = null;
    } else if (focusAfterSkip.current === "skip") {
      skipButtonRef.current?.focus();
      focusAfterSkip.current = null;
    }
  });

  const findHref = withNowParam("/", nowParam);
  const sheetVisible = sheetOpen && !isLarge;
  const panelDefault = current ?? previous;
  const lockedSession =
    draft.sessionId &&
    draft.sessionId !== panelDefault?.id &&
    notesToDraft(localState.notes[draft.sessionId]) !== (draft.text.trim() ? draft.text : "")
      ? known[draft.sessionId]
      : undefined;
  const noteTarget: Session | null = isLarge
    ? (lockedSession ?? panelDefault)
    : sheetVisible && notesSession
      ? notesSession
      : current;

  function flushDraft(): void {
    const pending = draftRef.current;
    if (!pending.sessionId) return;
    draftRef.current = { text: "", sessionId: "" };
    const latest = getLocalStateSnapshot();
    const nextState = applyNotepadText(latest, pending.sessionId, pending.text, getNow());
    if (nextState === latest) return;
    const saved = updateLocalState(nextState);
    setAnnouncement(saved ? "Saved" : "Saving on this device failed.");
  }
  const flushDraftRef = useRef(flushDraft);

  useEffect(() => {
    if (!draft.sessionId) return undefined;
    if (notesToDraft(getLocalStateSnapshot().notes[draft.sessionId]) === draft.text) {
      return undefined;
    }
    const timer = window.setTimeout(() => flushDraftRef.current(), NOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(LARGE_SCREEN_QUERY);
    const onChange = () => {
      if (query.matches) {
        flushDraftRef.current();
        restoreNotesFocus.current = true;
        setSheetOpen(false);
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onPageHide = () => flushDraftRef.current();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushDraftRef.current();
    };
  }, []);

  function openNotes() {
    if (!current) return;
    flushDraft();
    const text = notesToDraft(getLocalStateSnapshot().notes[current.id]);
    const nextDraft = { text, sessionId: current.id };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setNotesSession(current);
    setSheetOpen(true);
  }

  function closeNotes() {
    flushDraft();
    restoreNotesFocus.current = true;
    setSheetOpen(false);
  }

  useEffect(() => {
    if (sheetVisible) {
      noteInputRef.current?.focus();
    } else if (restoreNotesFocus.current) {
      restoreNotesFocus.current = false;
      (toggleRef.current ?? mainRef.current)?.focus();
    }
  }, [sheetVisible]);

  useEffect(() => {
    if (!sheetVisible) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetVisible]);

  function handleNotesKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeNotes();
      return;
    }
    if (event.key !== "Tab") return;
    const first = doneRef.current;
    const last = noteInputRef.current;
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (active !== first && active !== last) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderNotepad(target: Session) {
    const stored = notesToDraft(localState.notes[target.id]);
    return (
      <div className="now-note-form">
        <label htmlFor="now-note-input">
          Notes. Write freely. Saves on this device as you type.
        </label>
        <textarea
          ref={noteInputRef}
          id="now-note-input"
          className="now-notepad"
          value={draft.sessionId === target.id ? draft.text : stored}
          rows={isLarge ? 14 : 6}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => {
            if (draftRef.current.sessionId && draftRef.current.sessionId !== target.id) {
              flushDraft();
            }
            const nextDraft = { text: event.target.value, sessionId: target.id };
            draftRef.current = nextDraft;
            setDraft(nextDraft);
          }}
        />
      </div>
    );
  }

  function handleNotAttending() {
    if (!current) return;
    const title = current.title;
    flushDraft();
    setSkipped(current);
    setSheetOpen(false);
    updateLocalState(markNotAttending(getLocalStateSnapshot(), current.id));
    focusAfterSkip.current = "undo";
    setAnnouncement(`Okay, skipping ${title}. Taking a break is fine. Showing what is next.`);
  }

  function handleUndoSkip() {
    if (!skipped) return;
    updateLocalState(undoNotAttending(getLocalStateSnapshot(), skipped.id));
    setAnnouncement(`${skipped.title} is back in your plan.`);
    setSkipped(null);
    focusAfterSkip.current = "skip";
  }

  const nextNote = next ? transitionNote(current ?? previous, next) : null;
  const ready =
    mounted && clockReady && (planIds.length === 0 || !loadingIds || sessions.length > 0);
  const showEmpty = ready && !loadError && !current && !currentBreak && !nextItem;
  void reflectTick;
  const reflectCandidate =
    ready && !loadError ? timeline.reflectCandidate : null;
  const showReflect =
    reflectCandidate !== null && mounted && !isReflectDismissed(reflectCandidate.id);
  const headsUp = nextItem !== null && isHeadsUp(now, nextItem.startsAt);

  return (
    <div className="now-page">
      <main ref={mainRef} id="main" tabIndex={-1} className="now-shell">
        <header className="now-head">
          <p className="app-name">FocusTrack</p>
          <PrimaryNav current="now" nowParam={nowParam} />
          <h1>Now</h1>
          {demo ? (
            <p className="now-demo">
              <strong>{formatDemoLabel(now)}</strong>{" "}
              <span>(event time, not the live clock)</span>
            </p>
          ) : null}
          <p className="now-browse-row">
            <a className="now-button" href={findHref} onClick={() => {
              flushDraft();
              setNowOptOut();
            }}>
              Browse talks instead
            </a>
          </p>
        </header>

        <div className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>

        <div className="now-layout">
        <div className="now-main-col">
        {!mounted ? <p className="now-muted">Loading your plan…</p> : null}

        {mounted && loadError ? (
          <section className="now-card now-error" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="now-button"
              onClick={() => setRetryToken((value) => value + 1)}
            >
              Try again
            </button>
          </section>
        ) : null}

        {mounted && !loadError && !ready ? (
          <p className="now-muted">Loading your plan…</p>
        ) : null}

        {skipped ? (
          <section className="now-card now-skipped" aria-label="Skipped session">
            <p>
              Skipping <strong>{skipped.title}</strong>. That is a fine call.
            </p>
            <button
              ref={undoSkipRef}
              type="button"
              className="now-button"
              onClick={handleUndoSkip}
            >
              Undo, I am going
            </button>
          </section>
        ) : null}

        {showEmpty ? (
          <section className="now-card" aria-labelledby="now-empty-title">
            <h2 id="now-empty-title" className="now-label">
              Nothing on right now
            </h2>
            <p className="now-big">
              {planIds.length === 0
                ? "Your plan is empty. That is a fine place to start."
                : "No session is running and nothing else is coming up in your plan."}
            </p>
            <a className="now-button now-button-primary" href={findHref}>
              Find a session
            </a>
          </section>
        ) : null}

        {ready && !loadError && current ? (
          <section className="now-card" aria-labelledby="now-current-title">
            <h2 className="now-label">Happening now</h2>
            <p id="now-current-title" className="now-big">
              {current.title}
            </p>
            <p className="now-place">{place(current)}</p>
            <p className="now-ends">
              Ends at{" "}
              <time dateTime={current.endsAt}>{formatEventTime(current.endsAt)}</time>
            </p>
            {current.captions === "wordly-breakout" ? (
              <p className="now-fact">
                Captions: Wordly live captions for breakout sessions.{" "}
                <a href={ACCESSIBILITY_SOURCE_URL}>Official accessibility information</a>
              </p>
            ) : null}
            <div className="now-actions">
              <button
                ref={skipButtonRef}
                type="button"
                className="now-button"
                onClick={handleNotAttending}
              >
                I&apos;m not attending this one
              </button>
            </div>
          </section>
        ) : null}

        {ready && !loadError && !current && currentBreak ? (
          <section className="now-card" aria-labelledby="now-break-title">
            <h2 className="now-label">On a break</h2>
            <p id="now-break-title" className="now-big">
              Break
            </p>
            <p className="now-place">{currentBreak.room}</p>
            <p className="now-ends">
              Ends at{" "}
              <time dateTime={currentBreak.endsAt}>
                {formatEventTime(currentBreak.endsAt)}
              </time>
            </p>
          </section>
        ) : null}

        {showReflect && reflectCandidate ? (
          <section className="now-card now-reflect" aria-labelledby="now-reflect-title">
            <h2 id="now-reflect-title" className="now-label">
              Reflect on {reflectCandidate.title}?
            </h2>
            <p className="now-muted">It just ended. A few quiet words can help it stick.</p>
            <div className="now-actions">
              <a
                className="now-button now-button-primary"
                href={withNowParam("/reflect", nowParam)}
                aria-label={`Reflect on ${reflectCandidate.title}`}
              >
                Reflect
              </a>
              <button
                type="button"
                className="now-button"
                onClick={() => {
                  dismissReflect(reflectCandidate.id);
                  setReflectTick((value) => value + 1);
                }}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {ready && !loadError && next && nextItem?.kind === "talk" ? (
          <section className="now-card" aria-labelledby="now-next-title">
            <h2 className="now-label">Next</h2>
            {headsUp ? (
              <p className="now-heads-up">
                Next: {next.title} in {minutesUntil(next.startsAt, now)} min · {place(next)}
              </p>
            ) : null}
            <p id="now-next-title" className="now-big now-big-next">
              {next.title}
            </p>
            <p className="now-place">{place(next)}</p>
            <p className="now-ends">
              <time dateTime={next.startsAt}>
                {describeStartsIn(minutesUntil(next.startsAt, now))}
              </time>
              , at {formatEventTime(next.startsAt)}
            </p>
            {nextNote ? <p className="now-transition">{nextNote}</p> : null}
            {next.captions === "wordly-breakout" ? (
              <p className="now-fact">
                Captions: Wordly live captions for breakout sessions.{" "}
                <a href={ACCESSIBILITY_SOURCE_URL}>Official accessibility information</a>
              </p>
            ) : null}
          </section>
        ) : null}

        {ready && !loadError && nextItem?.kind === "break" ? (
          <section className="now-card" aria-labelledby="now-next-break-title">
            <h2 className="now-label">Next</h2>
            {headsUp ? (
              <p className="now-heads-up">
                Next: Break in {minutesUntil(nextItem.planBreak.startsAt, now)} min ·{" "}
                {nextItem.planBreak.room}
              </p>
            ) : null}
            <p id="now-next-break-title" className="now-big now-big-next">
              Break
            </p>
            <p className="now-place">{nextItem.planBreak.room}</p>
            <p className="now-ends">
              <time dateTime={nextItem.planBreak.startsAt}>
                {describeStartsIn(minutesUntil(nextItem.planBreak.startsAt, now))}
              </time>
              , at {formatEventTime(nextItem.planBreak.startsAt)}
            </p>
          </section>
        ) : null}

        </div>

        {ready && !loadError && isLarge ? (
          <aside className="now-notes-panel" aria-labelledby="now-notes-heading">
            {noteTarget ? (
              <>
                <h2 id="now-notes-heading" className="now-notes-title">
                  {noteTarget.title}
                </h2>
                {current ? null : (
                  <p className="now-muted">This session has ended. Your notes are still here.</p>
                )}
                {renderNotepad(noteTarget)}
              </>
            ) : (
              <>
                <h2 id="now-notes-heading" className="now-notes-title">
                  Notes
                </h2>
                <p className="now-muted">
                  Notes for a session appear here once it is running. Nothing to write yet.
                </p>
              </>
            )}
          </aside>
        ) : null}
        </div>

        {ready && !loadError && !isLarge && (current || sheetVisible) ? (
          <section className="now-notes" aria-label="Quick notes">
            <button
              ref={toggleRef}
              type="button"
              className="now-button now-toggle"
              aria-expanded={sheetVisible}
              aria-controls="now-notes-sheet"
              onClick={openNotes}
            >
              Notes
            </button>
          </section>
        ) : null}

        {sheetVisible && noteTarget ? (
          <div
            id="now-notes-sheet"
            className="now-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="now-sheet-title"
            onKeyDown={handleNotesKey}
          >
            <div className="now-sheet-head">
              <h2 id="now-sheet-title" className="now-notes-title">
                {noteTarget.title}
              </h2>
              <button
                ref={doneRef}
                type="button"
                className="now-button now-button-primary now-done"
                onClick={closeNotes}
              >
                Done
              </button>
            </div>
            {renderNotepad(noteTarget)}
          </div>
        ) : null}

        <section className="now-quiet" aria-label="Quiet rooms">
          <p>
            Quiet rooms: {EVENT.quietRooms.map((room) => `${room.room} (${room.audience})`).join("; ")}.{" "}
            <a href={ACCESSIBILITY_SOURCE_URL}>Official accessibility information</a>
          </p>
        </section>

        <nav className="now-nav" aria-label="Other pages">
          <a className="now-button" href={findHref}>
            Find sessions
          </a>
        </nav>

        <footer className="now-credit">
          <a href={SCHEDULE_SOURCE_URL}>{SCHEDULE_CREDIT}</a>
        </footer>
      </main>
    </div>
  );
}
