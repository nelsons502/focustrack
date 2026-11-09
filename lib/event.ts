export {
  ACCESSIBILITY_SOURCE_URL,
  DEMO_DAY,
  EVENT,
  EVENT_TIME_ZONE,
  SCHEDULE_CREDIT,
  SCHEDULE_SOURCE_URL,
} from "./contract";

export const ACCESSIBILITY_SOURCE_LABEL = "KubeCon inclusion & accessibility page";

export const ACCESSIBILITY_FACTS = {
  captionsWordly: "Live captions: Wordly (instructions in room)",
  captionsUnconfirmed: "Captions: not confirmed",
  seating: "Reserved accessible seating in every session",
  quietRoom: "Quiet room: Salt Palace, Level 2, 260A",
  quietRoomAbout:
    "Quiet rooms 260A (all attendees) and 260B (women and non-binary attendees) are on Salt Palace Level 2. Please avoid conversation, interaction, and work in these rooms.",
} as const;
