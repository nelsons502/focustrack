import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
