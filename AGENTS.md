# FocusTrack: product conventions

FocusTrack helps conference attendees take in fewer talks, and take them in well. It is not a tool for fitting in more sessions.

## Product principles

- **Focus first.** Every feature should help an attendee stay present and avoid overload. Never add engagement hooks, streaks, notifications, or anything that pulls attention away from the room.
- **Honest data.** Do not invent accessibility or sensory facts. Only show facts we can source (for example, the official inclusion and accessibility page). Crowd size appears only as a labelled estimate with its basis (for example, "keynote room"), otherwise "unknown".
- **AI at the edges.** The core path (search results, plan, energy check, Now screen) must work and be explainable without AI. AI may help with optional summaries and semantic search ranking, must be labelled, and must have a non-AI fallback.
- **Personal data stays on the device.** The plan and notes live in localStorage (`focustrack:v1`). Public session IDs are sent automatically to the schedule lookup API for times and rooms; notes, reflections, breaks and energy settings are not sent. Do not add an extra consent gate for this approved lookup.
- **Credit the source.** Show "Schedule data: CNCF / Sessionize" with a link wherever schedule data appears. Never commit raw schedule text.

## Accessibility bar

- Touch and click targets are at least 44 by 44 pixels.
- Layouts reflow at 320px width and stay usable at 200% zoom.
- Focus is always visible and never hidden behind other content; focus returns to the trigger when a drawer or dialog closes.
- Search and save status is announced through `aria-live` regions.
- Do not claim WCAG conformance. Say "designed to WCAG 2.2 AA and tested with keyboard and VoiceOver".

## Engineering conventions

- TypeScript strict mode. Avoid `any`; if unavoidable, explain why.
- Shared types and constants live in `lib/contract.ts`. Change it only with agreement from every worker.
- Write tests first for behavior. Vitest and React Testing Library.
- Do not add comments that restate what the code does. Comment only to explain why: a hidden constraint, a workaround, or a surprise.
- No new dependencies without approval.
- CI runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` on Node 22. Run them locally before opening a PR.

## Explainability

Every PR body must explain, in plain words a non-expert could repeat, how the change works and what problem it solves.

## File ownership

- **Worker A (UI):** `app/` pages and layouts (except `app/api/**`, `app/healthz`, `app/readyz`), `components/**`, `styles/**`, `lib/client/**`, this file, README.
- **Worker B (data and API):** `app/api/**`, `lib/elastic*`, `lib/energy*`, `scripts/**`.
- **Worker C (deploy and observability):** `Dockerfile`, `deploy/**`, `argocd/**`, `instrumentation.ts`, `lib/telemetry/**`, `app/healthz`, `app/readyz`.
- `.github/**` and `.gitar/**` are repository tooling; change them only deliberately.

Stay inside your own files. If you need a change in someone else's area, ask for it instead of editing it.
