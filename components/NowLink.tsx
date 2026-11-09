"use client";

import { useSyncExternalStore } from "react";
import { parseDemoNow } from "../lib/client/time";

function subscribe(): () => void {
  return () => undefined;
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function NowLink() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const now = new URLSearchParams(search).get("now");
  const href = now && parseDemoNow(now) ? `/now?now=${encodeURIComponent(now)}` : "/now";
  return (
    <a className="now-link" href={href}>
      Open the Now screen: what is on, and what is next
    </a>
  );
}
