export const EVENT_ID = "kccncna2026";
export const EVENT_UTC_OFFSET = "-07:00";
export const INDEX_NAME = "sessions";
export const LOCAL_STATE_KEY = "focustrack:v1";
export const QUIET_ROOM_260A = "Salt Palace, Level 2, 260A";

export const EVENT_TIME_ZONE = "America/Denver";
export const DEMO_DAY = "2026-11-10";
export const ACCESSIBILITY_SOURCE_URL = "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/";
export const SCHEDULE_SOURCE_URL = "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/";
export const SCHEDULE_CREDIT = "Schedule data: CNCF / Sessionize";

export const EVENT = {
  id: EVENT_ID,
  timeZone: EVENT_TIME_ZONE,
  demoDay: DEMO_DAY,
  accessibilitySourceUrl: ACCESSIBILITY_SOURCE_URL,
  quietRooms: [
    { room: QUIET_ROOM_260A, audience: "All attendees" },
    { room: "Salt Palace, Level 2, 260B", audience: "Women and nonbinary attendees" },
  ],
  quietRoomGuidance: "Please avoid conversation, interaction, and work in these rooms.",
  captions: {
    provider: "Wordly",
    instructions: "Follow the instructions in each breakout room to access captions.",
    sourceUrl: ACCESSIBILITY_SOURCE_URL,
  },
  scheduleCredit: SCHEDULE_CREDIT,
  scheduleSourceUrl: SCHEDULE_SOURCE_URL,
} as const;

export type Speaker = {
  name: string;
  company: string;
};

export type SessionKind =
  | "talk"
  | "keynote"
  | "panel"
  | "lightning"
  | "demo"
  | "workshop"
  | "community"
  | "colocated"
  | "logistics";

export type RoomType =
  | "keynote-hall"
  | "ballroom"
  | "breakout"
  | "expo-floor"
  | "other";

export type Restriction =
  | "sold-out"
  | "separate-registration"
  | "all-access-pass";

export type CrowdEstimate = "large" | "moderate" | "unknown";

export type NoiseEstimate = "loud" | "unknown";

export const PARSE_RULES = {
  lightning: "Duration is 10 minutes or less.",
  demo: 'Title starts with "Demo Theater:".',
  workshop: "Duration is 75 minutes or more, or title mentions Tutorial or ContribFest.",
  panel: 'Title contains "Panel".',
  expoFloor: 'Room contains "Solutions Showcase" or "Exhibit Hall".',
  keynoteHall: "Room used by keynote sessions.",
  ballroom: 'Room contains "Ballroom".',
  breakout: "Numbered room.",
  crowd: 'Large for keynote-hall or ballroom; moderate for a combined breakout like "250 A-C"; otherwise unknown.',
  noise: "Loud for expo-floor; otherwise unknown.",
  sensorySafety: 'Never add "small" or "quiet" estimates: false reassurance harms noise-sensitive attendees.',
} as const;

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
  roomType: RoomType;
  kind: SessionKind;
  restrictions: Restriction[];
  crowdEstimate: CrowdEstimate;
  crowdBasis: string;
  noiseEstimate: NoiseEstimate;
  noiseBasis: string;
  captions: Captions;
  plainSummary?: string;
  summarySource?: "ai-reviewed";
  autoSummary?: string;
  autoSummaryAt?: string;
  autoSummaryModel?: string;
  descriptionHash?: string;
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
  buildingChangeMinutes: number;
  maxDailyHours: number;
  flagLoudRooms: boolean;
};

export const DEFAULT_ENERGY_SETTINGS: EnergySettings = {
  maxConsecutive: 3,
  minBreakMinutes: 20,
  transitionMinutes: 10,
  levelChangeMinutes: 15,
  buildingChangeMinutes: 20,
  maxDailyHours: 5,
  flagLoudRooms: true,
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
  | { type: "overlap"; sessionIds: [string, string] }
  | { type: "loud-room"; sessionId: string };

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

export type PlanBreak = {
  id: string;
  startsAt: string;
  endsAt: string;
  room: typeof QUIET_ROOM_260A;
};

export type LocalState = {
  plan: {
    sessionIds: string[];
    notAttending: string[];
    breaks?: PlanBreak[];
  };
  notes: Record<string, NoteEntry[]>;
  energy: EnergySettings;
  reflections?: Record<string, Reflection>;
};
