import { describe, expect, test } from "bun:test";
import { formatPageCountLabel, formatTotalPagesSuffix } from "./pageCountLabel";

describe("formatPageCountLabel", () => {
  test("renders the compact current and total format", () => {
    expect(formatPageCountLabel(33, 268)).toBe("33 / 268");
  });

  test("uses a fallback when the total is unavailable", () => {
    expect(formatPageCountLabel(4, null)).toBe("4 / -");
  });

  test("formats the total-pages suffix for compact toolbar labels", () => {
    expect(formatTotalPagesSuffix(268)).toBe("268");
    expect(formatTotalPagesSuffix(undefined)).toBe("-");
  });
});
