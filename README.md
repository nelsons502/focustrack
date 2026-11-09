# FocusTrack

FocusTrack helps conference attendees take in fewer talks, and take them in well: search the real schedule, check the day's energy load, and stay present in the room.

Built for the WeMakeDevs Cloud Native Hackathon (Salt Lake City, November 9, 2026).

## Setup

Requires Node 22.

```bash
npm ci
npm run dev
```

Environment variables (server only, never committed):

- `ES_URL`: Elasticsearch endpoint
- `ES_API_KEY`: Elasticsearch API key

Checks run in CI: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Find (search)

The home page searches the live schedule through `GET /api/search`. Type a topic or learning goal, pick a day (Tuesday, November 10, 2026 by default), optionally hide restricted sessions (sold out, separate registration or all-access pass), and press Search. Search matches session titles and descriptions, with AI-assisted semantic matching over descriptions. Leaving the box empty browses the schedule for the chosen day.

Each result shows the session time in event time (America/Denver, whatever your device clock says), room, speakers, session type and any ticket restrictions. Crowd and noise are shown only as labelled estimates with their basis, or as "unknown". Wordly captions are mentioned only where the data says they apply, with a link to the official accessibility page.

"Add to plan" saves the session ID on your device (localStorage key `focustrack:v1`). Your plan is stored on this device; the Plan page sends your saved session IDs to the schedule service to look up their times and rooms. Notes, quiet-room breaks and settings are not sent, and adding or removing a talk keeps any saved breaks.

For demos, `?now=2026-11-10T11:15-07:00` pins a visible "Demo time" banner. Remove the parameter (or use the clear link) to return to the live clock. Unrecognised values are ignored.

## Plan (agenda and energy check)

`/plan` shows your saved sessions as a timeline for a day you choose, in event time (America/Denver), with room, speakers and ticket restrictions. Saved IDs are looked up through `GET /api/sessions?ids=` in batches of at most 50; an empty plan makes no request. Saved entries that are no longer in the schedule are named honestly and can be removed.

The energy check runs on this device for the chosen day only, against limits you can change (sessions in a row, what counts as a break, move times for room, level and building changes, session hours per day, and whether to flag rooms estimated to be loud). It explains each concern in concrete terms and can suggest dropping one session with one tap. When a real gap between saved sessions fits your shortest-break setting, it can suggest saving a quiet-room break (Salt Palace, Level 2, 260A) for that gap; the break is stored on this device with the rest of your plan (same `focustrack:v1` key), appears in the timeline, and can be removed with undo. Duplicate or overlapping breaks are refused. Settings are stored on this device too.

## Data credit

Schedule data: CNCF / Sessionize ([source](https://sessionize.com/api/v2/uo948i5p/view/markdown)). The repository does not contain raw schedule text.

## AI disclosure

AI coding assistants will be used during this hackathon. This section will describe how, per the event rules.
