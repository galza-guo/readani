import { invoke } from "@tauri-apps/api/core";
import {
  getDocumentFileName,
  resolveLoadedDocumentIdentity,
  type LoadDocumentIdentity,
} from "./documentIdentity";
import { hashBuffer } from "./hash";
import { readDocumentBytes, yieldToBrowserPaint } from "./documentLoading";
import { getReaderStatusLabel } from "./readerStatus";

export interface LoadEpubContext {
  flushPendingPdfExtractionCache: () => void;
  resetTranslationQueueForNewDocument: () => void;
  wordTranslationClearSelection: () => void;
  setAppView: (view: "home" | "reader") => void;
  setCurrentFilePath: (path: string | null) => void;
  setCurrentFileType: (type: "pdf" | "epub") => void;
  setPdfDoc: (doc: any | null) => void;
  setPdfOutline: (outline: any[]) => void;
  setEpubToc: (toc: any[]) => void;
  setEpubCurrentChapter: (chapter: string) => void;
  setPendingEpubNavigationHref: (href: string | null) => void;
  setPageSizes: (sizes: any[]) => void;
  setPageTranslations: (translations: any) => void;
  setHoverPid: (pid: string | null) => void;
  setActivePid: (pid: string | null) => void;
  setLoadingProgress: (progress: number | null) => void;
  setDocumentStatusMessage: (msg: string | null) => void;
  setTranslationStatusMessage: (msg: string | null) => void;
  setPdfScrollAnchor: (anchor: "top" | "bottom") => void;
  setPendingEpubScroll: (scroll: any) => void;
  setScrollToTranslationPage: React.Dispatch<React.SetStateAction<number | null>>;
  setEpubData: (data: Uint8Array | null) => void;
  setDocId: (id: string) => void;
  setCurrentPage: (page: number) => void;
  setCurrentBookTitle: (title: string | null) => void;
  pdfOutlineRequestIdRef: React.MutableRefObject<number>;
  pdfLoadRequestIdRef: React.MutableRefObject<number>;
}

export async function loadEpubFromPath(
  filePath: string,
  ctx: LoadEpubContext,
  startPage?: number,
  identity?: LoadDocumentIdentity,
): Promise<void> {
  ctx.pdfOutlineRequestIdRef.current += 1;
  ctx.pdfLoadRequestIdRef.current += 1;
  ctx.flushPendingPdfExtractionCache();
  ctx.setAppView("reader");
  ctx.setCurrentFilePath(filePath);
  ctx.setCurrentFileType("epub");
  ctx.setPdfDoc(null);
  ctx.setPdfOutline([]);
  ctx.setEpubToc([]);
  ctx.setEpubCurrentChapter("");
  ctx.setPendingEpubNavigationHref(null);
  ctx.setPageSizes([]);
  ctx.setPageTranslations({});
  ctx.wordTranslationClearSelection();
  ctx.setHoverPid(null);
  ctx.setActivePid(null);
  ctx.setLoadingProgress(0);
  ctx.setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
  ctx.setTranslationStatusMessage(null);
  ctx.setPdfScrollAnchor("top");
  ctx.setPendingEpubScroll(null);
  ctx.setScrollToTranslationPage(null);
  ctx.resetTranslationQueueForNewDocument();
  await yieldToBrowserPaint();

  try {
    const bytes = await readDocumentBytes(filePath);
    const buffer = bytes.buffer.slice(0);
    const hash = await hashBuffer(buffer);
    const resolvedIdentity = resolveLoadedDocumentIdentity({
      hash,
      filePath,
      identity,
    });
    const nextDocId = resolvedIdentity.docId;

    const fileName = getDocumentFileName(filePath);
    const title = resolvedIdentity.title;
    ctx.setCurrentBookTitle(title);

    ctx.setEpubData(bytes);
    ctx.setDocId(nextDocId);
    ctx.setCurrentPage(startPage || 1);

    try {
      await invoke("add_recent_book", {
        id: nextDocId,
        filePath: filePath,
        fileName: fileName,
        fileType: "epub",
        title: title,
        author: null,
        coverImage: null,
        totalPages: 1,
      });
    } catch (error) {
      console.error("Failed to add to recent books:", error);
    }
  } catch (error) {
    console.error("Failed to load EPUB:", error);
    ctx.setDocumentStatusMessage(
      "Failed to load EPUB. The file may have been moved or deleted.",
    );
    ctx.setLoadingProgress(null);
  }
}
