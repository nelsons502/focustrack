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

## Data credit

Schedule data: CNCF / Sessionize ([source](https://sessionize.com/api/v2/uo948i5p/view/markdown)). The repository does not contain raw schedule text.

## AI disclosure

AI coding assistants will be used during this hackathon. This section will describe how, per the event rules.
