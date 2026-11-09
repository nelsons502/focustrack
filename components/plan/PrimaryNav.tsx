"use client";

import "./plan.css";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { withNowParam } from "../../lib/client/now";

export type PrimaryNavCurrent = "find" | "plan" | "now" | "reflect";

type PrimaryNavProps = {
  current: PrimaryNavCurrent;
  nowParam?: string;
};

const LINKS: ReadonlyArray<{ key: PrimaryNavCurrent; label: string; path: string }> = [
  { key: "find", label: "Find", path: "/" },
  { key: "plan", label: "Plan", path: "/plan" },
  { key: "now", label: "Now", path: "/now" },
  { key: "reflect", label: "Reflect", path: "/reflect" },
];

function subscribe(): () => void {
  return () => undefined;
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function PrimaryNav({ current, nowParam }: PrimaryNavProps) {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const raw = nowParam ?? new URLSearchParams(search).get("now");
  return (
    <nav aria-label="Primary" className="primary-nav">
      {LINKS.map((link) => (
        <Link
          key={link.key}
          href={withNowParam(link.path, raw)}
          className={current === link.key ? "nav-link nav-link-current" : "nav-link"}
          aria-current={current === link.key ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
