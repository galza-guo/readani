import { describe, expect, test } from "bun:test";
import type { SentenceAnnotation } from "../types";
import {
  getPageSentenceAnnotations,
  groupSentenceAnnotations,
  sortSentenceAnnotations,
} from "./annotations";

function makeAnnotation(
  overrides: Partial<SentenceAnnotation> & { id: string },
): SentenceAnnotation {
  return {
    docId: "doc1",
    page: 1,
    pid: `pid-${overrides.id}`,
    sentenceIndex: 0,
    sourceSnapshot: `Source text for ${overrides.id}`,
    sourceHash: `hash-${overrides.id}`,
    rectsSnapshot: [],
    status: "attached",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("sortSentenceAnnotations", () => {
  test("sorts by page first, then by sentence index", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 2, sentenceIndex: 1 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 3 }),
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 1 }),
    ];

    const sorted = sortSentenceAnnotations(annotations);
    expect(sorted.map((a) => a.id)).toEqual(["c", "b", "a"]);
  });

  test("returns a new array without mutating the original", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 2, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 0 }),
    ];

    const sorted = sortSentenceAnnotations(annotations);
    expect(sorted.map((a) => a.id)).toEqual(["b", "a"]);
    expect(annotations.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("groupSentenceAnnotations", () => {
  test("groups adjacent sentences on the same page into one group", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1 }),
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 2 }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(1);
    expect(groups[0].annotationIds).toEqual(["a", "b", "c"]);
    expect(groups[0].startSentenceIndex).toBe(0);
    expect(groups[0].endSentenceIndex).toBe(2);
    expect(groups[0].excerpt).toBe("Source text for a");
  });

  test("breaks groups when pages change", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1 }),
      makeAnnotation({ id: "c", page: 2, sentenceIndex: 0 }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(2);
    expect(groups[0].annotationIds).toEqual(["a", "b"]);
    expect(groups[0].page).toBe(1);
    expect(groups[1].annotationIds).toEqual(["c"]);
    expect(groups[1].page).toBe(2);
  });

  test("breaks groups when sentence indexes are not adjacent", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1 }),
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 5 }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(2);
    expect(groups[0].annotationIds).toEqual(["a", "b"]);
    expect(groups[0].endSentenceIndex).toBe(1);
    expect(groups[1].annotationIds).toEqual(["c"]);
    expect(groups[1].startSentenceIndex).toBe(5);
  });

  test("carries needs-review through to the group summary", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0, status: "attached" }),
      makeAnnotation({
        id: "b",
        page: 1,
        sentenceIndex: 1,
        status: "needs-review",
      }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(1);
    expect(groups[0].hasNeedsReview).toBe(true);
  });

  test("sets hasNeedsReview to false when all annotations are attached", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1 }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(1);
    expect(groups[0].hasNeedsReview).toBe(false);
  });

  test("keeps note counts accurate", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1, note: "Review this" }),
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 2, note: "" }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(1);
    expect(groups[0].noteCount).toBe(1);
  });

  test("returns empty array for no annotations", () => {
    expect(groupSentenceAnnotations([])).toEqual([]);
  });

  test("handles unsorted input by sorting first", () => {
    const annotations = [
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 2 }),
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 1, sentenceIndex: 1 }),
    ];

    const groups = groupSentenceAnnotations(annotations);
    expect(groups).toHaveLength(1);
    expect(groups[0].annotationIds).toEqual(["a", "b", "c"]);
  });
});

describe("getPageSentenceAnnotations", () => {
  test("filters annotations to a specific page", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
      makeAnnotation({ id: "b", page: 2, sentenceIndex: 0 }),
      makeAnnotation({ id: "c", page: 1, sentenceIndex: 1 }),
    ];

    const page1 = getPageSentenceAnnotations(annotations, 1);
    expect(page1.map((a) => a.id)).toEqual(["a", "c"]);
  });

  test("returns empty array when no annotations match the page", () => {
    const annotations = [
      makeAnnotation({ id: "a", page: 1, sentenceIndex: 0 }),
    ];

    expect(getPageSentenceAnnotations(annotations, 5)).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(getPageSentenceAnnotations([], 1)).toEqual([]);
  });
});
