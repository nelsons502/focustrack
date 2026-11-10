"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type { SearchMode, Session } from "../lib/contract";
import {
  addSessionToPlan,
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  removeSessionFromPlan,
  subscribeLocalState,
  updateLocalState,
} from "../lib/client/local-state";
import { fetchSearch, type SearchRequest } from "../lib/client/search-api";
import { formatEventInstant, parseDemoNow } from "../lib/client/time";
import { DEMO_DAY } from "../lib/event";
import SessionCard from "./SessionCard";
import {
  FIND_FILTER_DEBOUNCE_MS,
  FIND_PAGE_SIZE,
  FIND_RESULT_LIMIT,
  readStoredFindState,
  writeStoredFindState,
} from "./find/find-state";
import styles from "./find/FindSearch.module.css";

const DEFAULT_DAY = DEMO_DAY;

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: "2026-11-09", label: "Mon, Nov 9" },
  { value: "2026-11-10", label: "Tue, Nov 10" },
  { value: "2026-11-11", label: "Wed, Nov 11" },
  { value: "2026-11-12", label: "Thu, Nov 12" },
  { value: "", label: "All event days" },
];

type SearchStatus = "loading" | "success" | "error";

function modeLabel(submittedQuery: string, mode: SearchMode | null): string {
  if (!submittedQuery) return "Browsing schedule";
  if (mode === "hybrid") return "AI-assisted search";
  if (mode === "lexical-fallback") return "Keyword search fallback";
  return "Search results";
}

function showingText(visible: number, total: number): string {
  if (total >= FIND_RESULT_LIMIT) {
    return `Showing ${visible} ${visible === 1 ? "session" : "sessions"}`;
  }
  const noun = total === 1 ? "session" : "sessions";
  return `Showing ${visible} of ${total} ${noun}`;
}

const ALLOWED_DAYS: readonly string[] = DAY_OPTIONS.map(
  (option) => option.value,
);

function subscribeLocationSearch(): () => void {
  return () => undefined;
}

function getLocationSearchSnapshot(): string {
  return window.location.search;
}

function getLocationSearchServerSnapshot(): string {
  return "";
}

export default function FindSearch() {
  const [initialState] = useState(() => ({
    q: "",
    day: DEFAULT_DAY,
    excludeRestricted: false,
  }));
  const [query, setQuery] = useState(initialState.q);
  const [day, setDay] = useState(initialState.day);
  const [excludeRestricted, setExcludeRestricted] = useState(
    initialState.excludeRestricted,
  );
  const [status, setStatus] = useState<SearchStatus>("loading");
  const [results, setResults] = useState<Session[]>([]);
  const [mode, setMode] = useState<SearchMode | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(FIND_PAGE_SIZE);
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const locationSearch = useSyncExternalStore(
    subscribeLocationSearch,
    getLocationSearchSnapshot,
    getLocationSearchServerSnapshot,
  );
  const demoNow = useMemo(
    () => parseDemoNow(new URLSearchParams(locationSearch).get("now")),
    [locationSearch],
  );
  const clearDemoHref = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    params.delete("now");
    const rest = params.toString();
    return rest ? `/?${rest}` : "/";
  }, [locationSearch]);
  const resultsListRef = useRef<HTMLUListElement | null>(null);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const filterTimerRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const lastRequestRef = useRef<SearchRequest>({
    q: initialState.q.trim().slice(0, 300),
    day: initialState.day,
    excludeRestricted: initialState.excludeRestricted,
  });

  const runSearch = useCallback(async (request: SearchRequest) => {
    lastRequestRef.current = request;
    writeStoredFindState({
      q: request.q,
      day: request.day,
      excludeRestricted: request.excludeRestricted,
    });
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const seq = ++requestSeqRef.current;
    setVisibleCount(FIND_PAGE_SIZE);
    setStatus("loading");
    setErrorMessage("");
    setSubmittedQuery(request.q.trim());
    try {
      const data = await fetchSearch(request, controller.signal);
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      setResults(data.results);
      setMode(data.mode);
      setStatus("success");
    } catch (error) {
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setResults([]);
      setMode(null);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Search is temporarily unavailable. Please try again shortly.",
      );
      setStatus("error");
    }
  }, []);

  // Restore before the initial search, which also persists its request.
  useEffect(() => {
    const storedState = readStoredFindState(ALLOWED_DAYS);
    if (!storedState) return;
    queueMicrotask(() => {
      setQuery(storedState.q);
      setDay(storedState.day);
      setExcludeRestricted(storedState.excludeRestricted);
    });
    lastRequestRef.current = {
      q: storedState.q.trim().slice(0, 300),
      day: storedState.day,
      excludeRestricted: storedState.excludeRestricted,
    };
  }, []);

  useEffect(() => {
    void runSearch(lastRequestRef.current);
    return () => {
      controllerRef.current?.abort();
      if (filterTimerRef.current !== null) {
        window.clearTimeout(filterTimerRef.current);
        filterTimerRef.current = null;
      }
    };
  }, [runSearch]);

  const cancelPendingFilterSearch = useCallback(() => {
    if (filterTimerRef.current !== null) {
      window.clearTimeout(filterTimerRef.current);
      filterTimerRef.current = null;
    }
  }, []);

  const scheduleFilterSearch = useCallback(
    (next: { day: string; excludeRestricted: boolean }) => {
      cancelPendingFilterSearch();
      filterTimerRef.current = window.setTimeout(() => {
        filterTimerRef.current = null;
        void runSearch({
          q: lastRequestRef.current.q,
          day: next.day,
          excludeRestricted: next.excludeRestricted,
        });
      }, FIND_FILTER_DEBOUNCE_MS);
    },
    [cancelPendingFilterSearch, runSearch],
  );

  function handleDayChange(value: string) {
    setDay(value);
    scheduleFilterSearch({ day: value, excludeRestricted });
  }

  function handleExcludeRestrictedChange(checked: boolean) {
    setExcludeRestricted(checked);
    scheduleFilterSearch({ day, excludeRestricted: checked });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancelPendingFilterSearch();
    void runSearch({
      q: query.trim().slice(0, 300),
      day,
      excludeRestricted,
    });
  }

  useEffect(() => {
    const firstNewIndex = pendingFocusIndexRef.current;
    if (firstNewIndex === null) return;
    pendingFocusIndexRef.current = null;
    const item = resultsListRef.current?.children[firstNewIndex];
    if (item instanceof HTMLElement) item.focus();
  }, [visibleCount]);

  function handleShowMore() {
    pendingFocusIndexRef.current = visibleCount;
    setVisibleCount((count) => count + FIND_PAGE_SIZE);
  }

  function handleRetry() {
    void runSearch(lastRequestRef.current);
  }

  function handleTogglePlan(session: Session) {
    const inPlan = localState.plan.sessionIds.includes(session.id);
    const next = inPlan
      ? removeSessionFromPlan(localState, session.id)
      : addSessionToPlan(localState, session.id);
    const saved = updateLocalState(next);
    if (inPlan) {
      setSaveAnnouncement(
        saved
          ? `${session.title} removed from your plan.`
          : `${session.title} removed for now, but saving on this device failed.`,
      );
    } else {
      setSaveAnnouncement(
        saved
          ? `${session.title} added to your plan.`
          : `${session.title} added for now, but saving on this device failed.`,
      );
    }
  }

  const planIds = new Set(localState.plan.sessionIds);
  const visibleResults = results.slice(0, visibleCount);
  const statusText =
    status === "loading"
      ? "Searching…"
      : status === "error"
        ? "Search could not be completed."
        : `${modeLabel(submittedQuery, mode)}. ${showingText(visibleResults.length, results.length)}.`;

  return (
    <section aria-labelledby="find-heading" className="find">
      <h2 id="find-heading" className="find-heading">
        Find a session
      </h2>
      <p className="find-intro">
        Search the schedule by topic or learning goal. Times are shown in
        event time for Salt Lake City.
      </p>

      {demoNow ? (
        <p className="demo-banner">
          <strong>Demo time:</strong> {formatEventInstant(demoNow)} (event
          time). This page is pinned to a demo moment, not the live clock.{" "}
          <a href={clearDemoHref}>Clear demo time</a>
        </p>
      ) : null}

      <form className="search-form" onSubmit={handleSubmit} role="search">
        <div className="field field-query">
          <label htmlFor="search-q">Search sessions</label>
          <input
            id="search-q"
            name="q"
            type="search"
            value={query}
            maxLength={300}
            autoComplete="off"
            placeholder="Try a topic or learning goal"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="search-day">Day</label>
          <select
            id="search-day"
            name="day"
            value={day}
            onChange={(event) => handleDayChange(event.target.value)}
          >
            {DAY_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-check">
          <input
            id="search-exclude"
            name="excludeRestricted"
            type="checkbox"
            checked={excludeRestricted}
            onChange={(event) =>
              handleExcludeRestrictedChange(event.target.checked)
            }
          />
          <label htmlFor="search-exclude">
            Hide restricted sessions (sold out, separate registration or
            all-access pass)
          </label>
        </div>
        <button type="submit" className="button button-primary">
          Search
        </button>
      </form>

      <p className="status" role="status" aria-live="polite" aria-atomic="true">
        {statusText}
      </p>
      <p
        className="save-note"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {saveAnnouncement}
      </p>

      {status === "error" ? (
        <div className="state-box state-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="button button-primary"
            onClick={handleRetry}
          >
            Retry search
          </button>
        </div>
      ) : null}

      {status === "success" && results.length === 0 ? (
        <div className="state-box">
          <p>No sessions found for this search.</p>
          <p>Try different words, another day, or clear the restricted filter.</p>
        </div>
      ) : null}

      {status === "success" && results.length > 0 ? (
        <>
          <p className="results-meta">
            {showingText(visibleResults.length, results.length)}
            {results.length > FIND_RESULT_LIMIT
              ? " — there may be more; narrow your search or change the day to see others."
              : null}
          </p>
          {results.length === FIND_RESULT_LIMIT ? (
            <p className="results-meta">Showing the first 30 — narrow your search to see others.</p>
          ) : null}
          <ul className="results" ref={resultsListRef}>
            {visibleResults.map((session) => (
              <li key={session.id} tabIndex={-1} className={styles.resultItem}>
                <SessionCard
                  session={session}
                  inPlan={planIds.has(session.id)}
                  onTogglePlan={handleTogglePlan}
                />
              </li>
            ))}
          </ul>
          {visibleResults.length < results.length ? (
            <div className={styles.showMore}>
              <button
                type="button"
                className={styles.showMoreButton}
                onClick={handleShowMore}
              >
                Show 30 more
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="plan-note">
        Your notes, breaks, settings and reflections stay on this device.
        Saved session IDs are used to look up times and rooms.
        {localState.plan.sessionIds.length > 0
          ? ` ${localState.plan.sessionIds.length} session${localState.plan.sessionIds.length === 1 ? "" : "s"} in your plan so far.`
          : ""}
      </p>
    </section>
  );
}
