import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";
import GlobalErrorPage from "./global-error";
import NotFoundPage from "./not-found";

describe("ErrorPage", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders a calm heading and plain-language explanation", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /something didn’t quite work/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/couldn’t load/i)).toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("links to Find, Plan and Now", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("href", "/now");
  });

  it("keeps a valid ?now= on recovery links", () => {
    window.history.replaceState(null, "", "/?now=2026-11-10T11:15-07:00");
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute(
      "href",
      "/?now=2026-11-10T11%3A15-07%3A00",
    );
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      "/plan?now=2026-11-10T11%3A15-07%3A00",
    );
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute(
      "href",
      "/now?now=2026-11-10T11%3A15-07%3A00",
    );
  });

  it("focuses the heading on mount", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /something didn’t quite work/i }),
    ).toHaveFocus();
  });

  it("prefers the framework retry callback over reset", () => {
    const reset = vi.fn();
    const retry = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("drops an invalid ?now= from recovery links", () => {
    window.history.replaceState(null, "", "/?now=garbage");
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Find" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("href", "/now");
  });
});

describe("NotFoundPage", () => {
  it("focuses the heading on mount", () => {
    render(<NotFoundPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /couldn’t find that page/i }),
    ).toHaveFocus();
  });
});

describe("GlobalErrorPage", () => {
  it("prefers the framework retry callback over reset", () => {
    const reset = vi.fn();
    const retry = vi.fn();
    render(<GlobalErrorPage error={new Error("boom")} reset={reset} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("focuses the heading on mount", () => {
    render(<GlobalErrorPage error={new Error("boom")} reset={vi.fn()} retry={vi.fn()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /something didn’t quite work/i }),
    ).toHaveFocus();
  });

  it("pins a light, high-contrast focus colour on its html element", () => {
    const { container } = render(
      <GlobalErrorPage error={new Error("boom")} reset={vi.fn()} retry={vi.fn()} />,
    );
    const html = container.querySelector("html") ?? document.documentElement;
    expect(html.style.getPropertyValue("--focus")).toBe("#0b5563");
    expect(html.style.colorScheme).toBe("light");
  });
});
