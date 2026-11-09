import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import DemoBar from "../components/demo/DemoBar";
import AppNav from "../components/nav/AppNav";
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
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <ThemeInit />
        <div className="app-shell">
          <AppNav />
          <div className="app-content">{children}</div>
        </div>
        <DemoBar />
      </body>
    </html>
  );
}
