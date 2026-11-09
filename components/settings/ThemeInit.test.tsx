import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ThemeInit from "./ThemeInit";

describe("ThemeInit", () => {
  it("renders a synchronous bootstrap for the saved theme", () => {
    const markup = renderToStaticMarkup(<ThemeInit />);

    expect(markup).toContain("<script>");
    expect(markup).toContain('localStorage.getItem("focustrack:theme")');
    expect(markup).toContain('choice==="light"||choice==="dark"');
    expect(markup).toContain("document.documentElement.dataset.theme=choice");
  });
});
