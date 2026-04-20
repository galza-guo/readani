import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EpubViewer } from "./EpubViewer";

describe("EpubViewer", () => {
  test("keeps page navigation chrome outside the viewer body", () => {
    const html = renderToStaticMarkup(
      <EpubViewer
        ref={null}
        fileData={new Uint8Array()}
        onMetadata={() => {}}
        onParagraphsExtracted={() => {}}
        onCurrentPageChange={() => {}}
        onTocChange={() => {}}
        onCurrentChapterChange={() => {}}
        onLoadingProgress={() => {}}
        onHrefChange={() => {}}
        scale={1}
      />
    );

    expect(html).toContain('class="epub-viewer"');
    expect(html).toContain('class="epub-content"');
    expect(html).not.toContain('class="epub-nav"');
    expect(html).not.toContain("Previous");
    expect(html).not.toContain("Next");
  });
});
