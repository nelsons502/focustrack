"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const raw = new URLSearchParams(search).get("now");
  return (
    <Link
      href={withNowParam("/settings", raw)}
      className="settings-link"
      aria-current={pathname === "/settings" ? "page" : undefined}
    >
      <span aria-hidden="true">⚙️ </span>Settings
    </Link>
  );
}
