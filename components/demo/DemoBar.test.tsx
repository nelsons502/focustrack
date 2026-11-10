import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNow, getSimClock, pauseSim, startSim, stopSim } from "../../lib/client/clock";
import DemoBar from "./DemoBar";

beforeEach(() => {
  window.sessionStorage.clear();
  stopSim();
});

afterEach(() => {
  stopSim();
});

describe("DemoBar", () => {
  it("renders nothing when no sim is active", () => {
    const { container } = render(<DemoBar />);
    expect(container.querySelector(".demo-bar")).toBeNull();
    expect(container.querySelector(".demo-bar-spacer")).toBeNull();
  });

  it("renders a spacer so the fixed pill never covers page content", () => {
    startSim("2026-11-10T11:10:00-07:00", 60);
    const { container } = render(<DemoBar />);
    expect(container.querySelector(".demo-bar-spacer")).not.toBeNull();
    expect(container.querySelector(".demo-bar")).not.toBeNull();
  });

  it("reserves the measured bar height plus its bottom offset", () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        height: 120,
        width: 300,
        top: window.innerHeight - 132,
        bottom: window.innerHeight - 12,
        left: 0,
        right: 300,
        x: 0,
        y: window.innerHeight - 132,
        toJSON: () => ({}),
      } as DOMRect);
    try {
      startSim("2026-11-10T11:10:00-07:00", 60);
      const { unmount } = render(<DemoBar />);
      expect(
        document.documentElement.style.getPropertyValue("--demo-bar-space"),
      ).toBe("132px");
      unmount();
      expect(
        document.documentElement.style.getPropertyValue("--demo-bar-space"),
      ).toBe("");
    } finally {
      rect.mockRestore();
      document.documentElement.style.removeProperty("--demo-bar-space");
    }
  });

  it("shows the simulated event time labelled as Demo time", () => {
    startSim("2026-11-10T11:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    expect(screen.getByLabelText("Demo time")).toBeInTheDocument();
    expect(screen.getByText(/11:10 AM/)).toBeInTheDocument();
  });

  it("pauses and resumes the sim", () => {
    startSim("2026-11-10T11:10:00-07:00", 60);
    render(<DemoBar />);
    fireEvent.click(screen.getByRole("button", { name: "Pause demo time" }));
    expect(getSimClock()?.playing).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Resume demo time" }));
    expect(getSimClock()?.playing).toBe(true);
    expect(screen.getByRole("button", { name: "Pause demo time" })).toBeInTheDocument();
  });

  it("changes speed and marks the active speed while paused", () => {
    startSim("2026-11-10T11:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    const fast = screen.getByRole("button", { name: "Set demo speed to 300 times" });
    fireEvent.click(fast);
    expect(getSimClock()?.speed).toBe(300);
    expect(fast).toHaveAttribute("aria-pressed", "true");
  });

  it("jumps to the next moment while staying paused", () => {
    startSim("2026-11-10T11:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    fireEvent.click(screen.getByRole("button", { name: "Jump to next moment" }));
    expect(getSimClock()?.playing).toBe(false);
    expect(getNow().getTime()).toBe(Date.parse("2026-11-10T11:30:00-07:00"));
  });

  it("disables jump after the last moment, and Stop clears the clock", () => {
    startSim("2026-11-10T17:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    expect(screen.getByRole("button", { name: "Jump to next moment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop demo" }));
    expect(getSimClock()).toBeNull();
    expect(screen.queryByLabelText("Demo time")).toBeNull();
  });
});

it("updates selected speed immediately while paused", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T23:00:00Z"));
  try {
    startSim("2026-11-10T11:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    const fast = screen.getByRole("button", { name: "Set demo speed to 300 times" });
    fireEvent.click(fast);
    expect(getSimClock()?.speed).toBe(300);
    expect(fast).toHaveAttribute("aria-pressed", "true");
  } finally {
    vi.useRealTimers();
  }
});

it("updates the resume control immediately while time is frozen", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T23:00:00Z"));
  try {
    startSim("2026-11-10T11:10:00-07:00", 60);
    pauseSim();
    render(<DemoBar />);
    fireEvent.click(screen.getByRole("button", { name: "Resume demo time" }));
    expect(getSimClock()?.playing).toBe(true);
    expect(screen.getByRole("button", { name: "Pause demo time" })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
