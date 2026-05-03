import { describe, expect, test } from "bun:test";
import { buildPdfExtractionPlan } from "./pdfExtractionQueue";

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
});
