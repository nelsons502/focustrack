export const EVENT_ID = "kccncna2026";
export const INDEX_NAME = "sessions";
export const LOCAL_STATE_KEY = "focustrack:v1";
export const QUIET_ROOM_260A = "Salt Palace, Level 2, 260A";

export type Speaker = {
  name: string;
  company: string;
};

export type SessionKind =
  | "talk"
  | "keynote"
  | "community"
  | "colocated"
  | "logistics";

export type Restriction = "sold-out" | "separate-registration";

export type CrowdEstimate = "large" | "unknown";

export type Captions = "wordly-breakout" | "unknown";

export type Session = {
  id: string;
  eventId: string;
  title: string;
  description: string;
  speakers: Speaker[];
  startsAt: string;
  endsAt: string;
  day: string;
  room: string;
  venue: string | null;
  level: string | null;
  kind: SessionKind;
  restrictions: Restriction[];
  crowdEstimate: CrowdEstimate;
  crowdBasis: string;
  captions: Captions;
  plainSummary?: string;
  summarySource?: "ai-reviewed";
  sourceUrl: string;
};

export type SessionCard = Session;

export type SearchMode = "hybrid" | "lexical-fallback";

export type SearchResponse = {
  results: SessionCard[];
  mode: SearchMode;
  tookMs: number;
};

export type EnergySettings = {
  maxConsecutive: number;
  minBreakMinutes: number;
  transitionMinutes: number;
  levelChangeMinutes: number;
  maxDailyHours: number;
};

export const DEFAULT_ENERGY_SETTINGS: EnergySettings = {
  maxConsecutive: 3,
  minBreakMinutes: 20,
  transitionMinutes: 10,
  levelChangeMinutes: 15,
  maxDailyHours: 5,
};

export type Warning =
  | { type: "consecutive"; sessionIds: string[]; count: number }
  | {
      type: "tight-transition";
      fromId: string;
      toId: string;
      gapMinutes: number;
      neededMinutes: number;
    }
  | { type: "long-day"; hours: number; maxHours: number }
  | { type: "overlap"; sessionIds: [string, string] };

export type EnergySuggestion = {
  kind: "drop" | "break";
  sessionId?: string;
  startsAt?: string;
  room: typeof QUIET_ROOM_260A;
};

export type EnergyResult = {
  warnings: Warning[];
  suggestion?: EnergySuggestion;
};

export type NoteEntry = {
  text: string;
  at: string;
};

export type Reflection = {
  prompt: string;
  answer: string;
  at: string;
};

export type LocalState = {
  plan: {
    sessionIds: string[];
    notAttending: string[];
  };
  notes: Record<string, NoteEntry[]>;
  energy: EnergySettings;
  reflections?: Record<string, Reflection>;
};
