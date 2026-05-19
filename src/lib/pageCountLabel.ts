export function formatPageCountLabel(
  currentPage: number,
  totalPages: number | null | undefined,
) {
  return `${currentPage} / ${formatTotalPagesSuffix(totalPages)}`;
}

export function formatTotalPagesSuffix(totalPages: number | null | undefined) {
  if (
    typeof totalPages === "number" &&
    Number.isFinite(totalPages) &&
    totalPages > 0
  ) {
    return String(totalPages);
  }

  return "-";
}
