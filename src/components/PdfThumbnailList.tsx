import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Virtuoso } from "react-virtuoso";

const THUMBNAIL_WIDTH = 132;
const THUMBNAIL_CACHE_LIMIT = 48;

function isCancelledRenderError(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

type PdfThumbnailListProps = {
  docId: string;
  pdfDoc: PDFDocumentProxy;
  pageSizes: { width: number; height: number }[];
  currentPage: number;
  onNavigate: (page: number) => void;
};

type PdfThumbnailItemProps = {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  pageSize?: { width: number; height: number };
  isActive: boolean;
  cachedThumbnail?: string;
  onThumbnailReady: (pageNumber: number, dataUrl: string) => void;
  onNavigate: (page: number) => void;
};

function PdfThumbnailItem({
  pdfDoc,
  pageNumber,
  pageSize,
  isActive,
  cachedThumbnail,
  onThumbnailReady,
  onNavigate,
}: PdfThumbnailItemProps) {
  useEffect(() => {
    if (cachedThumbnail) {
      return;
    }

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderThumbnail() {
      let page = null;

      try {
        page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_WIDTH / viewport.width;
        const thumbnailViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          return;
        }

        canvas.width = thumbnailViewport.width;
        canvas.height = thumbnailViewport.height;

        renderTask = page.render({ canvasContext: context, viewport: thumbnailViewport });
        await renderTask.promise;

        if (!cancelled) {
          onThumbnailReady(pageNumber, canvas.toDataURL("image/jpeg", 0.72));
        }
      } finally {
        try {
          page?.cleanup();
        } catch {
          // Ignore cleanup failures during thumbnail teardown.
        }
      }
    }

    renderThumbnail().catch((error) => {
      if (!cancelled && !isCancelledRenderError(error)) {
        console.error(`Failed to render PDF thumbnail for page ${pageNumber}:`, error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [cachedThumbnail, onThumbnailReady, pageNumber, pdfDoc]);

  const aspectRatio = pageSize ? `${pageSize.width} / ${pageSize.height}` : "0.72";

  return (
    <button
      type="button"
      className={`pdf-thumbnail-card ${isActive ? "is-active" : ""}`}
      onClick={() => onNavigate(pageNumber)}
    >
      <div className="pdf-thumbnail-preview" style={{ aspectRatio }}>
        {cachedThumbnail ? (
          <img
            src={cachedThumbnail}
            alt={`Thumbnail for page ${pageNumber}`}
            className="pdf-thumbnail-image"
          />
        ) : (
          <div className="pdf-thumbnail-skeleton" />
        )}
      </div>
      <span className="pdf-thumbnail-label">Page {pageNumber}</span>
    </button>
  );
}

export function PdfThumbnailList({
  docId,
  pdfDoc,
  pageSizes,
  currentPage,
  onNavigate,
}: PdfThumbnailListProps) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const thumbnailCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    thumbnailCacheRef.current = new Map();
    setThumbnailUrls({});
  }, [docId]);

  const totalPages = pageSizes.length;
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages]);

  const handleThumbnailReady = useCallback((pageNumber: number, dataUrl: string) => {
    const nextCache = new Map(thumbnailCacheRef.current);
    if (nextCache.get(pageNumber) === dataUrl) {
      return;
    }

    nextCache.delete(pageNumber);
    nextCache.set(pageNumber, dataUrl);

    while (nextCache.size > THUMBNAIL_CACHE_LIMIT) {
      const oldestPage = nextCache.keys().next().value;
      if (oldestPage === undefined) {
        break;
      }
      nextCache.delete(oldestPage);
    }

    thumbnailCacheRef.current = nextCache;
    setThumbnailUrls(Object.fromEntries(nextCache));
  }, []);

  return (
    <Virtuoso
      className="pdf-thumbnail-list"
      style={{ height: "100%" }}
      totalCount={pageNumbers.length}
      overscan={400}
      itemContent={(index) => {
        const pageNumber = pageNumbers[index];
        return (
          <div className="pdf-thumbnail-row">
            <PdfThumbnailItem
              pdfDoc={pdfDoc}
              pageNumber={pageNumber}
              pageSize={pageSizes[pageNumber - 1]}
              isActive={pageNumber === currentPage}
              cachedThumbnail={thumbnailUrls[pageNumber]}
              onThumbnailReady={handleThumbnailReady}
              onNavigate={onNavigate}
            />
          </div>
        );
      }}
    />
  );
}
