"use client";

import "./plan.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { withNowParam } from "../../lib/client/now";

export type PrimaryNavCurrent = "find" | "plan" | "now" | "reflect";

type PrimaryNavProps = {
  current?: PrimaryNavCurrent;
  nowParam?: string;
};

const LINKS: ReadonlyArray<{ key: PrimaryNavCurrent; label: string; path: string }> = [
  { key: "find", label: "Find", path: "/" },
  { key: "plan", label: "Plan", path: "/plan" },
  { key: "now", label: "Now", path: "/now" },
  { key: "reflect", label: "Reflect", path: "/reflect" },
];

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function getServerLocation(): string {
  return "";
}

function currentFromPathname(pathname: string): PrimaryNavCurrent | undefined {
  const link = LINKS.find((entry) => entry.path === pathname);
  return link?.key;
}

export default function PrimaryNav({ current, nowParam }: PrimaryNavProps) {
  const location = useSyncExternalStore(subscribe, getLocation, getServerLocation);
  const routerPathname = usePathname();
  const [locationPathname, search = ""] = location.split("?");
  const resolvedCurrent = current ?? currentFromPathname(routerPathname ?? locationPathname ?? "");
  const raw = nowParam ?? new URLSearchParams(search).get("now");
  return (
    <nav aria-label="Primary" className="primary-nav">
      {LINKS.map((link) => (
        <Link
          key={link.key}
          href={withNowParam(link.path, raw)}
          className={resolvedCurrent === link.key ? "nav-link nav-link-current" : "nav-link"}
          aria-current={resolvedCurrent === link.key ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
