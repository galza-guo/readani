import { useEffect, useRef, useMemo } from "react";
import type { AnnotationDisplayGroup } from "../types";
import type { ResolvedSentenceAnnotation } from "../lib/annotationMatching";
import {
  groupSentenceAnnotations,
  sortSentenceAnnotations,
} from "../lib/annotations";

type AnnotationsPanelProps = {
  annotations: ResolvedSentenceAnnotation[];
  open: boolean;
  onClose: () => void;
  onNavigateToPage: (page: number, pids?: string[]) => void;
  onDeleteAnnotation: (annotationId: string) => void;
};

export function AnnotationsPanel({
  annotations,
  open,
  onClose,
  onNavigateToPage,
  onDeleteAnnotation: _onDeleteAnnotation,
}: AnnotationsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const sorted = sortSentenceAnnotations(annotations);
    return groupSentenceAnnotations(sorted);
  }, [annotations]);

  // Build a pid lookup from annotations so we can resolve annotationIds → pids
  const annotationPidMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ann of annotations) {
      if (ann.resolvedStatus === "attached" && ann.livePid) {
        map.set(ann.id, ann.livePid);
      }
    }
    return map;
  }, [annotations]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleGroupClick(group: AnnotationDisplayGroup) {
    const pids = group.annotationIds
      .map((id) => annotationPidMap.get(id))
      .filter((p): p is string => p !== undefined);
    onNavigateToPage(group.page, pids);
  }

  return (
    <div className="annotations-panel" ref={panelRef}>
      <div className="annotations-panel-header">
        <span className="annotations-panel-title">Annotations</span>
        <button
          className="annotations-panel-close"
          onClick={onClose}
          aria-label="Close annotations panel"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="annotations-panel-body">
        {groups.length === 0 ? (
          <div className="annotations-panel-empty">
            No annotations yet. Select text in the document to add annotations.
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={`${group.docId}-${group.page}-${group.startSentenceIndex}`}
              className="annotations-panel-group"
              onClick={() => handleGroupClick(group)}
            >
              <div className="annotations-panel-group-page">
                Page {group.page}
              </div>
              <div className="annotations-panel-group-excerpt">
                {group.excerpt}
              </div>
              <div className="annotations-panel-group-meta">
                {group.noteCount > 0 && (
                  <span className="annotations-panel-badge annotations-panel-badge--notes">
                    {group.noteCount} {group.noteCount === 1 ? "note" : "notes"}
                  </span>
                )}
                {group.hasNeedsReview && (
                  <span className="annotations-panel-badge annotations-panel-badge--review">
                    Needs review
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
