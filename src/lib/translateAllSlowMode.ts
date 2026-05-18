import { t } from "./i18n";

export const TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE = 3;
export const TRANSLATE_ALL_SLOW_MODE_PAUSE_MS = 12_000;
export const TRANSLATE_ALL_SLOW_MODE_INITIAL_BACKOFF_MS = 45_000;
export const TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS = 600_000;
export const TRANSLATE_ALL_MAX_RETRIES_PER_PAGE = 3;

export function addCompletedTranslateAllUnits(
  currentCompletedUnits: number,
  completedUnits: number,
) {
  return Math.max(0, currentCompletedUnits) + Math.max(0, completedUnits);
}

export function shouldPauseTranslateAll(
  completedUnitsSincePause: number,
) {
  return completedUnitsSincePause >= TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE;
}

export function resetCompletedUnitsAfterPause(
  completedUnitsSincePause: number,
) {
  if (!shouldPauseTranslateAll(completedUnitsSincePause)) {
    return completedUnitsSincePause;
  }

  return completedUnitsSincePause % TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE;
}

export function getTranslateAllRateLimitBackoffMs(
  consecutiveRateLimitHits: number,
) {
  const normalizedHits = Math.max(1, consecutiveRateLimitHits);
  const multiplier = 2 ** (normalizedHits - 1);

  return Math.min(
    TRANSLATE_ALL_SLOW_MODE_INITIAL_BACKOFF_MS * multiplier,
    TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS,
  );
}

export function shouldAutoResumeTranslateAllQueue(args: {
  hasQueuedWork: boolean;
  didErrorDuringBulkRun?: boolean;
  scheduledResume: boolean;
  usageLimitPaused: boolean;
}) {
  return (
    args.hasQueuedWork &&
    !args.didErrorDuringBulkRun &&
    !args.scheduledResume &&
    !args.usageLimitPaused
  );
}

export function getTranslateAllTransientRetryLabel(args: {
  errorKind?: string;
  page: number | null;
  remainingSeconds: number;
}) {
  if (args.errorKind === "rate-limit") {
    if (args.page !== null) {
      return t("readerStatus.translateAll.rateLimitHit", {
        page: String(args.page),
        remainingSeconds: String(args.remainingSeconds),
      });
    }
    return t("readerStatus.translateAll.rateLimitHitShort", {
      remainingSeconds: String(args.remainingSeconds),
    });
  }

  const errorLabel =
    args.errorKind === "network-request"
      ? t("readerStatus.translateAll.errorNetwork")
      : args.errorKind === "timeout"
        ? t("readerStatus.translateAll.errorTimeout")
        : args.errorKind === "provider-unavailable"
          ? t("readerStatus.translateAll.errorProviderUnavailable")
          : t("readerStatus.translateAll.errorGeneric");

  if (args.page !== null) {
    return t("readerStatus.translateAll.transientRetryLabel", {
      error: errorLabel,
      page: String(args.page),
      remainingSeconds: String(args.remainingSeconds),
    });
  }
  return t("readerStatus.translateAll.transientRetryLabelNoPage", {
    error: errorLabel,
    remainingSeconds: String(args.remainingSeconds),
  });
}

export function selectSlowModeEpubPageBatch(
  queuedParagraphIds: string[],
  pages: { paragraphs: { pid: string }[] }[],
): string[] {
  const paragraphPageIndex = new Map<string, number>();
  for (const [pageIndex, page] of pages.entries()) {
    for (const paragraph of page.paragraphs) {
      paragraphPageIndex.set(paragraph.pid, pageIndex);
    }
  }

  let targetPageIndex: number | undefined;
  for (const id of queuedParagraphIds) {
    const index = paragraphPageIndex.get(id);
    if (index !== undefined) {
      targetPageIndex = index;
      break;
    }
  }

  if (targetPageIndex === undefined) {
    return queuedParagraphIds.slice(0, 1);
  }

  const pagePidSet = new Set(
    pages[targetPageIndex].paragraphs.map((p) => p.pid),
  );

  const selected: string[] = [];
  for (const id of queuedParagraphIds) {
    if (pagePidSet.has(id)) {
      selected.push(id);
    }
  }

  return selected.length > 0 ? selected : queuedParagraphIds.slice(0, 1);
}
