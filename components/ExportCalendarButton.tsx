"use client";

import { useState, useSyncExternalStore } from "react";
import { buildIcs } from "../lib/client/ics";
import {
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
} from "../lib/client/local-state";
import { fetchSessionsByIds } from "../lib/client/search-api";

type ExportStatus = "idle" | "working" | "ready" | "error";

const MAX_EXPORT_IDS = 50;
const FILE_NAME = "focustrack-plan.ics";

function downloadFile(content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExportCalendarButton() {
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const ids = localState.plan.sessionIds.slice(0, MAX_EXPORT_IDS);
  const empty = ids.length === 0;

  async function handleExport() {
    setStatus("working");
    setErrorMessage("");
    try {
      const sessions = await fetchSessionsByIds(ids);
      const ordered = ids.flatMap((id) => {
        const match = sessions.find((session) => session.id === id);
        return match ? [match] : [];
      });
      if (ordered.length === 0) throw new Error("Your sessions could not be loaded. Please try again shortly.");
      downloadFile(
        buildIcs(ordered, { notAttending: localState.plan.notAttending }),
      );
      setStatus("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Your calendar file could not be created. Please try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div className="export-calendar">
      <button
        type="button"
        className="button"
        onClick={() => void handleExport()}
        disabled={empty || status === "working"}
        aria-describedby="export-calendar-help"
      >
        Add my plan to my calendar
      </button>
      <p id="export-calendar-help" className="export-calendar-help">
        {empty
          ? "Add a session to your plan first. Your phone calendar will handle reminders, so you can close this app."
          : "Downloads a calendar file. Your own calendar settings decide any reminders; FocusTrack never sends notifications."}
      </p>
      <p role="status" aria-live="polite" className="export-calendar-status">
        {status === "ready" ? "Calendar file ready" : ""}
      </p>
      {status === "error" ? (
        <p role="alert" className="export-calendar-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
