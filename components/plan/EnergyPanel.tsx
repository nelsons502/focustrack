"use client";

import { QUIET_ROOM_260A } from "../../lib/contract";
import type {
  EnergyResult,
  EnergySettings,
  PlanBreak,
  Session,
  Warning,
} from "../../lib/contract";
import {
  createPlanBreak,
  ENERGY_SETTING_BOUNDS,
  formatHours,
  formatMinutes,
  hasRealBreakGap,
  type NumericEnergyKey,
} from "../../lib/client/plan";
import { formatEventInstant } from "../../lib/client/time";

type EnergyPanelProps = {
  sessions: Session[];
  dayLabel: string;
  settings: EnergySettings;
  result: EnergyResult;
  breaks: PlanBreak[];
  onDrop: (session: Session) => void;
  onAddBreak: (planBreak: PlanBreak) => void;
  onSettingsChange: (settings: EnergySettings) => void;
};

const NUMERIC_FIELDS: {
  key: NumericEnergyKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "maxConsecutive",
    label: "Sessions in a row before a break",
    hint: "We flag a run longer than this with no real break in it.",
  },
  {
    key: "minBreakMinutes",
    label: "Shortest break that counts (minutes)",
    hint: "A gap at least this long ends a run of sessions.",
  },
  {
    key: "transitionMinutes",
    label: "Time to move rooms (minutes)",
    hint: "We flag a shorter gap between back-to-back sessions.",
  },
  {
    key: "levelChangeMinutes",
    label: "Time when changing level (minutes)",
    hint: "Used when the next room is on another level.",
  },
  {
    key: "buildingChangeMinutes",
    label: "Time when changing building (minutes)",
    hint: "Used when the next session is in another building.",
  },
  {
    key: "maxDailyHours",
    label: "Most session hours in one day",
    hint: "We flag a day with more session time than this.",
  },
];

function titleFor(sessions: Session[], id: string): string {
  return sessions.find((session) => session.id === id)?.title ?? "a saved session";
}

function quotedTitles(sessions: Session[], ids: string[]): string {
  return ids.map((id) => `“${titleFor(sessions, id)}”`).join(", ");
}

function warningText(
  warning: Warning,
  sessions: Session[],
  settings: EnergySettings,
): string {
  switch (warning.type) {
    case "consecutive":
      return `${warning.count} sessions in a row without a break of at least ${formatMinutes(settings.minBreakMinutes)} minutes: ${quotedTitles(sessions, warning.sessionIds)}. Your limit is ${formatMinutes(settings.maxConsecutive)} in a row.`;
    case "tight-transition":
      return `Only ${formatMinutes(warning.gapMinutes)} minutes between “${titleFor(sessions, warning.fromId)}” and “${titleFor(sessions, warning.toId)}”. You asked for at least ${formatMinutes(warning.neededMinutes)} minutes for this move.`;
    case "long-day":
      return `${formatHours(warning.hours)} hours of sessions this day. Your limit is ${formatHours(warning.maxHours)} hours.`;
    case "overlap":
      return `“${titleFor(sessions, warning.sessionIds[0])}” and “${titleFor(sessions, warning.sessionIds[1])}” overlap in time.`;
    case "loud-room": {
      const session = sessions.find((item) => item.id === warning.sessionId);
      const basis = session?.noiseBasis.trim();
      return basis
        ? `“${titleFor(sessions, warning.sessionId)}” is in a room estimated to be loud, based on ${basis}.`
        : `“${titleFor(sessions, warning.sessionId)}” is in a room estimated to be loud.`;
    }
  }
}

function safeBreakText(
  startsAt: string,
  sessions: Session[],
  settings: EnergySettings,
): string | null {
  if (!hasRealBreakGap(sessions, startsAt, settings.minBreakMinutes)) {
    return null;
  }
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  return `One option: take ${formatMinutes(settings.minBreakMinutes)} minutes in the quiet room (${QUIET_ROOM_260A}) from ${formatEventInstant(start)} (event time). There is a gap in your plan then.`;
}

export default function EnergyPanel({
  sessions,
  dayLabel,
  settings,
  result,
  breaks,
  onDrop,
  onAddBreak,
  onSettingsChange,
}: EnergyPanelProps) {
  const dropSession =
    result.suggestion?.kind === "drop" && result.suggestion.sessionId
      ? sessions.find((session) => session.id === result.suggestion?.sessionId)
      : undefined;
  const breakText =
    result.suggestion?.kind === "break" && result.suggestion.startsAt
      ? safeBreakText(result.suggestion.startsAt, sessions, settings)
      : null;
  const breakCandidate =
    result.suggestion?.kind === "break" && result.suggestion.startsAt
      ? createPlanBreak(
          sessions,
          breaks,
          result.suggestion.startsAt,
          settings.minBreakMinutes,
        )
      : null;
  const breakAlreadySaved = Boolean(
    breakText &&
      !breakCandidate &&
      result.suggestion?.kind === "break" &&
      result.suggestion.startsAt &&
      breaks.some((entry) => {
        const start = Date.parse(result.suggestion!.startsAt!);
        const end = start + settings.minBreakMinutes * 60_000;
        return Date.parse(entry.startsAt) < end && start < Date.parse(entry.endsAt);
      }),
  );

  function handleNumericChange(key: NumericEnergyKey, raw: string) {
    const bounds = ENERGY_SETTING_BOUNDS[key];
    const parsed = Number(raw);
    const value = Number.isFinite(parsed)
      ? Math.min(bounds.max, Math.max(bounds.min, parsed))
      : bounds.min;
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <section aria-labelledby="energy-heading" className="energy">
      <h2 id="energy-heading" className="plan-heading">
        Energy check for {dayLabel}
      </h2>
      <p className="plan-intro">
        A gentle look at this day against the limits you set. These are
        prompts to consider, not predictions about how you will feel.
      </p>
      {result.warnings.length === 0 ? (
        <p className="state-box">
          No energy concerns for this day with your current settings.
        </p>
      ) : (
        <ul className="warnings">
          {result.warnings.map((warning, index) => (
            <li key={`${warning.type}-${index}`} className="warning">
              {warningText(warning, sessions, settings)}
            </li>
          ))}
        </ul>
      )}
      {dropSession ? (
        <div className="suggestion">
          <p>
            One option: drop “{dropSession.title}” to ease this day. You can
            add it back from Find any time.
          </p>
          <button
            type="button"
            className="button button-primary"
            aria-label={`Drop ${dropSession.title} from plan`}
            onClick={() => onDrop(dropSession)}
          >
            Drop this session
          </button>
        </div>
      ) : null}
      {breakText ? (
        <div className="suggestion">
          <p>{breakText}</p>
          {breakCandidate ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => onAddBreak(breakCandidate)}
            >
              Add quiet-room break to plan
            </button>
          ) : breakAlreadySaved ? (
            <p>This quiet-room break is already in your plan.</p>
          ) : null}
        </div>
      ) : null}
      <details className="settings">
        <summary className="settings-summary">Energy settings</summary>
        <fieldset className="settings-fields">
          <legend>Your limits for the energy check</legend>
          <p className="settings-note">
            Settings are stored on this device and apply straight away.
          </p>
          {NUMERIC_FIELDS.map((field) => {
            const bounds = ENERGY_SETTING_BOUNDS[field.key];
            const inputId = `energy-${field.key}`;
            const hintId = `${inputId}-hint`;
            return (
              <div className="field" key={field.key}>
                <label htmlFor={inputId}>{field.label}</label>
                <input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  value={settings[field.key]}
                  aria-describedby={hintId}
                  onChange={(event) =>
                    handleNumericChange(field.key, event.target.value)
                  }
                />
                <p id={hintId} className="field-hint">
                  {field.hint} Between {bounds.min} and {bounds.max}.
                </p>
              </div>
            );
          })}
          <div className="field field-check">
            <input
              id="energy-flagLoudRooms"
              type="checkbox"
              checked={settings.flagLoudRooms}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  flagLoudRooms: event.target.checked,
                })
              }
            />
            <label htmlFor="energy-flagLoudRooms">
              Flag rooms estimated to be loud
            </label>
          </div>
        </fieldset>
      </details>
    </section>
  );
}
