import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import * as Popover from "@radix-ui/react-popover";
import {
  getPdfAlignmentState,
  getTranslatablePdfParagraphs,
} from "../lib/pdfSegments";
import { getFriendlyProviderError } from "../lib/providerErrors";
import type { PageProgressStatus } from "../lib/pageTranslationScheduler";
import { useToast } from "./toast/ToastProvider";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import type {
  PageDoc,
  PageTranslationState,
  Paragraph,
  SelectionTranslation,
  WordTranslation,
} from "../types";

type TranslationPaneChromeProps = {
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  statusMap?: PageProgressStatus[];
  currentPage?: number;
  onSeekPage?: (page: number) => void;
};

type PdfTranslationPaneProps = {
  mode: "pdf";
  currentPage: number;
  page?: PageDoc;
  pageTranslation?: PageTranslationState;
  loadingMessage?: string | null;
  setupRequired?: boolean;
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  onOpenSettings: () => void;
  onRetryPage: (page: number) => void;
  canRetryPage: boolean;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onLocatePid: (pid: string, page: number) => void;
  selectionTranslation: SelectionTranslation | null;
  onClearSelectionTranslation: () => void;
  statusMap?: PageProgressStatus[];
  onSeekPage?: (page: number) => void;
};

type EpubTranslationPaneProps = {
  mode: "epub";
  pages: PageDoc[];
  currentPage: number;
  setupRequired?: boolean;
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  onOpenSettings: () => void;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
  wordTranslation: WordTranslation | null;
  onClearWordTranslation: () => void;
  scrollToPage?: number | null;
  statusMap?: PageProgressStatus[];
  onSeekPage?: (page: number) => void;
};

type TranslationPaneProps = PdfTranslationPaneProps | EpubTranslationPaneProps;

function getFallbackAttemptSummary(
  pageTranslation?: PageTranslationState,
) {
  const attemptCount = pageTranslation?.fallbackTrace?.attemptCount ?? 0;

  if (attemptCount <= 1) {
    return undefined;
  }

  return `Tried ${attemptCount} presets.`;
}

function TranslateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l6 6" />
      <path d="M4 14l6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="M22 22l-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

async function copyTextToClipboard(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (copied) {
      return;
    }
  }

  throw new Error("Clipboard access is unavailable.");
}

type SelectedCopyMode = "translation" | "original" | "both";

function getCopyableTranslation(para: Paragraph) {
  if (para.status !== "done") {
    return "";
  }

  return para.translation?.trim() ?? "";
}

function buildSelectedCopyText(
  paragraphs: Paragraph[],
  mode: SelectedCopyMode,
) {
  const blocks = paragraphs
    .map((para) => {
      const translation = getCopyableTranslation(para);
      const original = para.source.trim();

      if (mode === "translation") {
        return translation;
      }

      if (mode === "original") {
        return original;
      }

      return [translation, original].filter(Boolean).join("\n");
    })
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.join("\n\n").trim();
}

function TranslationSetupPrompt({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div className="translation-setup-prompt">
      <p className="translation-setup-title">Translation is not set up yet.</p>
      <button
        className="btn btn-quiet-action"
        onClick={onOpenSettings}
        type="button"
      >
        Open Settings to add a provider.
      </button>
    </div>
  );
}

const PdfSegmentCard = memo(function PdfSegmentCard({
  para,
  isActive,
  isSelected,
  onHoverPid,
  onSelect,
  onCopyText,
}: {
  para: Paragraph;
  isActive: boolean;
  isSelected: boolean;
  onHoverPid: (pid: string | null) => void;
  onSelect: (pid: string, event: React.MouseEvent<HTMLElement>) => void;
  onCopyText: (text: string, label: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<
    "translation" | "source" | null
  >(null);
  const showInlineActions =
    isHovered || isActive || isSelected || hasFocusWithin;
  const sourceVisible = showInlineActions;
  const showTranslationCopy = hoveredSection === "translation";
  const showSourceCopy = hoveredSection === "source";
  const canCopyTranslation =
    para.status === "done" && Boolean(para.translation?.trim());
  const canCopySource = Boolean(para.source.trim());

  let translationText = para.translation?.trim() ?? "";
  if (para.status === "loading") {
    translationText = "Translating this passage...";
  } else if (para.status === "error") {
    translationText = "Translation failed for this passage.";
  } else if (!translationText) {
    translationText = "Translation will appear here when this passage is ready.";
  }

  return (
    <article
      className={`pdf-segment-card ${
        isActive && !isHovered ? "is-linked-active" : ""
      } ${
        isSelected ? "is-selected" : ""
      }`}
      onMouseEnter={() => {
        setIsHovered(true);
        onHoverPid(para.pid);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredSection(null);
        onHoverPid(null);
      }}
      onFocusCapture={() => {
        setHasFocusWithin(true);
        onHoverPid(para.pid);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;

        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setHasFocusWithin(false);
          setHoveredSection(null);
          onHoverPid(null);
        }
      }}
      onClick={(event) => onSelect(para.pid, event)}
    >
      <div className="pdf-segment-surface">
        <div
          className={`pdf-segment-row pdf-segment-row--translation ${
            showTranslationCopy ? "is-copy-hovered" : ""
          }`}
          onMouseEnter={() => setHoveredSection("translation")}
          onMouseLeave={() =>
            setHoveredSection((current) =>
              current === "translation" ? null : current,
            )
          }
        >
          <div className="pdf-segment-translation">{translationText}</div>
          <button
            className="pdf-segment-copy-btn"
            type="button"
            disabled={!canCopyTranslation}
            tabIndex={showTranslationCopy ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onCopyText(para.translation?.trim() ?? "", "Translation");
            }}
            title="Copy translation"
            aria-label="Copy translation"
          >
            <CopyIcon />
          </button>
        </div>
        <div
          className={`pdf-segment-source-reveal ${
            sourceVisible ? "is-visible" : ""
          }`}
          aria-hidden={!sourceVisible}
        >
          <div className="pdf-segment-source-reveal-inner">
            <div
              className={`pdf-segment-row pdf-segment-row--source ${
                showSourceCopy ? "is-copy-hovered" : ""
              }`}
              onMouseEnter={() => setHoveredSection("source")}
              onMouseLeave={() =>
                setHoveredSection((current) =>
                  current === "source" ? null : current,
                )
              }
            >
              <div className="pdf-segment-source">{para.source}</div>
              <button
                className="pdf-segment-copy-btn"
                type="button"
                disabled={!canCopySource || !sourceVisible}
                tabIndex={showSourceCopy ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyText(para.source, "Original text");
                }}
                title="Copy original text"
                aria-label="Copy original text"
              >
                <CopyIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

const ParagraphBlock = memo(function ParagraphBlock({
  para,
  pageNum,
  isActive,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
}: {
  para: Paragraph;
  pageNum: number;
  isActive: boolean;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
}) {
  const handleMouseUp = useCallback(
    (event: React.MouseEvent) => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (
        selectedText &&
        selectedText.length > 0 &&
        selectedText.length < 200
      ) {
        event.stopPropagation();
        onTranslateText(selectedText, { x: event.clientX, y: event.clientY });
      }
    },
    [onTranslateText],
  );

  const translationText =
    para.status === "loading"
      ? "Translating..."
      : para.status === "error"
        ? "Translation failed."
        : para.translation || "";

  return (
    <div
      className={`paragraph-block ${isActive ? "is-active" : ""}`}
      onMouseEnter={() => onHoverPid(para.pid)}
      onMouseLeave={() => onHoverPid(null)}
    >
      <div className="paragraph-actions">
        <button
          className="action-btn locate-btn"
          onClick={(event) => {
            event.stopPropagation();
            onLocatePid(para.pid, pageNum);
          }}
          title="Locate in document"
        >
          <LocateIcon />
        </button>
        <button
          className="action-btn translate-btn"
          onClick={(event) => {
            event.stopPropagation();
            onTranslatePid(para.pid);
          }}
          title="Translate paragraph"
        >
          <TranslateIcon />
        </button>
      </div>
      <div className="paragraph-source" onMouseUp={handleMouseUp}>
        {para.source}
      </div>
      {para.status === "error" ? (
        <div className="paragraph-translation paragraph-error">
          <span>Translation failed.</span>
          <button
            className="retry-btn"
            onClick={(event) => {
              event.stopPropagation();
              onTranslatePid(para.pid);
            }}
            title="Retry translation"
          >
            <RetryIcon />
            <span>Retry</span>
          </button>
        </div>
      ) : translationText ? (
        <div className="paragraph-translation">{translationText}</div>
      ) : null}
    </div>
  );
});

const EpubPageTranslation = memo(function EpubPageTranslation({
  page,
  activePid,
  hoverPid,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
}: {
  page: PageDoc;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
}) {
  const pageTitle = page.title || `Page ${page.page}`;

  return (
    <div className="translation-page">
      <div className="translation-page-title">{pageTitle}</div>
      {page.paragraphs.map((para) => (
        <ParagraphBlock
          key={para.pid}
          para={para}
          pageNum={page.page}
          isActive={para.pid === activePid || para.pid === hoverPid}
          onHoverPid={onHoverPid}
          onTranslatePid={onTranslatePid}
          onLocatePid={onLocatePid}
          onTranslateText={onTranslateText}
        />
      ))}
    </div>
  );
});

type TranslationProgressBarProps = {
  statusMap: PageProgressStatus[];
  currentPage: number;
  progressLabel: string;
  onSeekPage: (page: number) => void;
};

const TranslationProgressBar = memo(function TranslationProgressBar({
  statusMap,
  currentPage,
  progressLabel,
  onSeekPage,
}: TranslationProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [hoverPage, setHoverPage] = useState<number | null>(null);

  const pageFromOffset = useCallback(
    (clientX: number) => {
      const barWidth = barRef.current?.clientWidth ?? 1;
      const rect = barRef.current?.getBoundingClientRect();
      const offsetX = rect ? clientX - rect.left : 0;
      const raw = Math.round((offsetX / barWidth) * statusMap.length);
      return Math.max(1, Math.min(raw, statusMap.length));
    },
    [statusMap.length],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setDragPage(pageFromOffset(event.clientX));
    },
    [pageFromOffset],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        setDragPage(pageFromOffset(event.clientX));
      } else {
        setHoverPage(pageFromOffset(event.clientX));
      }
    },
    [isDragging, pageFromOffset],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const page = pageFromOffset(event.clientX);
      setIsDragging(false);
      setDragPage(null);
      onSeekPage(page);
    },
    [isDragging, pageFromOffset, onSeekPage],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsDragging(false);
      setDragPage(null);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let nextPage: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          nextPage = Math.max(1, currentPage - 1);
          break;
        case "ArrowRight":
        case "ArrowUp":
          nextPage = Math.min(statusMap.length, currentPage + 1);
          break;
        case "Home":
          nextPage = 1;
          break;
        case "End":
          nextPage = statusMap.length;
          break;
      }
      if (nextPage !== null) {
        event.preventDefault();
        onSeekPage(nextPage);
      }
    },
    [currentPage, statusMap.length, onSeekPage],
  );

  const tooltipContent = isDragging
    ? `Page ${dragPage}`
    : `${progressLabel} · Page ${hoverPage} of ${statusMap.length}`;

  const markerLeft = ((currentPage - 1) / statusMap.length) * 100;

  return (
    <div
      className="translation-progress-bar"
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={(event) => {
        setIsHovered(true);
        setHoverPage(pageFromOffset(event.clientX));
      }}
      onMouseLeave={() => {
        if (!isDragging) {
          setIsHovered(false);
          setHoverPage(null);
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-valuemin={1}
      aria-valuemax={statusMap.length}
      aria-valuenow={currentPage}
      aria-label={`Page navigation, page ${currentPage} of ${statusMap.length}`}
    >
      {statusMap.map((status, index) => (
        <span
          key={index}
          data-status={status}
          className="translation-progress-segment"
          style={{ "--segment-index": index } as CSSProperties}
        />
      ))}
      <span
        className="translation-progress-marker"
        style={{ left: `${markerLeft}%` }}
      />
      {(isHovered || isDragging) && (
        <span className="translation-progress-tooltip">{tooltipContent}</span>
      )}
    </div>
  );
});

function TranslationPaneFooter({
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning: _bulkActionRunning,
  statusMap,
  currentPage,
  onSeekPage,
}: TranslationPaneChromeProps) {
  return (
    <div className="translation-pane-footer">
      <div className="translation-pane-footer-progress">
        {statusMap && statusMap.length > 0 && progressLabel && onSeekPage && currentPage ? (
          <TranslationProgressBar
            statusMap={statusMap}
            currentPage={currentPage}
            progressLabel={progressLabel}
            onSeekPage={onSeekPage}
          />
        ) : progressLabel ? (
          <span className="translation-pane-progress-text">
            {progressLabel}
          </span>
        ) : null}
        {progressDetailLabel ? (
          <span
            className={`translation-pane-progress-detail ${
              progressDetailState ? `is-${progressDetailState}` : ""
            }`}
            aria-live="polite"
          >
            <span>{progressDetailLabel}</span>
            {progressDetailState ? (
              <span
                className="translation-pane-progress-ellipsis"
                aria-hidden="true"
              />
            ) : null}
          </span>
        ) : null}
      </div>
      <button
        className="btn btn-small btn-quiet-action"
        type="button"
        onClick={onBulkAction}
        disabled={bulkActionDisabled}
      >
        {bulkActionLabel}
      </button>
    </div>
  );
}

function PdfTranslationPane({
  currentPage,
  page,
  pageTranslation,
  loadingMessage,
  setupRequired = false,
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning,
  onOpenSettings,
  onRetryPage,
  canRetryPage,
  activePid,
  hoverPid,
  onHoverPid,
  onLocatePid: _onLocatePid,
  selectionTranslation,
  onClearSelectionTranslation,
  statusMap,
  onSeekPage,
}: Omit<PdfTranslationPaneProps, "mode">) {
  const { showToast } = useToast();
  const [selectedPids, setSelectedPids] = useState<string[]>([]);
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const resolvedLoadingMessage =
    loadingMessage ??
    pageTranslation?.activityMessage ??
    (pageTranslation?.status === "queued"
      ? "Queued for translation..."
      : pageTranslation?.status === "loading"
        ? "Translating this page..."
        : null);
  const translatableParagraphs = getTranslatablePdfParagraphs(page);
  const alignmentState = getPdfAlignmentState(page);
  const showSegmentCards =
    pageTranslation?.status === "done" && translatableParagraphs.length > 0;
  const fallbackAttemptSummary = getFallbackAttemptSummary(pageTranslation);
  const resolvedErrorMessage = pageTranslation?.fallbackTrace?.lastError
    ? getFriendlyProviderError(pageTranslation.fallbackTrace.lastError).message
    : pageTranslation?.error;
  const paragraphSelectionKey = translatableParagraphs
    .map((para) => para.pid)
    .join("|");
  const selectedPidSet = new Set(selectedPids);
  const selectedParagraphs = translatableParagraphs.filter((para) =>
    selectedPidSet.has(para.pid),
  );

  useEffect(() => {
    setSelectedPids([]);
    selectionAnchorIndexRef.current = null;
  }, [currentPage, paragraphSelectionKey]);

  useEffect(() => {
    if (selectedPids.length === 0) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".pdf-segment-card") ||
        target.closest(".translation-pane-selection-overlay")
      ) {
        return;
      }

      setSelectedPids([]);
      selectionAnchorIndexRef.current = null;
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectedPids.length]);

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return;
      }

      void copyTextToClipboard(trimmedText)
        .then(() => {
          showToast({
            message: `${label} copied.`,
            tone: "success",
            durationMs: 1800,
          });
        })
        .catch(() => {
          showToast({
            message: `Couldn't copy ${label.toLowerCase()}.`,
            detail: "Clipboard access is unavailable right now.",
            tone: "error",
          });
        });
    },
    [showToast],
  );
  const handleSelectPid = useCallback(
    (pid: string, event: React.MouseEvent<HTMLElement>) => {
      const clickedIndex = translatableParagraphs.findIndex(
        (para) => para.pid === pid,
      );

      if (clickedIndex < 0) {
        return;
      }

      const isToggle = event.metaKey || event.ctrlKey;
      const isRange = event.shiftKey;
      const anchorIndex = selectionAnchorIndexRef.current ?? clickedIndex;
      let nextSelected: string[];

      if (isRange) {
        const next = new Set<string>(isToggle ? selectedPids : []);
        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);

        if (!isToggle) {
          next.clear();
        }

        for (let index = start; index <= end; index += 1) {
          next.add(translatableParagraphs[index].pid);
        }

        nextSelected = translatableParagraphs
          .map((para) => para.pid)
          .filter((currentPid) => next.has(currentPid));
      } else if (isToggle) {
        const next = new Set<string>(selectedPids);

        selectionAnchorIndexRef.current = clickedIndex;

        if (next.has(pid)) {
          next.delete(pid);
        } else {
          next.add(pid);
        }

        nextSelected = translatableParagraphs
          .map((para) => para.pid)
          .filter((currentPid) => next.has(currentPid));
      } else {
        selectionAnchorIndexRef.current = clickedIndex;
        nextSelected = [pid];
      }

      if (isRange && selectionAnchorIndexRef.current === null) {
        selectionAnchorIndexRef.current = clickedIndex;
      }

      setSelectedPids(nextSelected);
    },
    [selectedPids, translatableParagraphs],
  );
  const handleCopySelected = useCallback(
    (mode: SelectedCopyMode) => {
      const text = buildSelectedCopyText(selectedParagraphs, mode);

      if (!text) {
        showToast({
          message:
            mode === "translation"
              ? "The selected translation is not ready yet."
              : mode === "original"
                ? "There is no original text to copy."
                : "There is nothing ready to copy in this selection.",
          tone: "neutral",
          durationMs: 2200,
        });
        return;
      }

      const label =
        mode === "translation"
          ? "Selected translation"
          : mode === "original"
            ? "Selected original text"
            : "Selected text";

      handleCopyText(text, label);
    },
    [handleCopyText, selectedParagraphs, showToast],
  );

  return (
    <div className="translation-pane page-translation-pane">
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">Translation</span>
            {pageTranslation?.isCached ? (
              <span
                className="page-translation-cached-indicator"
                aria-label="Cached"
                title="Cached"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
            ) : null}
          </div>
        </div>
        {selectedParagraphs.length > 1 ? (
          <div
            className="translation-pane-selection-overlay"
            role="toolbar"
            aria-label="Copy selected passages"
          >
            <span className="pdf-selection-toolbar-label">Copy selected</span>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("translation")}
            >
              translation
            </button>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("original")}
            >
              original
            </button>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("both")}
            >
              both
            </button>
          </div>
        ) : null}
        <div className="page-translation-actions rail-pane-header-actions">
          <ExpandableIconButton
            type="button"
            onClick={() => onRetryPage(currentPage)}
            disabled={!canRetryPage}
            aria-label="Redo page"
            label="Redo page"
            labelDirection="left"
          >
            <RetryIcon />
          </ExpandableIconButton>
        </div>
      </div>
      <div className="page-translation-scroll">
        <div className="page-translation-shell">
          {pageTranslation?.status === "unavailable" ? (
            <div className="page-translation-empty">
              This page does not contain any usable text yet. Please OCR it
              first, then reopen it in{" "}
              <span className="page-translation-empty-brand">readani</span>.
            </div>
          ) : pageTranslation?.status === "setup-required" || setupRequired ? (
            <TranslationSetupPrompt onOpenSettings={onOpenSettings} />
          ) : pageTranslation?.status === "error" ? (
            <div className="page-translation-error">
              {fallbackAttemptSummary ? <p>{fallbackAttemptSummary}</p> : null}
              <p>{resolvedErrorMessage || "Translation failed for this page."}</p>
              {pageTranslation.errorChecks?.length ? (
                <div className="page-translation-error-checks-wrap">
                  <div className="page-translation-error-checks-label">
                    Possible checks
                  </div>
                  <ul className="page-translation-error-checks">
                    {pageTranslation.errorChecks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                className="btn btn-primary"
                onClick={() => onRetryPage(currentPage)}
              >
                Retry page
              </button>
            </div>
          ) : showSegmentCards ? (
            <div className="pdf-segment-list">
              {alignmentState === "coarse" ? (
                <div className="pdf-segment-alignment-note">
                  Highlights may be approximate on this page.
                </div>
              ) : null}
              {translatableParagraphs.map((para) => (
                <PdfSegmentCard
                  key={para.pid}
                  para={para}
                  isActive={para.pid === activePid || para.pid === hoverPid}
                  isSelected={selectedPidSet.has(para.pid)}
                  onHoverPid={onHoverPid}
                  onSelect={handleSelectPid}
                  onCopyText={handleCopyText}
                />
              ))}
            </div>
          ) : resolvedLoadingMessage ? (
            <div className="page-translation-loading-state">
              <div className="page-translation-spinner" />
              <p className="page-translation-loading-text">
                {resolvedLoadingMessage}
              </p>
            </div>
          ) : (
            <div className="page-translation-empty">
              Translation will appear here when this page is ready.
            </div>
          )}
        </div>
      </div>
      <TranslationPaneFooter
        progressLabel={progressLabel}
        progressDetailLabel={progressDetailLabel}
        progressDetailState={progressDetailState}
        bulkActionLabel={bulkActionLabel}
        onBulkAction={onBulkAction}
        bulkActionDisabled={bulkActionDisabled}
        bulkActionRunning={bulkActionRunning}
        statusMap={statusMap}
        currentPage={currentPage}
        onSeekPage={onSeekPage}
      />

      {selectionTranslation ? (
        <Popover.Root
          open={true}
          onOpenChange={(open) => !open && onClearSelectionTranslation()}
        >
          <Popover.Anchor
            style={{
              position: "fixed",
              left: selectionTranslation.position.x,
              top: selectionTranslation.position.y,
            }}
          />
          <Popover.Portal>
            <Popover.Content
              className="selection-popover"
              sideOffset={8}
              onPointerDownOutside={onClearSelectionTranslation}
              onEscapeKeyDown={onClearSelectionTranslation}
            >
              <div className="selection-popover-source">
                {selectionTranslation.text}
              </div>
              <div className="selection-popover-divider" />
              {selectionTranslation.isLoading ? (
                <div className="selection-popover-loading">Translating...</div>
              ) : selectionTranslation.error ? (
                <div className="selection-popover-error">
                  {selectionTranslation.error}
                </div>
              ) : (
                <div className="selection-popover-translation">
                  {selectionTranslation.translation}
                </div>
              )}
              <Popover.Arrow className="word-popover-arrow" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}

function EpubTranslationPane({
  pages,
  currentPage,
  setupRequired = false,
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning,
  onOpenSettings,
  activePid,
  hoverPid,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
  wordTranslation,
  onClearWordTranslation,
  scrollToPage,
  statusMap,
  onSeekPage,
}: Omit<EpubTranslationPaneProps, "mode">) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const lastHandledScrollPageRef = useRef<number | null>(null);

  useEffect(() => {
    if (!scrollToPage) {
      lastHandledScrollPageRef.current = null;
      return;
    }
    if (lastHandledScrollPageRef.current === scrollToPage || pages.length === 0)
      return;
    const index = pages.findIndex((page) => page.page === scrollToPage);
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: "start",
        behavior: "smooth",
      });
      lastHandledScrollPageRef.current = scrollToPage;
    }
  }, [pages, scrollToPage]);

  return (
    <div className="translation-pane">
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">Translation</span>
          </div>
        </div>
      </div>
      {setupRequired ? (
        <TranslationSetupPrompt onOpenSettings={onOpenSettings} />
      ) : null}
      <Virtuoso
        ref={virtuosoRef}
        style={{ flex: 1, minHeight: 0 }}
        totalCount={pages.length}
        itemContent={(index) => (
          <EpubPageTranslation
            page={pages[index]}
            activePid={activePid}
            hoverPid={hoverPid}
            onHoverPid={onHoverPid}
            onTranslatePid={onTranslatePid}
            onLocatePid={onLocatePid}
            onTranslateText={onTranslateText}
          />
        )}
      />
      <TranslationPaneFooter
        progressLabel={progressLabel}
        progressDetailLabel={progressDetailLabel}
        progressDetailState={progressDetailState}
        bulkActionLabel={bulkActionLabel}
        onBulkAction={onBulkAction}
        bulkActionDisabled={bulkActionDisabled}
        bulkActionRunning={bulkActionRunning}
        statusMap={statusMap}
        currentPage={currentPage}
        onSeekPage={onSeekPage}
      />
      {wordTranslation ? (
        <Popover.Root
          open={true}
          onOpenChange={(open) => !open && onClearWordTranslation()}
        >
          <Popover.Anchor
            style={{
              position: "fixed",
              left: wordTranslation.position.x,
              top: wordTranslation.position.y,
            }}
          />
          <Popover.Portal>
            <Popover.Content
              className="word-popover"
              sideOffset={8}
              onPointerDownOutside={() => onClearWordTranslation()}
              onEscapeKeyDown={() => onClearWordTranslation()}
            >
              <div className="word-popover-header">
                <div className="word-popover-word">{wordTranslation.word}</div>
              </div>
              {wordTranslation.phonetic ? (
                <div className="word-popover-phonetic">
                  <span className="phonetic-label">UK</span>
                  <span className="phonetic-text">
                    {wordTranslation.phonetic}
                  </span>
                </div>
              ) : null}
              {wordTranslation.isLoading ? (
                <div className="word-popover-loading">Looking up...</div>
              ) : (
                <div className="word-popover-definitions">
                  {wordTranslation.definitions.map((definition, index) => (
                    <div key={index} className="word-definition">
                      {definition.pos ? (
                        <span className="word-pos">{definition.pos}</span>
                      ) : null}
                      <span className="word-meanings">
                        {definition.meanings}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Popover.Arrow className="word-popover-arrow" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}

export function TranslationPane(props: TranslationPaneProps) {
  if (props.mode === "pdf") {
    return (
      <PdfTranslationPane
        currentPage={props.currentPage}
        page={props.page}
        pageTranslation={props.pageTranslation}
        loadingMessage={props.loadingMessage}
        setupRequired={props.setupRequired}
        progressLabel={props.progressLabel}
        progressDetailLabel={props.progressDetailLabel}
        progressDetailState={props.progressDetailState}
        bulkActionLabel={props.bulkActionLabel}
        onBulkAction={props.onBulkAction}
        bulkActionDisabled={props.bulkActionDisabled}
        bulkActionRunning={props.bulkActionRunning}
        onOpenSettings={props.onOpenSettings}
        onRetryPage={props.onRetryPage}
        canRetryPage={props.canRetryPage}
        activePid={props.activePid}
        hoverPid={props.hoverPid}
        onHoverPid={props.onHoverPid}
        onLocatePid={props.onLocatePid}
        selectionTranslation={props.selectionTranslation}
        onClearSelectionTranslation={props.onClearSelectionTranslation}
        statusMap={props.statusMap}
        onSeekPage={props.onSeekPage}
      />
    );
  }

  return (
    <EpubTranslationPane
      pages={props.pages}
      currentPage={props.currentPage}
      setupRequired={props.setupRequired}
      progressLabel={props.progressLabel}
      progressDetailLabel={props.progressDetailLabel}
      progressDetailState={props.progressDetailState}
      bulkActionLabel={props.bulkActionLabel}
      onBulkAction={props.onBulkAction}
      bulkActionDisabled={props.bulkActionDisabled}
      bulkActionRunning={props.bulkActionRunning}
      onOpenSettings={props.onOpenSettings}
      activePid={props.activePid}
      hoverPid={props.hoverPid}
      onHoverPid={props.onHoverPid}
      onTranslatePid={props.onTranslatePid}
      onLocatePid={props.onLocatePid}
      onTranslateText={props.onTranslateText}
      wordTranslation={props.wordTranslation}
      onClearWordTranslation={props.onClearWordTranslation}
      scrollToPage={props.scrollToPage}
      statusMap={props.statusMap}
      onSeekPage={props.onSeekPage}
    />
  );
}
