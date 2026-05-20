export type PdfPageSize = {
  width: number;
  height: number;
};

export type PdfPageSizeEntry = PdfPageSize | null;

export function createProgressivePdfPageSizes({
  totalPages,
  pageNumber,
  size,
}: {
  totalPages: number;
  pageNumber: number;
  size: PdfPageSize;
}): PdfPageSizeEntry[] {
  const pageCount = Math.max(0, Math.floor(totalPages));
  const sizes: PdfPageSizeEntry[] = Array.from(
    { length: pageCount },
    () => null,
  );
  const index = pageNumber - 1;

  if (index >= 0 && index < sizes.length) {
    sizes[index] = size;
  }

  return sizes;
}

export function mergeProgressivePdfPageSize(
  pageSizes: PdfPageSizeEntry[],
  pageNumber: number,
  size: PdfPageSize,
): PdfPageSizeEntry[] {
  const index = pageNumber - 1;

  if (index < 0 || index >= pageSizes.length) {
    return pageSizes;
  }

  const existing = pageSizes[index];
  if (existing?.width === size.width && existing.height === size.height) {
    return pageSizes;
  }

  const nextSizes = [...pageSizes];
  nextSizes[index] = size;
  return nextSizes;
}
