"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import PrimaryNav from "../plan/PrimaryNav";
import SettingsLink from "../SettingsLink";
import PlayDayLink from "./PlayDayLink";

const FOCUSABLE = "a[href], button:not([disabled])";

export default function AppNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreMenuFocus = useRef(false);

  const close = useCallback(() => {
    restoreMenuFocus.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = document.querySelectorAll<HTMLElement>(".app-content, .demo-bar, .app-nav-bar, .skip-link");
    background.forEach((element) => element.setAttribute("inert", ""));
    const query = window.matchMedia("(min-width: 900px)");
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) {
        const active = document.activeElement;
        if (active === closeRef.current || active === menuRef.current || active === document.body) {
          const destination = panelRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? panelRef.current?.querySelector<HTMLElement>("a[href]");
          destination?.focus();
        }
        setOpen(false);
      }
    };
    query.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = previous;
      background.forEach((element) => element.removeAttribute("inert"));
      query.removeEventListener("change", onWide);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!panelRef.current.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onPanelClick(event: MouseEvent<HTMLDivElement>) {
    if (open && event.target instanceof Element && event.target.closest("a")) {
      close();
    }
  }

  return (
    <div className="app-nav" data-open={open ? "true" : "false"}>
      <div className="app-nav-bar">
        <p className="app-nav-name">FocusTrack</p>
        <button
          ref={menuRef}
          type="button"
          className="app-nav-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
        >
          Menu
        </button>
      </div>
      <div
        id={panelId}
        ref={panelRef}
        className="app-nav-panel"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Navigation" : undefined}
        onKeyDown={onPanelKeyDown}
        onClick={onPanelClick}
      >
        <div className="app-nav-panel-head">
          <p className="app-nav-name">FocusTrack</p>
          <button ref={closeRef} type="button" className="app-nav-close" onClick={close}>
            Close
          </button>
        </div>
        <p className="app-nav-group">
          Your day
        </p>
        <PrimaryNav />
        <div className="app-nav-foot">
          <SettingsLink />
          <PlayDayLink />
        </div>
      </div>
    </div>
  );
}
