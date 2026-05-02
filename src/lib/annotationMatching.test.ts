import { describe, expect, test } from "bun:test";
import type { SentenceAnnotation, PageDoc, Paragraph } from "../types";
import { hashString } from "./hash";
import { resolveAnnotations } from "./annotationMatching";

function makeAnnotation(
  overrides: Partial<SentenceAnnotation> & { id: string },
): SentenceAnnotation {
  return {
    docId: "doc1",
    page: 1,
    pid: `pid-${overrides.id}`,
    sentenceIndex: 0,
    sourceSnapshot: `Source text for ${overrides.id}`,
    sourceHash: "",
    rectsSnapshot: [],
    status: "attached",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makeParagraph(
  overrides: Partial<Paragraph> & { pid: string },
): Paragraph {
  return {
    page: 1,
    source: `Source text for ${overrides.pid}`,
    status: "idle",
    rects: [],
    ...overrides,
  };
}

function makePageDoc(overrides: Partial<PageDoc> = {}): PageDoc {
  return {
    page: 1,
    paragraphs: [],
    isExtracted: true,
    ...overrides,
  };
}

describe("resolveAnnotations", () => {
  test("exact pid match resolves as attached with livePid", () => {
    const ann = makeAnnotation({
      id: "a1",
      page: 1,
      pid: "p-0",
      sentenceIndex: 0,
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Hello world" }),
          makeParagraph({ pid: "p-1", page: 1, source: "Goodbye world" }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("attached");
    expect(result[0].livePid).toBe("p-0");
    expect(result[0].liveSentenceIndex).toBe(0);
    expect(result[0].livePage).toBe(1);
  });

  test("fallback to source hash when pid does not match", () => {
    const sourceText = "The quick brown fox";
    const ann = makeAnnotation({
      id: "a1",
      page: 1,
      pid: "old-pid",
      sourceHash: hashString(sourceText),
      sentenceIndex: 2,
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "new-p0", page: 1, source: "Something else" }),
          makeParagraph({ pid: "new-p1", page: 1, source: "Another thing" }),
          makeParagraph({ pid: "new-p2", page: 1, source: sourceText }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("attached");
    expect(result[0].livePid).toBe("new-p2");
    expect(result[0].liveSentenceIndex).toBe(2);
    expect(result[0].livePage).toBe(1);
  });

  test("duplicate text on one page resolved with sentence index", () => {
    const sharedSource = "Repeated sentence";

    const ann = makeAnnotation({
      id: "a1",
      page: 1,
      pid: "old-pid",
      sentenceIndex: 3, // annotation was on sentence index 3
      sourceSnapshot: sharedSource,
      sourceHash: hashString(sharedSource),
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Some text" }),
          makeParagraph({ pid: "p-1", page: 1, source: sharedSource }),
          makeParagraph({ pid: "p-2", page: 1, source: "Other text" }),
          makeParagraph({ pid: "p-3", page: 1, source: sharedSource }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("attached");
    expect(result[0].livePid).toBe("p-3");
    expect(result[0].liveSentenceIndex).toBe(3);
  });

  test("returns needs-review when no positive match evidence exists", () => {
    const sharedSource = "Repeated sentence";

    const ann = makeAnnotation({
      id: "a1",
      page: 1,
      pid: "old-pid",
      sentenceIndex: 3,
      sourceSnapshot: "Completely different text now",
      sourceHash: "intentionally-wrong-hash",
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Some text" }),
          makeParagraph({ pid: "p-1", page: 1, source: sharedSource }),
          makeParagraph({ pid: "p-2", page: 1, source: "Other text" }),
          makeParagraph({ pid: "p-3", page: 1, source: sharedSource }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("needs-review");
    expect(result[0].livePid).toBeUndefined();
    expect(result[0].liveSentenceIndex).toBeUndefined();
  });

  test("parser drift producing needs-review when source text changed", () => {
    const ann = makeAnnotation({
      id: "a1",
      page: 1,
      pid: "old-pid",
      sentenceIndex: 5,
      sourceSnapshot: "Original text before parser drift",
      sourceHash: hashString("Original text before parser drift"),
    });

    // Only one paragraph on page 1, far from sentenceIndex 5
    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Totally new text" }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("needs-review");
    expect(result[0].livePid).toBeUndefined();
    expect(result[0].liveSentenceIndex).toBeUndefined();
  });

  test("unresolved items remaining present when page no longer exists", () => {
    const ann = makeAnnotation({
      id: "a1",
      page: 5,
      pid: "p-0",
      sentenceIndex: 0,
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Some text" }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    expect(result[0].resolvedStatus).toBe("needs-review");
    expect(result[0].livePid).toBeUndefined();
    expect(result[0].livePage).toBeUndefined();
    // The original annotation data is preserved
    expect(result[0].id).toBe("a1");
    expect(result[0].page).toBe(5);
  });

  test("no annotations returns empty array", () => {
    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Some text" }),
        ],
      }),
    ];

    const result = resolveAnnotations([], pageDocs);
    expect(result).toEqual([]);
  });

  test("no page docs makes all annotations needs-review", () => {
    const annotations = [
      makeAnnotation({ id: "a1", page: 1, pid: "p-0" }),
      makeAnnotation({ id: "a2", page: 2, pid: "p-1" }),
    ];

    const result = resolveAnnotations(annotations, []);
    expect(result).toHaveLength(2);
    expect(result[0].resolvedStatus).toBe("needs-review");
    expect(result[1].resolvedStatus).toBe("needs-review");
    expect(result[0].livePid).toBeUndefined();
    expect(result[1].livePid).toBeUndefined();
  });

  test("preserves original annotation fields in output", () => {
    const ann = makeAnnotation({
      id: "a1",
      docId: "my-doc",
      page: 1,
      pid: "p-0",
      sentenceIndex: 0,
      sourceSnapshot: "Hello",
      sourceHash: hashString("Hello"),
      rectsSnapshot: [{ page: 1, x: 10, y: 20, w: 100, h: 15 }],
      note: "Important note",
      status: "attached",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p-0", page: 1, source: "Hello" }),
        ],
      }),
    ];

    const result = resolveAnnotations([ann], pageDocs);
    expect(result).toHaveLength(1);
    const resolved = result[0];
    expect(resolved.id).toBe("a1");
    expect(resolved.docId).toBe("my-doc");
    expect(resolved.sourceSnapshot).toBe("Hello");
    expect(resolved.rectsSnapshot).toEqual([
      { page: 1, x: 10, y: 20, w: 100, h: 15 },
    ]);
    expect(resolved.note).toBe("Important note");
    expect(resolved.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(resolved.updatedAt).toBe("2026-01-02T00:00:00Z");
  });

  test("resolves across multiple pages", () => {
    const annotations = [
      makeAnnotation({ id: "a1", page: 1, pid: "p1-0", sentenceIndex: 0 }),
      makeAnnotation({ id: "a2", page: 2, pid: "p2-0", sentenceIndex: 0 }),
    ];

    const pageDocs = [
      makePageDoc({
        page: 1,
        paragraphs: [
          makeParagraph({ pid: "p1-0", page: 1, source: "Page 1 text" }),
        ],
      }),
      makePageDoc({
        page: 2,
        paragraphs: [
          makeParagraph({ pid: "p2-0", page: 2, source: "Page 2 text" }),
        ],
      }),
    ];

    const result = resolveAnnotations(annotations, pageDocs);
    expect(result).toHaveLength(2);
    expect(result[0].livePage).toBe(1);
    expect(result[0].livePid).toBe("p1-0");
    expect(result[1].livePage).toBe(2);
    expect(result[1].livePid).toBe("p2-0");
  });
});
