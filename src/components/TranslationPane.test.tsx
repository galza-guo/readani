import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import type { PageDoc, PageTranslationState } from "../types";
import { TranslationPane } from "./TranslationPane";

function buildPdfPage(overrides: Partial<PageDoc> = {}): PageDoc {
  return {
    page: 3,
    isExtracted: true,
    paragraphs: [
      {
        pid: "p-1",
        page: 3,
        source: "Original paragraph text.",
        translation: "Translated paragraph text.",
        status: "done",
        rects: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      },
    ],
    ...overrides,
  };
}

function renderPdfPane(options: {
  page?: PageDoc;
  pageTranslation?: PageTranslationState;
  loadingMessage?: string | null;
  setupRequired?: boolean;
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | null;
  bulkActionLabel?: string;
  bulkActionRunning?: boolean;
  canRetryPage?: boolean;
} = {}) {
  const page = options.page ?? buildPdfPage();

  return renderToStaticMarkup(
    <TranslationPane
      mode="pdf"
      currentPage={3}
      page={page}
      pageTranslation={
        options.pageTranslation ?? {
          page: 3,
          displayText: "Original paragraph text.",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated paragraph text.",
          status: "done",
        }
      }
      loadingMessage={options.loadingMessage}
      setupRequired={options.setupRequired}
      progressLabel={options.progressLabel}
      progressDetailLabel={options.progressDetailLabel}
      progressDetailState={options.progressDetailState}
      bulkActionLabel={options.bulkActionLabel ?? "Translate All"}
      onBulkAction={() => {}}
      bulkActionDisabled={false}
      bulkActionRunning={options.bulkActionRunning ?? false}
      onOpenSettings={() => {}}
      onRetryPage={() => {}}
      canRetryPage={options.canRetryPage ?? true}
      activePid={null}
      hoverPid={null}
      onHoverPid={() => {}}
      onLocatePid={() => {}}
      selectionTranslation={null}
      onClearSelectionTranslation={() => {}}
    />,
  );
}

describe("TranslationPane", () => {
  test("renders PDF segments translation-first while keeping original text on demand", () => {
    const html = renderPdfPane();

    expect(html).toContain("pdf-segment-card");
    expect(html).toContain("Translated paragraph text.");
    expect(html).not.toContain("Original paragraph text.");
    expect(html).toContain('aria-label="Show original text"');
    expect(html).toContain('aria-label="Locate in document"');
  });

  test("shows a coarse alignment note and disables locate when rects are unavailable", () => {
    const html = renderPdfPane({
      page: buildPdfPage({
        paragraphs: [
          {
            pid: "p-1",
            page: 3,
            source: "OCR paragraph text.",
            translation: "OCR translation text.",
            status: "done",
            rects: [],
          },
        ],
      }),
    });

    expect(html).toContain("Highlights may be approximate on this page.");
    expect(html).toContain('aria-label="Precise PDF location unavailable"');
    expect(html).toContain("disabled");
  });

  test("renders footer progress beside the bulk action", () => {
    const html = renderPdfPane({
      progressLabel: "3/9 pages translated",
      progressDetailLabel: "Translating page 4",
      progressDetailState: "running",
      bulkActionLabel: "Stop Translating All",
      bulkActionRunning: true,
    });

    expect(html).toContain("translation-pane-progress-text");
    expect(html).toContain("translation-pane-progress-detail is-running");
    expect(html).toContain(">Stop Translating All<");
  });

  test("shows fallback attempt count before the final page error message", () => {
    const html = renderPdfPane({
      pageTranslation: {
        page: 3,
        displayText: "Original paragraph text.",
        previousContext: "",
        nextContext: "",
        status: "error",
        error: "The provider took too long to respond. Please try again.",
        fallbackTrace: {
          requestedPresetId: "preset-a",
          finalPresetId: "preset-c",
          usedFallback: true,
          attemptedPresetIds: ["preset-a", "preset-b", "preset-c"],
          attemptCount: 3,
          lastError: "Gateway timeout",
        },
      },
    });

    expect(html).toContain("Tried 3 presets.");
    expect(html).toContain("The translation service is temporarily unavailable. Please try again shortly.");
  });

  test("renders loading state without the old page blob container", () => {
    const html = renderPdfPane({
      pageTranslation: {
        page: 3,
        displayText: "Original text",
        previousContext: "",
        nextContext: "",
        status: "loading",
      },
      loadingMessage: "Translating this page...",
    });

    expect(html).toContain("page-translation-loading-state");
    expect(html).toContain("Translating this page...");
    expect(html).not.toContain("pdf-segment-card");
  });

  test("renders the unavailable page message for OCR or scanned PDFs without usable text", () => {
    const html = renderPdfPane({
      page: buildPdfPage({ paragraphs: [] }),
      pageTranslation: {
        page: 3,
        displayText: "",
        previousContext: "",
        nextContext: "",
        status: "unavailable",
      },
      canRetryPage: false,
    });

    const emptyRule =
      appCss.match(/\.page-translation-empty\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(html).toContain("This page does not contain any usable text yet.");
    expect(html).toContain("Please OCR it first, then reopen it in");
    expect(emptyRule).toContain("font-style: italic");
  });

  test("renders setup-required prompt when no translation provider is available", () => {
    const html = renderPdfPane({
      pageTranslation: {
        page: 3,
        displayText: "Original text",
        previousContext: "",
        nextContext: "",
        status: "setup-required",
        error: "Translation is not set up yet.",
      },
      setupRequired: true,
      canRetryPage: false,
    });

    expect(html).toContain("translation-setup-prompt");
    expect(html).toContain("Open Settings to add a provider.");
  });

  test("keeps page-level errors visible with a retry action", () => {
    const html = renderPdfPane({
      pageTranslation: {
        page: 3,
        displayText: "Original text",
        previousContext: "",
        nextContext: "",
        status: "error",
        error: "Could not reach the translation service.",
        errorChecks: [
          "Check your network connection.",
          "Check the Base URL in Settings.",
        ],
      },
    });

    expect(html).toContain("Could not reach the translation service.");
    expect(html).toContain("Possible checks");
    expect(html).toContain(">Retry page<");
  });

  test("keeps the shared translation header in EPUB mode", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="epub"
        pages={[]}
        currentPage={4}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onOpenSettings={() => {}}
        activePid={null}
        hoverPid={null}
        onHoverPid={() => {}}
        onTranslatePid={() => {}}
        onLocatePid={() => {}}
        onTranslateText={() => {}}
        wordTranslation={null}
        onClearWordTranslation={() => {}}
        scrollToPage={null}
      />,
    );

    expect(html).toContain(">Translation<");
    expect(html).toContain("rail-pane-title");
  });
});
