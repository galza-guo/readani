import type { CachedPdfExtractionPage } from "./pdfExtractionHydration";

export function mergePdfExtractionCachePages(
  existing: CachedPdfExtractionPage[],
  incoming: CachedPdfExtractionPage[],
): CachedPdfExtractionPage[] {
  const merged = new Map<number, CachedPdfExtractionPage>();

  for (const page of existing) {
    merged.set(page.page, page);
  }

  for (const page of incoming) {
    merged.set(page.page, page);
  }

  return Array.from(merged.values()).sort((left, right) => left.page - right.page);
}
