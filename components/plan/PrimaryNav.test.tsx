import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ReflectPage from "../../app/reflect/page";
import { NOW_OPT_OUT_KEY } from "../now/now-helpers";
import PrimaryNav from "./PrimaryNav";

const NOW = "2026-11-10T11:00-07:00";

beforeEach(() => {
  localStorage.clear();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("PrimaryNav", () => {
  it("links Find, Plan, Now and Reflect and marks the current page", () => {
    render(<PrimaryNav current="now" />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Find" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Reflect" })).toHaveAttribute("href", "/reflect");
  });

  it("keeps a valid ?now= in every link", () => {
    window.history.pushState({}, "", `/reflect?now=${NOW}`);
    render(<PrimaryNav current="reflect" />);
    const encoded = encodeURIComponent(NOW);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute("href", `/?now=${encoded}`);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("href", `/plan?now=${encoded}`);
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("href", `/now?now=${encoded}`);
    expect(screen.getByRole("link", { name: "Reflect" })).toHaveAttribute("href", `/reflect?now=${encoded}`);
  });

  it("drops an invalid ?now=", () => {
    window.history.pushState({}, "", "/plan?now=garbage");
    render(<PrimaryNav current="plan" />);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute("href", "/");
  });

  it("prefers the nowParam prop over the address bar", () => {
    render(<PrimaryNav current="now" nowParam={NOW} />);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      `/plan?now=${encodeURIComponent(NOW)}`,
    );
  });

  it("opts out of Now takeover when Find is clicked", () => {
    render(<PrimaryNav current="now" />);
    const findLink = screen.getByRole("link", { name: "Find" });
    findLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(findLink);
    expect(window.sessionStorage.getItem(NOW_OPT_OUT_KEY)).toBe("1");
  });
});

describe("ReflectPage", () => {
  it("renders the primary nav with Reflect as the current page", () => {
    window.history.pushState({}, "", `/reflect?now=${NOW}`);
    render(<ReflectPage />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reflect" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      `/plan?now=${encodeURIComponent(NOW)}`,
    );
  });
});
