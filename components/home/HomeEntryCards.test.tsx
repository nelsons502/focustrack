import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomeEntryCards from "./HomeEntryCards";

describe("HomeEntryCards", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("shows three gentle entry cards", () => {
    render(<HomeEntryCards />);
    expect(screen.getByRole("link", { name: "Plan your day" })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(
      screen.getByRole("link", { name: /Open the Now screen/ }),
    ).toHaveAttribute("href", "/now");
    expect(screen.getByRole("link", { name: "Play my day demo" })).toHaveAttribute(
      "href",
      "/demo",
    );
  });

  it("keeps a valid ?now= on Plan and demo links", () => {
    window.history.replaceState(null, "", "/?now=2026-11-10T11:15-07:00");
    render(<HomeEntryCards />);
    const encoded = "2026-11-10T11%3A15-07%3A00";
    expect(screen.getByRole("link", { name: "Plan your day" })).toHaveAttribute(
      "href",
      `/plan?now=${encoded}`,
    );
    expect(screen.getByRole("link", { name: "Play my day demo" })).toHaveAttribute(
      "href",
      `/demo?now=${encoded}`,
    );
    expect(
      screen.getByRole("link", { name: /Open the Now screen/ }),
    ).toHaveAttribute("href", `/now?now=${encoded}`);
  });

  it("drops an invalid ?now=", () => {
    window.history.replaceState(null, "", "/?now=garbage");
    render(<HomeEntryCards />);
    expect(screen.getByRole("link", { name: "Plan your day" })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.getByRole("link", { name: "Play my day demo" })).toHaveAttribute(
      "href",
      "/demo",
    );
  });

  it("puts the calendar export in the Plan card", () => {
    render(<HomeEntryCards />);
    const planLink = screen.getByRole("link", { name: "Plan your day" });
    const card = planLink.closest("article");
    expect(card).not.toBeNull();
    expect(
      card?.querySelector("button")?.textContent,
    ).toMatch(/Add my plan to my calendar/);
  });
});

it("updates entry links when browser history changes the demo clock", () => {
  window.history.replaceState(null, "", "/?now=2026-11-10T11:15-07:00");
  render(<HomeEntryCards />);
  window.history.pushState(null, "", "/?now=2026-11-10T12:30-07:00");
  fireEvent.popState(window);
  expect(screen.getByRole("link", { name: "Plan your day" })).toHaveAttribute(
    "href", "/plan?now=2026-11-10T12%3A30-07%3A00",
  );
  expect(screen.getByRole("link", { name: "Play my day demo" })).toHaveAttribute(
    "href", "/demo?now=2026-11-10T12%3A30-07%3A00",
  );
  expect(screen.getByRole("link", { name: /Open the Now screen/ })).toHaveAttribute(
    "href", "/now?now=2026-11-10T12%3A30-07%3A00",
  );
});
