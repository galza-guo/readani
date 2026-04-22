import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import * as Popover from "@radix-ui/react-popover";
import {
  getPdfAlignmentState,
  getTranslatablePdfParagraphs,
} from "../lib/pdfSegments";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import type {
  PageDoc,
  PageTranslationState,
  Paragraph,
  SelectionTranslation,
  WordTranslation,
} from "../types";

type TranslationPaneChromeProps = {
  statusMessage?: string | null;
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
};

type PdfTranslationPaneProps = {
  mode: "pdf";
  currentPage: number;
  page?: PageDoc;
  pageTranslation?: PageTranslationState;
  loadingMessage?: string | null;
  setupRequired?: boolean;
  statusMessage?: string | null;
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
};

type EpubTranslationPaneProps = {
  mode: "epub";
  pages: PageDoc[];
  currentPage: number;
  setupRequired?: boolean;
  statusMessage?: string | null;
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
};

type TranslationPaneProps = PdfTranslationPaneProps | EpubTranslationPaneProps;

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

function OriginalIcon({ revealed }: { revealed: boolean }) {
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
      {revealed ? (
        <>
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 0-1.1.27-2.16.77-3.09" />
          <path d="M1 1l22 22" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c5 0 9.27 3.11 11 8a10.96 10.96 0 0 1-4.08 5.4" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        </>
      ) : (
        <>
          <path d="M2.06 12C3.79 7.11 8.06 4 13.06 4s9.27 3.11 11 8c-1.73 4.89-6 8-11 8s-9.27-3.11-11-8z" />
          <circle cx="13.06" cy="12" r="3" />
        </>
      )}
    </svg>
  );
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
  pageNum,
  isActive,
  onHoverPid,
  onLocatePid,
}: {
  para: Paragraph;
  pageNum: number;
  isActive: boolean;
  onHoverPid: (pid: string | null) => void;
  onLocatePid: (pid: string, page: number) => void;
}) {
  const [sourceRevealed, setSourceRevealed] = useState(false);
  const canLocate = para.rects.length > 0;

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
      className={`pdf-segment-card ${isActive ? "is-active" : ""}`}
      onMouseEnter={() => onHoverPid(para.pid)}
      onMouseLeave={() => onHoverPid(null)}
    >
      <div className="pdf-segment-card-actions">
        <button
          className="action-btn"
          type="button"
          onClick={() => setSourceRevealed((current) => !current)}
          title={sourceRevealed ? "Hide original text" : "Show original text"}
          aria-label={sourceRevealed ? "Hide original text" : "Show original text"}
        >
          <OriginalIcon revealed={sourceRevealed} />
        </button>
        <button
          className="action-btn"
          type="button"
          onClick={() => onLocatePid(para.pid, pageNum)}
          title={
            canLocate
              ? "Locate in document"
              : "Precise PDF location unavailable"
          }
          aria-label={
            canLocate
              ? "Locate in document"
              : "Precise PDF location unavailable"
          }
          disabled={!canLocate}
        >
          <LocateIcon />
        </button>
      </div>
      <div className="pdf-segment-translation">{translationText}</div>
      {sourceRevealed ? (
        <div className="pdf-segment-source-wrap">
          <div className="pdf-segment-source-label">Original</div>
          <div className="pdf-segment-source">{para.source}</div>
        </div>
      ) : null}
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

function TranslationPaneFooter({
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning,
}: TranslationPaneChromeProps) {
  return (
    <div className="translation-pane-footer">
      <div className="translation-pane-footer-meta">
        {progressLabel ? (
          <span
            className={`translation-pane-progress-text ${
              bulkActionRunning ? "is-active" : ""
            }`}
          >
            {progressLabel}
          </span>
        ) : null}
        {progressLabel && progressDetailLabel ? (
          <span
            className="translation-pane-progress-separator"
            aria-hidden="true"
          >
            ·
          </span>
        ) : null}
        {progressDetailLabel ? (
          <span
            className={`translation-pane-progress-detail ${
              progressDetailState
                ? `is-${progressDetailState}`
                : ""
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
  statusMessage,
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
  onLocatePid,
  selectionTranslation,
  onClearSelectionTranslation,
}: Omit<PdfTranslationPaneProps, "mode">) {
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
          {statusMessage ? (
            <div
              className="translation-pane-status rail-pane-meta"
              aria-live="polite"
            >
              {statusMessage}
            </div>
          ) : null}
        </div>
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
              <p>
                {pageTranslation.error || "Translation failed for this page."}
              </p>
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
                  pageNum={currentPage}
                  isActive={para.pid === activePid || para.pid === hoverPid}
                  onHoverPid={onHoverPid}
                  onLocatePid={onLocatePid}
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
  currentPage: _currentPage,
  setupRequired = false,
  statusMessage,
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
          {statusMessage ? (
            <div
              className="translation-pane-status rail-pane-meta"
              aria-live="polite"
            >
              {statusMessage}
            </div>
          ) : null}
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
        statusMessage={props.statusMessage}
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
      />
    );
  }

  return (
    <EpubTranslationPane
      pages={props.pages}
      currentPage={props.currentPage}
      setupRequired={props.setupRequired}
      statusMessage={props.statusMessage}
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
    />
  );
}
