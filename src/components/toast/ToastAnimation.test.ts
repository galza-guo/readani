import { describe, expect, test } from "bun:test";
import appCss from "../../App.css?raw";

describe("toast animations", () => {
  test("includes subtle enter and exit motion with reduced-motion fallback", () => {
    const toastBlockStart = appCss.indexOf(".toast {");
    const toastBlockEnd = appCss.indexOf(".toast--exiting {");
    const exitingBlockEnd = appCss.indexOf(".toast__icon {");
    const toastRule =
      toastBlockStart >= 0 && toastBlockEnd > toastBlockStart
        ? appCss.slice(toastBlockStart, toastBlockEnd)
        : "";
    const exitingRule =
      toastBlockEnd >= 0 && exitingBlockEnd > toastBlockEnd
        ? appCss.slice(toastBlockEnd, exitingBlockEnd)
        : "";

    expect(appCss).toContain("@keyframes toast-enter");
    expect(appCss).toContain("@keyframes toast-exit");
    expect(toastRule).toContain("transform-origin: bottom right");
    expect(toastRule).toContain("animation: toast-enter 200ms");
    expect(exitingRule).toContain("animation: toast-exit 180ms");
    expect(appCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(appCss).toContain("animation: none");
  });
});
