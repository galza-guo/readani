import type { SentenceAnnotation, PageDoc, Paragraph } from "../types";
import { hashString } from "./hash";

export type ResolvedSentenceAnnotation = SentenceAnnotation & {
  livePid?: string;
  liveSentenceIndex?: number;
  livePage?: number;
  resolvedStatus: "attached" | "needs-review";
};

/**
 * Resolve stored annotations against live page data.
 *
 * Matching cascade per annotation:
 * 1. Exact match: page + pid
 * 2. Positive match: page + sourceHash (closest duplicate by sentenceIndex)
 * 3. Positive match: page + sourceSnapshot (closest duplicate by sentenceIndex)
 * 4. Unresolved → mark as needs-review
 */
export function resolveAnnotations(
  annotations: SentenceAnnotation[],
  pageDocs: PageDoc[],
): ResolvedSentenceAnnotation[] {
  // Build an index: page → Paragraph[]
  const pageMap = new Map<number, Paragraph[]>();
  for (const pd of pageDocs) {
    pageMap.set(pd.page, pd.paragraphs);
  }

  return annotations.map((ann) => resolveOne(ann, pageMap));
}

function resolveOne(
  ann: SentenceAnnotation,
  pageMap: Map<number, Paragraph[]>,
): ResolvedSentenceAnnotation {
  const base: ResolvedSentenceAnnotation = {
    ...ann,
    resolvedStatus: ann.status,
  };

  const paragraphs = pageMap.get(ann.page);
  if (!paragraphs || paragraphs.length === 0) {
    // Page no longer exists — mark as needs-review
    return { ...base, resolvedStatus: "needs-review" };
  }

  // 1. Exact match: page + pid
  const pidMatchIndex = paragraphs.findIndex((p) => p.pid === ann.pid);
  if (pidMatchIndex >= 0) {
    const pidMatch = paragraphs[pidMatchIndex];
    return {
      ...base,
      livePid: pidMatch.pid,
      liveSentenceIndex: pidMatchIndex,
      livePage: ann.page,
      resolvedStatus: "attached",
    };
  }

  // 2. Positive match: page + sourceHash
  const hashMatch = ann.sourceHash
    ? findClosestMatch(
        paragraphs,
        (p) => hashString(p.source) === ann.sourceHash,
        ann.sentenceIndex,
      )
    : null;
  if (hashMatch) {
    return {
      ...base,
      livePid: hashMatch.pid,
      liveSentenceIndex: hashMatch.index,
      livePage: ann.page,
      resolvedStatus: "attached",
    };
  }

  // 3. Positive match: page + sourceSnapshot (string comparison)
  const snapshotMatch = ann.sourceSnapshot
    ? findClosestMatch(
        paragraphs,
        (p) => p.source === ann.sourceSnapshot,
        ann.sentenceIndex,
      )
    : null;
  if (snapshotMatch) {
    return {
      ...base,
      livePid: snapshotMatch.pid,
      liveSentenceIndex: snapshotMatch.index,
      livePage: ann.page,
      resolvedStatus: "attached",
    };
  }

  // 4. Unresolved → needs-review
  return { ...base, resolvedStatus: "needs-review" };
}

function findClosestMatch(
  paragraphs: Paragraph[],
  predicate: (paragraph: Paragraph) => boolean,
  sentenceIndex: number,
): { pid: string; index: number } | null {
  let bestMatch: { pid: string; index: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (!predicate(paragraphs[i])) {
      continue;
    }

    const dist = Math.abs(sentenceIndex - i);
    if (!bestMatch || dist < bestDistance) {
      bestMatch = { pid: paragraphs[i].pid, index: i };
      bestDistance = dist;
    }
  }

  return bestMatch;
}
