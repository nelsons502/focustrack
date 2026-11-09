import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import DemoBar from "../components/demo/DemoBar";
import PrimaryNav from "../components/plan/PrimaryNav";
import SettingsLink from "../components/SettingsLink";
import ThemeInit from "../components/settings/ThemeInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "FocusTrack",
  description:
    "Plan fewer conference talks and take them in well: search the schedule, check your energy, stay present.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ThemeInit />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <p className="site-name">FocusTrack</p>
            <PrimaryNav />
            <SettingsLink />
          </div>
        </header>
        {children}
        <DemoBar />
      </body>
    </html>
  );
}
