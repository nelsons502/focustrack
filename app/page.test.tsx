import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
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
});
