import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppNav from "./AppNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/plan" }));

const NOW = "2026-11-10T11:00-07:00";

beforeEach(() => {
  window.history.pushState({}, "", "/plan");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("AppNav", () => {
  it("toggles aria-expanded from the Menu button and wires aria-controls", () => {
    render(<AppNav />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    const panelId = menu.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(panelId)).toContainElement(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("makes page content inert while open", () => {
    render(
      <>
        <AppNav />
        <div className="app-content">Page</div>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.querySelector(".app-content")).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.querySelector(".app-content")).not.toHaveAttribute("inert");
  });

  it("closes on Escape and returns focus to the Menu button", () => {
    render(<AppNav />);
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with Close and when a link is chosen, and locks body scroll while open", () => {
    render(<AppNav />);
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("link", { name: "Reflect" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("traps Tab inside the open menu", () => {
    render(<AppNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const settings = screen.getByRole("link", { name: /Settings/ });
    settings.focus();
    fireEvent.keyDown(settings, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Tab", shiftKey: true });
    expect(settings).toHaveFocus();
  });

  it("marks the current link and keeps ?now= on every link", () => {
    window.history.pushState({}, "", `/plan?now=${NOW}`);
    render(<AppNav />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Find" })).not.toHaveAttribute("aria-current");
    const encoded = encodeURIComponent(NOW);
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("href", `/now?now=${encoded}`);
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", `/settings?now=${encoded}`);
  });
});
