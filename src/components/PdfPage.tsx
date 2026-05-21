import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Paragraph } from "../types";
import {
  loadPdfPageViewport,
  renderPdfPageToScratchCanvas,
  syncCanvasToViewport,
} from "../lib/pdfPageRender";

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
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pdfDoc, pageNumber, scale]);

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
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
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
