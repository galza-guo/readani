import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../../App.css?raw";
import { PageNavigationToolbar } from "./PageNavigationToolbar";

describe("PageNavigationToolbar", () => {
  test("renders a shared page strip with edge controls and center content", () => {
    const html = renderToStaticMarkup(
      <PageNavigationToolbar
        previousLabel="Previous page"
        nextLabel="Next page"
        previousDisabled={false}
        nextDisabled={true}
        onPrevious={() => {}}
        onNext={() => {}}
      >
        <div className="test-page-label">Page 3 of 9</div>
      </PageNavigationToolbar>
    );

    expect(html).toContain('class="document-panel-toolbar document-page-toolbar"');
    expect(html).toContain('class="btn btn-ghost btn-icon-only document-toolbar-icon-btn"');
    expect(html).toContain('class="document-page-toolbar-main"');
    expect(html).toContain("Page 3 of 9");
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain("disabled");
  });

  test("uses the shared toolbar layout rules", () => {
    const panelRule =
      appCss.match(/\.document-panel-toolbar,\s*\.pdf-panel-toolbar\s*\{([^}]*)\}/)?.[1] ?? "";
    const toolbarRule =
      appCss.match(/\.document-page-toolbar,\s*\.pdf-page-toolbar\s*\{([^}]*)\}/)?.[1] ?? "";
    const mainRule = appCss.match(/\.document-page-toolbar-main\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(panelRule).not.toContain("background");
    expect(panelRule).not.toContain("backdrop-filter");
    expect(toolbarRule).toContain("display: grid");
    expect(toolbarRule).toContain("grid-template-columns: 40px minmax(0, 1fr) 40px");
    expect(toolbarRule).not.toContain("border-bottom");
    expect(mainRule).toContain("display: flex");
    expect(mainRule).toContain("justify-content: center");
  });
});
