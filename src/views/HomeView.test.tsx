import { describe, expect, test } from "bun:test";
import appCss from "../App.css?raw";

describe("HomeView layout", () => {
  test("uses root-height layout primitives to avoid phantom window scrollbars", () => {
    const rootRule = appCss.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? "";
    const homeRule = appCss.match(/\.home\s*\{([^}]*)\}/)?.[1] ?? "";
    const mainRule = appCss.match(/\.home-main\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellRule = appCss.match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootRule).toContain("height: 100%");
    expect(rootRule).toContain("overflow: hidden");

    expect(homeRule).toContain("height: 100%");
    expect(homeRule).toContain("min-height: 0");
    expect(homeRule).not.toContain("height: 100vh");

    expect(mainRule).toContain("min-height: 0");
    expect(shellRule).toContain("height: 100%");
    expect(shellRule).not.toContain("height: 100vh");
  });
});
