import PlanView from "../../components/plan/PlanView";
import PrimaryNav from "../../components/plan/PrimaryNav";
import {
  SCHEDULE_CREDIT,
  SCHEDULE_SOURCE_URL,
} from "../../lib/contract";

export default function PlanPage() {
  return (
    <main id="main" tabIndex={-1} className="shell plan-page">
      <header className="masthead">
        <p className="app-name">FocusTrack</p>
        <PrimaryNav current="plan" />
        <h1>Your plan</h1>
        <p className="purpose">
          The sessions you saved, in order, with a gentle check on how full
          the day is.
        </p>
      </header>
      <PlanView />
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>{SCHEDULE_CREDIT}</a>
      </footer>
    </main>
  );
}
