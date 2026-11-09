"use client";

import "./errors.css";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
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

export default function NotFoundPage() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const raw = new URLSearchParams(search).get("now");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" tabIndex={-1} className="shell error-page">
      <div className="error-card">
        <h1 ref={headingRef} tabIndex={-1} className="error-heading">
          We couldn’t find that page
        </h1>
        <p className="error-text">
          The link may be old, or the address may have a typo. Head back to
          Find to browse the schedule, check your Plan, or open the Now
          screen to see what’s on.
        </p>
        <nav aria-label="Recovery" className="error-nav">
          <Link className="error-nav-link" href={withNowParam("/", raw)}>
            Find
          </Link>
          <Link className="error-nav-link" href={withNowParam("/plan", raw)}>
            Plan
          </Link>
          <Link className="error-nav-link" href={withNowParam("/now", raw)}>
            Now
          </Link>
        </nav>
      </div>
    </main>
  );
}
