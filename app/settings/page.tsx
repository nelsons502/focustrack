import type { Metadata } from "next";
import SettingsView from "../../components/settings/SettingsView";

export const metadata: Metadata = {
  title: "Settings | FocusTrack",
};

export default function SettingsPage() {
  return (
    <main id="main" tabIndex={-1} className="shell">
      <header className="masthead">
        <h1>Settings</h1>
        <p className="purpose">
          Your energy limits, appearance, and the data kept on this device — grouped below so you can change one thing at a time.
        </p>
      </header>
      <SettingsView />
    </main>
  );
}
