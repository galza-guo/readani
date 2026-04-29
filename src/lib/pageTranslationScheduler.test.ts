import { describe, expect, test } from "bun:test";
import type { PageDoc } from "../types";
import {
  dequeueNextPage,
  enqueueBackgroundPages,
  enqueueForegroundPage,
  getEpubSectionTranslationProgress,
  getFullBookActionLabel,
  getPageTranslationProgress,
  shouldContinueQueuedPageTranslations,
  isRequestVersionCurrent,
  bumpRequestVersion,
} from "./pageTranslationScheduler";

describe("pageTranslationScheduler queues", () => {
  test("promotes the current page ahead of background work without duplicating it", () => {
    const backgroundQueue = enqueueBackgroundPages([], [2, 3, 4]);
    const foregroundQueue = enqueueForegroundPage([], 3);
    const next = dequeueNextPage({
      foregroundQueue,
      backgroundQueue,
      inFlightPages: [],
    });

    expect(next).toEqual({
      page: 3,
      foregroundQueue: [],
      backgroundQueue: [2, 4],
    });
  });

  test("skips pages that are already in flight until they are available again", () => {
    const next = dequeueNextPage({
      foregroundQueue: [5],
      backgroundQueue: [6, 7],
      inFlightPages: [5, 6],
    });

    expect(next).toEqual({
      page: 7,
      foregroundQueue: [5],
      backgroundQueue: [6],
    });
  });

  test("stops the translate-all queue after the first page error", () => {
    expect(
      shouldContinueQueuedPageTranslations({
        didError: true,
        isTranslateAllRunning: true,
        foregroundQueue: [8],
        backgroundQueue: [9, 10],
      })
    ).toBe(false);
  });

  test("keeps regular queued work moving when the failure was outside translate-all", () => {
    expect(
      shouldContinueQueuedPageTranslations({
        didError: true,
        isTranslateAllRunning: false,
        foregroundQueue: [8],
        backgroundQueue: [],
      })
    ).toBe(true);
  });
});

describe("pageTranslationScheduler progress", () => {
  test("counts only pages whose translatable paragraphs are all done", () => {
    const pages: PageDoc[] = [
      {
        page: 1,
        paragraphs: [{ pid: "a", page: 1, source: "A readable first page.", translation: "Translated.", status: "done", rects: [] }],
      },
      {
        page: 2,
        paragraphs: [{ pid: "b", page: 2, source: "Symbols --- ...", status: "idle", rects: [] }],
      },
      {
        page: 3,
        paragraphs: [{ pid: "c", page: 3, source: "Another readable page.", status: "idle", rects: [] }],
      },
    ];

    expect(
      getPageTranslationProgress({
        pages,
      })
    ).toEqual({
      translatedCount: 1,
      totalCount: 2,
      isFullyTranslated: false,
      unitLabel: "pages",
    });
  });

  test("reports fully translated when all translatable pages have done paragraphs", () => {
    const pages: PageDoc[] = [
      {
        page: 1,
        paragraphs: [{ pid: "a", page: 1, source: "A readable first page.", translation: "Translated.", status: "done", rects: [] }],
      },
      {
        page: 2,
        paragraphs: [{ pid: "b", page: 2, source: "Symbols --- ...", status: "idle", rects: [] }],
      },
      {
        page: 3,
        paragraphs: [{ pid: "c", page: 3, source: "Another readable page.", translation: "Also translated.", status: "done", rects: [] }],
      },
    ];

    expect(
      getPageTranslationProgress({
        pages,
      })
    ).toEqual({
      translatedCount: 2,
      totalCount: 2,
      isFullyTranslated: true,
      unitLabel: "pages",
    });
  });

  test("uses Retranslate All only when every translatable page is already translated", () => {
    expect(
      getFullBookActionLabel({
        translatedCount: 1,
        totalCount: 3,
        isFullyTranslated: false,
        unitLabel: "pages",
      })
    ).toBe(
      "Translate All"
    );
    expect(
      getFullBookActionLabel({
        translatedCount: 3,
        totalCount: 3,
        isFullyTranslated: true,
        unitLabel: "pages",
      })
    ).toBe(
      "Retranslate All"
    );
  });

  test("counts EPUB section progress by unique href instead of virtual page", () => {
    const pages: PageDoc[] = [
      {
        page: 1,
        title: "Chapter 1",
        paragraphs: [
          {
            pid: "a",
            page: 1,
            source: "A readable opening paragraph.",
            translation: "Translated opening paragraph.",
            status: "done",
            rects: [],
            epubHref: "chap1.xhtml",
            sectionTitle: "Chapter 1",
          },
        ],
      },
      {
        page: 2,
        title: "Chapter 1",
        paragraphs: [
          {
            pid: "b",
            page: 2,
            source: "Another readable paragraph in the same chapter.",
            translation: "Translated follow-up paragraph.",
            status: "done",
            rects: [],
            epubHref: "chap1.xhtml#part-2",
            sectionTitle: "Chapter 1",
          },
        ],
      },
      {
        page: 3,
        title: "Chapter 2",
        paragraphs: [
          {
            pid: "c",
            page: 3,
            source: "A readable second chapter paragraph.",
            status: "idle",
            rects: [],
            epubHref: "chap2.xhtml",
            sectionTitle: "Chapter 2",
          },
        ],
      },
    ];

    expect(getEpubSectionTranslationProgress(pages)).toEqual({
      translatedCount: 1,
      totalCount: 2,
      isFullyTranslated: false,
      unitLabel: "sections",
    });
  });
});

describe("pageTranslationScheduler request versions", () => {
  test("invalidates stale page results after a newer redo request", () => {
    const first = bumpRequestVersion({}, 12);
    const second = bumpRequestVersion(first.versions, 12);

    expect(isRequestVersionCurrent(second.versions, 12, first.version)).toBe(false);
    expect(isRequestVersionCurrent(second.versions, 12, second.version)).toBe(true);
  });
});
