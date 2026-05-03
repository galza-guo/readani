import { describe, expect, test } from "bun:test";
import type { CachedPdfExtractionPage } from "./pdfExtractionHydration";
import { mergePdfExtractionCachePages } from "./pdfExtractionCacheQueue";

function extractedPage(page: number, label: string): CachedPdfExtractionPage {
  return {
    page,
    paragraphs: [
      {
        pid: `doc:p${page}:${label}`,
        page,
        source: label,
        rects: [],
      },
    ],
    watermarks: [],
  };
}

describe("pdfExtractionCacheQueue", () => {
  test("keeps one entry per page and lets newer extraction data replace older data", () => {
    expect(
      mergePdfExtractionCachePages(
        [extractedPage(1, "old-1"), extractedPage(2, "old-2")],
        [extractedPage(2, "new-2"), extractedPage(3, "new-3")],
      ),
    ).toEqual([
      extractedPage(1, "old-1"),
      extractedPage(2, "new-2"),
      extractedPage(3, "new-3"),
    ]);
  });

  test("returns pages in ascending page order for stable batch writes", () => {
    expect(
      mergePdfExtractionCachePages([], [
        extractedPage(5, "five"),
        extractedPage(1, "one"),
        extractedPage(3, "three"),
      ]),
    ).toEqual([
      extractedPage(1, "one"),
      extractedPage(3, "three"),
      extractedPage(5, "five"),
    ]);
  });
});
