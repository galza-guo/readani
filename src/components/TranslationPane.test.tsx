import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TranslationPane } from "./TranslationPane";

describe("TranslationPane", () => {
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
});
