import ReflectView from "../../components/ReflectView";
import "./reflect.css";

const SCHEDULE_SOURCE_URL =
  "https://sessionize.com/api/v2/uo948i5p/view/markdown";

export default function ReflectPage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <ReflectView />
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>Schedule data: CNCF / Sessionize</a>
      </footer>
    </main>
  );
}
