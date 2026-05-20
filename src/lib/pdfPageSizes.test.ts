import { describe, expect, test } from "bun:test";
import {
  createProgressivePdfPageSizes,
  mergeProgressivePdfPageSize,
} from "./pdfPageSizes";

describe("progressive PDF page sizes", () => {
  test("creates a full-length page size list with only the opening page known", () => {
    const sizes = createProgressivePdfPageSizes({
      totalPages: 5,
      pageNumber: 3,
      size: { width: 320, height: 480 },
    });

    expect(sizes).toEqual([
      null,
      null,
      { width: 320, height: 480 },
      null,
      null,
    ]);
  });

  test("merges a later page size without clearing existing sizes", () => {
    const sizes = createProgressivePdfPageSizes({
      totalPages: 3,
      pageNumber: 2,
      size: { width: 320, height: 480 },
    });

    expect(
      mergeProgressivePdfPageSize(sizes, 1, { width: 300, height: 450 }),
    ).toEqual([
      { width: 300, height: 450 },
      { width: 320, height: 480 },
      null,
    ]);
  });
});
