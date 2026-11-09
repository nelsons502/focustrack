import {
  DEFAULT_ENERGY_SETTINGS,
  LOCAL_STATE_KEY,
  type EnergySettings,
  type LocalState,
  type NoteEntry,
  type PlanBreak,
  type Reflection,
} from "../contract";
import { normalizePlanBreaks } from "./plan";

export function createDefaultLocalState(): LocalState {
  return {
    plan: { sessionIds: [], notAttending: [], breaks: [] },
    notes: {},
    energy: { ...DEFAULT_ENERGY_SETTINGS },
  };
}

export function getBrowserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function parseEnergy(value: unknown): EnergySettings {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_ENERGY_SETTINGS;
  return {
    maxConsecutive: finiteNumber(source.maxConsecutive, defaults.maxConsecutive),
    minBreakMinutes: finiteNumber(
      source.minBreakMinutes,
      defaults.minBreakMinutes,
    ),
    transitionMinutes: finiteNumber(
      source.transitionMinutes,
      defaults.transitionMinutes,
    ),
    levelChangeMinutes: finiteNumber(
      source.levelChangeMinutes,
      defaults.levelChangeMinutes,
    ),
    buildingChangeMinutes: finiteNumber(
      source.buildingChangeMinutes,
      defaults.buildingChangeMinutes,
    ),
    maxDailyHours: finiteNumber(source.maxDailyHours, defaults.maxDailyHours),
    flagLoudRooms:
      typeof source.flagLoudRooms === "boolean"
        ? source.flagLoudRooms
        : defaults.flagLoudRooms,
  };
}

function parseNotes(value: unknown): Record<string, NoteEntry[]> {
  if (!isRecord(value)) return {};
  const notes: Record<string, NoteEntry[]> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const parsed = entries.filter(
      (entry): entry is NoteEntry =>
        isRecord(entry) &&
        typeof entry.text === "string" &&
        typeof entry.at === "string",
    );
    notes[key] = parsed;
  }
  return notes;
}

function parseReflections(
  value: unknown,
): Record<string, Reflection> | undefined {
  if (!isRecord(value)) return undefined;
  const reflections: Record<string, Reflection> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      isRecord(entry) &&
      typeof entry.prompt === "string" &&
      typeof entry.answer === "string" &&
      typeof entry.at === "string"
    ) {
      reflections[key] = {
        prompt: entry.prompt,
        answer: entry.answer,
        at: entry.at,
      };
    }
  }
  return reflections;
}

export function parseLocalState(value: unknown): LocalState {
  if (!isRecord(value)) return createDefaultLocalState();
  const plan = isRecord(value.plan) ? value.plan : {};
  const sessionIds = [...new Set(stringArray(plan.sessionIds))];
  const notAttending = [...new Set(stringArray(plan.notAttending))].filter(
    (id) => !sessionIds.includes(id),
  );
  const state: LocalState = {
    plan: { sessionIds, notAttending, breaks: normalizePlanBreaks(plan.breaks) },
    notes: parseNotes(value.notes),
    energy: parseEnergy(value.energy),
  };
  const reflections = parseReflections(value.reflections);
  if (reflections) state.reflections = reflections;
  return state;
}

export function loadLocalState(
  storage: Storage | null = getBrowserStorage(),
): LocalState {
  if (!storage) return createDefaultLocalState();
  try {
    const raw = storage.getItem(LOCAL_STATE_KEY);
    if (!raw) return createDefaultLocalState();
    return parseLocalState(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultLocalState();
  }
}

export function saveLocalState(
  state: LocalState,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function addSessionToPlan(state: LocalState, id: string): LocalState {
  if (state.plan.sessionIds.includes(id)) return state;
  return {
    ...state,
    plan: {
      ...state.plan,
      sessionIds: [...state.plan.sessionIds, id],
      notAttending: state.plan.notAttending.filter((item) => item !== id),
    },
  };
}

export function removeSessionFromPlan(
  state: LocalState,
  id: string,
): LocalState {
  if (!state.plan.sessionIds.includes(id)) return state;
  return {
    ...state,
    plan: {
      ...state.plan,
      sessionIds: state.plan.sessionIds.filter((item) => item !== id),
    },
  };
}

export function addBreakToPlan(state: LocalState, planBreak: PlanBreak): LocalState {
  const [valid] = normalizePlanBreaks([planBreak]);
  if (!valid) return state;
  const existing = normalizePlanBreaks(state.plan.breaks ?? []);
  const next = normalizePlanBreaks([...existing, valid]);
  if (next.length === existing.length) return state;
  return { ...state, plan: { ...state.plan, breaks: next } };
}

export function removeBreakFromPlan(state: LocalState, id: string): LocalState {
  const existing = state.plan.breaks ?? [];
  if (!existing.some((entry) => entry.id === id)) return state;
  return {
    ...state,
    plan: {
      ...state.plan,
      breaks: existing.filter((entry) => entry.id !== id),
    },
  };
}

const SERVER_SNAPSHOT: LocalState = createDefaultLocalState();
let cachedSnapshot: LocalState | null = null;
const listeners = new Set<() => void>();

export function subscribeLocalState(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_STATE_KEY) {
      cachedSnapshot = null;
      listener();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function getLocalStateSnapshot(): LocalState {
  if (!cachedSnapshot) cachedSnapshot = loadLocalState();
  return cachedSnapshot;
}

export function getLocalStateServerSnapshot(): LocalState {
  return SERVER_SNAPSHOT;
}

export function updateLocalState(next: LocalState): boolean {
  cachedSnapshot = next;
  const saved = saveLocalState(next);
  for (const listener of listeners) listener();
  return saved;
}
