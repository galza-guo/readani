import { describe, expect, test } from "bun:test";
import {
  addCompletedTranslateAllUnits,
  getTranslateAllTransientRetryLabel,
  getTranslateAllRateLimitBackoffMs,
  resetCompletedUnitsAfterPause,
  selectSlowModeEpubPageBatch,
  shouldAutoResumeTranslateAllQueue,
  shouldPauseTranslateAll,
  TRANSLATE_ALL_MAX_RETRIES_PER_PAGE,
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

  test("caps page retries at three", () => {
    expect(TRANSLATE_ALL_MAX_RETRIES_PER_PAGE).toBe(3);
  });

  test("does not auto-resume queued work while usage-limit pause is active", () => {
    expect(
      shouldAutoResumeTranslateAllQueue({
        hasQueuedWork: true,
        scheduledResume: false,
        usageLimitPaused: true,
      }),
    ).toBe(false);
  });

  test("does not auto-resume queued work when a delayed retry is already scheduled", () => {
    expect(
      shouldAutoResumeTranslateAllQueue({
        hasQueuedWork: true,
        scheduledResume: true,
        usageLimitPaused: false,
      }),
    ).toBe(false);
  });

  test("auto-resumes queued work only when the run is neither paused nor already scheduled", () => {
    expect(
      shouldAutoResumeTranslateAllQueue({
        hasQueuedWork: true,
        didErrorDuringBulkRun: false,
        scheduledResume: false,
        usageLimitPaused: false,
      }),
    ).toBe(true);
  });

  test("does not auto-resume queued work after a fatal bulk-run error", () => {
    expect(
      shouldAutoResumeTranslateAllQueue({
        hasQueuedWork: true,
        didErrorDuringBulkRun: true,
        scheduledResume: false,
        usageLimitPaused: false,
      }),
    ).toBe(false);
  });
});

describe("selectSlowModeEpubPageBatch", () => {
  const pages = [
    { paragraphs: [{ pid: "p1a" }, { pid: "p1b" }] },
    { paragraphs: [{ pid: "p2a" }, { pid: "p2b" }, { pid: "p2c" }] },
    { paragraphs: [{ pid: "p3a" }] },
  ];

  test("returns all queued paragraph ids from the first queued page", () => {
    expect(
      selectSlowModeEpubPageBatch(["p1a", "p2a", "p2b", "p3a"], pages),
    ).toEqual(["p1a"]);
  });

  test("returns paragraph ids from one page only even when queue spans many", () => {
    expect(
      selectSlowModeEpubPageBatch(["p2a", "p2b", "p2c", "p3a", "p1a"], pages),
    ).toEqual(["p2a", "p2b", "p2c"]);
  });

  test("falls back to the first queued id when nothing matches", () => {
    expect(
      selectSlowModeEpubPageBatch(["unknown1", "unknown2"], pages),
    ).toEqual(["unknown1"]);
  });

  test("preserves reading order within the selected page", () => {
    const bigPages = [
      { paragraphs: [{ pid: "a1" }, { pid: "a2" }, { pid: "a3" }, { pid: "a4" }] },
    ];
    expect(
      selectSlowModeEpubPageBatch(["a3", "a1", "a4", "a2"], bigPages),
    ).toEqual(["a3", "a1", "a4", "a2"]);
  });
});

describe("getTranslateAllTransientRetryLabel", () => {
  test("includes the page number when one is available", () => {
    expect(
      getTranslateAllTransientRetryLabel({
        errorKind: "network-request",
        page: 4,
        remainingSeconds: 45,
      }),
    ).toBe("Network error on page 4. Retrying in 45s");
  });

  test("omits the page phrase cleanly when no page is available", () => {
    expect(
      getTranslateAllTransientRetryLabel({
        errorKind: "network-request",
        page: null,
        remainingSeconds: 45,
      }),
    ).toBe("Network error. Retrying in 45s");
  });
});
