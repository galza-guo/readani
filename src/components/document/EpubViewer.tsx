import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import ePub from "epubjs";
import type { Book, NavItem, Rendition } from "epubjs";

export type EpubParagraph = {
  pid: string;
  source: string;
  translation?: string;
  status: "idle" | "loading" | "done" | "error";
  href?: string; // Store the spine item href for navigation
  sectionTitle?: string; // Chapter/section title for display
};

type EpubViewerProps = {
  fileData: Uint8Array;
  onMetadata: (metadata: { title: string; author?: string; coverImage?: string }) => void;
  onParagraphsExtracted: (paragraphs: EpubParagraph[]) => void;
  onCurrentPageChange: (page: number, total: number) => void;
  onTocChange?: (toc: NavItem[]) => void;
  onCurrentChapterChange?: (chapter: string) => void;
  onLoadingProgress?: (progress: number | null) => void;
  onHrefChange?: (href: string) => void;
  scale: number;
};

export type EpubViewerHandle = {
  navigateTo: (pid: string) => void;
  navigateToHref: (href: string) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
};

export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(function EpubViewer({
  fileData,
  onMetadata,
  onParagraphsExtracted,
  onCurrentPageChange,
  onTocChange,
  onCurrentChapterChange,
  onLoadingProgress,
  onHrefChange,
  scale,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocRef = useRef<NavItem[]>([]);
  const paragraphMapRef = useRef<Map<string, string>>(new Map()); // pid -> href
  const paragraphSourceRef = useRef<Map<string, string>>(new Map()); // pid -> source text
  const [loading, setLoading] = useState(true);

  // Store callbacks in refs to avoid dependency issues
  const onMetadataRef = useRef(onMetadata);
  const onParagraphsExtractedRef = useRef(onParagraphsExtracted);
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  const onTocChangeRef = useRef(onTocChange);
  const onCurrentChapterChangeRef = useRef(onCurrentChapterChange);
  const onLoadingProgressRef = useRef(onLoadingProgress);
  const onHrefChangeRef = useRef(onHrefChange);

  const normalizeHref = useCallback((href: string) => href.split("#")[0], []);

  const matchesHref = useCallback(
    (locationHref: string, tocHref: string) => {
      const normalizedLocation = normalizeHref(locationHref);
      const normalizedToc = normalizeHref(tocHref);
      return (
        normalizedLocation === normalizedToc ||
        normalizedLocation.endsWith(normalizedToc) ||
        normalizedToc.endsWith(normalizedLocation)
      );
    },
    [normalizeHref]
  );

  useEffect(() => {
    onMetadataRef.current = onMetadata;
  }, [onMetadata]);

  useEffect(() => {
    onParagraphsExtractedRef.current = onParagraphsExtracted;
  }, [onParagraphsExtracted]);

  useEffect(() => {
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange]);

  useEffect(() => {
    onTocChangeRef.current = onTocChange;
  }, [onTocChange]);

  useEffect(() => {
    onCurrentChapterChangeRef.current = onCurrentChapterChange;
  }, [onCurrentChapterChange]);

  useEffect(() => {
    onLoadingProgressRef.current = onLoadingProgress;
  }, [onLoadingProgress]);

  useEffect(() => {
    onHrefChangeRef.current = onHrefChange;
  }, [onHrefChange]);

  // Expose navigation method via ref
  useImperativeHandle(ref, () => ({
    navigateTo: (pid: string) => {
      const href = paragraphMapRef.current.get(pid);
      const source = paragraphSourceRef.current.get(pid);
      if (href && renditionRef.current) {
        renditionRef.current.display(href).then(() => {
          if (!source) return;
          const normalizedSnippet = source.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);
          if (!normalizedSnippet) return;

          const contentsList = (renditionRef.current as any)?.getContents?.() ?? [];
          for (const content of contentsList) {
            const doc = content.document;
            if (!doc) continue;
            const nodes = doc.querySelectorAll("p, div, span, li, blockquote, h1, h2, h3, h4, h5, h6");
            for (const node of nodes) {
              const text = node.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
              if (!text || text.length < 20) continue;
              if (text.includes(normalizedSnippet) || normalizedSnippet.includes(text.slice(0, 120))) {
                (node as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
            }
          }
        });
        onHrefChangeRef.current?.(href);
      }
    },
    navigateToHref: (href: string) => {
      if (renditionRef.current) {
        renditionRef.current.display(href);
        onHrefChangeRef.current?.(href);
      }
    },
    goToPreviousPage: () => {
      renditionRef.current?.prev();
    },
    goToNextPage: () => {
      renditionRef.current?.next();
    },
  }), []);

  // Load book only when fileData changes
  useEffect(() => {
    if (!containerRef.current || !fileData) return;

    const loadBook = async () => {
      try {
        setLoading(true);
        onLoadingProgressRef.current?.(5);

        // Clean up previous book
        if (bookRef.current) {
          bookRef.current.destroy();
          bookRef.current = null;
          renditionRef.current = null;
        }

        // Clear container and paragraph map
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
        paragraphMapRef.current.clear();
        paragraphSourceRef.current.clear();

        // Copy into a plain ArrayBuffer so epub.js gets the binary type it expects.
        const bookData = new ArrayBuffer(fileData.byteLength);
        new Uint8Array(bookData).set(fileData);
        const book = ePub(bookData);
        bookRef.current = book;
        onLoadingProgressRef.current?.(15);

        // Wait for book to be ready
        await book.ready;
        onLoadingProgressRef.current?.(25);

        // Get metadata
        const metadata = await book.loaded.metadata;
        const cover = await book.coverUrl();

        onMetadataRef.current({
          title: metadata.title || "Untitled",
          author: metadata.creator,
          coverImage: cover || undefined,
        });
        onLoadingProgressRef.current?.(35);

        // Get table of contents
        const navigation = await book.loaded.navigation;
        tocRef.current = navigation.toc;
        onTocChangeRef.current?.(navigation.toc);

        // Create rendition
        const rendition = book.renderTo(containerRef.current!, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "scrolled-doc",
        });

        renditionRef.current = rendition;

        // Apply initial scale
        rendition.themes.fontSize(`${100 * scale}%`);

        // Track location changes
        rendition.on("relocated", (location: any) => {
          if (location.start) {
            const currentPage = location.start.displayed?.page || 1;
            const totalPages = location.start.displayed?.total || 1;
            onCurrentPageChangeRef.current(currentPage, totalPages);

            // Find current chapter using ref for latest value
            const href = location.start.href;
            if (href) {
              onHrefChangeRef.current?.(href);
            }
            const currentToc = tocRef.current;
            const chapter = currentToc.find((item) => {
              return matchesHref(href, item.href);
            });
            if (chapter) {
              onCurrentChapterChangeRef.current?.(chapter.label);
            }
          }
        });

        onLoadingProgressRef.current?.(45);

        // Display first section
        await rendition.display();
        onLoadingProgressRef.current?.(55);

        // Extract text for translation (this will report progress 55-100%)
        await extractParagraphs(book);

        setLoading(false);
        onLoadingProgressRef.current?.(null);
      } catch (error) {
        console.error("Failed to load EPUB:", error);
        setLoading(false);
        onLoadingProgressRef.current?.(null);
      }
    };

    loadBook();

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
        renditionRef.current = null;
      }
    };
  }, [fileData]); // Only depend on fileData

  // Handle scale changes separately without reloading the book
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${100 * scale}%`);
    }
  }, [scale]);

  const extractParagraphs = async (book: Book) => {
    const paragraphs: EpubParagraph[] = [];
    let pidCounter = 0;

    // Helper to find section title from TOC
    const findSectionTitle = (href: string): string | undefined => {
      const toc = tocRef.current;
      for (const item of toc) {
        if (matchesHref(href, item.href)) {
          return item.label;
        }
      }
      return undefined;
    };

    try {
      const spine = book.spine as any;
      if (!spine || !spine.items) {
        console.warn("EPUB spine is empty or undefined");
        onParagraphsExtractedRef.current(paragraphs);
        return;
      }

      const totalItems = spine.items.length;
      let processedItems = 0;

      for (const item of spine.items) {
        try {
          const doc = await book.load(item.href);
          const sectionTitle = findSectionTitle(item.href);
          // Handle both Document and string responses
          let textContent: string[] = [];

          if (doc instanceof Document) {
            const textNodes = doc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, div, span");
            textNodes.forEach((node) => {
              const text = node.textContent?.trim();
              if (text && text.length > 10) {
                textContent.push(text);
              }
            });
          } else if (typeof doc === "string") {
            // Parse HTML string
            const parser = new DOMParser();
            const parsed = parser.parseFromString(doc, "text/html");
            const textNodes = parsed.querySelectorAll("p, h1, h2, h3, h4, h5, h6, div, span");
            textNodes.forEach((node) => {
              const text = node.textContent?.trim();
              if (text && text.length > 10) {
                textContent.push(text);
              }
            });
          }

          // Deduplicate and add to paragraphs
          const seen = new Set<string>();
          for (const text of textContent) {
            if (!seen.has(text)) {
              seen.add(text);
              const pid = `epub:${pidCounter++}`;
              paragraphs.push({
                pid,
                source: text,
                status: "idle",
                href: item.href,
                sectionTitle,
              });
              // Store mapping for navigation
              paragraphMapRef.current.set(pid, item.href);
              paragraphSourceRef.current.set(pid, text);
            }
          }
        } catch (itemError) {
          console.warn(`Failed to load spine item ${item.href}:`, itemError);
        }

        processedItems++;
        // Report progress from 55% to 100%
        const progress = 55 + Math.round((processedItems / totalItems) * 45);
        onLoadingProgressRef.current?.(progress);
      }
    } catch (error) {
      console.error("Failed to extract paragraphs:", error);
    }

    console.log(`Extracted ${paragraphs.length} paragraphs from EPUB`);
    onParagraphsExtractedRef.current(paragraphs);
  };

  return (
    <div className="epub-viewer">
      <div className="epub-content">
        {loading && <div className="epub-loading">Loading EPUB...</div>}
        <div ref={containerRef} className="epub-container" />
      </div>
    </div>
  );
});
