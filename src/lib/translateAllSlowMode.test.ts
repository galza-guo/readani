import { describe, expect, test } from "bun:test";
import {
  addCompletedTranslateAllUnits,
  getTranslateAllRateLimitBackoffMs,
  resetCompletedUnitsAfterPause,
  shouldPauseTranslateAll,
  TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE,
  TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS,
  TRANSLATE_ALL_SLOW_MODE_PAUSE_MS,
} from "./translateAllSlowMode";

describe("translateAllSlowMode", () => {
  test("uses a three-unit threshold and a twelve-second normal pause", () => {
    expect(TRANSLATE_ALL_SLOW_MODE_BATCH_SIZE).toBe(3);
    expect(TRANSLATE_ALL_SLOW_MODE_PAUSE_MS).toBe(12_000);
  });

  test("waits for the third completed unit before pausing", () => {
    expect(shouldPauseTranslateAll(1)).toBe(false);
    expect(shouldPauseTranslateAll(2)).toBe(false);
    expect(shouldPauseTranslateAll(3)).toBe(true);
  });

  test("resets completed units after a scheduled pause", () => {
    expect(resetCompletedUnitsAfterPause(2)).toBe(2);
    expect(resetCompletedUnitsAfterPause(3)).toBe(0);
    expect(resetCompletedUnitsAfterPause(4)).toBe(1);
  });

  test("accumulates completed translate-all units safely", () => {
    expect(addCompletedTranslateAllUnits(0, 1)).toBe(1);
    expect(addCompletedTranslateAllUnits(2, 3)).toBe(5);
    expect(addCompletedTranslateAllUnits(-1, 2)).toBe(2);
  });

  test("backs off rate-limit retries up to a ten-minute cap", () => {
    expect(getTranslateAllRateLimitBackoffMs(1)).toBe(45_000);
    expect(getTranslateAllRateLimitBackoffMs(2)).toBe(90_000);
    expect(getTranslateAllRateLimitBackoffMs(3)).toBe(180_000);
    expect(getTranslateAllRateLimitBackoffMs(4)).toBe(360_000);
    expect(getTranslateAllRateLimitBackoffMs(5)).toBe(TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS);
    expect(getTranslateAllRateLimitBackoffMs(6)).toBe(TRANSLATE_ALL_SLOW_MODE_MAX_BACKOFF_MS);
  });
});
