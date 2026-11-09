"use client";

import "./settings.css";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_ENERGY_SETTINGS, type EnergySettings } from "../../lib/contract";
import { stopSim } from "../../lib/client/clock";
import {
  createDefaultLocalState,
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import { withNowParam } from "../../lib/client/now";
import {
  clampEnergySettings,
  ENERGY_SETTING_BOUNDS,
  type NumericEnergyKey,
} from "../../lib/client/plan";
import {
  clearThemeChoice,
  getThemeServerSnapshot,
  readThemeChoice,
  storeThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "./theme";

const NUMERIC_FIELDS: { key: NumericEnergyKey; label: string; hint: string }[] = [
  { key: "maxConsecutive", label: "Sessions in a row before a break", hint: "We flag a run longer than this with no real break in it." },
  { key: "minBreakMinutes", label: "Shortest break that counts (minutes)", hint: "A gap at least this long ends a run of sessions." },
  { key: "transitionMinutes", label: "Time to move rooms (minutes)", hint: "We flag a shorter gap between back-to-back sessions." },
  { key: "levelChangeMinutes", label: "Time when changing level (minutes)", hint: "Used when the next room is on another level." },
  { key: "buildingChangeMinutes", label: "Time when changing building (minutes)", hint: "Used when the next session is in another building." },
  { key: "maxDailyHours", label: "Most session hours in one day", hint: "We flag a day with more session time than this." },
];

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System (match this device)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function subscribeLocation(): () => void {
  return () => undefined;
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function SettingsView() {
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const search = useSyncExternalStore(subscribeLocation, getSearch, getServerSearch);
  const settings = clampEnergySettings(localState.energy);
  const [numericDrafts, setNumericDrafts] = useState<Partial<Record<NumericEnergyKey, string>>>({});
  const theme = useSyncExternalStore(subscribeThemeChoice, readThemeChoice, getThemeServerSnapshot);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [status, setStatus] = useState("");
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (confirmingClear) {
      confirmRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      clearTriggerRef.current?.focus();
    }
  }, [confirmingClear]);

  function saveSettings(next: EnergySettings) {
    updateLocalState({ ...localState, energy: clampEnergySettings(next) });
  }

  function handleNumericChange(key: NumericEnergyKey, raw: string) {
    if (raw === "") {
      setNumericDrafts((current) => ({ ...current, [key]: "" }));
      return;
    }
    const bounds = ENERGY_SETTING_BOUNDS[key];
    const parsed = Number(raw);
    const value = Number.isFinite(parsed)
      ? Math.min(bounds.max, Math.max(bounds.min, parsed))
      : bounds.min;
    setNumericDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    saveSettings({ ...settings, [key]: value });
  }

  function handleNumericBlur(key: NumericEnergyKey) {
    setNumericDrafts((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleReset() {
    setNumericDrafts({});
    saveSettings({ ...DEFAULT_ENERGY_SETTINGS });
    setStatus("Energy settings reset to defaults.");
  }

  function handleThemeChange(choice: ThemeChoice) {
    storeThemeChoice(choice);
    setStatus("Theme saved on this device.");
  }

  function closeConfirm() {
    restoreFocusRef.current = true;
    setConfirmingClear(false);
  }

  function handleClear() {
    updateLocalState(createDefaultLocalState());
    stopSim();
    clearThemeChoice();
    setNumericDrafts({});
    restoreFocusRef.current = true;
    setConfirmingClear(false);
    setStatus("On-device data cleared. Your plan, notes, breaks, reflections and settings were removed from this device.");
  }

  const rawNow = new URLSearchParams(search).get("now");

  return (
    <div className="settings-view">
      <p className="save-note" role="status" aria-live="polite">{status}</p>

      <section aria-labelledby="settings-energy-heading" className="settings-card">
        <h2 id="settings-energy-heading">Energy check</h2>
        <p>These limits shape the gentle energy check on your plan. They apply straight away and are stored on this device.</p>
        <fieldset className="settings-fields settings-local-fields">
          <legend>Your limits for the energy check</legend>
          {NUMERIC_FIELDS.map((field) => {
            const bounds = ENERGY_SETTING_BOUNDS[field.key];
            const inputId = `settings-energy-${field.key}`;
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
                  value={numericDrafts[field.key] ?? settings[field.key]}
                  aria-describedby={hintId}
                  onChange={(event) => handleNumericChange(field.key, event.target.value)}
                  onBlur={() => handleNumericBlur(field.key)}
                />
                <p id={hintId} className="field-hint">
                  {field.hint} Between {bounds.min} and {bounds.max}.
                </p>
              </div>
            );
          })}
          <div className="field field-check">
            <input
              id="settings-energy-flagLoudRooms"
              type="checkbox"
              checked={settings.flagLoudRooms}
              onChange={(event) => saveSettings({ ...settings, flagLoudRooms: event.target.checked })}
            />
            <label htmlFor="settings-energy-flagLoudRooms">Flag rooms estimated to be loud</label>
          </div>
        </fieldset>
        <button type="button" className="button" onClick={handleReset}>
          Reset energy settings to defaults
        </button>
      </section>

      <section aria-labelledby="settings-theme-heading" className="settings-card">
        <h2 id="settings-theme-heading">Theme</h2>
        <fieldset className="theme-fields">
          <legend>Choose how FocusTrack looks on this device</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="theme-option">
              <input
                type="radio"
                name="focustrack-theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => handleThemeChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="settings-demo-heading" className="settings-card">
        <h2 id="settings-demo-heading">Demo</h2>
        <p>See a conference day unfold at 60× speed, without touching a real plan of your own making.</p>
        <Link href={withNowParam("/demo", rawNow)} className="button settings-demo-link">
          Play my day
        </Link>
      </section>

      <section aria-labelledby="settings-privacy-heading" className="settings-card">
        <h2 id="settings-privacy-heading">Your data on this device</h2>
        <p>
          Your plan, notes, breaks, reflections and energy settings stay on this device.
          They are not sent to a server. This page uses system fonts and does not request
          fonts from a third party. To show times and rooms for saved talks, public
          session IDs are sent to the schedule lookup; nothing you wrote is included.
        </p>
        {confirmingClear ? (
          <div className="clear-confirm" ref={confirmRef} tabIndex={-1} role="group" aria-label="Confirm clearing on-device data">
            <p>
              This removes your plan, notes, breaks, reflections and energy settings from
              this device, and stops any demo clock. It cannot be undone.
            </p>
            <div className="settings-actions">
              <button type="button" className="button button-coral" onClick={handleClear}>
                Remove all on-device data
              </button>
              <button type="button" className="button" onClick={closeConfirm}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={clearTriggerRef}
            type="button"
            className="button"
            onClick={() => setConfirmingClear(true)}
          >
            Clear on-device data
          </button>
        )}
      </section>
    </div>
  );
}
