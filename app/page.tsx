import FindSearch from "../components/FindSearch";
import ReflectLink from "../components/ReflectLink";
import PrimaryNav from "../components/plan/PrimaryNav";
import HomeTakeover from "../components/now/HomeTakeover";
import HomeEntryCards from "../components/home/HomeEntryCards";

const SCHEDULE_SOURCE_URL =
  "https://sessionize.com/api/v2/uo948i5p/view/markdown";

export default function HomePage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <HomeTakeover />
      <header className="masthead">
        <PrimaryNav current="find" />
        <h1>FocusTrack</h1>
        <p className="purpose">
          Find a few talks worth your attention, plan a day you can actually
          absorb, and stay present in the room.
        </p>
      </header>
      <HomeEntryCards />
      <FindSearch />
      <ReflectLink />
      <footer className="credit">
        <p className="home-privacy">
          Your notes, breaks, settings and reflections stay on this device.
          Saved session IDs are used to look up times and rooms.
        </p>
        <a href={SCHEDULE_SOURCE_URL}>Schedule data: CNCF / Sessionize</a>
      </footer>
    </main>
  );
}
