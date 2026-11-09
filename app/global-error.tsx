"use client";

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
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

export default function GlobalErrorPage({
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
}) {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const raw = new URLSearchParams(search).get("now");
  const handleRetry = retry ?? reset ?? (() => window.location.reload());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <html
      lang="en"
      style={{ "--focus": "#0b5563", colorScheme: "light" } as CSSProperties}
    >
      <body
        style={{
          margin: 0,
          background: "#faf7f0",
          color: "#1e2b25",
          fontFamily:
            '"Nunito Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <main
          style={{
            maxWidth: "46rem",
            margin: "0 auto",
            padding: "1.5rem 1rem 3rem",
          }}
        >
          <div
            style={{
              margin: "2rem 0",
              padding: "2rem 1.5rem",
              background: "#fffdf8",
              border: "1px solid #6f8378",
              borderRadius: "16px",
            }}
          >
            <h1
              ref={headingRef}
              tabIndex={-1}
              style={{
                margin: "0 0 0.75rem",
                fontSize: "1.75rem",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Something didn’t quite work
            </h1>
            <p style={{ margin: "0 0 1rem", color: "#45564d", maxWidth: "34rem" }}>
              FocusTrack ran into a problem and couldn’t load. You can try
              again — if it still doesn’t work, head back to Find, your Plan,
              or the Now screen.
            </p>
            <button
              type="button"
              onClick={() => handleRetry()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "44px",
                minWidth: "44px",
                padding: "0.55rem 1.1rem",
                borderRadius: "12px",
                border: "1.5px solid #0d4d44",
                background: "#14665c",
                color: "#ffffff",
                font: "inherit",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <nav
              aria-label="Recovery"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "1.5rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid #6f8378",
              }}
            >
              {(
                [
                  { label: "Find", path: "/" },
                  { label: "Plan", path: "/plan" },
                  { label: "Now", path: "/now" },
                ] as const
              ).map((link) => (
                <a
                  key={link.label}
                  href={withNowParam(link.path, raw)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "44px",
                    minWidth: "44px",
                    padding: "0.55rem 1.1rem",
                    border: "1.5px solid #0d4d44",
                    borderRadius: "12px",
                    background: "#fffdf8",
                    color: "#0d4d44",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </main>
      </body>
    </html>
  );
}
