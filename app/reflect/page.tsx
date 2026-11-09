import ReflectView from "../../components/ReflectView";
import PrimaryNav from "../../components/plan/PrimaryNav";
import "./reflect.css";

const SCHEDULE_SOURCE_URL =
  "https://sessionize.com/api/v2/uo948i5p/view/markdown";

export default function ReflectPage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <header className="masthead">
        <p className="app-name">FocusTrack</p>
        <PrimaryNav current="reflect" />
      </header>
      <ReflectView />
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>Schedule data: CNCF / Sessionize</a>
      </footer>
    </main>
  );
}
