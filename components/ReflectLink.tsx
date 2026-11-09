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

export default function ReflectLink() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const now = new URLSearchParams(search).get("now");
  const href =
    now && parseDemoNow(now) ? `/reflect?now=${encodeURIComponent(now)}` : "/reflect";
  return (
    <a className="button" href={href}>
      Reflect on today&rsquo;s talks (optional)
    </a>
  );
}
