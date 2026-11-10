"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type { LocalState, Session } from "../lib/contract";
import { getNow, getSimClock, useNow } from "../lib/client/clock";
import {
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
  updateLocalState,
} from "../lib/client/local-state";
import {
  MAX_ANSWER_LENGTH,
  savedReflections,
  selectEndedToday,
  withReflection,
} from "../lib/client/reflection";
import { buildReflectionPrompts } from "../lib/client/reflection-prompts";
import { fetchSessionsByIds } from "../lib/client/sessions-api";
import { formatEventInstant, formatEventRange, parseDemoNow } from "../lib/client/time";

type View = { kind: "list" } | { kind: "session"; id: string } | { kind: "recap" };
type LoadStatus = "loading" | "success" | "error";

const PRIVACY_COPY = "Nothing here is graded or shared. It stays on this device.";

function subscribeLocation(): () => void {
  return () => undefined;
}

function getLocationSearch(): string {
  return window.location.search;
}

function getLocationSearchServer(): string {
  return "";
}

function plannedIds(state: LocalState): string[] {
  const skipped = new Set(state.plan.notAttending);
  return state.plan.sessionIds.filter((id) => !skipped.has(id));
}

export default function ReflectView() {
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const locationSearch = useSyncExternalStore(
    subscribeLocation,
    getLocationSearch,
    getLocationSearchServer,
  );
  // Shared clock follows the 60x demo sim (and ?now= via getNow) and ticks
  // every second, so a talk appears here as soon as it ends in demo time.
  const now = useNow(1000);
  const clockReady = now.getTime() !== 0;
  const isDemoTime = clockReady && (getSimClock() !== null || parseDemoNow(new URLSearchParams(locationSearch).get("now")) !== null);
  const homeHref = useMemo(() => {
    const param = new URLSearchParams(locationSearch).get("now");
    return param ? `/?now=${encodeURIComponent(param)}` : "/";
  }, [locationSearch]);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View>({ kind: "list" });
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const idsKey = plannedIds(localState).join(",");

  useEffect(() => {
    const controller = new AbortController();
    fetchSessionsByIds(idsKey ? idsKey.split(",") : [], controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setSessions(loaded);
        setStatus("success");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [idsKey, retry]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  const ended = clockReady ? selectEndedToday(sessions, localState, now) : [];
  const recap = savedReflections(ended, localState);
  // The open form is not clock-filtered: crossing midnight (at 60x, a real
  // second) must not unmount it and discard the unsaved answer or focus.
  // The "today" filter applies to the list and recap only.
  const selected =
    view.kind === "session"
      ? openSession?.id === view.id
        ? openSession
        : sessions.find((session) => session.id === view.id)
      : undefined;

  const nowLabel = clockReady ? (
    <p className="reflect-meta reflect-now">
      {isDemoTime ? "Demo time:" : "Right now:"}{" "}
      <time dateTime={now.toISOString()}>{formatEventInstant(now)}</time>
    </p>
  ) : null;

  if (view.kind === "session" && selected) {
    return (
      <ReflectForm
        key={selected.id}
        session={selected}
        localState={localState}
        headingRef={headingRef}
        onBack={() => {
          setOpenSession(null);
          setView({ kind: "list" });
        }}
      />
    );
  }

  if (view.kind === "recap") {
    return (
      <section aria-labelledby="reflect-title" className="reflect-page reflect-recap">
        <h1 id="reflect-title" ref={headingRef} tabIndex={-1} className="reflect-heading">
          Night-of recap
        </h1>
        <p className="reflect-intro">
          A calm look back at today, in your own words. {PRIVACY_COPY}
        </p>
        {nowLabel}
        {recap.length === 0 ? (
          <div className="reflect-empty">
            <p role="status">
              No reflections saved yet. Pick a talk to write one, or skip this entirely.
            </p>
          </div>
        ) : (
          <>
            <p className="reflect-meta">
              {recap.length === 1
                ? "1 reflection saved today."
                : `${recap.length} reflections saved today.`}
            </p>
            <ul className="reflect-list">
              {recap.map(({ session, reflection }) => (
                <li key={session.id} className="reflect-item reflect-recap-item">
                  <h2>{session.title}</h2>
                  <p className="reflect-meta">{formatEventRange(session.startsAt, session.endsAt)}</p>
                  <p className="reflect-prompt">{reflection.prompt}</p>
                  <p className="reflect-answer-text">{reflection.answer}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="reflect-actions">
          <button type="button" className="button" onClick={() => setView({ kind: "list" })}>
            Back to today&rsquo;s talks
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="reflect-title" className="reflect-page">
      <h1 id="reflect-title" ref={headingRef} tabIndex={-1} className="reflect-heading">
        Talks you attended today
      </h1>
      <p className="reflect-intro">
        A few optional questions to help you keep what mattered. {PRIVACY_COPY}
      </p>
      {nowLabel}
      {!clockReady || status === "loading" ? (
        <p role="status">Loading your talks&hellip;</p>
      ) : status === "error" ? (
        <div className="state-box state-error" role="alert">
          <p>Your talks could not be loaded. Nothing you saved is lost.</p>
          <button type="button" className="button" onClick={() => {
              setStatus("loading");
              setRetry((n) => n + 1);
            }}>
            Try again
          </button>
        </div>
      ) : ended.length === 0 ? (
        <div className="reflect-empty">
          <p role="status">
            No talks have ended yet. Come back after one finishes, or skip this: it is optional.
          </p>
        </div>
      ) : (
        <>
          <p className="reflect-meta">
            {ended.length === 1 ? "1 talk ended today." : `${ended.length} talks ended today.`}
          </p>
          <ul className="reflect-list">
            {ended.map((session) => {
              const done = Boolean(localState.reflections?.[session.id]?.answer);
              return (
                <li key={session.id} className="reflect-item">
                  <h2>{session.title}</h2>
                  <p className="reflect-meta">
                    {formatEventRange(session.startsAt, session.endsAt)}
                  </p>
                  {session.room ? <p className="reflect-place">{session.room}</p> : null}
                  {done ? <p className="reflect-saved">Reflection saved</p> : null}
                  <div className="reflect-actions reflect-item-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      aria-label={`${done ? "Edit reflection for" : "Reflect on"} ${session.title}`}
                      onClick={() => {
                        setOpenSession(session);
                        setView({ kind: "session", id: session.id });
                      }}
                    >
                      {done ? "Edit reflection" : "Reflect"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="reflect-actions">
        {status === "success" && clockReady ? (
          <button type="button" className="button" onClick={() => setView({ kind: "recap" })}>
            Night-of recap
          </button>
        ) : null}
        <a className="reflect-nav-link" href={homeHref}>
          Back to FocusTrack
        </a>
      </div>
    </section>
  );
}

function ReflectForm({
  session,
  localState,
  headingRef,
  onBack,
}: {
  session: Session;
  localState: LocalState;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  const { prompts } = useMemo(() => buildReflectionPrompts(session), [session]);
  const existing = localState.reflections?.[session.id];
  const initialPrompt =
    existing && prompts.includes(existing.prompt) ? existing.prompt : prompts[0];
  const [prompt, setPrompt] = useState(initialPrompt);
  const [answer, setAnswer] = useState(existing?.answer ?? "");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"ok" | "error">("ok");
  const notes = localState.notes[session.id] ?? [];

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) {
      setTone("error");
      setMessage("Write a few words first, or go back. Nothing is required.");
      return;
    }
    const saved = updateLocalState(withReflection(localState, session.id, prompt, answer, getNow()));
    if (saved) {
      setTone("ok");
      setMessage("Saved. You can close this.");
    } else {
      setTone("error");
      setMessage("Could not save on this device. Your answer is still here.");
    }
  }

  return (
    <section aria-labelledby="reflect-title" className="reflect-page">
      <h1 id="reflect-title" ref={headingRef} tabIndex={-1} className="reflect-heading">
        {session.title}
      </h1>
      <p className="reflect-meta">
        {formatEventRange(session.startsAt, session.endsAt)}. {PRIVACY_COPY}
      </p>
      {notes.length > 0 ? (
        <div className="reflect-notes">
          <h2>Your notes from this talk</h2>
          <ul>
            {notes.map((note, index) => (
              <li key={`${note.at}-${index}`}>{note.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="reflect-form">
        <fieldset className="reflect-fieldset">
          <legend>Pick one question</legend>
          {prompts.map((text) => (
            <label key={text} className="reflect-choice">
              <input
                type="radio"
                name="prompt"
                value={text}
                checked={prompt === text}
                onChange={() => {
                  setPrompt(text);
                  setMessage("");
                }}
              />
              <span>{text}</span>
            </label>
          ))}
        </fieldset>
        <label className="reflect-label" htmlFor="reflect-answer">
          Your answer (private)
        </label>
        <textarea
          id="reflect-answer"
          className="reflect-answer"
          value={answer}
          maxLength={MAX_ANSWER_LENGTH}
          onChange={(event) => {
            setAnswer(event.target.value);
            setMessage("");
          }}
        />
        <div className="reflect-actions">
          <button type="submit" className="button button-primary">
            Save on this device
          </button>
          <button type="button" className="button" onClick={onBack}>
            Back to today&rsquo;s talks
          </button>
        </div>
        <p className="reflect-status" role="status" aria-live="polite" data-tone={tone}>
          {message}
        </p>
      </form>
    </section>
  );
}
