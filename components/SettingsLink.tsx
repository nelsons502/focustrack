"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { withNowParam } from "../lib/client/now";

function subscribe(): () => void {
  return () => undefined;
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function SettingsLink() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const raw = new URLSearchParams(search).get("now");
  return (
    <Link href={withNowParam("/settings", raw)} className="settings-link">
      <span aria-hidden="true">⚙️ </span>Settings
    </Link>
  );
}
