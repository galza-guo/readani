import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import * as Popover from "@radix-ui/react-popover";
import { getNextRevealText } from "../lib/typewriter";
import type {
  PageDoc,
  PageTranslationState,
  Paragraph,
  SelectionTranslation,
  WordTranslation,
} from "../types";

type PdfTranslationPaneProps = {
  mode: "pdf";
  currentPage: number;
  pageTranslation?: PageTranslationState;
  onRetryPage: (page: number) => void;
  canRetryPage: boolean;
  selectionTranslation: SelectionTranslation | null;
  onClearSelectionTranslation: () => void;
};

type EpubTranslationPaneProps = {
  mode: "epub";
  pages: PageDoc[];
  currentPage: number;
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

      if (selectedText && selectedText.length > 0 && selectedText.length < 200) {
        event.stopPropagation();
        onTranslateText(selectedText, { x: event.clientX, y: event.clientY });
      }
    },
    [onTranslateText]
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

function PdfTranslationPane({
  currentPage,
  pageTranslation,
  onRetryPage,
  canRetryPage,
  selectionTranslation,
  onClearSelectionTranslation,
}: Omit<PdfTranslationPaneProps, "mode">) {
  const [revealedText, setRevealedText] = useState("");

  useEffect(() => {
    const fullText = pageTranslation?.translatedText ?? "";

    if (pageTranslation?.status !== "done" || !fullText) {
      setRevealedText("");
      return;
    }

    if (pageTranslation.isCached) {
      setRevealedText(fullText);
      return;
    }

    setRevealedText("");
    const intervalId = window.setInterval(() => {
      setRevealedText((current) => {
        const next = getNextRevealText(current, fullText, 24);
        if (next === fullText) {
          window.clearInterval(intervalId);
        }
        return next;
      });
    }, 18);

    return () => window.clearInterval(intervalId);
  }, [
    pageTranslation?.isCached,
    pageTranslation?.page,
    pageTranslation?.status,
    pageTranslation?.translatedText,
  ]);

  return (
    <div className="translation-pane page-translation-pane">
      <div className="page-translation-shell">
        <div className="page-translation-header">
          <div className="page-translation-header-main">
            <span className="page-translation-label">Page {currentPage}</span>
            {pageTranslation?.isCached ? (
              <span className="page-translation-badge">Cached</span>
            ) : null}
          </div>
          <div className="page-translation-actions">
            <button
              className="btn btn-ghost btn-icon-only"
              type="button"
              onClick={() => onRetryPage(currentPage)}
              disabled={!canRetryPage}
              aria-label="Redo page translation"
              title="Redo page"
            >
              <RetryIcon />
            </button>
          </div>
        </div>

        {pageTranslation?.status === "unavailable" ? (
          <div className="page-translation-empty">
            This PDF does not contain usable text yet. Please OCR it first, then
            reopen it in Readany.
          </div>
        ) : pageTranslation?.status === "error" ? (
          <div className="page-translation-error">
            <p>{pageTranslation.error || "Translation failed for this page."}</p>
            <button className="btn btn-primary" onClick={() => onRetryPage(currentPage)}>
              Retry page
            </button>
          </div>
        ) : pageTranslation?.status === "done" ? (
          <div className="page-translation-content">{revealedText}</div>
        ) : (
          <div className="page-translation-loading">
            <div className="page-translation-spinner" />
            <p>Translating this page...</p>
          </div>
        )}
      </div>

      {selectionTranslation ? (
        <Popover.Root open={true} onOpenChange={(open) => !open && onClearSelectionTranslation()}>
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
              <div className="selection-popover-source">{selectionTranslation.text}</div>
              <div className="selection-popover-divider" />
              {selectionTranslation.isLoading ? (
                <div className="selection-popover-loading">Translating...</div>
              ) : selectionTranslation.error ? (
                <div className="selection-popover-error">{selectionTranslation.error}</div>
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
    if (lastHandledScrollPageRef.current === scrollToPage || pages.length === 0) return;
    const index = pages.findIndex((page) => page.page === scrollToPage);
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({ index, align: "start", behavior: "smooth" });
      lastHandledScrollPageRef.current = scrollToPage;
    }
  }, [pages, scrollToPage]);

  return (
    <div className="translation-pane">
      <div className="translation-pane-header">
        <div className="page-translation-header-main">
          <span className="page-translation-label">Translation</span>
          <span className="translation-pane-page">Page {currentPage}</span>
        </div>
      </div>
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
      {wordTranslation ? (
        <Popover.Root open={true} onOpenChange={(open) => !open && onClearWordTranslation()}>
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
                  <span className="phonetic-text">{wordTranslation.phonetic}</span>
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
                      <span className="word-meanings">{definition.meanings}</span>
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
        pageTranslation={props.pageTranslation}
        onRetryPage={props.onRetryPage}
        canRetryPage={props.canRetryPage}
        selectionTranslation={props.selectionTranslation}
        onClearSelectionTranslation={props.onClearSelectionTranslation}
      />
    );
  }

  return (
    <EpubTranslationPane
      pages={props.pages}
      currentPage={props.currentPage}
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
