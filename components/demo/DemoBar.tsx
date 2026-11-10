"use client";

import { useEffect, useRef, useState } from "react";
import "./demo.css";
import {
  getSimClock,
  pauseSim,
  resumeSim,
  setSpeed,
  startSim,
  stopSim,
  useNow,
} from "../../lib/client/clock";
import { formatEventInstant } from "../../lib/client/time";
import { nextDemoMoment } from "../../lib/demo/maya";

const SPEEDS: readonly number[] = [1, 60, 300];

export default function DemoBar() {
  const now = useNow(1000);
  const [sim, setSim] = useState(() => getSimClock());
  const barRef = useRef<HTMLElement | null>(null);
  const barVisible = now.getTime() !== 0 && sim !== null;
  useEffect(() => {
    const update = () => setSim(getSimClock());
    update();
    window.addEventListener("focustrack:clock", update);
    return () => window.removeEventListener("focustrack:clock", update);
  }, []);
  useEffect(() => {
    const bar = barRef.current;
    const root = document.documentElement;
    if (!barVisible || !bar) return;
    const update = () => {
      const rect = bar.getBoundingClientRect();
      if (rect.height === 0) return;
      const bottomOffset = Math.max(0, window.innerHeight - rect.bottom);
      root.style.setProperty(
        "--demo-bar-space",
        `${rect.height + bottomOffset}px`,
      );
    };
    update();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    observer?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--demo-bar-space");
    };
  }, [barVisible]);
  // Epoch is the pre-hydration placeholder from useNow; render nothing until
  // the real (possibly simulated) time is known on the client.
  if (now.getTime() === 0 || !sim) return null;

  const next = nextDemoMoment(now.getTime());

  return (
    <>
      {/* Reserves flow space so the fixed pill never covers page content. */}
      <div className="demo-bar-spacer" aria-hidden="true" />
      <section ref={barRef} className="demo-bar" aria-label="Demo time">
      <p className="demo-bar-time">
        <span className="demo-bar-label">Demo time</span>{" "}
        <time dateTime={now.toISOString()}>{formatEventInstant(now)}</time>
      </p>
      <div className="demo-bar-controls">
        {sim.playing ? (
          <button
            type="button"
            className="demo-bar-button"
            aria-label="Pause demo time"
            onClick={() => pauseSim()}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            className="demo-bar-button"
            aria-label="Resume demo time"
            onClick={() => resumeSim()}
          >
            Resume
          </button>
        )}
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className="demo-bar-button"
            aria-label={`Set demo speed to ${speed} times`}
            aria-pressed={sim.speed === speed}
            onClick={() => setSpeed(speed)}
          >
            {speed}&times;
          </button>
        ))}
        <button
          type="button"
          className="demo-bar-button"
          aria-label="Jump to next moment"
          disabled={next === null}
          onClick={() => {
            // startSim preserves the current play/pause state when seeking.
            if (next) startSim(next, sim.speed);
          }}
        >
          Jump to next moment
        </button>
        <button
          type="button"
          className="demo-bar-button"
          aria-label="Stop demo"
          onClick={() => stopSim()}
        >
          Stop demo
        </button>
      </div>
        {next === null ? (
          <p className="demo-bar-note">End of the demo day.</p>
        ) : null}
      </section>
    </>
  );
}
