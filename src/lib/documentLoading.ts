import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getDocumentFileName,
  getDocumentTitleFromPath,
} from "./documentIdentity";
import { hashBuffer } from "./hash";
import type { FileType, RecentBook } from "../types";

export type DocumentInspection = {
  docId: string;
  filePath: string;
  fileName: string;
  fileType: FileType;
  title: string;
  totalPages: number;
  chapterCount?: number;
};

export function getDocumentFileType(filePath: string): FileType {
  return filePath.split(".").pop()?.toLowerCase() === "epub" ? "epub" : "pdf";
}

export async function readDocumentBytes(filePath: string) {
  const rawBytes = (await invoke("read_pdf_file", { path: filePath })) as number[];
  return new Uint8Array(rawBytes);
}

export async function inspectPdfDocument(
  filePath: string,
  bytes: Uint8Array,
  docId: string,
): Promise<DocumentInspection> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice().buffer });
  const doc = await loadingTask.promise;
  try {
    return {
      docId,
      filePath,
      fileName: getDocumentFileName(filePath),
      fileType: "pdf",
      title: getDocumentTitleFromPath(filePath),
      totalPages: doc.numPages,
    };
  } finally {
    await doc.destroy();
  }
}

export async function inspectEpubDocument(
  filePath: string,
  bytes: Uint8Array,
  docId: string,
): Promise<DocumentInspection> {
  const { default: ePub } = await import("epubjs");
  const bookData = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(bookData).set(bytes);
  const book = ePub(bookData);

  try {
    await book.ready;
    const metadata = await book.loaded.metadata;
    const navigation = await book.loaded.navigation;
    const spineItems = ((book.spine as any)?.items ?? []) as unknown[];
    return {
      docId,
      filePath,
      fileName: getDocumentFileName(filePath),
      fileType: "epub",
      title: metadata.title || getDocumentTitleFromPath(filePath),
      totalPages: 1,
      chapterCount: spineItems.length || navigation.toc.length || undefined,
    };
  } finally {
    book.destroy();
  }
}

export async function inspectDocument(filePath: string): Promise<DocumentInspection> {
  const bytes = await readDocumentBytes(filePath);
  const buffer = bytes.buffer.slice(0);
  const hash = await hashBuffer(buffer);
  const docId = hash.slice(0, 12);
  const fileType = getDocumentFileType(filePath);

  if (fileType === "epub") {
    return inspectEpubDocument(filePath, bytes, docId);
  }

  return inspectPdfDocument(filePath, bytes, docId);
}

export async function loadPdfPageSize(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  } finally {
    page.cleanup();
  }
}

export async function yieldToBrowserPaint() {
  if (typeof window === "undefined") {
    return;
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

export function releasePdfDocument(doc: PDFDocumentProxy | null) {
  if (!doc) {
    return;
  }

  try {
    doc.cleanup();
  } catch {
    // Ignore cleanup failures during teardown.
  }

  void doc.destroy().catch(() => {
    // Ignore destroy failures during teardown.
  });
}

export function isStructurallySimilarRecentCandidate(
  book: RecentBook,
  candidate: DocumentInspection,
) {
  if (book.fileType !== candidate.fileType) {
    return false;
  }

  if (candidate.fileType === "pdf") {
    return book.totalPages === candidate.totalPages;
  }

  return true;
}
