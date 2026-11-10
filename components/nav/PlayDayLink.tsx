"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { withNowParam } from "../../lib/client/now";

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

export default function PlayDayLink() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const pathname = usePathname();
  const raw = new URLSearchParams(search).get("now");
  return (
    <Link
      href={withNowParam("/demo", raw)}
      className="app-nav-play"
      aria-current={pathname === "/demo" ? "page" : undefined}
    >
      <svg className="app-nav-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
      </svg>
      Play my day
    </Link>
  );
}
