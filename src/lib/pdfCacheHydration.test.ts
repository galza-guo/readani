import { describe, expect, test } from "bun:test";
import type { PageDoc, Paragraph } from "../types";
import {
  applyCachedPdfPageTranslations,
  type CachedPdfPageTranslation,
} from "./pdfCacheHydration";
import { getPageTranslationProgress } from "./pageTranslationScheduler";

function paragraph(overrides: Partial<Paragraph> = {}): Paragraph {
  return {
    pid: "doc-1:p1:alpha",
    page: 1,
    source: "A readable paragraph of source text.",
    status: "idle",
    rects: [{ page: 1, x: 10, y: 20, w: 100, h: 24 }],
    ...overrides,
  };
}

describe("pdfCacheHydration", () => {
  test("rehydrates fully cached PDF pages back into translated reader state", () => {
    const pages: PageDoc[] = [
      {
        page: 1,
        isExtracted: true,
        paragraphs: [
          paragraph({
            pid: "doc-1:p1:first",
            source: "Readable first paragraph.",
          }),
          paragraph({
            pid: "doc-1:p1:second",
            source: "Readable second paragraph.",
          }),
        ],
      },
      {
        page: 2,
        isExtracted: true,
        paragraphs: [
          paragraph({
            pid: "doc-1:p2:first",
            page: 2,
            source: "Readable third paragraph.",
          }),
        ],
      },
    ];
    const cachedPages: CachedPdfPageTranslation[] = [
      {
        page: 1,
        translations: [
          {
            sid: "doc-1:p1:first",
            translation: "Translated first paragraph.",
          },
          {
            sid: "doc-1:p1:second",
            translation: "Translated second paragraph.",
          },
        ],
      },
    ];

    const hydrated = applyCachedPdfPageTranslations(pages, cachedPages);

    expect(hydrated.pages[0]?.paragraphs.map((item) => item.status)).toEqual([
      "done",
      "done",
    ]);
    expect(
      hydrated.pages[0]?.paragraphs.map((item) => item.translation),
    ).toEqual([
      "Translated first paragraph.",
      "Translated second paragraph.",
    ]);
    expect(hydrated.pageTranslations[1]).toMatchObject({
      page: 1,
      status: "done",
      isCached: true,
      translatedText:
        "Translated first paragraph.\n\nTranslated second paragraph.",
    });
    expect(getPageTranslationProgress({ pages: hydrated.pages })).toEqual({
      translatedCount: 1,
      totalCount: 2,
      isFullyTranslated: false,
      unitLabel: "pages",
    });
  });

  test("ignores cached payloads for pages that are not fully present", () => {
    const pages: PageDoc[] = [
      {
        page: 3,
        isExtracted: true,
        paragraphs: [
          paragraph({
            pid: "doc-1:p3:first",
            page: 3,
            source: "Readable paragraph one.",
          }),
          paragraph({
            pid: "doc-1:p3:second",
            page: 3,
            source: "Readable paragraph two.",
          }),
        ],
      },
    ];
    const cachedPages: CachedPdfPageTranslation[] = [
      {
        page: 3,
        translations: [
          {
            sid: "doc-1:p3:first",
            translation: "Only one paragraph was cached.",
          },
        ],
      },
    ];

    const hydrated = applyCachedPdfPageTranslations(pages, cachedPages);

    expect(hydrated.pages[0]?.paragraphs.map((item) => item.status)).toEqual([
      "idle",
      "idle",
    ]);
    expect(hydrated.pageTranslations).toEqual({});
    expect(getPageTranslationProgress({ pages: hydrated.pages })).toEqual({
      translatedCount: 0,
      totalCount: 1,
      isFullyTranslated: false,
      unitLabel: "pages",
    });
  });
});
