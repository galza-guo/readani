import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import appCss from "../App.css?raw";
import { PdfViewer } from "./PdfViewer";

describe("PdfViewer", () => {
  test("renders the zoom dock in a viewer shell layer, outside the scroll content", () => {
    const html = renderToStaticMarkup(
      <PdfViewer
        pdfDoc={{} as any}
        pageSizes={[{ width: 100, height: 200 }]}
        currentPage={1}
        zoomMode="custom"
        manualScale={1}
        scrollAnchor="top"
        onNavigateToPage={() => {}}
        onRequestPageChange={() => {}}
        onZoomModeChange={() => {}}
        onManualScaleChange={() => {}}
        onResolvedScaleChange={() => {}}
        overlayStatusMessage="Extracting text"
        overlayProgress={81}
        onSelectionText={() => {}}
        onClearSelection={() => {}}
      />
    );

    expect(html).toContain('class="pdf-viewer-shell document-viewer-shell"');
    expect(html).toContain('class="pdf-viewer"');
    expect(html).toContain('class="document-status-dock"');
    expect(html).toContain("Extracting text");
    expect(html).toContain('class="pdf-zoom-dock document-zoom-dock"');
    expect(html).toContain('class="pdf-page"');
    expect(html).not.toContain('class="pdf-page-stage"');
    expect(html).toContain(
      '</div></div><div class="document-status-dock"><div class="document-status-surface document-status-surface-overlay"'
    );
    expect(html).toContain('</div><div class="pdf-zoom-dock document-zoom-dock"');
  });

  test("positions the viewer shell as the zoom dock anchor layer", () => {
    const shellRule =
      appCss.match(/\.document-viewer-shell,\s*\.pdf-viewer-shell\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(shellRule).toContain("position: relative");
    expect(shellRule).toContain("min-height: 0");
  });

  test("lets the viewer shell and scroller shrink when the pane gets narrower", () => {
    const shellRule =
      appCss.match(/\.document-viewer-shell,\s*\.pdf-viewer-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const viewerRule = appCss.match(/\.pdf-viewer\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(shellRule).toContain("min-width: 0");
    expect(viewerRule).toContain("min-width: 0");
  });

  test("replaces the compact trigger with the expanded control when opened", () => {
    const html = renderToStaticMarkup(
      <PdfViewer
        pdfDoc={{} as any}
        pageSizes={[{ width: 100, height: 200 }]}
        currentPage={1}
        zoomMode="custom"
        manualScale={1.2}
        scrollAnchor="top"
        onNavigateToPage={() => {}}
        onRequestPageChange={() => {}}
        onZoomModeChange={() => {}}
        onManualScaleChange={() => {}}
        onResolvedScaleChange={() => {}}
        defaultZoomPopoverOpen={true}
        onSelectionText={() => {}}
        onClearSelection={() => {}}
      />
    );

    expect(html).toContain('class="pdf-zoom-expanded pdf-zoom-panel"');
    expect(html).not.toContain('class="btn pdf-zoom-trigger"');
    expect(html).not.toContain('class="btn btn-ghost pdf-zoom-expanded-toggle"');
    expect(html.match(/120%/g)?.length).toBe(1);
  });
});
