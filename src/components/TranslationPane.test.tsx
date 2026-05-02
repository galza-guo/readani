import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import type { PageDoc, PageTranslationState } from "../types";
import type { ResolvedSentenceAnnotation } from "../lib/annotationMatching";
import { ToastProvider } from "./toast/ToastProvider";
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

function renderPdfPane(
  options: {
    page?: PageDoc;
    translationEnabled?: boolean;
    pageTranslation?: PageTranslationState;
    loadingMessage?: string | null;
    setupRequired?: boolean;
    progressLabel?: string | null;
    progressDetailLabel?: string | null;
    progressDetailState?: "running" | "stopping" | "waiting" | "paused" | null;
    bulkActionLabel?: string;
    bulkActionRunning?: boolean;
    secondaryActionLabel?: string | null;
    onSecondaryAction?: () => void;
    canRetryPage?: boolean;
    activePid?: string | null;
    hoverPid?: string | null;
    annotations?: ResolvedSentenceAnnotation[];
    annotationModeEnabled?: boolean;
    onToggleAnnotationMode?: () => void;
    onAnnotateSentence?: (para: any, sentenceIndex: number) => void;
    onDeleteAnnotation?: (annotationId: string) => void;
    onSaveNote?: (annotationId: string, note: string) => void;
    noteEditingAnnotationId?: string | null;
    onNoteEditingChange?: (annotationId: string | null) => void;
    onHighlightSelected?: (pids: string[]) => void;
  } = {},
) {
  const page = options.page ?? buildPdfPage();

  return renderToStaticMarkup(
    <ToastProvider>
      <TranslationPane
        mode="pdf"
        translationEnabled={options.translationEnabled ?? true}
        targetLanguage={{ label: "Chinese", code: "zh" }}
        onTranslationPreferenceChange={() => {}}
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
        secondaryActionLabel={options.secondaryActionLabel}
        onSecondaryAction={options.onSecondaryAction}
        onOpenSettings={() => {}}
        onRetryPage={() => {}}
        canRetryPage={options.canRetryPage ?? true}
        activePid={options.activePid ?? null}
        hoverPid={options.hoverPid ?? null}
        onHoverPid={() => {}}
        onLocatePid={() => {}}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
        annotations={options.annotations}
        annotationModeEnabled={options.annotationModeEnabled}
        onToggleAnnotationMode={options.onToggleAnnotationMode}
        onAnnotateSentence={options.onAnnotateSentence}
        onDeleteAnnotation={options.onDeleteAnnotation}
        onSaveNote={options.onSaveNote}
        noteEditingAnnotationId={options.noteEditingAnnotationId}
        onNoteEditingChange={options.onNoteEditingChange}
        onHighlightSelected={options.onHighlightSelected}
      />
    </ToastProvider>,
  );
}

function buildEpubPages(overrides?: Partial<PageDoc>[]): PageDoc[] {
  const basePages: PageDoc[] = [
    {
      page: 4,
      title: "Chapter 1",
      isExtracted: true,
      paragraphs: [
        {
          pid: "epub-p-1",
          page: 4,
          source: "EPUB original sentence.",
          translation: "EPUB translated sentence.",
          status: "done",
          rects: [],
        },
      ],
    },
  ];

  if (!overrides?.length) {
    return basePages;
  }

  return basePages.map((page, index) => ({
    ...page,
    ...(overrides[index] ?? {}),
  }));
}

function renderEpubPane(
  options: {
    pages?: PageDoc[];
    currentPage?: number;
    translationEnabled?: boolean;
    setupRequired?: boolean;
    annotations?: ResolvedSentenceAnnotation[];
    annotationModeEnabled?: boolean;
    onToggleAnnotationMode?: () => void;
    noteEditingAnnotationId?: string | null;
  } = {},
) {
  return renderToStaticMarkup(
    <ToastProvider>
      <TranslationPane
        mode="epub"
        translationEnabled={options.translationEnabled ?? true}
        targetLanguage={{ label: "Chinese", code: "zh" }}
        onTranslationPreferenceChange={() => {}}
        pages={options.pages ?? buildEpubPages()}
        currentPage={options.currentPage ?? 4}
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
        setupRequired={options.setupRequired}
        annotations={options.annotations}
        annotationModeEnabled={options.annotationModeEnabled}
        onToggleAnnotationMode={options.onToggleAnnotationMode}
        onAnnotateSentence={() => {}}
        onDeleteAnnotation={() => {}}
        onSaveNote={() => {}}
        noteEditingAnnotationId={options.noteEditingAnnotationId}
        onNoteEditingChange={() => {}}
      />
    </ToastProvider>,
  );
}

describe("TranslationPane", () => {
  test("renders PDF segments without the old eye and locate controls", () => {
    const html = renderPdfPane();

    expect(html).toContain("pdf-segment-card");
    expect(html).toContain("pdf-segment-surface");
    expect(html).toContain("Translated paragraph text.");
    expect(html).toContain("pdf-segment-source-reveal");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-label="Copy translation"');
    expect(html).not.toContain('aria-label="Show original text"');
    expect(html).not.toContain('aria-label="Locate in document"');
    expect(html).not.toContain("Copy selected");
  });

  test("shows a coarse alignment note when rects are unavailable", () => {
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
    expect(html).toContain('aria-label="Copy translation"');
  });

  test("reveals the original text and its copy control for the active segment", () => {
    const html = renderPdfPane({ activePid: "p-1" });

    expect(html).toContain("Original paragraph text.");
    expect(html).toContain('aria-label="Copy original text"');
    expect(html).toContain("pdf-segment-source-reveal is-visible");
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

  test("renders waiting state without animated ellipsis", () => {
    const html = renderPdfPane({
      progressDetailLabel: "Network error on page 4. Retrying in 45s",
      progressDetailState: "waiting",
      bulkActionLabel: "Stop Translating All",
      bulkActionRunning: true,
    });

    expect(html).toContain("translation-pane-progress-detail is-waiting");
    expect(html).toContain(">Network error on page 4. Retrying in 45s<");
    expect(html).not.toContain("translation-pane-progress-ellipsis");
  });

  test("renders paused state with Continue and secondary Stop", () => {
    const html = renderPdfPane({
      progressDetailLabel: "Paused — out of credits or quota.",
      progressDetailState: "paused",
      bulkActionLabel: "Continue",
      bulkActionRunning: true,
      secondaryActionLabel: "Stop",
      onSecondaryAction: () => {},
    });

    expect(html).toContain("translation-pane-progress-detail is-paused");
    expect(html).toContain(">Continue<");
    expect(html).toContain(">Stop<");
    expect(html).toContain("translation-pane-secondary-action");
    expect(html).not.toContain("translation-pane-progress-ellipsis");
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
    expect(html).toContain(
      "The translation service is temporarily unavailable. Please try again shortly.",
    );
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
    const html = renderEpubPane({ pages: [] });

    expect(html).toContain(">Translation<");
    expect(html).toContain("rail-pane-title");
  });

  test("renders EPUB annotation mode button in header", () => {
    const html = renderEpubPane({ annotationModeEnabled: true });

    expect(html).toContain("annotation-mode-btn is-active");
    expect(html).toContain('aria-label="Annotation mode"');
  });

  test("renders EPUB notes inline for annotated paragraphs", () => {
    const html = renderEpubPane({
      annotations: [
        {
          id: "ann-epub-1",
          docId: "doc-1",
          page: 4,
          pid: "stored-pid",
          sentenceIndex: 0,
          sourceSnapshot: "EPUB original sentence.",
          sourceHash: "hash-1",
          rectsSnapshot: [],
          status: "attached",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          livePid: "epub-p-1",
          liveSentenceIndex: 0,
          livePage: 4,
          resolvedStatus: "attached",
          note: "EPUB note text.",
        },
      ],
    });

    expect(html).toContain("paragraph-block");
    expect(html).toContain("is-annotated");
    expect(html).toContain('aria-label="Remove highlight"');
    expect(html).toContain("pdf-segment-note");
    expect(html).toContain("EPUB note text.");
  });

  test("shows a comment placeholder row for highlighted sentences without notes", () => {
    const annotation: ResolvedSentenceAnnotation = {
      id: "ann-placeholder",
      docId: "doc-1",
      page: 3,
      pid: "p-1",
      sentenceIndex: 0,
      sourceSnapshot: "Original paragraph text.",
      sourceHash: "abc123",
      rectsSnapshot: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      status: "attached",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      livePid: "p-1",
      liveSentenceIndex: 0,
      livePage: 3,
      resolvedStatus: "attached",
    };

    const html = renderPdfPane({ annotations: [annotation] });

    expect(html).toContain("pdf-segment-note is-placeholder");
    expect(html).toContain(">Comment<");
  });

  test("renders EPUB needs-review warning banner", () => {
    const html = renderEpubPane({
      annotations: [
        {
          id: "ann-epub-review",
          docId: "doc-1",
          page: 4,
          pid: "stale-pid",
          sentenceIndex: 0,
          sourceSnapshot: "Old EPUB sentence.",
          sourceHash: "hash-2",
          rectsSnapshot: [],
          status: "attached",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          resolvedStatus: "needs-review",
        },
      ],
    });

    expect(html).toContain("annotation-review-banner");
    expect(html).toContain("1 annotation need review on this page.");
    expect(html).toContain("annotation-review-action");
  });

  test("renders annotate button in segment cards", () => {
    const html = renderPdfPane();

    expect(html).toContain('aria-label="Highlight sentence"');
    expect(html).toContain("pdf-segment-annotate-btn");
  });

  test("applies annotation-mode class when annotation mode is enabled", () => {
    const html = renderPdfPane({ annotationModeEnabled: true });

    expect(html).toContain("pdf-segment-list annotation-mode");
    expect(html).toContain("annotation-mode-btn is-active");
  });

  test("annotated card has is-annotated class", () => {
    const annotation: ResolvedSentenceAnnotation = {
      id: "ann-1",
      docId: "doc-1",
      page: 3,
      pid: "p-1",
      sentenceIndex: 0,
      sourceSnapshot: "Original paragraph text.",
      sourceHash: "abc123",
      rectsSnapshot: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      status: "attached",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      livePid: "p-1",
      liveSentenceIndex: 0,
      livePage: 3,
      resolvedStatus: "attached",
    };

    const html = renderPdfPane({ annotations: [annotation] });

    expect(html).toContain("is-annotated");
    expect(html).toContain('aria-label="Remove highlight"');
  });

  test("renders note text when annotation has a note", () => {
    const annotation: ResolvedSentenceAnnotation = {
      id: "ann-1",
      docId: "doc-1",
      page: 3,
      pid: "p-1",
      sentenceIndex: 0,
      sourceSnapshot: "Original paragraph text.",
      sourceHash: "abc123",
      rectsSnapshot: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      status: "attached",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      livePid: "p-1",
      liveSentenceIndex: 0,
      livePage: 3,
      resolvedStatus: "attached",
      note: "This is an important passage.",
    };

    const html = renderPdfPane({ annotations: [annotation] });

    expect(html).toContain("pdf-segment-note");
    expect(html).toContain("This is an important passage.");
  });

  test("styles notes as an inline bold row inside the sentence card", () => {
    const noteRule = appCss.match(/\.pdf-segment-note\s*\{([^}]*)\}/)?.[1] ?? "";
    const shellRule =
      appCss.match(/\.pdf-segment-note-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const placeholderRule =
      appCss.match(/\.pdf-segment-note\.is-placeholder\s*\{([^}]*)\}/)?.[1] ??
      "";
    const inputRule =
      appCss.match(/\.pdf-segment-note-input\s*\{([^}]*)\}/)?.[1] ?? "";
    const saveRule =
      appCss.match(/\.pdf-segment-note-save\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(shellRule).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(noteRule).toContain("min-height: 20px");
    expect(noteRule).toContain("font-weight: 700");
    expect(noteRule).toContain("background: transparent");
    expect(noteRule).toContain("border: none");
    expect(placeholderRule).toContain("font-style: italic");
    expect(placeholderRule).toContain("opacity: 0.24");
    expect(inputRule).toContain("background: transparent");
    expect(inputRule).toContain("border: none");
    expect(inputRule).toContain("appearance: none");
    expect(saveRule).toContain("background: transparent");
    expect(saveRule).toContain("border: none");
  });

  test("renders needs-review warning banner", () => {
    const annotation: ResolvedSentenceAnnotation = {
      id: "ann-needs-review",
      docId: "doc-1",
      page: 3,
      pid: "p-1",
      sentenceIndex: 0,
      sourceSnapshot: "Original paragraph text.",
      sourceHash: "abc123",
      rectsSnapshot: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      status: "needs-review",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      resolvedStatus: "needs-review",
    };

    const html = renderPdfPane({ annotations: [annotation] });

    expect(html).toContain("annotation-review-banner");
    expect(html).toContain("1 annotation need review on this page.");
    expect(html).toContain("annotation-review-action");
  });

  test("renders annotation mode button in header", () => {
    const html = renderPdfPane();

    expect(html).toContain("annotation-mode-btn");
    expect(html).toContain('aria-label="Annotation mode"');
  });

  test("renders inline save control while editing a comment", () => {
    const annotation: ResolvedSentenceAnnotation = {
      id: "ann-editing",
      docId: "doc-1",
      page: 3,
      pid: "p-1",
      sentenceIndex: 0,
      sourceSnapshot: "Original paragraph text.",
      sourceHash: "abc123",
      rectsSnapshot: [{ page: 3, x: 12, y: 24, w: 90, h: 18 }],
      status: "attached",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      livePid: "p-1",
      liveSentenceIndex: 0,
      livePage: 3,
      resolvedStatus: "attached",
    };

    const html = renderPdfPane({
      annotations: [annotation],
      noteEditingAnnotationId: "ann-editing",
    });

    expect(html).toContain("pdf-segment-note-shell");
    expect(html).toContain("pdf-segment-note-editor");
    expect(html).not.toContain("<textarea");
    expect(html).toContain('aria-label="Save comment"');
  });
});
