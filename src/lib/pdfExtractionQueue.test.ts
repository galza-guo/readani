import { describe, expect, test } from "bun:test";
import {
  buildPdfExtractionPlan,
  getPdfStartupHydrationPages,
} from "./pdfExtractionQueue";

describe("pdfExtractionQueue", () => {
  test("prioritizes the current page, then nearby pages, then the rest", () => {
    expect(
      buildPdfExtractionPlan({
        totalPages: 8,
        currentPage: 4,
        extractedPages: [],
        radius: 1,
      }),
    ).toEqual([4, 3, 5, 2, 6, 1, 7, 8]);
  });

  test("skips pages that are already extracted", () => {
    expect(
      buildPdfExtractionPlan({
        totalPages: 6,
        currentPage: 3,
        extractedPages: [2, 3, 5],
        radius: 1,
      }),
    ).toEqual([4, 1, 6]);
  });

  test("limits startup cache hydration to the current page neighborhood", () => {
    expect(
      getPdfStartupHydrationPages({
        totalPages: 12,
        currentPage: 7,
        radius: 1,
      }),
    ).toEqual([7, 6, 8]);
  });

  test("clamps startup cache hydration pages near the document edges", () => {
    expect(
      getPdfStartupHydrationPages({
        totalPages: 4,
        currentPage: 1,
        radius: 2,
      }),
    ).toEqual([1, 2, 3]);
  });
});
