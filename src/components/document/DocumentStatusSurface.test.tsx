import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentStatusSurface } from "./DocumentStatusSurface";

describe("DocumentStatusSurface", () => {
  test("renders blocking status as a centered pane replacement with optional progress", () => {
    const html = renderToStaticMarkup(
      <DocumentStatusSurface message="Loading document" progress={42} variant="blocking" />
    );

    expect(html).toContain("document-status-surface");
    expect(html).toContain("document-status-surface-blocking");
    expect(html).toContain("document-status-message");
    expect(html).toContain(">Loading document<");
    expect(html).toContain('style="width:42%"');
  });

  test("renders overlay status as a compact dock strip", () => {
    const html = renderToStaticMarkup(
      <DocumentStatusSurface message="Extracting text" progress={73} variant="overlay" />
    );

    expect(html).toContain("document-status-surface");
    expect(html).toContain("document-status-surface-overlay");
    expect(html).toContain(">Extracting text<");
    expect(html).toContain("document-status-progress-track");
    expect(html).toContain('style="width:73%"');
  });
});
