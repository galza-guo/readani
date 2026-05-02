import type {
  SentenceAnnotation,
  AnnotationDisplayGroup,
  SentenceAnnotationStatus,
} from "../types";

type AnnotationLike = SentenceAnnotation & {
  resolvedStatus?: SentenceAnnotationStatus;
  liveSentenceIndex?: number;
};

function getAnnotationIndex(annotation: AnnotationLike) {
  return annotation.liveSentenceIndex ?? annotation.sentenceIndex;
}

/** Sort annotations by page, then sentence index. */
export function sortSentenceAnnotations<T extends AnnotationLike>(
  annotations: T[],
): T[] {
  return [...annotations].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return getAnnotationIndex(a) - getAnnotationIndex(b);
  });
}

/** Group adjacent sentence annotations on the same page into display groups.
 *  Annotations must be adjacent in sentence index and on the same page.
 *  Break groups when pages change or sentence indexes are not adjacent. */
export function groupSentenceAnnotations(
  annotations: AnnotationLike[],
): AnnotationDisplayGroup[] {
  const sorted = sortSentenceAnnotations(annotations);
  const groups: AnnotationDisplayGroup[] = [];

  let i = 0;
  while (i < sorted.length) {
    const first = sorted[i];
    const firstIndex = getAnnotationIndex(first);
    const groupAnnotations: AnnotationLike[] = [first];
    let j = i + 1;

    while (
      j < sorted.length &&
      sorted[j].page === first.page &&
      getAnnotationIndex(sorted[j]) ===
        getAnnotationIndex(groupAnnotations[groupAnnotations.length - 1]) + 1
    ) {
      groupAnnotations.push(sorted[j]);
      j++;
    }

    const last = groupAnnotations[groupAnnotations.length - 1];
    const lastIndex = getAnnotationIndex(last);

    groups.push({
      docId: first.docId,
      page: first.page,
      annotationIds: groupAnnotations.map((a) => a.id),
      startSentenceIndex: firstIndex,
      endSentenceIndex: lastIndex,
      excerpt: first.sourceSnapshot,
      noteCount: groupAnnotations.filter(
        (a) => a.note !== undefined && a.note !== "",
      ).length,
      hasNeedsReview: groupAnnotations.some(
        (a) => (a.resolvedStatus ?? a.status) === "needs-review",
      ),
    });

    i = j;
  }

  return groups;
}

/** Filter annotations to a specific page. */
export function getPageSentenceAnnotations(
  annotations: SentenceAnnotation[],
  page: number,
): SentenceAnnotation[] {
  return annotations.filter((a) => a.page === page);
}
