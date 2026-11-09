import type { Metadata } from "next";
import PlayMyDayButton from "../../components/demo/PlayMyDayButton";
import { SCHEDULE_CREDIT, SCHEDULE_SOURCE_URL } from "../../lib/contract";

export const metadata: Metadata = {
  title: "Play my day | FocusTrack",
};

export default function DemoPage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <header className="masthead">
        <p className="app-name">FocusTrack</p>
        <h1>Play my day</h1>
        <p className="purpose">
          Try a real Tuesday at the conference in a few minutes. This loads
          Maya&apos;s plan of five talks from the real schedule, plus a
          20-minute break in Quiet Room 260A, and runs demo time at 60&times;
          &mdash; one minute per second &mdash; starting Tuesday, November 10
          at 11:10 AM event time.
        </p>
      </header>
      <p>
        Play my day replaces your current plan on this device. Your notes,
        energy settings, and reflections stay as they are on this device and
        are not sent anywhere. Only the plan&apos;s public session IDs are
        sent to the schedule lookup for times and rooms. You can pause,
        change speed, jump to the next moment, or stop the demo at any time
        from the Demo time bar.
      </p>
      <PlayMyDayButton />
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>{SCHEDULE_CREDIT}</a>
      </footer>
    </main>
  );
}
