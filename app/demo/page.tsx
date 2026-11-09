import type { Metadata } from "next";
import PlayMyDayButton from "../../components/demo/PlayMyDayButton";
import { SCHEDULE_CREDIT, SCHEDULE_SOURCE_URL } from "../../lib/contract";
import DemoTimeline from "../../components/demo/DemoTimeline";
import "./page.css";

export const metadata: Metadata = {
  title: "Play my day | FocusTrack",
};

export default function DemoPage() {
  return (
    <main id="main" tabIndex={-1} className="shell demo-page">
      <header className="masthead">
        <p className="app-name">FocusTrack</p>
        <h1>Play my day</h1>
        <p className="purpose">
          A gentle way to see FocusTrack follow a conference day. In a few
          minutes you can watch Maya&apos;s Tuesday unfold — no setup. Your
          notes, energy settings, and reflections stay on this device.
        </p>
      </header>

      <section aria-labelledby="demo-how-heading" className="demo-section">
        <h2 id="demo-how-heading" className="demo-heading">
          What Play my day does
        </h2>
        <ol className="demo-steps">
          <li>
            <span className="demo-step-number" aria-hidden="true">
              1
            </span>
            <p>
              <strong>Loads Maya&apos;s Tuesday.</strong> Five talks from the
              real schedule, plus a 20-minute break in Quiet Room 260A.
            </p>
          </li>
          <li>
            <span className="demo-step-number" aria-hidden="true">
              2
            </span>
            <p>
              <strong>Starts demo time.</strong> Tuesday, November 10 at
              11:10 AM event time, playing at 60&times; — one minute per
              second — so the Now screen follows the day for you.
            </p>
          </li>
          <li>
            <span className="demo-step-number" aria-hidden="true">
              3
            </span>
            <p>
              <strong>Stays in your hands.</strong> Pause, change speed, jump
              to the next moment, or stop the demo at any time from the Demo
              time bar.
            </p>
          </li>
        </ol>
      </section>

      <DemoTimeline />

      <section aria-labelledby="demo-speed-heading" className="demo-section">
        <h2 id="demo-speed-heading" className="demo-heading">
          The speed buttons, in plain words
        </h2>
        <p className="demo-note">
          Once the demo is running, the Demo time bar at the bottom of the
          screen offers three speeds:
        </p>
        <ul className="demo-speeds">
          <li>
            <strong>1&times;</strong> — real time. One second passes per
            second, for lingering on a single moment.
          </li>
          <li>
            <strong>60&times;</strong> — the demo default. One minute passes
            per second, so a whole day takes a few minutes.
          </li>
          <li>
            <strong>300&times;</strong> — five minutes per second, for
            skipping ahead to the afternoon.
          </li>
        </ul>
      </section>

      <p>
        Play my day replaces your current plan on this device. Your notes,
        energy settings, and reflections stay as they are on this device and
        are not sent anywhere. Only the plan&apos;s public session IDs are
        sent to the schedule lookup for times and rooms. You can pause,
        change speed, jump to the next moment, or stop the demo at any time
        from the Demo time bar.
      </p>
      <div className="demo-cta">
        <PlayMyDayButton />
        <p className="demo-note">
          Takes you to the Now screen, where the day is already playing.
        </p>
      </div>
      <footer className="credit">
        <a href={SCHEDULE_SOURCE_URL}>{SCHEDULE_CREDIT}</a>
      </footer>
    </main>
  );
}
