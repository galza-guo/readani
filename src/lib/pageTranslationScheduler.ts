import type { PageDoc, PageTranslationState } from "../types";
import { hasUsablePageText } from "./pageText";
import { t } from "./i18n";
import {
  getTranslatablePdfParagraphs,
  isPdfPageFullyTranslated,
} from "./pdfSegments";

export type PageProgressStatus =
  | "translated"
  | "queued"
  | "untranslated"
  | "not-translatable";

type PageTranslationProgressArgs = {
  pages: PageDoc[];
};

type PageTranslationProgress = {
  translatedCount: number;
  totalCount: number;
  isFullyTranslated: boolean;
  unitLabel: string;
};

type PageProgressQueueState = {
  foregroundQueue?: Iterable<number>;
  inFlightPage?: number | null;
};

type DequeueNextPageArgs = {
  foregroundQueue: number[];
  backgroundQueue: number[];
  inFlightPages: Iterable<number>;
};

type DequeueNextPageResult = {
  page: number | null;
  foregroundQueue: number[];
  backgroundQueue: number[];
};

type ShouldContinueQueuedPageTranslationsArgs = {
  didError: boolean;
  isTranslateAllRunning: boolean;
  foregroundQueue: number[];
  backgroundQueue: number[];
};

type RequestVersionResult = {
  versions: Record<number, number>;
  version: number;
};

function getPageSourceText(page?: PageDoc) {
  return (page?.paragraphs ?? [])
    .map((paragraph) => paragraph.source.trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSectionHref(href?: string) {
  return href ? href.split("#")[0] : "";
}

export function enqueueForegroundPage(queue: number[], page: number) {
  return [page, ...queue.filter((queuedPage) => queuedPage !== page)];
}

export function enqueueBackgroundPages(queue: number[], pages: number[]) {
  const nextQueue = [...queue];

  for (const page of pages) {
    if (!nextQueue.includes(page)) {
      nextQueue.push(page);
    }
  }

  return nextQueue;
}

export function dequeueNextPage({
  foregroundQueue,
  backgroundQueue,
  inFlightPages,
}: DequeueNextPageArgs): DequeueNextPageResult {
  const blockedPages = new Set(inFlightPages);

  for (let index = 0; index < foregroundQueue.length; index += 1) {
    const page = foregroundQueue[index];
    if (blockedPages.has(page)) {
      continue;
    }

    return {
      page,
      foregroundQueue: foregroundQueue.filter((queuedPage) => queuedPage !== page),
      backgroundQueue: backgroundQueue.filter((queuedPage) => queuedPage !== page),
    };
  }

  for (let index = 0; index < backgroundQueue.length; index += 1) {
    const page = backgroundQueue[index];
    if (blockedPages.has(page)) {
      continue;
    }

    return {
      page,
      foregroundQueue,
      backgroundQueue: backgroundQueue.filter((queuedPage) => queuedPage !== page),
    };
  }

  return {
    page: null,
    foregroundQueue,
    backgroundQueue,
  };
}

export function shouldContinueQueuedPageTranslations({
  didError,
  isTranslateAllRunning,
  foregroundQueue,
  backgroundQueue,
}: ShouldContinueQueuedPageTranslationsArgs) {
  if (didError && isTranslateAllRunning) {
    return false;
  }

  return foregroundQueue.length > 0 || backgroundQueue.length > 0;
}

export function getPageTranslationProgress({
  pages,
}: PageTranslationProgressArgs): PageTranslationProgress {
  const translatablePages = pages.filter((page) => hasUsablePageText(getPageSourceText(page)));
  const translatedPages = translatablePages.filter((page) => isPdfPageFullyTranslated(page));

  return {
    translatedCount: translatedPages.length,
    totalCount: translatablePages.length,
    isFullyTranslated:
      translatablePages.length > 0 && translatedPages.length === translatablePages.length,
    unitLabel: t("translation.pages"),
  };
}

export function getEpubSectionTranslationProgress(pages: PageDoc[]): PageTranslationProgress {
  const sections = new Map<
    string,
    {
      hasTranslatableParagraph: boolean;
      isTranslated: boolean;
    }
  >();

  for (const page of pages) {
    for (const paragraph of page.paragraphs) {
      const normalizedHref = normalizeSectionHref(paragraph.epubHref);
      const sectionKey = normalizedHref || paragraph.sectionTitle || `page:${page.page}`;
      const hasUsableText = hasUsablePageText(paragraph.source);
      const existing = sections.get(sectionKey) ?? {
        hasTranslatableParagraph: false,
        isTranslated: true,
      };

      if (hasUsableText) {
        existing.hasTranslatableParagraph = true;
        if (paragraph.status !== "done") {
          existing.isTranslated = false;
        }
      }

      sections.set(sectionKey, existing);
    }
  }

  const translatableSections = Array.from(sections.values()).filter(
    (section) => section.hasTranslatableParagraph
  );
  const translatedSections = translatableSections.filter((section) => section.isTranslated);

  return {
    translatedCount: translatedSections.length,
    totalCount: translatableSections.length,
    isFullyTranslated:
      translatableSections.length > 0 && translatedSections.length === translatableSections.length,
    unitLabel: t("translation.sections"),
  };
}

export function getFullBookActionLabel(progress: PageTranslationProgress) {
  return progress.isFullyTranslated ? t("translation.retranslateAll") : t("translation.translateAll");
}

export function bumpRequestVersion(
  versions: Record<number, number>,
  page: number
): RequestVersionResult {
  const version = (versions[page] ?? 0) + 1;
  return {
    versions: {
      ...versions,
      [page]: version,
    },
    version,
  };
}

export function isRequestVersionCurrent(
  versions: Record<number, number>,
  page: number,
  version: number
) {
  return (versions[page] ?? 0) === version;
}

export function getPageProgressMap(
  pages: PageDoc[],
  pageTranslations?: Record<number, PageTranslationState>,
  queueState?: PageProgressQueueState,
): PageProgressStatus[] {
  const queuedPages = new Set(queueState?.foregroundQueue ?? []);

  return pages.map((page) => {
    const translatableParagraphs = getTranslatablePdfParagraphs(page);

    if (translatableParagraphs.length === 0) {
      return "not-translatable";
    }

    if (isPdfPageFullyTranslated(page)) {
      return "translated";
    }

    if (
      page.page === queueState?.inFlightPage ||
      queuedPages.has(page.page)
    ) {
      return "queued";
    }

    const translationState = pageTranslations?.[page.page];
    if (translationState?.status === "loading") {
      return "queued";
    }

    if (!queueState && translationState?.status === "queued") {
      return "queued";
    }

    return "untranslated";
  });
}
