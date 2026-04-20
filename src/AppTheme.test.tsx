import { describe, expect, test } from "bun:test";
import appCss from "./App.css?raw";

describe("app theme tokens", () => {
  test("routes the app backdrop through a dedicated theme token", () => {
    const rootRule = appCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const darkThemeRule = appCss.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    const bodyRule = appCss.match(/body\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellRule = appCss.match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const homeRule = appCss.match(/\.home\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootRule).toContain("--app-backdrop: #f5f5f5");
    expect(darkThemeRule).toContain("--app-backdrop: #141416");
    expect(bodyRule).toContain("background: var(--app-backdrop)");
    expect(shellRule).toContain("background: var(--app-backdrop)");
    expect(homeRule).toContain("background: var(--app-backdrop)");
  });
});
