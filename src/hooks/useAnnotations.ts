import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { ResolvedSentenceAnnotation } from "../lib/annotationMatching";
import { resolveAnnotations } from "../lib/annotationMatching";
import { hashString } from "../lib/hash";
import type { PageDoc, Rect, SentenceAnnotation } from "../types";

export interface UseAnnotationsParams {
  docId: string;
  pages: PageDoc[];
  currentPage: number;
}

export interface UseAnnotationsReturn {
  // State
  annotations: SentenceAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<SentenceAnnotation[]>>;
  annotationModeEnabled: boolean;
  setAnnotationModeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noteEditingAnnotationId: string | null;
  setNoteEditingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingAnnotationDeletion: SentenceAnnotation | null;
  setPendingAnnotationDeletion: React.Dispatch<
    React.SetStateAction<SentenceAnnotation | null>
  >;
  annotationsPanelOpen: boolean;
  setAnnotationsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Derived
  resolvedAnnotations: ResolvedSentenceAnnotation[];
  resolvedAnnotationsRef: React.MutableRefObject<ResolvedSentenceAnnotation[]>;
  savedHighlightPids: string[];

  // Actions
  deleteSentenceAnnotation: (annotationId: string) => Promise<void>;
  requestDeleteSentenceAnnotation: (annotationId: string) => void;
  ensureSentenceHighlight: (para: {
    pid: string;
    page: number;
    source: string;
    sentenceIndex: number;
    rects: Rect[];
  }) => Promise<ResolvedSentenceAnnotation | undefined>;
  toggleSentenceHighlight: (para: {
    pid: string;
    page: number;
    source: string;
    sentenceIndex: number;
    rects: Rect[];
  }) => Promise<ResolvedSentenceAnnotation | undefined>;
  highlightSelectedSentences: (pids: string[]) => Promise<void>;
  saveSentenceNote: (annotationId: string, note: string) => Promise<void>;
  resetAnnotationUi: () => void;
}

export function useAnnotations({
  docId,
  pages,
  currentPage,
}: UseAnnotationsParams): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<SentenceAnnotation[]>([]);
  const [annotationModeEnabled, setAnnotationModeEnabled] = useState(false);
  const [noteEditingAnnotationId, setNoteEditingAnnotationId] = useState<
    string | null
  >(null);
  const [pendingAnnotationDeletion, setPendingAnnotationDeletion] =
    useState<SentenceAnnotation | null>(null);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);

  const resolvedAnnotationsRef = useRef<ResolvedSentenceAnnotation[]>([]);

  // Load annotations when docId changes
  useEffect(() => {
    if (!docId) {
      setAnnotations([]);
      return;
    }
    invoke("get_annotations", { docId })
      .then((result) => {
        setAnnotations(result as SentenceAnnotation[]);
      })
      .catch(() => {
        setAnnotations([]);
      });
  }, [docId]);

  const resolvedAnnotations = useMemo(
    () => resolveAnnotations(annotations, pages),
    [annotations, pages],
  );

  // Keep ref in sync
  resolvedAnnotationsRef.current = resolvedAnnotations;

  // Compute saved annotation pids for the current page (for PDF overlay)
  const savedHighlightPids = useMemo(() => {
    return resolvedAnnotations
      .filter(
        (a) =>
          a.page === currentPage &&
          a.resolvedStatus === "attached" &&
          a.livePid,
      )
      .map((a) => a.livePid!);
  }, [resolvedAnnotations, currentPage]);

  const deleteSentenceAnnotation = useCallback(
    async (annotationId: string) => {
      if (!docId) return;
      try {
        await invoke("delete_annotation", { docId, annotationId });
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
        if (noteEditingAnnotationId === annotationId) {
          setNoteEditingAnnotationId(null);
        }
        setPendingAnnotationDeletion((current) =>
          current?.id === annotationId ? null : current,
        );
      } catch {
        // Silently ignore
      }
    },
    [docId, noteEditingAnnotationId],
  );

  const requestDeleteSentenceAnnotation = useCallback(
    (annotationId: string) => {
      const existing = annotations.find(
        (annotation) => annotation.id === annotationId,
      );
      if (!existing) {
        return;
      }

      if (existing.note?.trim()) {
        setPendingAnnotationDeletion(existing);
        return;
      }

      void deleteSentenceAnnotation(annotationId);
    },
    [annotations, deleteSentenceAnnotation],
  );

  const ensureSentenceHighlight = useCallback(
    async (para: {
      pid: string;
      page: number;
      source: string;
      sentenceIndex: number;
      rects: Rect[];
    }) => {
      if (!docId) return;

      const existing = resolvedAnnotationsRef.current.find(
        (a) =>
          a.docId === docId &&
          a.page === para.page &&
          a.resolvedStatus === "attached" &&
          (a.livePid ?? a.pid) === para.pid,
      );

      if (existing) {
        return existing;
      }

      const id = `${docId}-${para.page}-${para.pid}`;
      const now = new Date().toISOString();
      const newAnnotation: SentenceAnnotation = {
        id,
        docId,
        page: para.page,
        pid: para.pid,
        sentenceIndex: para.sentenceIndex,
        sourceSnapshot: para.source,
        sourceHash: hashString(para.source),
        rectsSnapshot: para.rects,
        status: "attached",
        createdAt: now,
        updatedAt: now,
      };

      try {
        const saved = await invoke("upsert_annotation", {
          annotation: newAnnotation,
        });
        setAnnotations((prev) => [
          ...prev.filter((a) => a.id !== id),
          saved as SentenceAnnotation,
        ]);
      } catch {
        // Still add locally on error
        setAnnotations((prev) => [
          ...prev.filter((a) => a.id !== id),
          newAnnotation,
        ]);
      }
    },
    [docId],
  );

  const toggleSentenceHighlight = useCallback(
    async (para: {
      pid: string;
      page: number;
      source: string;
      sentenceIndex: number;
      rects: Rect[];
    }) => {
      if (!docId) return;

      const existing = resolvedAnnotationsRef.current.find(
        (a) =>
          a.docId === docId &&
          a.page === para.page &&
          a.resolvedStatus === "attached" &&
          (a.livePid ?? a.pid) === para.pid,
      );

      if (existing) {
        requestDeleteSentenceAnnotation(existing.id);
        return existing;
      }

      return ensureSentenceHighlight(para);
    },
    [docId, ensureSentenceHighlight, requestDeleteSentenceAnnotation],
  );

  const highlightSelectedSentences = useCallback(
    async (pids: string[]) => {
      if (!docId || !pages) return;

      for (const pid of pids) {
        let para:
          | {
              pid: string;
              page: number;
              source: string;
              sentenceIndex: number;
              rects: Rect[];
            }
          | undefined;
        for (const pageDoc of pages) {
          const idx = pageDoc.paragraphs.findIndex((p) => p.pid === pid);
          if (idx >= 0) {
            const p = pageDoc.paragraphs[idx];
            para = {
              pid: p.pid,
              page: p.page,
              source: p.source,
              sentenceIndex: idx,
              rects: p.rects,
            };
            break;
          }
        }
        if (para) {
          await ensureSentenceHighlight(para);
        }
      }
    },
    [docId, ensureSentenceHighlight, pages],
  );

  const saveSentenceNote = useCallback(
    async (annotationId: string, note: string) => {
      const existing = annotations.find((a) => a.id === annotationId);
      if (!existing) return;

      const updated = {
        ...existing,
        note: note || undefined,
        updatedAt: new Date().toISOString(),
      };

      try {
        const saved = await invoke("upsert_annotation", {
          annotation: updated,
        });
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotationId ? (saved as SentenceAnnotation) : a,
          ),
        );
      } catch {
        setAnnotations((prev) =>
          prev.map((a) => (a.id === annotationId ? updated : a)),
        );
      }
    },
    [annotations],
  );

  const resetAnnotationUi = useCallback(() => {
    setNoteEditingAnnotationId(null);
    setPendingAnnotationDeletion(null);
    setAnnotationModeEnabled(false);
    setAnnotationsPanelOpen(false);
  }, []);

  return {
    // State
    annotations,
    setAnnotations,
    annotationModeEnabled,
    setAnnotationModeEnabled,
    noteEditingAnnotationId,
    setNoteEditingAnnotationId,
    pendingAnnotationDeletion,
    setPendingAnnotationDeletion,
    annotationsPanelOpen,
    setAnnotationsPanelOpen,

    // Derived
    resolvedAnnotations,
    resolvedAnnotationsRef,
    savedHighlightPids,

    // Actions
    deleteSentenceAnnotation,
    requestDeleteSentenceAnnotation,
    ensureSentenceHighlight,
    toggleSentenceHighlight,
    highlightSelectedSentences,
    saveSentenceNote,
    resetAnnotationUi,
  };
}
