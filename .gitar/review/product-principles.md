# Product principles reviewers should enforce

## Focus first
- The product protects attendee attention. Flag engagement traps: infinite scroll, streaks, badges for usage, unsolicited notifications, autoplay, or dark patterns that make leaving harder.
- Each screen has one obvious primary action and a clear done state.

## Accessibility (this app serves neurodivergent, Deaf and hard-of-hearing attendees)
- Every interactive element is keyboard reachable, has an accessible name, and a visible focus style that is never obscured by sticky headers or drawers.
- Touch targets are at least 44 by 44 CSS pixels. Layouts reflow at 320 CSS pixels and stay usable at 200% text zoom.
- Drawers and dialogs return focus to the control that opened them. Search results and saves are announced through an aria-live region.
- Never convey meaning by color alone; crowd and caption indicators need text labels.
- Respect `prefers-reduced-motion`. Maintain WCAG 2.2 AA contrast in both light and dark themes.
- Every async view has loading, empty and human-friendly error states.

## Honest data
- Accessibility facts shown to users come from a cited source (for example the event's official accessibility page). Flag any code or seed data that invents caption availability, noise levels or accommodations, including AI-generated values.
- Estimates (for example crowd from room type) are labelled as estimates in the UI; unknown values are shown as unknown.
- Model output is generated ahead of time or validated before display, never on the live demo path.
- Schedule data is credited to its source. Raw schedule text is not committed to this repository.

## Privacy
- Public session IDs may be sent to the schedule lookup API automatically to resolve the on-device plan. This lookup is approved; do not add a consent gate for it. Notes, reflections, breaks and energy settings remain on-device.
- Plans and notes stay on the device. Any future sharing of private content needs explicit consent at the moment of sharing, bounded input, and aggregates hidden below 5 responses.
