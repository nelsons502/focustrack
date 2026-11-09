import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import PrimaryNav from "../plan/PrimaryNav";
import SettingsLink from "../SettingsLink";
import ThemeInit from "./ThemeInit";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  window.history.pushState({}, "", "/");
});

describe("PrimaryNav without current prop", () => {
  it("derives the current page from the pathname", () => {
    window.history.pushState({}, "", "/plan");
    render(<PrimaryNav />);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Find" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing current on Settings and keeps a valid ?now=", () => {
    const now = "2026-11-10T11:00-07:00";
    window.history.pushState({}, "", `/settings?now=${encodeURIComponent(now)}`);
    render(<PrimaryNav />);
    expect(screen.getByRole("navigation", { name: "Primary" }).querySelector("[aria-current]")).toBeNull();
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("href", `/now?now=${encodeURIComponent(now)}`);
  });

  it("explicit current still wins over the pathname", () => {
    window.history.pushState({}, "", "/plan");
    render(<PrimaryNav current="now" />);
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("aria-current", "page");
  });
});

describe("SettingsLink", () => {
  it("links to Settings preserving a valid ?now=", () => {
    const now = "2026-11-10T11:00-07:00";
    window.history.pushState({}, "", `/plan?now=${encodeURIComponent(now)}`);
    render(<SettingsLink />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", `/settings?now=${encodeURIComponent(now)}`);
  });
});

describe("ThemeInit", () => {
  it("renders a pre-paint bootstrap script", () => {
    const { container } = render(<ThemeInit />);
    const script = container.querySelector("script");

    expect(script).not.toBeNull();
    expect(script?.textContent).toContain('localStorage.getItem("focustrack:theme")');
    expect(script?.textContent).toContain("document.documentElement.dataset.theme=choice");
  });
});
