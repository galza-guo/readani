import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import { PdfNavigationSidebar } from "./PdfNavigationSidebar";

describe("PdfNavigationSidebar", () => {
  test("renders a single two-button view toggle without a separate navigation title row", () => {
    const html = renderToStaticMarkup(
      <PdfNavigationSidebar
        docId="doc-1"
        pdfDoc={{} as any}
        pageSizes={[{ width: 100, height: 160 }]}
        currentPage={3}
        outline={[
          { id: "intro", title: "Introduction", page: 1, depth: 0 },
          { id: "chapter-1", title: "Chapter 1", page: 3, depth: 0 },
        ]}
        activeTab="contents"
        onTabChange={() => {}}
        onNavigate={() => {}}
      />
    );

    expect(html).toContain('class="pdf-sidebar"');
    expect(html).toContain(">Thumbnails<");
    expect(html).toContain(">Contents<");
    expect(html).toContain(">Chapter 1<");
    expect(html).not.toContain(">Navigate<");
  });

  test("styles the toggle as one shared segmented control row", () => {
    const listRule = appCss.match(/\.pdf-sidebar-tabs-list\s*\{([^}]*)\}/)?.[1] ?? "";
    const triggerRule = appCss.match(/\.pdf-sidebar-tab-trigger\s*\{([^}]*)\}/)?.[1] ?? "";
    const dividerRule =
      appCss.match(/\.pdf-sidebar-tab-trigger \+ \.pdf-sidebar-tab-trigger\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(listRule).toContain("padding: 0");
    expect(listRule).toContain("overflow: hidden");
    expect(listRule).not.toContain("gap: 6px");

    expect(triggerRule).toContain("border-radius: 0");
    expect(triggerRule).toContain("min-height: 44px");
    expect(dividerRule).toContain("border-left");
  });
});
