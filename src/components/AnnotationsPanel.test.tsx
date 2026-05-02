import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnotationsPanel } from "./AnnotationsPanel";
import type { ResolvedSentenceAnnotation } from "../lib/annotationMatching";

function makeAnnotation(
  overrides: Partial<ResolvedSentenceAnnotation> & { id: string },
): ResolvedSentenceAnnotation {
  const page = overrides.page ?? 1;
  const sentenceIndex = overrides.sentenceIndex ?? 0;
  const pid = overrides.pid ?? `pid-${overrides.id}`;
  const resolvedStatus =
    overrides.resolvedStatus ?? overrides.status ?? "attached";

  return {
    docId: "doc1",
    page,
    pid,
    livePid: pid,
    sentenceIndex,
    liveSentenceIndex: sentenceIndex,
    livePage: page,
    sourceSnapshot: `Source text for ${overrides.id}`,
    sourceHash: `hash-${overrides.id}`,
    rectsSnapshot: [],
    status: "attached",
    resolvedStatus,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("AnnotationsPanel", () => {
  test("returns null when open is false", () => {
    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={[]}
        open={false}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toBe("");
  });

  test("renders the panel with title and close button when open is true", () => {
    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={[]}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel");
    expect(html).toContain("annotations-panel-header");
    expect(html).toContain("annotations-panel-title");
    expect(html).toContain(">Annotations<");
    expect(html).toContain("annotations-panel-close");
    expect(html).toContain('aria-label="Close annotations panel"');
  });

  test("shows empty state when there are no annotations", () => {
    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={[]}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel-empty");
    expect(html).toContain("No annotations yet");
  });

  test("groups adjacent sentence annotations on the same page into one row", () => {
    const annotations = [
      makeAnnotation({ id: "a1", page: 3, sentenceIndex: 0 }),
      makeAnnotation({ id: "a2", page: 3, sentenceIndex: 1 }),
      makeAnnotation({ id: "a3", page: 3, sentenceIndex: 2 }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    // All three should be grouped into one group row
    const groupMatches = html.match(/annotations-panel-group"/g);
    expect(groupMatches).toHaveLength(1);
    expect(html).toContain("Page 3");
    expect(html).toContain("Source text for a1");
  });

  test("separates annotations on different pages into distinct groups", () => {
    const annotations = [
      makeAnnotation({ id: "a1", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "a2", page: 2, sentenceIndex: 0 }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    const groupMatches = html.match(/annotations-panel-group"/g);
    expect(groupMatches).toHaveLength(2);
    expect(html).toContain("Page 1");
    expect(html).toContain("Page 2");
  });

  test("shows a note count badge when annotations have notes", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 1,
        sentenceIndex: 0,
        note: "Review this later",
      }),
      makeAnnotation({
        id: "a2",
        page: 1,
        sentenceIndex: 1,
        note: "Check reference",
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel-badge--notes");
    expect(html).toContain("2 notes");
  });

  test("shows singular note label for a single note", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 1,
        sentenceIndex: 0,
        note: "Review this",
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("1 note");
    expect(html).not.toContain("1 notes");
  });

  test("shows a needs-review badge when any annotation has needs-review status", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 1,
        sentenceIndex: 0,
        status: "attached",
      }),
      makeAnnotation({
        id: "a2",
        page: 1,
        sentenceIndex: 1,
        status: "needs-review",
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel-badge--review");
    expect(html).toContain("Needs review");
  });

  test("prefers resolved needs-review state over stored attached status", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 1,
        sentenceIndex: 0,
        status: "attached",
        resolvedStatus: "needs-review",
        livePid: undefined,
        liveSentenceIndex: undefined,
        livePage: undefined,
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel-badge--review");
    expect(html).toContain("Needs review");
  });

  test("omits badges when there are no notes and no needs-review status", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 1,
        sentenceIndex: 0,
        status: "attached",
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).not.toContain("annotations-panel-badge--notes");
    expect(html).not.toContain("annotations-panel-badge--review");
  });

  test("renders the excerpt text inside each group", () => {
    const annotations = [
      makeAnnotation({
        id: "a1",
        page: 5,
        sentenceIndex: 0,
        sourceSnapshot: "This is a longer source text for testing.",
      }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    expect(html).toContain("annotations-panel-group-excerpt");
    expect(html).toContain("This is a longer source text for testing.");
  });

  test("renders each group with correct page label for identification", () => {
    const annotations = [
      makeAnnotation({ id: "a1", page: 10, sentenceIndex: 3 }),
      makeAnnotation({ id: "a2", page: 10, sentenceIndex: 4 }),
      makeAnnotation({ id: "a3", page: 25, sentenceIndex: 0 }),
    ];

    const html = renderToStaticMarkup(
      <AnnotationsPanel
        annotations={annotations}
        open={true}
        onClose={() => {}}
        onNavigateToPage={() => {}}
        onDeleteAnnotation={() => {}}
      />,
    );

    // Page 10 should group a1+a2, page 25 should be separate
    const groupMatches = html.match(/annotations-panel-group"/g);
    expect(groupMatches).toHaveLength(2);
    expect(html).toContain("Page 10");
    expect(html).toContain("Page 25");
  });
});
