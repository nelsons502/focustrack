import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultLocalState,
  updateLocalState,
} from "../../lib/client/local-state";
import { SCHEDULE_CREDIT, SCHEDULE_SOURCE_URL } from "../../lib/contract";
import PlanPage from "./page";

beforeEach(() => {
  window.localStorage.clear();
  updateLocalState(createDefaultLocalState());
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanPage", () => {
  it("names the plan and credits the schedule source", () => {
    render(<PlanPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Your plan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: SCHEDULE_CREDIT }),
    ).toHaveAttribute(
      "href",
      SCHEDULE_SOURCE_URL,
    );
  });

  it("marks Plan as the current page in Find and Plan navigation", () => {
    render(<PlanPage />);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute(
      "href",
      "/",
    );
    const plan = screen.getByRole("link", { name: "Plan" });
    expect(plan).toHaveAttribute("href", "/plan");
    expect(plan).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute(
      "href",
      "/now",
    );
  });
});
