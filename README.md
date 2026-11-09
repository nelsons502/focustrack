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

"Add to plan" saves the session ID on your device only (localStorage key `focustrack:v1`). Nothing about your plan is sent to a server.

For demos, `?now=2026-11-10T11:15-07:00` pins a visible "Demo time" banner. Remove the parameter (or use the clear link) to return to the live clock. Unrecognised values are ignored.

## Data credit

Schedule data: CNCF / Sessionize ([source](https://sessionize.com/api/v2/uo948i5p/view/markdown)). The repository does not contain raw schedule text.

## AI disclosure

AI coding assistants will be used during this hackathon. This section will describe how, per the event rules.
