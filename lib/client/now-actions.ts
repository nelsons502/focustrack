import type { LocalState } from "../contract";
import { addSessionToPlan } from "./local-state";

export function addNote(
  state: LocalState,
  sessionId: string,
  text: string,
  at: Date,
): LocalState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const existing = state.notes[sessionId] ?? [];
  return {
    ...state,
    notes: {
      ...state.notes,
      [sessionId]: [...existing, { text: trimmed, at: at.toISOString() }],
    },
  };
}

export function undoLastNote(state: LocalState, sessionId: string): LocalState {
  const existing = state.notes[sessionId] ?? [];
  if (existing.length === 0) return state;
  return {
    ...state,
    notes: { ...state.notes, [sessionId]: existing.slice(0, -1) },
  };
}

export function markNotAttending(state: LocalState, sessionId: string): LocalState {
  if (!state.plan.sessionIds.includes(sessionId)) return state;
  return {
    ...state,
    plan: {
      sessionIds: state.plan.sessionIds.filter((id) => id !== sessionId),
      notAttending: [...new Set([...state.plan.notAttending, sessionId])],
    },
  };
}

export function undoNotAttending(state: LocalState, sessionId: string): LocalState {
  return addSessionToPlan(state, sessionId);
}
