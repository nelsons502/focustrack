import { EVENT_ID, QUIET_ROOM_260A } from "./contract";

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
