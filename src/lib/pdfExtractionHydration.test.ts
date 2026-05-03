import { describe, expect, test } from "bun:test";
import type { PageDoc, Paragraph } from "../types";
import {
  applyCachedPdfExtractionPages,
  type CachedPdfExtractionPage,
} from "./pdfExtractionHydration";

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

describe("pdfExtractionHydration", () => {
  test("hydrates cached extracted pages into the in-memory reader state", () => {
    const pages: PageDoc[] = [
      { page: 1, paragraphs: [], isExtracted: false },
      { page: 2, paragraphs: [], isExtracted: false },
    ];
    const cachedPages: CachedPdfExtractionPage[] = [
      {
        page: 2,
        paragraphs: [
          paragraph({
            pid: "doc-1:p2:first",
            page: 2,
            source: "Recovered paragraph.",
          }),
        ],
        watermarks: ["SAMPLE"],
      },
    ];

    const hydrated = applyCachedPdfExtractionPages(pages, cachedPages);

    expect(hydrated[0]).toEqual({ page: 1, paragraphs: [], isExtracted: false });
    expect(hydrated[1]).toMatchObject({
      page: 2,
      isExtracted: true,
      watermarks: ["SAMPLE"],
    });
    expect(hydrated[1]?.paragraphs).toEqual([
      paragraph({
        pid: "doc-1:p2:first",
        page: 2,
        source: "Recovered paragraph.",
      }),
    ]);
  });

  test("normalizes cached paragraphs that do not include runtime status fields", () => {
    const pages: PageDoc[] = [{ page: 1, paragraphs: [], isExtracted: false }];
    const cachedPages: CachedPdfExtractionPage[] = [
      {
        page: 1,
        paragraphs: [
          {
            pid: "doc-1:p1:first",
            page: 1,
            source: "Recovered paragraph.",
            rects: [],
          },
        ],
        watermarks: [],
      },
    ];

    const hydrated = applyCachedPdfExtractionPages(pages, cachedPages);

    expect(hydrated[0]?.paragraphs).toEqual([
      {
        pid: "doc-1:p1:first",
        page: 1,
        source: "Recovered paragraph.",
        rects: [],
        status: "idle",
      },
    ]);
  });

  test("preserves already extracted in-memory pages", () => {
    const pages: PageDoc[] = [
      {
        page: 1,
        paragraphs: [
          paragraph({
            pid: "doc-1:p1:fresh",
            source: "Freshly extracted page.",
          }),
        ],
        isExtracted: true,
      },
    ];
    const cachedPages: CachedPdfExtractionPage[] = [
      {
        page: 1,
        paragraphs: [
          paragraph({
            pid: "doc-1:p1:stale",
            source: "Stale cached page.",
          }),
        ],
        watermarks: ["OLD"],
      },
    ];

    const hydrated = applyCachedPdfExtractionPages(pages, cachedPages);

    expect(hydrated).toEqual(pages);
  });
});
