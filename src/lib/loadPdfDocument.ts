import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getDocumentFileName,
  resolveLoadedDocumentIdentity,
  type LoadDocumentIdentity,
} from "./documentIdentity";
import { hashBuffer } from "./hash";
import {
  loadPdfPageSize,
  readDocumentBytes,
  releasePdfDocument,
  yieldToBrowserPaint,
} from "./documentLoading";
import { getReaderStatusLabel } from "./readerStatus";
import { getErrorMessage } from "./errorMessage";
import { extractPageParagraphs } from "./textExtraction";
import {
  createProgressivePdfPageSizes,
  mergeProgressivePdfPageSize,
  type PdfPageSizeEntry,
} from "./pdfPageSizes";
import {
  buildPdfExtractionPlan,
  chunkPageNumbers,
  getPdfStartupHydrationPages,
} from "./pdfExtractionQueue";
import {
  applyCachedPdfExtractionPages,
  type CachedPdfExtractionPage,
} from "./pdfExtractionHydration";
import {
  normalizePdfOutline,
  resolvePdfDestinationPage,
} from "./pdfNavigation";
import type { PageDoc } from "../types";

type CachedPdfExtractionStatus = {
  cachedPageCount: number;
  isComplete: boolean;
};

export interface LoadPdfContext {
  pdfOutlineRequestIdRef: React.MutableRefObject<number>;
  pdfLoadRequestIdRef: React.MutableRefObject<number>;
  queuePdfExtractionCachePage: (docId: string, page: CachedPdfExtractionPage) => void;
  flushPendingPdfExtractionCache: () => void;
  resetTranslationQueueForNewDocument: () => void;
  wordTranslationClearSelection: () => void;
  wordTranslationClearWord: () => void;
  setAppView: (view: "home" | "reader") => void;
  setCurrentFilePath: (path: string | null) => void;
  setCurrentFileType: (type: "pdf" | "epub") => void;
  setEpubData: (data: Uint8Array | null) => void;
  setEpubToc: (toc: any[]) => void;
  setEpubCurrentChapter: (chapter: string) => void;
  setPendingEpubNavigationHref: (href: string | null) => void;
  setLoadingProgress: (progress: number | null) => void;
  setDocumentStatusMessage: (msg: string | null) => void;
  setTranslationStatusMessage: (msg: string | null) => void;
  setPdfDoc: (doc: PDFDocumentProxy | null) => void;
  setPdfOutline: (outline: any[]) => void;
  setPages: React.Dispatch<React.SetStateAction<PageDoc[]>>;
  setPageTranslations: React.Dispatch<React.SetStateAction<any>>;
  setPageSizes: React.Dispatch<React.SetStateAction<PdfPageSizeEntry[]>>;
  setPdfZoomMode: (mode: any) => void;
  setPdfManualScale: (scale: number) => void;
  setResolvedPdfScale: (scale: number) => void;
  setPdfScrollAnchor: (anchor: "top" | "bottom") => void;
  setPendingEpubScroll: (scroll: any) => void;
  setScrollToTranslationPage: React.Dispatch<React.SetStateAction<number | null>>;
  setHoverPid: (pid: string | null) => void;
  setActivePid: (pid: string | null) => void;
  setCurrentBookTitle: (title: string | null) => void;
  setDocId: (id: string) => void;
  setCurrentPage: (page: number) => void;
  extractionCacheVersion: string;
  hydrationBatchSize: number;
}

function clampPage(page: number, total: number): number {
  return Math.max(1, Math.min(page, total));
}

export async function loadPdfFromPath(
  filePath: string,
  ctx: LoadPdfContext,
  startPage?: number,
  identity?: LoadDocumentIdentity,
): Promise<void> {
  const outlineRequestId = ++ctx.pdfOutlineRequestIdRef.current;
  const loadRequestId = ++ctx.pdfLoadRequestIdRef.current;
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
  let loadedDoc: PDFDocumentProxy | null = null;
  let committedDoc = false;
  let failedStage = "prepare PDF";
  const isStaleLoad = () => ctx.pdfLoadRequestIdRef.current !== loadRequestId;

  ctx.flushPendingPdfExtractionCache();
  ctx.setAppView("reader");
  ctx.setCurrentFilePath(filePath);
  ctx.setCurrentFileType("pdf");
  ctx.setEpubData(null);
  ctx.setEpubToc([]);
  ctx.setEpubCurrentChapter("");
  ctx.setPendingEpubNavigationHref(null);
  ctx.setLoadingProgress(0);
  ctx.setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
  ctx.setTranslationStatusMessage(null);
  ctx.setPdfDoc(null);
  ctx.setPdfOutline([]);
  ctx.setPages([]);
  ctx.setPageTranslations({});
  ctx.setPageSizes([]);
  ctx.setPdfZoomMode("fit-width");
  ctx.setPdfManualScale(1);
  ctx.setResolvedPdfScale(1);
  ctx.setPdfScrollAnchor("top");
  ctx.setPendingEpubScroll(null);
  ctx.setScrollToTranslationPage(null);
  ctx.wordTranslationClearSelection();
  ctx.wordTranslationClearWord();
  ctx.setHoverPid(null);
  ctx.setActivePid(null);
  ctx.resetTranslationQueueForNewDocument();
  await yieldToBrowserPaint();

  try {
    failedStage = "read PDF file";
    ctx.setLoadingProgress(5);
    const bytes = await readDocumentBytes(filePath);
    const buffer = bytes.buffer.slice(0);
    const hash = await hashBuffer(buffer);
    const resolvedIdentity = resolveLoadedDocumentIdentity({
      hash,
      filePath,
      identity,
    });
    const nextDocId = resolvedIdentity.docId;

    if (isStaleLoad()) {
      return;
    }

    failedStage = "parse PDF";
    ctx.setLoadingProgress(15);
    loadingTask = pdfjsLib.getDocument({ data: bytes });
    const doc = await loadingTask.promise;
    loadedDoc = doc;

    if (isStaleLoad()) {
      return;
    }

    const initialCurrentPage = clampPage(startPage || 1, doc.numPages);

    failedStage = "inspect opening PDF page";
    ctx.setLoadingProgress(25);
    const openingPageSize = await loadPdfPageSize(doc, initialCurrentPage);

    if (isStaleLoad()) {
      return;
    }

    const sizes = createProgressivePdfPageSizes({
      totalPages: doc.numPages,
      pageNumber: initialCurrentPage,
      size: openingPageSize,
    });
    const initialPages: PageDoc[] = Array.from(
      { length: doc.numPages },
      (_, index) => ({
        page: index + 1,
        paragraphs: [],
        isExtracted: false,
      }),
    );

    const fileName = getDocumentFileName(filePath);
    const title = resolvedIdentity.title;
    ctx.setCurrentBookTitle(title);

    ctx.setPdfDoc(doc);
    committedDoc = true;
    void doc
      .getOutline()
      .then((outline) =>
        normalizePdfOutline(outline as any, {
          getPageNumberFromDest: (dest: any) =>
            resolvePdfDestinationPage(dest, doc),
        }),
      )
      .then((normalizedOutline: any) => {
        if (ctx.pdfOutlineRequestIdRef.current !== outlineRequestId) {
          return;
        }
        ctx.setPdfOutline(normalizedOutline);
      })
      .catch((error: any) => {
        console.error("Failed to load PDF outline:", error);
      });
    ctx.setPageSizes(sizes);
    ctx.setDocId(nextDocId);
    ctx.setCurrentPage(initialCurrentPage);
    ctx.setDocumentStatusMessage(getReaderStatusLabel("extracting-text"));
    ctx.setPages(initialPages);

    void invoke("add_recent_book", {
      id: nextDocId,
      filePath: filePath,
      fileName: fileName,
      fileType: "pdf",
      title: title,
      author: null,
      coverImage: null,
      totalPages: doc.numPages,
    }).catch((error) => {
      console.error("Failed to add to recent books:", error);
    });

    const remainingSizePages = buildPdfExtractionPlan({
      totalPages: doc.numPages,
      currentPage: initialCurrentPage,
      extractedPages: [initialCurrentPage],
    });

    void (async () => {
      for (const pageNumber of remainingSizePages) {
        if (isStaleLoad()) {
          return;
        }

        try {
          const size = await loadPdfPageSize(doc, pageNumber);
          if (isStaleLoad()) {
            return;
          }

          ctx.setPageSizes((prev: PdfPageSizeEntry[]) =>
            mergeProgressivePdfPageSize(prev, pageNumber, size),
          );
        } catch (error) {
          console.error(`Failed to inspect PDF page ${pageNumber}:`, error);
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
      }
    })();

    let cachedExtractionStatus: CachedPdfExtractionStatus | null = null;
    try {
      failedStage = "read extraction cache status";
      cachedExtractionStatus = (await invoke(
        "get_cached_pdf_extraction_status",
        {
          docId: nextDocId,
          extractionVersion: ctx.extractionCacheVersion,
          totalPages: doc.numPages,
        },
      )) as CachedPdfExtractionStatus;
    } catch (error) {
      console.warn(
        "Failed to read cached PDF extraction status, continuing without cache:",
        error,
      );
    }

    if (isStaleLoad()) {
      return;
    }

    if (cachedExtractionStatus?.isComplete) {
      try {
        failedStage = "hydrate cached extraction pages";
        const startupHydrationPages = getPdfStartupHydrationPages({
          totalPages: doc.numPages,
          currentPage: initialCurrentPage,
          radius: 1,
        });

        const cachedExtractionPages = (await invoke(
          "get_cached_pdf_extraction_pages",
          {
            docId: nextDocId,
            extractionVersion: ctx.extractionCacheVersion,
            pages: startupHydrationPages,
          },
        )) as CachedPdfExtractionPage[];

        if (isStaleLoad()) {
          return;
        }

        ctx.setPages(
          applyCachedPdfExtractionPages(initialPages, cachedExtractionPages),
        );
        ctx.setLoadingProgress(null);
        ctx.setDocumentStatusMessage(null);

        const hydratedPages = new Set(
          cachedExtractionPages.map((page) => page.page),
        );
        const remainingPages = buildPdfExtractionPlan({
          totalPages: doc.numPages,
          currentPage: initialCurrentPage,
          extractedPages: Array.from(hydratedPages),
        });
        const remainingPageBatches = chunkPageNumbers(
          remainingPages,
          ctx.hydrationBatchSize,
        );

        void (async () => {
          for (const batch of remainingPageBatches) {
            if (isStaleLoad()) {
              return;
            }

            const nextBatch = (await invoke(
              "get_cached_pdf_extraction_pages",
              {
                docId: nextDocId,
                extractionVersion: ctx.extractionCacheVersion,
                pages: batch,
              },
            )) as CachedPdfExtractionPage[];

            if (isStaleLoad()) {
              return;
            }

            ctx.setPages((prev: PageDoc[]) =>
              applyCachedPdfExtractionPages(prev, nextBatch),
            );

            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 0);
            });
          }
        })().catch((error) => {
          console.error("Failed to hydrate cached PDF extraction pages:", error);
        });

        return;
      } catch (error) {
        console.warn(
          "Failed to hydrate cached PDF extraction pages, falling back to live extraction:",
          error,
        );
        ctx.setPages(initialPages);
        ctx.setDocumentStatusMessage(getReaderStatusLabel("extracting-text"));
        ctx.setLoadingProgress(50);
      }
    }

    const startupHydrationPages = getPdfStartupHydrationPages({
      totalPages: doc.numPages,
      currentPage: initialCurrentPage,
      radius: 1,
    });

    let cachedExtractionPages: CachedPdfExtractionPage[] = [];
    try {
      failedStage = "read nearby extraction cache pages";
      cachedExtractionPages = (await invoke(
        "get_cached_pdf_extraction_pages",
        {
          docId: nextDocId,
          extractionVersion: ctx.extractionCacheVersion,
          pages: startupHydrationPages,
        },
      )) as CachedPdfExtractionPage[];
    } catch (error) {
      console.warn(
        "Failed to read nearby cached PDF extraction pages, continuing with live extraction:",
        error,
      );
    }

    if (isStaleLoad()) {
      return;
    }

    const hydratedPages = applyCachedPdfExtractionPages(
      initialPages,
      cachedExtractionPages,
    );
    ctx.setPages(hydratedPages);

    const extractedPages = hydratedPages
      .filter((page) => page.isExtracted)
      .map((page) => page.page);
    const extractionPlan = buildPdfExtractionPlan({
      totalPages: doc.numPages,
      currentPage: initialCurrentPage,
      extractedPages,
    });

    const extractAndCachePage = async (pageNumber: number) => {
      const page = await doc.getPage(pageNumber);
      try {
        if (isStaleLoad()) {
          return false;
        }

        failedStage = `extract text from page ${pageNumber}`;

        const { paragraphs, watermarks } = await extractPageParagraphs(
          page,
          nextDocId,
          pageNumber - 1,
        );

        if (isStaleLoad()) {
          return false;
        }

        const extractedPage: CachedPdfExtractionPage = {
          page: pageNumber,
          paragraphs,
          watermarks,
        };

        ctx.setPages((prev: PageDoc[]) =>
          applyCachedPdfExtractionPages(prev, [extractedPage]),
        );
        ctx.queuePdfExtractionCachePage(nextDocId, extractedPage);

        return true;
      } catch (error) {
        console.error(`Failed to extract PDF page ${pageNumber}:`, error);
        return false;
      } finally {
        page.cleanup();
      }
    };

    const currentPageAlreadyCached = extractedPages.includes(initialCurrentPage);
    if (currentPageAlreadyCached) {
      ctx.setLoadingProgress(null);
      ctx.setDocumentStatusMessage(null);
    } else {
      await extractAndCachePage(initialCurrentPage);
      if (isStaleLoad()) {
        return;
      }
      ctx.setLoadingProgress(null);
      ctx.setDocumentStatusMessage(null);
    }

    const remainingPages = extractionPlan.filter(
      (pageNumber) => pageNumber !== initialCurrentPage,
    );
    void (async () => {
      for (const pageNumber of remainingPages) {
        if (isStaleLoad()) {
          ctx.flushPendingPdfExtractionCache();
          return;
        }

        await extractAndCachePage(pageNumber);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
      }

      ctx.flushPendingPdfExtractionCache();
    })();
  } catch (error) {
    if (isStaleLoad()) {
      return;
    }

    const detail = getErrorMessage(error);
    console.error(`Failed to load PDF during ${failedStage}:`, error);
    ctx.setLoadingProgress(null);
    ctx.setDocumentStatusMessage(
      `Failed to load PDF during ${failedStage}: ${detail}`,
    );
  } finally {
    if (!committedDoc) {
      if (loadedDoc) {
        releasePdfDocument(loadedDoc);
      } else if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          // Ignore loading-task teardown failures during cancellation.
        }
      }
    }
  }
}
