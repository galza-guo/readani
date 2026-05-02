import { useCallback, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizeSelectionText } from "../lib/pageText";
import type { Paragraph } from "../types";
import {
  loadPdfPageViewport,
  renderPdfPageToScratchCanvas,
  syncCanvasToViewport,
} from "../lib/pdfPageRender";

const TEXT_LAYER_CLASS = "pdf-text-layer";

function isCancelledRenderError(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

type PdfPageProps = {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  baseWidth: number;
  baseHeight: number;
  paragraphs: Paragraph[];
  highlightPid?: string | null;
  savedHighlightPids?: string[];
  onSelectionText: (selection: {
    text: string;
    position: { x: number; y: number };
  }) => void;
  onClearSelection: () => void;
};

export function PdfPage({
  pdfDoc,
  pageNumber,
  scale,
  baseWidth,
  baseHeight,
  paragraphs,
  highlightPid,
  savedHighlightPids,
  onSelectionText,
  onClearSelection,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null =
      null;

    async function renderPage() {
      let page = null;

      try {
        const loadedPage = await loadPdfPageViewport({
          loadPage: (targetPageNumber) => pdfDoc.getPage(targetPageNumber),
          pageNumber,
          scale,
          isCancelled: () => cancelled,
        });

        if (!loadedPage) {
          return;
        }

        page = loadedPage.page;
        const { viewport } = loadedPage;

        if (canvasRef.current) {
          syncCanvasToViewport({
            canvas: canvasRef.current,
            viewport,
          });
        }

        const scratchCanvas = await renderPdfPageToScratchCanvas({
          page,
          viewport,
          renderPage: (currentPage, options) =>
            currentPage.render(options as any),
          createCanvas: () => document.createElement("canvas"),
          isCancelled: () => cancelled,
          onRenderTaskCreated: (task) => {
            renderTask = task;
          },
        });

        if (!scratchCanvas || !canvasRef.current) {
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }

        syncCanvasToViewport({
          canvas,
          viewport,
        });
        context.drawImage(scratchCanvas, 0, 0);

        if (cancelled || !textLayerRef.current) {
          return;
        }

        const { TextLayerBuilder } =
          await import("pdfjs-dist/web/pdf_viewer.mjs");
        const container = textLayerRef.current;
        container.replaceChildren();
        container.classList.add(TEXT_LAYER_CLASS);
        const textLayer = new TextLayerBuilder({ pdfPage: page });
        textLayer.div.classList.add("pdf-text-layer-inner");
        await textLayer.render(viewport);
        if (cancelled) return;
        container.appendChild(textLayer.div);
      } catch (error) {
        if (!cancelled && !isCancelledRenderError(error)) {
          console.error(`Failed to render PDF page ${pageNumber}:`, error);
        }
      } finally {
        try {
          page?.cleanup();
        } catch {
          // Ignore cleanup failures during page teardown.
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerRef.current?.replaceChildren();
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const text = normalizeSelectionText(selection?.toString() ?? "");

    if (!selection || selection.rangeCount === 0 || !text) {
      onClearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!textLayerRef.current?.contains(range.commonAncestorContainer)) {
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      onClearSelection();
      return;
    }

    onSelectionText({
      text,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      },
    });
  }, [onClearSelection, onSelectionText]);

  const highlightRects = highlightPid
    ? paragraphs
        .filter((paragraph) => paragraph.pid === highlightPid)
        .flatMap((paragraph) => paragraph.rects)
    : [];

  const savedRects =
    (savedHighlightPids?.length ?? 0) > 0
      ? paragraphs
          .filter(
            (p) =>
              savedHighlightPids!.includes(p.pid) && p.pid !== highlightPid,
          )
          .flatMap((p) => p.rects)
      : [];

  return (
    <div
      className="pdf-page"
      style={{ width: baseWidth * scale, height: baseHeight * scale }}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="pdf-text-layer" />
      <div className="pdf-overlay">
        {highlightRects.map((rect, index) =>
          (() => {
            const markerSize = Math.max(
              10,
              Math.min(18, Math.round(Math.min(rect.w, rect.h) * scale)),
            );
            const markerRadius = markerSize / 2;

            return (
              <div
                key={`${rect.page}-${rect.x}-${rect.y}-${index}`}
                className="pdf-highlight"
                style={{
                  left: Math.max(0, rect.x * scale - markerRadius),
                  top: Math.max(
                    0,
                    rect.y * scale + (rect.h * scale) / 2 - markerRadius,
                  ),
                  width: markerSize,
                  height: markerSize,
                }}
              />
            );
          })(),
        )}
        {savedRects.map((rect, index) => (
          <div
            key={`saved-${rect.page}-${rect.x}-${rect.y}-${index}`}
            className="pdf-highlight-saved"
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.w * scale,
              height: rect.h * scale,
            }}
          />
        ))}
      </div>
    </div>
  );
}
