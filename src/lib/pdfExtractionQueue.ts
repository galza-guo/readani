type BuildPdfExtractionPlanOptions = {
  totalPages: number;
  currentPage: number;
  extractedPages: number[];
  radius?: number;
};

export function buildPdfExtractionPlan({
  totalPages,
  currentPage,
  extractedPages,
  radius = 1,
}: BuildPdfExtractionPlanOptions): number[] {
  if (totalPages <= 0) {
    return [];
  }

  const extracted = new Set(extractedPages);
  const seen = new Set<number>();
  const plan: number[] = [];

  const pushPage = (page: number) => {
    if (page < 1 || page > totalPages || extracted.has(page) || seen.has(page)) {
      return;
    }

    seen.add(page);
    plan.push(page);
  };

  pushPage(currentPage);

  for (let distance = 1; distance <= totalPages; distance += 1) {
    pushPage(currentPage - distance);
    pushPage(currentPage + distance);
  }

  if (radius > 0) {
    const nearby = plan.slice(0, Math.min(plan.length, radius * 2 + 1));
    const remainder = plan.slice(nearby.length);
    return [...nearby, ...remainder];
  }

  return plan;
}
