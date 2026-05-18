import { describe, expect, test } from "bun:test";
import { getDocumentProgressSnapshot } from "./readingProgress";

describe("reading progress", () => {
  test("uses the real PDF page count instead of transient extracted-page state", () => {
    const progress = getDocumentProgressSnapshot({
      currentFileType: "pdf",
      currentPage: 33,
      pdfPageCount: 268,
      pagesLength: 1,
      epubTotalPages: 1,
    });

    expect(progress).toEqual({
      totalPages: 268,
      percent: (33 / 268) * 100,
    });
  });

  test("clamps impossible progress to a valid range", () => {
    const progress = getDocumentProgressSnapshot({
      currentFileType: "epub",
      currentPage: 33,
      pdfPageCount: null,
      pagesLength: 33,
      epubTotalPages: 1,
    });

    expect(progress).toEqual({
      totalPages: 1,
      percent: 100,
    });
  });
});
