import { useCallback, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizeSelectionText } from "../lib/pageText";

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
  onSelectionText: (selection: { text: string; position: { x: number; y: number } }) => void;
  onClearSelection: () => void;
};

export function PdfPage({
  pdfDoc,
  pageNumber,
  scale,
  baseWidth,
  baseHeight,
  onSelectionText,
  onClearSelection,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      let page = null;

      try {
        page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });

        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d");
          if (!context) return;

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          renderTask = page.render({ canvasContext: context, viewport });
          await renderTask.promise;
        }

        if (cancelled || !textLayerRef.current) {
          return;
        }

        const { TextLayerBuilder } = await import("pdfjs-dist/web/pdf_viewer.mjs");
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

  return (
    <div
      className="pdf-page"
      style={{ width: baseWidth * scale, height: baseHeight * scale }}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="pdf-text-layer" />
    </div>
  );
}
