"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
import {
  describeStartsIn,
  formatDemoLabel,
  minutesUntil,
  resolveNow,
  selectCurrentAndNext,
  transitionNote,
  withNowParam,
} from "../lib/client/now";
import {
  addNote,
  markNotAttending,
  undoLastNote,
  undoNotAttending,
} from "../lib/client/now-actions";
import { fetchSessionsByIds } from "../lib/client/search-api";
import { formatEventTime } from "../lib/client/time";

const CLOCK_TICK_MS = 30_000;
const NOTES_SHOWN = 3;

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
  const [realNow, setRealNow] = useState(() => new Date());
  const [known, setKnown] = useState<Record<string, Session>>({});
  const [loadError, setLoadError] = useState("");
  const [loadingIds, setLoadingIds] = useState(false);
  const requested = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSession, setNotesSession] = useState<Session | null>(null);
  const [lastSavedFor, setLastSavedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({ text: "", sessionId: "" });
  const [skipped, setSkipped] = useState<Session | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const undoSkipRef = useRef<HTMLButtonElement>(null);
  const focusAfterSkip = useRef<"undo" | "skip" | null>(null);

  const { now, demo } = useMemo(
    () => resolveNow(nowParam, realNow),
    [nowParam, realNow],
  );

  useEffect(() => {
    if (demo) return undefined;
    const timer = window.setInterval(() => setRealNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [demo]);

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
  const { current, next, previous } = useMemo(
    () => selectCurrentAndNext(sessions, planIds, now),
    [sessions, planIds, now],
  );

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
  const noteTarget = notesOpen && notesSession ? notesSession : current;
  const targetNotes = noteTarget ? (localState.notes[noteTarget.id] ?? []) : [];
  const recentNotes = targetNotes.slice(-NOTES_SHOWN).reverse();
  const canUndoNote =
    lastSavedFor !== null && (localState.notes[lastSavedFor]?.length ?? 0) > 0;

  function saveDraft(): boolean | null {
    if (!draft.sessionId || !draft.text.trim()) return null;
    const saved = updateLocalState(
      addNote(getLocalStateSnapshot(), draft.sessionId, draft.text, new Date()),
    );
    setDraft({ text: "", sessionId: "" });
    setLastSavedFor(draft.sessionId);
    setAnnouncement(
      saved
        ? "Note saved on this device."
        : "Note kept for now, but saving on this device failed.",
    );
    return saved;
  }

  function closeNotes() {
    saveDraft();
    setNotesOpen(false);
    toggleRef.current?.focus();
  }

  useEffect(() => {
    if (notesOpen) noteInputRef.current?.focus();
  }, [notesOpen]);

  function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveDraft();
    noteInputRef.current?.focus();
  }

  function handleUndoNote() {
    if (!lastSavedFor) return;
    updateLocalState(undoLastNote(getLocalStateSnapshot(), lastSavedFor));
    setLastSavedFor(null);
    setAnnouncement("Last note removed.");
    noteInputRef.current?.focus();
  }

  function handleNotesKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeNotes();
    }
  }

  function handleNotAttending() {
    if (!current) return;
    const title = current.title;
    saveDraft();
    setSkipped(current);
    setNotesOpen(false);
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
  const ready = mounted && (planIds.length === 0 || !loadingIds || sessions.length > 0);
  const showEmpty = ready && !loadError && !current && !next;

  return (
    <div className="now-page">
      <main id="main" tabIndex={-1} className="now-shell">
        <header className="now-head">
          <h1>Now</h1>
          {demo ? (
            <p className="now-demo">
              <strong>{formatDemoLabel(now)}</strong>{" "}
              <span>(event time, not the live clock)</span>
            </p>
          ) : null}
        </header>

        <div className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>

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

        {ready && !loadError && next ? (
          <section className="now-card" aria-labelledby="now-next-title">
            <h2 className="now-label">Next</h2>
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

        {ready && !loadError && noteTarget ? (
          <section className="now-notes" aria-label="Quick notes">
            <button
              ref={toggleRef}
              type="button"
              className="now-button now-toggle"
              aria-expanded={notesOpen}
              aria-controls="now-notes-drawer"
              onClick={() => {
                if (notesOpen) {
                  closeNotes();
                } else {
                  setNotesSession(current);
                  setNotesOpen(true);
                }
              }}
            >
              {notesOpen ? "Close notes" : "Quick notes"}
            </button>
            {notesOpen ? (
              <div
                id="now-notes-drawer"
                className="now-drawer"
                role="group"
                aria-label={`Notes for ${noteTarget.title}`}
                onKeyDown={handleNotesKey}
              >
                <form onSubmit={handleSaveNote} className="now-note-form">
                  <label htmlFor="now-note-input">One line at a time. Saved on this device when you press Enter, close, or move on</label>
                  <div className="now-note-row">
                    <input
                      ref={noteInputRef}
                      id="now-note-input"
                      type="text"
                      value={draft.text}
                      maxLength={280}
                      autoComplete="off"
                      enterKeyHint="done"
                      onChange={(event) =>
                        setDraft((previousDraft) => ({
                          text: event.target.value,
                          sessionId: previousDraft.sessionId || noteTarget.id,
                        }))
                      }
                    />
                    <button type="submit" className="now-button now-button-primary">
                      Save note
                    </button>
                  </div>
                </form>
                <div className="now-note-tools">
                  <button
                    type="button"
                    className="now-button"
                    onClick={handleUndoNote}
                    disabled={!canUndoNote}
                  >
                    Undo last note
                  </button>
                </div>
                {recentNotes.length > 0 ? (
                  <ul className="now-note-list" aria-label="Latest notes">
                    {recentNotes.map((note) => (
                      <li key={note.at + note.text}>{note.text}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
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
