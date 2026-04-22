export const TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE = 3;
export const TRANSLATE_ALL_SLOW_MODE_PAUSE_MS = 12_000;
export const TRANSLATE_ALL_SLOW_MODE_INITIAL_BACKOFF_MS = 45_000;
export const TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS = 600_000;

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
