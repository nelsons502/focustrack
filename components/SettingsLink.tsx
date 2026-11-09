"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { withNowParam } from "../lib/client/now";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function SettingsLink() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const pathname = usePathname();
  const raw = new URLSearchParams(search).get("now");
  return (
    <Link
      href={withNowParam("/settings", raw)}
      className="settings-link"
      aria-current={pathname === "/settings" ? "page" : undefined}
    >
      <svg className="app-nav-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Settings
    </Link>
  );
}
