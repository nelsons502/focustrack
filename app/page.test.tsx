import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ results: [], mode: "lexical-fallback", tookMs: 1 }),
      } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("links to the Now screen", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: /Open the Now screen/ })).toHaveAttribute("href", "/now");
  });

  it("credits the schedule source with a link to Sessionize", () => {
    render(<HomePage />);
    const credit = screen.getByRole("link", {
      name: "Schedule data: CNCF / Sessionize",
    });
    expect(credit).toHaveAttribute(
      "href",
      "https://sessionize.com/api/v2/uo948i5p/view/markdown",
    );
  });

  it("names the app in the page heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "FocusTrack" }),
    ).toBeInTheDocument();
  });

  it("links to Plan and marks Find as the current page", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute(
      "href",
      "/now",
    );
  });

  it("puts the Find search near the top of the page", () => {
    render(<HomePage />);
    expect(screen.getByLabelText(/Search sessions/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});
