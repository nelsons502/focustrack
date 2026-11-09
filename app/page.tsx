const SCHEDULE_SOURCE_URL =
  "https://sessionize.com/api/v2/uo948i5p/view/markdown";

export default function HomePage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <h1>FocusTrack</h1>
      <p className="purpose">
        Find the talks worth your attention, plan a day you can actually
        finish, and stay present in the room.
      </p>
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>Schedule data: CNCF / Sessionize</a>
      </footer>
    </main>
  );
}
