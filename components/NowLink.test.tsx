import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NowLink from "./NowLink";

describe("NowLink", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("keeps a valid demo clock", () => {
    window.history.replaceState(null, "", "/?now=2026-11-10T11:15-07:00");
    render(<NowLink />);
    expect(screen.getByRole("link", { name: /now screen/i }).getAttribute("href")).toBe(
      "/now?now=2026-11-10T11%3A15-07%3A00",
    );
  });

  it("drops an invalid demo clock", () => {
    window.history.replaceState(null, "", "/?now=garbage");
    render(<NowLink />);
    expect(screen.getByRole("link", { name: /now screen/i }).getAttribute("href")).toBe("/now");
  });
});
