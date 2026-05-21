import { describe, expect, test } from "bun:test";
import appCss from "./App.css?raw";

describe("split resize handle", () => {
  test("shows vertical separators always with color shift on interaction", () => {
    const splitHandleRule = appCss.match(/\.split-resize-handle::before\s*\{([^}]*)\}/)?.[1] ?? "";
    const splitHandleHoverRule =
      appCss.match(/\.split-resize-handle:hover::before\s*\{([^}]*)\}/)?.[1] ?? "";
    const splitHandleDraggingRule =
      appCss.match(/\.split-resize-handle\[data-dragging="true"\]::before\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(splitHandleRule).toContain("opacity: 0.9");
    expect(splitHandleRule).toContain("background-color 0.14s ease 0s");
    expect(splitHandleHoverRule).toContain("background-color: var(--accent-strong)");
    expect(splitHandleHoverRule).toContain("transition-delay: 0.18s");
    expect(splitHandleDraggingRule).toContain("background-color: var(--accent-strong)");
    expect(splitHandleDraggingRule).toContain("transition-delay: 0s");
  });

  test("keeps reader workspace split handles visible in narrow windows", () => {
    const narrowRule = appCss.match(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.pdf-nav-resize-handle\s*\{/)
      ?.[0] ?? "";

    expect(narrowRule).toContain(".app-main:not(.app-main--workspace) .split-resize-handle");
    expect(narrowRule).not.toContain("\n  .split-resize-handle {\n    display: none;");
  });
});
