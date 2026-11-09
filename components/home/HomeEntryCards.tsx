"use client";

import { useSyncExternalStore } from "react";
import ExportCalendarButton from "../ExportCalendarButton";
import NowLink from "../NowLink";
import { withNowParam } from "../../lib/client/now";
import "./home.css";

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return "";
}

export default function HomeEntryCards() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const rawNow = new URLSearchParams(search).get("now");
  const planHref = withNowParam("/plan", rawNow);
  const demoHref = withNowParam("/demo", rawNow);

  return (
    <section aria-label="Start here" className="home-entries">
      <article className="home-entry">
        <h2>
          <a className="home-entry-link" href={planHref}>
            Plan your day
          </a>
        </h2>
        <p>Choose a few talks and leave room to breathe between them.</p>
        <ExportCalendarButton />
      </article>
      <article className="home-entry">
        <h2>Now</h2>
        <p>See what is on and what is next, without the full schedule.</p>
        <NowLink />
      </article>
      <article className="home-entry">
        <h2>
          <a className="home-entry-link" href={demoHref}>
            Play my day demo
          </a>
        </h2>
        <p>Try a gentle demo day first. Nothing to set up.</p>
      </article>
    </section>
  );
}
