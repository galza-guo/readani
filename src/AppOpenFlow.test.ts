import { describe, expect, test } from "bun:test";

describe("PDF open flow", () => {
  test("yields to browser paint before starting the heavy PDF file read", async () => {
    const source = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
    const loadPdfIndex = source.indexOf("const loadPdfFromPath = useCallback");
    const yieldIndex = source.indexOf(
      "await yieldToBrowserPaint();",
      loadPdfIndex,
    );
    const readIndex = source.indexOf(
      "const bytes = await readDocumentBytes(filePath);",
      loadPdfIndex,
    );

    expect(loadPdfIndex).toBeGreaterThan(-1);
    expect(yieldIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(-1);
    expect(yieldIndex).toBeLessThan(readIndex);
  });
});
