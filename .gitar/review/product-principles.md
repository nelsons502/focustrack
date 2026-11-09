# Product principles reviewers should enforce

## Focus first
- The product protects attendee attention. Flag engagement traps: infinite scroll, streaks, badges for usage, unsolicited notifications, autoplay, or dark patterns that make leaving harder.
- Each screen has one obvious primary action and a clear done state.

## Accessibility (this app serves neurodivergent, Deaf and hard-of-hearing attendees)
- Every interactive element is keyboard reachable with a visible focus style, and has an accessible name.
- Never convey meaning by color alone; crowd, noise and caption indicators need text or icon labels.
- Respect `prefers-reduced-motion`. Maintain WCAG AA contrast.
- Every async view has loading, empty and human-friendly error states.

## AI at the edges
- Model output is generated ahead of time or validated before display. Teach-back hints must never reveal the answer; flag any code path that sends the answer key to the client before the attendee answers.
- Estimated data (crowd, noise) is labelled as an estimate in the UI.
