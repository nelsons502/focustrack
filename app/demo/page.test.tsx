import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSimClock, stopSim } from "../../lib/client/clock";
import {
  createDefaultLocalState,
  loadLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import { SCHEDULE_CREDIT, SCHEDULE_SOURCE_URL } from "../../lib/contract";
import { MAYA_SESSION_IDS, NOW_OPT_OUT_KEY } from "../../lib/demo/maya";
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
    expect(screen.getByRole("link", { name: SCHEDULE_CREDIT })).toHaveAttribute(
      "href",
      SCHEDULE_SOURCE_URL,
    );
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
