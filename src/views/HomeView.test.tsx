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

  test("styles the landing hero around the enlarged wordmark and footer fine print", () => {
    const contentRule = appCss.match(/\.home-content\s*\{([^}]*)\}/)?.[1] ?? "";
    const logoRule = appCss.match(/\.home-logo-img\s*\{([^}]*)\}/)?.[1] ?? "";
    const subtitleRule = appCss.match(/\.home-subtitle\s*\{([^}]*)\}/)?.[1] ?? "";
    const disclaimerRule = appCss.match(/\.home-disclaimer\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(contentRule).toContain("display: flex");
    expect(contentRule).toContain("flex-direction: column");
    expect(contentRule).toContain("min-height: 100%");

    expect(logoRule).toContain("width: min(100%, 280px)");
    expect(logoRule).toContain("height: auto");

    expect(subtitleRule).toContain("font-size: 18px");
    expect(subtitleRule).toContain("font-weight: 500");

    expect(disclaimerRule).toContain("margin-top: auto");
    expect(disclaimerRule).toContain("font-style: italic");
    expect(disclaimerRule).toContain("color: var(--ink-subtle)");
    expect(disclaimerRule).not.toContain("background:");
    expect(disclaimerRule).not.toContain("border:");
  });
});
