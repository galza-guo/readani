import type { FileType } from "../types";

type GetDocumentProgressSnapshotArgs = {
  currentFileType: FileType;
  currentPage: number;
  pdfPageCount: number | null;
  pagesLength: number;
  epubTotalPages: number;
};

export function getDocumentProgressSnapshot({
  currentFileType,
  currentPage,
  pdfPageCount,
  pagesLength,
  epubTotalPages,
}: GetDocumentProgressSnapshotArgs) {
  const totalPages =
    currentFileType === "pdf"
      ? pdfPageCount ?? pagesLength
      : epubTotalPages || pagesLength;

  if (!Number.isFinite(totalPages) || totalPages <= 0) {
    return {
      totalPages: 0,
      percent: 0,
    };
  }

  const safePage = Math.min(Math.max(currentPage, 1), totalPages);

  return {
    totalPages,
    percent: (safePage / totalPages) * 100,
  };
}
