import { describe, expect, test } from "bun:test";
import { resolveLoadedDocumentIdentity } from "./documentIdentity";

describe("document identity", () => {
  test("keeps the stored recent-book identity when the file hash still matches", () => {
    const resolved = resolveLoadedDocumentIdentity({
      hash: "abc123def4567890",
      filePath: "/books/My Book.pdf",
      identity: {
        docId: "abc123def456",
        title: "Saved Title",
      },
    });

    expect(resolved).toEqual({
      docId: "abc123def456",
      title: "Saved Title",
    });
  });

  test("falls back to the actual file identity when the file contents changed", () => {
    const resolved = resolveLoadedDocumentIdentity({
      hash: "zzz999yyy888777",
      filePath: "/books/Replaced Book.pdf",
      identity: {
        docId: "abc123def456",
        title: "Old Saved Title",
      },
    });

    expect(resolved).toEqual({
      docId: "zzz999yyy888",
      title: "Replaced Book",
    });
  });
});
