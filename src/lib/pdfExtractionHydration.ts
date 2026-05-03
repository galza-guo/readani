import type { PageDoc, Paragraph } from "../types";

type CachedPdfExtractionParagraph = Pick<
  Paragraph,
  "pid" | "page" | "source" | "rects"
> &
  Partial<Pick<Paragraph, "status" | "translation">>;

export type CachedPdfExtractionPage = {
  page: number;
  paragraphs: CachedPdfExtractionParagraph[];
  watermarks: string[];
};

export function applyCachedPdfExtractionPages(
  pages: PageDoc[],
  cachedPages: CachedPdfExtractionPage[],
): PageDoc[] {
  const cachedByPage = new Map(
    cachedPages.map((cachedPage) => [cachedPage.page, cachedPage]),
  );

  return pages.map((page) => {
    if (page.isExtracted) {
      return page;
    }

    const cachedPage = cachedByPage.get(page.page);
    if (!cachedPage) {
      return page;
    }

    return {
      ...page,
      paragraphs: cachedPage.paragraphs.map((paragraph) => ({
        ...paragraph,
        status: paragraph.status ?? "idle",
      })),
      watermarks: cachedPage.watermarks,
      isExtracted: true,
    };
  });
}
