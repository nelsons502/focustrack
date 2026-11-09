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

export default function ErrorPage({
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
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
          Something didn’t quite work
        </h1>
        <p className="error-text">
          This page ran into a problem and couldn’t load. You can try again —
          if it still doesn’t work, head back to Find, your Plan, or the Now
          screen.
        </p>
        <button
          type="button"
          className="button button-primary error-retry"
          onClick={() => (retry ?? reset)()}
        >
          Try again
        </button>
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
