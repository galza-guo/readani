import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
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
});
