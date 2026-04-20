import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import { TranslationPane } from "./TranslationPane";

describe("TranslationPane", () => {
  test("renders cached state as an icon-only indicator", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated text",
          status: "done",
          isCached: true,
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).toContain("page-translation-cached-indicator");
    expect(html).not.toContain(">Cached<");
  });

  test("renders footer progress as plain text with a neutral bulk action button", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated text",
          status: "done",
        }}
        progressLabel="3/9 pages translated"
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).toContain("translation-pane-progress-text");
    expect(html).not.toContain("translation-progress-indicator");
    expect(html).toContain('class="btn btn-small btn-quiet-action"');
    expect(html).not.toContain("btn-primary btn-small");
  });

  test("renders loading state without the old boxed wrapper", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          status: "loading",
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).toContain("page-translation-loading-state");
    expect(html).toContain("page-translation-loading-text");
    expect(html).not.toContain("page-translation-loading\"");
  });

  test("uses a generic translation title in PDF mode", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated text",
          status: "done",
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).toContain(">Translation<");
    expect(html).toContain("rail-pane-title");
    expect(html).not.toContain("page-translation-label");
    expect(html).not.toContain(">Page 3<");
  });

  test("uses the shared pane title without page numbering in EPUB mode", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="epub"
        pages={[]}
        currentPage={4}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        activePid={null}
        hoverPid={null}
        onHoverPid={() => {}}
        onTranslatePid={() => {}}
        onLocatePid={() => {}}
        onTranslateText={() => {}}
        wordTranslation={null}
        onClearWordTranslation={() => {}}
        scrollToPage={null}
      />
    );

    expect(html).toContain(">Translation<");
    expect(html).toContain("rail-pane-title");
    expect(html).not.toContain("translation-pane-page");
    expect(html).not.toContain(">Page 4<");
  });

  test("uses the centered shared header rhythm without a translation-only divider", () => {
    const railHeaderRule = appCss.match(/\.rail-pane-header\s*\{([^}]*)\}/)?.[1] ?? "";
    const translationHeaderRule =
      appCss.match(/\.translation-pane-header\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(railHeaderRule).toContain("align-items: center");
    expect(translationHeaderRule).not.toContain("border-bottom");
  });

  test("does not render a vocabulary button in PDF mode", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated text",
          status: "done",
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).not.toContain('aria-label="Open vocabulary"');
  });

  test("does not render a vocabulary button in EPUB mode", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="epub"
        pages={[]}
        currentPage={1}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        activePid={null}
        hoverPid={null}
        onHoverPid={() => {}}
        onTranslatePid={() => {}}
        onLocatePid={() => {}}
        onTranslateText={() => {}}
        wordTranslation={null}
        onClearWordTranslation={() => {}}
        scrollToPage={null}
      />
    );

    expect(html).not.toContain('aria-label="Open vocabulary"');
  });

  test("renders the redo page action as a left-expanding icon button", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "Original text",
          previousContext: "",
          nextContext: "",
          translatedText: "Translated text",
          status: "done",
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={true}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    expect(html).toContain('class="btn btn-ghost expandable-icon-button"');
    expect(html).toContain('data-label-direction="left"');
    expect(html).toContain(">Redo page<");
    expect(html).toContain('aria-label="Redo page"');
  });

  test("renders the unavailable page message as plain italic copy with upright readani", () => {
    const html = renderToStaticMarkup(
      <TranslationPane
        mode="pdf"
        currentPage={3}
        pageTranslation={{
          page: 3,
          displayText: "",
          previousContext: "",
          nextContext: "",
          status: "unavailable",
        }}
        bulkActionLabel="Translate All"
        onBulkAction={() => {}}
        bulkActionDisabled={false}
        bulkActionRunning={false}
        onRetryPage={() => {}}
        canRetryPage={false}
        selectionTranslation={null}
        onClearSelectionTranslation={() => {}}
      />
    );

    const emptyRule = appCss.match(/\.page-translation-empty\s*\{([^}]*)\}/)?.[1] ?? "";
    const brandRule =
      appCss.match(/\.page-translation-empty-brand\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(html).toContain("This page does not contain any usable text yet.");
    expect(html).toContain("Please OCR it first, then reopen it in");
    expect(html).toContain('class="page-translation-empty-brand">readani<');
    expect(html).not.toContain("This PDF does not contain usable text yet.");
    expect(emptyRule).toContain("font-style: italic");
    expect(emptyRule).not.toContain("border:");
    expect(brandRule).toContain("font-style: normal");
  });
});
