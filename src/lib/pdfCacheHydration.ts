import type { PageDoc, PageTranslationState } from "../types";
import { buildPageTranslationPayload } from "./pageText";
import {
  buildPdfPageTranslatedText,
  getTranslatablePdfParagraphs,
  isPdfPageFullyTranslated,
} from "./pdfSegments";

export type CachedPdfPageTranslation = {
  page: number;
  translations: Array<{
    sid: string;
    translation: string;
  }>;
};

type HydratedPdfCacheState = {
  pages: PageDoc[];
  pageTranslations: Record<number, PageTranslationState>;
};

function isPageHydrationBusy(translation?: PageTranslationState) {
  return translation?.status === "queued" || translation?.status === "loading";
}

export function applyCachedPdfPageTranslations(
  pages: PageDoc[],
  cachedPages: CachedPdfPageTranslation[],
  existingTranslations: Record<number, PageTranslationState> = {},
): HydratedPdfCacheState {
  const cachedByPage = new Map(
    cachedPages.map((cachedPage) => [cachedPage.page, cachedPage]),
  );

  const nextPages = pages.map((page) => {
    const cachedPage = cachedByPage.get(page.page);
    const existing = existingTranslations[page.page];
    if (!cachedPage || isPageHydrationBusy(existing) || isPdfPageFullyTranslated(page)) {
      return page;
    }

    const translatableParagraphs = getTranslatablePdfParagraphs(page);
    if (translatableParagraphs.length === 0) {
      return page;
    }

    const translationsBySid = new Map(
      cachedPage.translations.map((item) => [item.sid, item.translation.trim()]),
    );
    const hasEveryParagraph =
      translatableParagraphs.length === cachedPage.translations.length &&
      translatableParagraphs.every((paragraph) =>
        Boolean(translationsBySid.get(paragraph.pid)),
      );

    if (!hasEveryParagraph) {
      return page;
    }

    return {
      ...page,
      paragraphs: page.paragraphs.map((paragraph) => {
        const translation = translationsBySid.get(paragraph.pid);
        if (!translation) {
          return paragraph;
        }

        return {
          ...paragraph,
          translation,
          status: "done" as const,
        };
      }),
    };
  });

  const pageTranslations = Object.fromEntries(
    nextPages.flatMap((page) => {
      const cachedPage = cachedByPage.get(page.page);
      if (!cachedPage || !isPdfPageFullyTranslated(page)) {
        return [];
      }

      const existing = existingTranslations[page.page];
      if (isPageHydrationBusy(existing)) {
        return [];
      }

      const payload = buildPageTranslationPayload(nextPages, page.page);
      return [
        [
          page.page,
          {
            page: page.page,
            displayText: payload.displayText,
            previousContext: payload.previousContext,
            nextContext: payload.nextContext,
            translatedText: buildPdfPageTranslatedText(page),
            status: "done" as const,
            isCached: true,
            activityMessage: undefined,
            error: undefined,
            errorChecks: undefined,
          },
        ],
      ];
    }),
  ) as Record<number, PageTranslationState>;

  return {
    pages: nextPages,
    pageTranslations,
  };
}
