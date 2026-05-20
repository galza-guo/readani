import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  mergePdfExtractionCachePages,
} from "../lib/pdfExtractionCacheQueue";
import type { CachedPdfExtractionPage } from "../lib/pdfExtractionHydration";

const CACHE_VERSION = "pdf-extraction-v1";
const BATCH_SIZE = 12;
const FLUSH_MS = 250;

export function usePdfExtractionCache() {
  const pendingRef = useRef<CachedPdfExtractionPage[]>([]);
  const pendingDocIdRef = useRef<string | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const flushQueueRef = useRef<Promise<void>>(Promise.resolve());

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearFlushTimer();

    const docId = pendingDocIdRef.current;
    const pages = pendingRef.current;
    if (!docId || pages.length === 0) {
      return;
    }

    pendingRef.current = [];

    flushQueueRef.current = flushQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await invoke("cache_pdf_extraction_pages", {
          docId,
          extractionVersion: CACHE_VERSION,
          pages,
        });
      })
      .catch((error) => {
        console.error("Failed to cache extracted PDF pages:", error);
      });
  }, [clearFlushTimer]);

  const queuePage = useCallback(
    (docId: string, page: CachedPdfExtractionPage) => {
      if (pendingDocIdRef.current !== docId) {
        pendingDocIdRef.current = docId;
        pendingRef.current = [];
      }

      pendingRef.current = mergePdfExtractionCachePages(
        pendingRef.current,
        [page],
      );

      if (pendingRef.current.length >= BATCH_SIZE) {
        flush();
        return;
      }

      clearFlushTimer();
      flushTimerRef.current = window.setTimeout(() => {
        flush();
      }, FLUSH_MS);
    },
    [clearFlushTimer, flush],
  );

  return {
    queuePage,
    flush,
    cacheVersion: CACHE_VERSION,
  };
}
