import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { decideEdgePageTurn, type PdfPageTurnDirection } from "../lib/pdfNavigation";
import { clampPage } from "../lib/pageQueue";
import {
  PDF_VIEWER_PADDING,
  clampPdfManualScale,
  getPdfZoomPresetValue,
  resolvePdfScale,
  type PdfZoomMode,
} from "../lib/readerLayout";
import { DocumentStatusSurface } from "./document/DocumentStatusSurface";
import { PdfPage } from "./PdfPage";
import { PageNavigationToolbar } from "./reader/PageNavigationToolbar";

const PDF_ZOOM_SLIDER_MIN = 0.5;
const PDF_ZOOM_SLIDER_MAX = 2.5;
const PDF_ZOOM_SLIDER_STEP = 0.05;

type PdfViewerProps = {
  pdfDoc: PDFDocumentProxy;
  pageSizes: { width: number; height: number }[];
  currentPage: number;
  zoomMode: PdfZoomMode;
  manualScale: number;
  scrollAnchor: "top" | "bottom";
  onNavigateToPage: (page: number) => void;
  onRequestPageChange: (direction: PdfPageTurnDirection) => void;
  onZoomModeChange: (mode: PdfZoomMode) => void;
  onManualScaleChange: (scale: number) => void;
  onResolvedScaleChange: (scale: number) => void;
  defaultZoomPopoverOpen?: boolean;
  overlayStatusMessage?: string | null;
  overlayProgress?: number | null;
  onSelectionText: (selection: { text: string; position: { x: number; y: number } }) => void;
  onClearSelection: () => void;
};

function ZoomIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      <path d="M11 8v6M8 11h6" strokeLinecap="round" />
    </svg>
  );
}

export function PdfViewer({
  pdfDoc,
  pageSizes,
  currentPage,
  zoomMode,
  manualScale,
  scrollAnchor,
  onNavigateToPage,
  onRequestPageChange,
  onZoomModeChange,
  onManualScaleChange,
  onResolvedScaleChange,
  defaultZoomPopoverOpen = false,
  overlayStatusMessage,
  overlayProgress,
  onSelectionText,
  onClearSelection,
}: PdfViewerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const zoomDockRef = useRef<HTMLDivElement | null>(null);
  const lastPageTurnAtRef = useRef(0);
  const zoomPopoverCloseTimeoutRef = useRef<number | null>(null);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [pageInputValue, setPageInputValue] = useState(String(currentPage));
  const [isZoomPopoverOpen, setIsZoomPopoverOpen] = useState(defaultZoomPopoverOpen);
  const pageSize = pageSizes[currentPage - 1];

  const effectiveScale = useMemo(() => {
    if (!pageSize) {
      return 1;
    }

    return resolvePdfScale({
      mode: zoomMode,
      manualScale,
      containerWidth: viewerSize.width,
      containerHeight: viewerSize.height,
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
      padding: PDF_VIEWER_PADDING,
    });
  }, [manualScale, pageSize, viewerSize.height, viewerSize.width, zoomMode]);

  const selectedZoomOption = useMemo(
    () => getPdfZoomPresetValue(zoomMode, manualScale),
    [manualScale, zoomMode]
  );

  const displayedZoomPercent = Math.round(effectiveScale * 100);
  const sliderValue = clampPdfManualScale(zoomMode === "custom" ? manualScale : effectiveScale);

  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const updateViewerSize = () => {
      const nextSize = {
        width: Math.round(scroller.clientWidth),
        height: Math.round(scroller.clientHeight),
      };

      setViewerSize((prev) =>
        prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
      );
    };

    updateViewerSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewerSize);
      return () => window.removeEventListener("resize", updateViewerSize);
    }

    const observer = new ResizeObserver(updateViewerSize);
    observer.observe(scroller);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onResolvedScaleChange(effectiveScale);
  }, [effectiveScale, onResolvedScaleChange]);

  useEffect(() => {
    return () => {
      if (zoomPopoverCloseTimeoutRef.current !== null) {
        window.clearTimeout(zoomPopoverCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const targetTop = scrollAnchor === "bottom" ? scroller.scrollHeight : 0;
    scroller.scrollTo({ top: targetTop, left: 0, behavior: "auto" });

    const frameId = window.requestAnimationFrame(() => {
      const nextTop = scrollAnchor === "bottom" ? scroller.scrollHeight : 0;
      scroller.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentPage, scrollAnchor]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const direction = decideEdgePageTurn({
      deltaY: event.deltaY,
      scrollTop: scroller.scrollTop,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
    });

    if (!direction) {
      return;
    }

    const now = Date.now();
    if (now - lastPageTurnAtRef.current < 250) {
      return;
    }

    lastPageTurnAtRef.current = now;
    event.preventDefault();
    onRequestPageChange(direction);
  };

  const commitPageInput = useCallback(() => {
    if (pageSizes.length === 0) {
      setPageInputValue(String(currentPage));
      return;
    }

    const parsedPage = Number.parseInt(pageInputValue, 10);
    if (Number.isNaN(parsedPage)) {
      setPageInputValue(String(currentPage));
      return;
    }

    const nextPage = clampPage(parsedPage, pageSizes.length);
    setPageInputValue(String(nextPage));

    if (nextPage !== currentPage) {
      onNavigateToPage(nextPage);
    }
  }, [currentPage, onNavigateToPage, pageInputValue, pageSizes.length]);

  const handlePageInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const digitsOnlyValue = event.target.value.replace(/\D+/g, "");
    setPageInputValue(digitsOnlyValue);
  }, []);

  const handlePageInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        commitPageInput();
        event.currentTarget.blur();
        return;
      }

      if (event.key === "Escape") {
        setPageInputValue(String(currentPage));
        event.currentTarget.blur();
      }
    },
    [commitPageInput, currentPage]
  );

  const clearZoomPopoverCloseTimer = useCallback(() => {
    if (zoomPopoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(zoomPopoverCloseTimeoutRef.current);
      zoomPopoverCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleZoomPopoverClose = useCallback(() => {
    clearZoomPopoverCloseTimer();
    zoomPopoverCloseTimeoutRef.current = window.setTimeout(() => {
      setIsZoomPopoverOpen(false);
      zoomPopoverCloseTimeoutRef.current = null;
    }, 220);
  }, [clearZoomPopoverCloseTimer]);

  useEffect(() => {
    if (!isZoomPopoverOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!zoomDockRef.current?.contains(event.target as Node)) {
        clearZoomPopoverCloseTimer();
        setIsZoomPopoverOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearZoomPopoverCloseTimer();
        setIsZoomPopoverOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearZoomPopoverCloseTimer, isZoomPopoverOpen]);

  const handleZoomOptionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;

      if (value === "fit-width" || value === "fit-height") {
        onZoomModeChange(value);
      } else if (value === "100") {
        onManualScaleChange(1);
      } else if (value === "150") {
        onManualScaleChange(1.5);
      }
    },
    [onManualScaleChange, onZoomModeChange]
  );

  const handleZoomSliderChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onManualScaleChange(Number(event.target.value));
    },
    [onManualScaleChange]
  );

  if (!pageSize) {
    return <div className="empty-state">Loading page...</div>;
  }

  return (
    <div className="pdf-reader-main">
      <PageNavigationToolbar
        previousLabel="Previous page"
        nextLabel="Next page"
        previousDisabled={currentPage <= 1}
        nextDisabled={currentPage >= pageSizes.length}
        onPrevious={() => onNavigateToPage(currentPage - 1)}
        onNext={() => onNavigateToPage(currentPage + 1)}
      >
        <label className="pdf-page-jump">
          <span className="pdf-page-jump-label">Page</span>
          <input
            className="pdf-page-input"
            type="text"
            inputMode="numeric"
            value={pageInputValue}
            onChange={handlePageInputChange}
            onBlur={commitPageInput}
            onKeyDown={handlePageInputKeyDown}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Current page"
          />
          <span className="pdf-page-jump-total">of {pageSizes.length}</span>
        </label>
      </PageNavigationToolbar>

      <div className="pdf-viewer-shell document-viewer-shell">
        <div ref={scrollerRef} className="pdf-viewer" onWheel={handleWheel}>
          <div className="pdf-page-wrapper">
            <PdfPage
              pdfDoc={pdfDoc}
              pageNumber={currentPage}
              scale={effectiveScale}
              baseWidth={pageSize.width}
              baseHeight={pageSize.height}
              onSelectionText={onSelectionText}
              onClearSelection={onClearSelection}
            />
          </div>
        </div>
        {overlayStatusMessage ? (
          <div className="document-status-dock">
            <DocumentStatusSurface
              message={overlayStatusMessage}
              progress={overlayProgress}
              variant="overlay"
            />
          </div>
        ) : null}
        <div
          ref={zoomDockRef}
          className="pdf-zoom-dock document-zoom-dock"
          onPointerEnter={clearZoomPopoverCloseTimer}
          onPointerLeave={() => {
            if (isZoomPopoverOpen) {
              scheduleZoomPopoverClose();
            }
          }}
        >
          {isZoomPopoverOpen ? (
            <div className="pdf-zoom-expanded pdf-zoom-panel">
              <select
                className="pdf-zoom-mode-select"
                value={selectedZoomOption || ""}
                onChange={handleZoomOptionChange}
                aria-label="Zoom preset"
              >
                <option value="">Custom</option>
                <option value="fit-width">Fit width</option>
                <option value="fit-height">Fit height</option>
                <option value="100">100%</option>
                <option value="150">150%</option>
              </select>
              <input
                className="pdf-zoom-slider"
                type="range"
                min={PDF_ZOOM_SLIDER_MIN}
                max={PDF_ZOOM_SLIDER_MAX}
                step={PDF_ZOOM_SLIDER_STEP}
                value={sliderValue}
                onChange={handleZoomSliderChange}
                aria-label="PDF zoom"
              />
              <div className="pdf-zoom-readout">{displayedZoomPercent}%</div>
            </div>
          ) : (
            <button
              type="button"
              className="btn pdf-zoom-trigger"
              aria-label="Open zoom controls"
              title="Zoom controls"
              aria-expanded={false}
              onClick={() => {
                clearZoomPopoverCloseTimer();
                setIsZoomPopoverOpen(true);
              }}
            >
              <ZoomIcon />
              <span>{displayedZoomPercent}%</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
