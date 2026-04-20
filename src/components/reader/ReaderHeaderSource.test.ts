import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readAppSource() {
  return readFileSync(resolve(import.meta.dir, "..", "..", "App.tsx"), "utf8");
}

describe("reader header buttons", () => {
  test("uses expanding icon labels with direction-aware reveal", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("ExpandableIconButton");
    expect(appSource).toContain('label="Home"');
    expect(appSource).toContain('labelDirection="right"');
    expect(appSource).toContain("showHoverLabel={true}");
    expect(appSource).toContain('hoverLabel="Theme"');
    expect(appSource).toContain('label="Settings"');
    expect(appSource).toContain('labelDirection="left"');
    expect(appSource).toContain('aria-label="Home"');
    expect(appSource).toContain('aria-label="Settings"');
    expect(appSource).toContain('d="M3 10.5 12 3l9 7.5"');
    expect(appSource).toContain('d="M5 9.5V21h14V9.5"');
    expect(appSource).not.toContain('d="M19 12H5M12 19l-7-7 7-7"');
  });
});
