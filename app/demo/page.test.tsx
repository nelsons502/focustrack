import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSimClock, stopSim } from "../../lib/client/clock";
import {
  createDefaultLocalState,
  loadLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import {
  NOW_OPT_OUT_KEY,
  SCHEDULE_CREDIT,
  SCHEDULE_SOURCE_URL,
} from "../../lib/contract";
import { MAYA_SESSION_IDS } from "../../lib/demo/maya";
import DemoPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  stopSim();
  updateLocalState(createDefaultLocalState());
});

afterEach(() => {
  stopSim();
});

describe("DemoPage", () => {
  it("explains the demo replaces the current plan and credits the schedule", () => {
    render(<DemoPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Play my day" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/replaces your current plan/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing leaves this device/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: SCHEDULE_CREDIT })).toHaveAttribute(
      "href",
      SCHEDULE_SOURCE_URL,
    );
  });

  it("shows the three steps, Maya's timeline preview, and speeds explained", () => {
    render(<DemoPage />);
    expect(
      screen.getByRole("heading", { name: "What Play my day does" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loads Maya's Tuesday/i)).toBeInTheDocument();
    expect(screen.getByText(/Starts demo time/i)).toBeInTheDocument();
    expect(screen.getByText(/Stays in your hands/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /preview of Maya's Tuesday/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Talk 1")).toBeInTheDocument();
    expect(screen.getByText("Talk 5")).toBeInTheDocument();
    expect(screen.getByText("Quiet break")).toBeInTheDocument();
    expect(screen.getByText(/11:30 AM/)).toBeInTheDocument();
    expect(screen.getByText(/real time\. One second passes/i)).toBeInTheDocument();
    expect(screen.getByText(/one minute passes per second/i)).toBeInTheDocument();
    expect(screen.getByText(/five minutes per second/i)).toBeInTheDocument();
  });

  it("loads Maya's plan, starts the clock playing, and goes to Now", () => {
    window.sessionStorage.setItem(NOW_OPT_OUT_KEY, "1");
    render(<DemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "Play my day" }));
    expect(loadLocalState().plan.sessionIds).toEqual(MAYA_SESSION_IDS);
    expect(getSimClock()?.playing).toBe(true);
    expect(getSimClock()?.speed).toBe(60);
    expect(window.sessionStorage.getItem(NOW_OPT_OUT_KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith("/now");
  });
});
