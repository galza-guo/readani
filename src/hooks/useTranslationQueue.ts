import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { hasPresetTranslationContext } from "../lib/appSettings";
import { resolveTargetLanguage } from "../lib/appSettings";
import {
  buildPdfPageTranslatedText,
  getTranslatablePdfParagraphs,
  isPdfPageFullyTranslated,
} from "../lib/pdfSegments";
import { buildPageTranslationPayload, hasUsablePageText } from "../lib/pageText";
import { getReaderStatusLabel } from "../lib/readerStatus";
import {
  TRANSLATION_SETUP_REQUIRED_MESSAGE,
  getProviderErrorDetail,
  getTranslateAllSlowModeErrorAction,
} from "../lib/providerErrors";
import {
  clearPageTranslationsForTargetLanguageChange,
  getFallbackFailureStatusMessage,
  getFriendlyFallbackError,
  invokeWithTimeout,
  sanitizeEpubPagesForPresetChange,
  sanitizePdfTranslationsForPresetChange,
} from "../lib/translationHelpers";
import {
  bumpRequestVersion,
  dequeueNextPage,
  enqueueBackgroundPages,
  enqueueForegroundPage,
  isRequestVersionCurrent,
  shouldContinueQueuedPageTranslations,
} from "../lib/pageTranslationScheduler";
import {
  addCompletedTranslateAllUnits,
  getTranslateAllTransientRetryLabel,
  getTranslateAllRateLimitBackoffMs,
  resetCompletedUnitsAfterPause,
  selectSlowModeEpubPageBatch,
  shouldAutoResumeTranslateAllQueue,
  shouldPauseTranslateAll,
  TRANSLATE_ALL_MAX_RETRIES_PER_PAGE,
  TRANSLATE_ALL_SLOW_MODE_PAUSE_MS,
} from "../lib/translateAllSlowMode";
import {
  applyCachedPdfPageTranslations,
  type CachedPdfPageTranslation,
} from "../lib/pdfCacheHydration";
import {
  getEpubSectionTranslationProgress,
  getFullBookActionLabel,
  getPageProgressMap,
  getPageTranslationProgress,
} from "../lib/pageTranslationScheduler";
import { t } from "../lib/i18n";
import type { LRUCache } from "../lib/lruCache";
import type {
  BatchTranslationResult,
  BookTranslationPreference,
  FileType,
  PageDoc,
  PageTranslationState,
  TargetLanguage,
  TranslationFallbackTrace,
  TranslationPreset,
  TranslationSettings,
} from "../types";

// --- Internal constants ---

const FRONTEND_TIMEOUT_MS = 95_000;

const FALLBACK_PROGRESS_EVENT = "translation-fallback-progress";
const FALLBACK_FAILURE_EVENT = "translation-fallback-failure";

// --- Internal types ---

type TranslationFallbackProgressPayload = {
  requestId: string;
  message: string;
};

type TranslationFallbackFailurePayload = {
  requestId: string;
  trace: TranslationFallbackTrace;
};

type FallbackRequestContext =
  | {
      kind: "pdf-page";
      page: number;
      requestVersion: number;
      sessionId: number;
    }
  | {
      kind: "epub-batch";
      requestId: number;
    };

type ShowToastFn = (args: {
  message: string;
  detail?: string;
  tone?: "success" | "error" | "neutral";
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}) => void;

type GetEffectivePresetFn = (
  settings?: TranslationSettings,
) => TranslationPreset | null | undefined;

type WordTranslationHook = {
  textTranslationCacheRef: React.MutableRefObject<LRUCache<string, string>>;
  handleClearSelectionTranslation: () => void;
  handleClearWordTranslation: () => void;
};

// --- Hook args ---

export type UseTranslationQueueArgs = {
  // Document identity
  currentFileType: FileType;
  currentPage: number;
  docId: string;
  docIdRef: React.MutableRefObject<string>;

  // Pages (shared state — read/write)
  pages: PageDoc[];
  setPages: React.Dispatch<React.SetStateAction<PageDoc[]>>;
  pagesRef: React.MutableRefObject<PageDoc[]>;

  // Page translations (shared state — read/write)
  pageTranslations: Record<number, PageTranslationState>;
  setPageTranslations: React.Dispatch<
    React.SetStateAction<Record<number, PageTranslationState>>
  >;
  pageTranslationsRef: React.MutableRefObject<
    Record<number, PageTranslationState>
  >;

  // Settings
  settingsRef: React.MutableRefObject<TranslationSettings>;
  settingsLoaded: boolean;
  systemLocale: string;
  currentTargetLanguageRef: React.MutableRefObject<TargetLanguage>;
  translationEnabledRef: React.MutableRefObject<boolean>;
  getEffectivePreset: GetEffectivePresetFn;
  effectivePreset: TranslationPreset | null | undefined;
  activePresetHasTranslationContext: boolean;
  showTranslationSetupToast: () => void;

  // Book preferences
  bookTranslationPreferences: Record<string, BookTranslationPreference>;
  setBookTranslationPreferences: React.Dispatch<
    React.SetStateAction<Record<string, BookTranslationPreference>>
  >;

  // PDF-specific
  pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null;
  allPdfPagesExtracted: boolean;

  // UI callbacks
  showToast: ShowToastFn;
  setTranslationStatusMessage: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  showFallbackSuccessToast: (trace: TranslationFallbackTrace) => void;

  // External hooks
  wordTranslationHook: WordTranslationHook;
  pdfTranslationSessionRef: React.MutableRefObject<number>;

  // Settings persistence bridge
  updateSettingsDraftState: (s: TranslationSettings | null) => void;
  persistSettings: (s: TranslationSettings) => Promise<TranslationSettings>;
  settingsDraftRef: React.MutableRefObject<TranslationSettings | null>;
};

// --- Hook return ---

export type TranslationQueueResult = {
  // State
  isTranslateAllRunning: boolean;
  translateAllWaitState: {
    kind: "slow-pause" | "rate-limit" | "transient-retry" | "usage-limit";
    resumeAt?: number;
    page: number | null;
    errorKind?: string;
  } | null;
  translateAllWaitTick: number;
  isTranslateAllStopRequested: boolean;
  pageTranslationInFlightPage: number | null;
  translateAllUsageLimitPaused: boolean;
  translationEnabled: boolean;
  currentTargetLanguage: TargetLanguage;

  // Refs (for external consumers like loadPdfFromPath)
  isTranslateAllRunningRef: React.MutableRefObject<boolean>;
  pdfTranslationSessionRef: React.MutableRefObject<number>;
  translateAllErrorToastShownRef: React.MutableRefObject<boolean>;
  foregroundPageTranslateQueueRef: React.MutableRefObject<number[]>;
  backgroundPageTranslateQueueRef: React.MutableRefObject<number[]>;

  // Computed
  pageProgressMap: ReturnType<typeof getPageProgressMap>;
  translationProgressLabel: string | null;
  translateAllActionLabel: string;
  translateAllProgressDetail: {
    label: string | null;
    state: "waiting" | "running" | "stopping" | "paused" | null;
  };
  pdfProgressDetailLabel: string | null;
  pdfProgressDetailState: "waiting" | "running" | "stopping" | "paused" | null;
  currentPdfLoadingMessage: string | null;
  currentPdfPageDoc: PageDoc | undefined;
  showPdfSetupPrompt: boolean;
  canRedoCurrentPage: boolean;
  canTranslateAll: boolean;

  // Methods
  resetTranslateAllSlowModeRuntime: () => void;
  queuePagesForTranslation: (
    pageNumbers: number[],
    options?: {
      priority: "foreground" | "background";
      forceFresh?: boolean;
    },
  ) => void;
  runPageTranslationQueue: () => Promise<void>;
  runTranslateQueue: () => Promise<void>;
  startTranslateAll: (mode: "skip-cached" | "replace-all") => Promise<void>;
  stopTranslateAll: () => void;
  handleTranslateAllAction: () => Promise<void>;
  resumeTranslateAllAfterUsageLimit: () => void;
  handleTranslatePid: (pid: string, forceRetry?: boolean) => void;
  handleRedoPageTranslation: (pageNumber: number) => Promise<void>;
  handleTranslationPreferenceChange: (
    preference: BookTranslationPreference,
  ) => void;
  handleReaderSettingsChange: (nextSettings: TranslationSettings) => Promise<void>;
  showFallbackSuccessToast: (trace: TranslationFallbackTrace) => void;
  resetTranslationQueueForNewDocument: () => void;
};

// --- Hook implementation ---

export function useTranslationQueue(
  args: UseTranslationQueueArgs,
): TranslationQueueResult {
  const {
    currentFileType,
    currentPage,
    docId,
    docIdRef,
    pages,
    setPages,
    pagesRef,
    pageTranslations,
    setPageTranslations,
    pageTranslationsRef,
    settingsRef,
    settingsLoaded,
    systemLocale,
    currentTargetLanguageRef,
    translationEnabledRef,
    getEffectivePreset,
    effectivePreset,
    activePresetHasTranslationContext,
    showTranslationSetupToast,
    bookTranslationPreferences,
    setBookTranslationPreferences,
    pdfDoc,
    allPdfPagesExtracted,
    showToast,
    setTranslationStatusMessage,
    showFallbackSuccessToast,
    wordTranslationHook,
    pdfTranslationSessionRef,
    updateSettingsDraftState,
    persistSettings,
    settingsDraftRef,
  } = args;

  // --- Translation state ---

  const [isTranslateAllRunning, setIsTranslateAllRunning] = useState(false);
  const [translateAllWaitState, setTranslateAllWaitState] = useState<{
    kind: "slow-pause" | "rate-limit" | "transient-retry" | "usage-limit";
    resumeAt?: number;
    page: number | null;
    errorKind?: string;
  } | null>(null);
  const [translateAllWaitTick, setTranslateAllWaitTick] = useState(
    () => Date.now(),
  );
  const [isTranslateAllStopRequested, setIsTranslateAllStopRequested] =
    useState(false);
  const [pageTranslationInFlightPage, setPageTranslationInFlightPage] =
    useState<number | null>(null);
  const [translateAllUsageLimitPaused, setTranslateAllUsageLimitPaused] =
    useState(false);

  // --- Translation refs ---

  const translationRequestId = useRef(0);
  const translatingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const translateQueueRef = useRef<string[]>([]);
  const forceFreshSentenceTranslationIdsRef = useRef<Set<string>>(new Set());
  const foregroundPageTranslateQueueRef = useRef<number[]>([]);
  const backgroundPageTranslateQueueRef = useRef<number[]>([]);
  const pageTranslationRequestVersionsRef = useRef<Record<number, number>>({});
  const pageTranslationInFlightRef = useRef<number | null>(null);
  const pageTranslatingRef = useRef(false);
  const isTranslateAllRunningRef = useRef(false);
  const translateAllResumeTimerRef = useRef<number | null>(null);
  const translateAllCompletedUnitsRef = useRef(0);
  const translateAllRateLimitStreakRef = useRef(0);
  const translateAllErrorToastShownRef = useRef(false);
  const translateAllPdfRetryCountRef = useRef<Map<number, number>>(new Map());
  const translateAllEpubRetryCountRef = useRef<Map<number, number>>(new Map());
  const translateAllUsageLimitPausedRef = useRef(false);
  const fallbackToastEligiblePdfPagesRef = useRef<Set<number>>(new Set());
  const fallbackRequestContextsRef = useRef<
    Record<string, FallbackRequestContext>
  >({});
  const fallbackFailureTracesRef = useRef<
    Record<string, TranslationFallbackTrace>
  >({});

  // --- Derived values from book preferences ---

  const currentBookTranslationResolution =
    resolveBookTranslationPreferenceLocal({
      docId,
      preferences: bookTranslationPreferences,
      defaultLanguage: settingsRef.current.defaultLanguage,
    });
  const currentBookTranslationPreference =
    currentBookTranslationResolution.preference;
  const translationEnabled = currentBookTranslationPreference.enabled;
  const currentTargetLanguage = currentBookTranslationPreference.targetLanguage;
  const resolvedCurrentTargetLanguageLocal = resolveTargetLanguage(
    currentTargetLanguage,
    settingsRef.current.appLanguage,
    systemLocale,
  );

  // --- Helper callbacks ---

  const clearTranslateAllResumeTimer = useCallback(() => {
    if (translateAllResumeTimerRef.current !== null) {
      window.clearTimeout(translateAllResumeTimerRef.current);
      translateAllResumeTimerRef.current = null;
    }

    setTranslateAllWaitState(null);
    setTranslateAllWaitTick(Date.now());
  }, []);

  const resetTranslateAllSlowModeRuntime = useCallback(() => {
    clearTranslateAllResumeTimer();
    translateAllCompletedUnitsRef.current = 0;
    translateAllRateLimitStreakRef.current = 0;
    translateAllPdfRetryCountRef.current.clear();
    translateAllEpubRetryCountRef.current.clear();
    setTranslateAllUsageLimitPaused(false);
    translateAllUsageLimitPausedRef.current = false;
  }, [clearTranslateAllResumeTimer]);

  const scheduleTranslateAllResume = useCallback(
    (
      delayMs: number,
      waitState: {
        kind: "slow-pause" | "rate-limit" | "transient-retry";
        page: number | null;
        errorKind?: string;
      },
      resumeWork: () => void,
    ) => {
      clearTranslateAllResumeTimer();
      const resumeAt = Date.now() + delayMs;
      setTranslateAllWaitState({
        ...waitState,
        resumeAt,
      });
      setTranslateAllWaitTick(Date.now());
      translateAllResumeTimerRef.current = window.setTimeout(() => {
        translateAllResumeTimerRef.current = null;
        setTranslateAllWaitState(null);
        setTranslateAllWaitTick(Date.now());
        resumeWork();
      }, delayMs);
    },
    [clearTranslateAllResumeTimer],
  );

  // --- Sync effects ---

  useEffect(() => {
    isTranslateAllRunningRef.current = isTranslateAllRunning;
  }, [isTranslateAllRunning]);

  useEffect(() => {
    if (!translateAllWaitState) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTranslateAllWaitTick(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [translateAllWaitState]);

  useEffect(() => {
    return () => {
      clearTranslateAllResumeTimer();
    };
  }, [clearTranslateAllResumeTimer]);

  // --- Tauri event listeners ---

  useEffect(() => {
    let isMounted = true;
    let unlistenProgress: (() => void) | undefined;
    let unlistenFailure: (() => void) | undefined;

    void listen<TranslationFallbackProgressPayload>(
      FALLBACK_PROGRESS_EVENT,
      (event) => {
        const payload = event.payload;
        const context = fallbackRequestContextsRef.current[payload.requestId];
        if (!context) {
          return;
        }

        if (context.kind === "pdf-page") {
          if (
            pdfTranslationSessionRef.current !== context.sessionId ||
            !isRequestVersionCurrent(
              pageTranslationRequestVersionsRef.current,
              context.page,
              context.requestVersion,
            )
          ) {
            return;
          }

          setPageTranslations((prev) => {
            const existing = prev[context.page];
            if (
              !existing ||
              (existing.status !== "loading" && existing.status !== "queued")
            ) {
              return prev;
            }

            return {
              ...prev,
              [context.page]: {
                ...existing,
                activityMessage: payload.message,
              },
            };
          });
          if (!isTranslateAllRunningRef.current) {
            showToast({
              message: payload.message,
              durationMs: 3200,
            });
          }
          return;
        }

        if (translationRequestId.current === context.requestId) {
          if (!isTranslateAllRunningRef.current) {
            showToast({
              message: payload.message,
              durationMs: 3200,
            });
          }
        }
      },
    ).then((dispose) => {
      if (!isMounted) {
        dispose();
        return;
      }
      unlistenProgress = dispose;
    });

    void listen<TranslationFallbackFailurePayload>(
      FALLBACK_FAILURE_EVENT,
      (event) => {
        fallbackFailureTracesRef.current[event.payload.requestId] =
          event.payload.trace;
      },
    ).then((dispose) => {
      if (!isMounted) {
        dispose();
        return;
      }
      unlistenFailure = dispose;
    });

    return () => {
      isMounted = false;
      unlistenProgress?.();
      unlistenFailure?.();
    };
  }, [showToast]);

  // --- Book translation preference persistence ---

  useEffect(() => {
    if (!docId || !currentBookTranslationResolution.shouldPersist) {
      return;
    }

    setBookTranslationPreferences((prev) => {
      if (prev[docId]) {
        return prev;
      }

      const next = {
        ...prev,
        [docId]: currentBookTranslationPreference,
      };
      saveBookTranslationPreferencesLocal(next);
      return next;
    });
  }, [
    currentBookTranslationPreference,
    currentBookTranslationResolution.shouldPersist,
    docId,
    setBookTranslationPreferences,
  ]);

  useEffect(() => {
    currentTargetLanguageRef.current = resolvedCurrentTargetLanguageLocal;
  }, [resolvedCurrentTargetLanguageLocal]);

  useEffect(() => {
    translationEnabledRef.current = translationEnabled;
  }, [translationEnabled]);

  // --- Computed values ---

  const pageTranslationProgress = getPageTranslationProgress({ pages });

  const pageProgressMap =
    currentFileType === "pdf" && pages.length > 0
      ? getPageProgressMap(pages, pageTranslations, {
          foregroundQueue: foregroundPageTranslateQueueRef.current,
          inFlightPage: pageTranslationInFlightPage,
        })
      : [];

  const epubSectionTranslationProgress =
    getEpubSectionTranslationProgress(pages);

  const translationProgress =
    currentFileType === "pdf"
      ? pageTranslationProgress
      : epubSectionTranslationProgress;

  const translationProgressLabel = (() => {
    if (!translationEnabled) {
      return null;
    }

    if (
      (currentFileType === "pdf" && !allPdfPagesExtracted) ||
      translationProgress.totalCount === 0
    ) {
      return null;
    }

    if (translationProgress.isFullyTranslated) {
      return t("translation.progressFullyTranslated");
    }

    return t("translation.progressCountOfTotal", {
      translatedCount: String(translationProgress.translatedCount),
      totalCount: String(translationProgress.totalCount),
      unitLabel: translationProgress.unitLabel,
    });
  })();

  const translateAllActionLabel = (() => {
    if (!translationEnabled) {
      return t("translation.progressTranslationOff");
    }

    if (translateAllUsageLimitPaused) {
      return t("translation.progressContinue");
    }

    if (isTranslateAllStopRequested) {
      return t("translation.progressStopping");
    }

    if (isTranslateAllRunning) {
      return t("translation.progressStopTranslatingAll");
    }

    return getFullBookActionLabel(translationProgress);
  })();

  const translateAllProgressDetail = (() => {
    if (!isTranslateAllRunning) {
      return {
        label: null,
        state: null,
      } as const;
    }

    if (translateAllWaitState) {
      if (translateAllWaitState.kind === "usage-limit") {
        return {
          label: t("translation.progressPausedOutOfCredits"),
          state: "paused" as const,
        };
      }

      const remainingSeconds = translateAllWaitState.resumeAt
        ? Math.max(
            1,
            Math.ceil(
              (translateAllWaitState.resumeAt - translateAllWaitTick) / 1_000,
            ),
          )
        : 0;

      if (translateAllWaitState.kind === "slow-pause") {
        return {
          label: t("translation.progressSlowModePause", {
            remainingSeconds: String(remainingSeconds),
          }),
          state: "waiting" as const,
        };
      }

      if (translateAllWaitState.kind === "transient-retry") {
        return {
          label: getTranslateAllTransientRetryLabel({
            errorKind: translateAllWaitState.errorKind,
            page: translateAllWaitState.page,
            remainingSeconds,
          }),
          state: "waiting" as const,
        };
      }

      // Legacy rate-limit kind
      return {
        label:
          currentFileType === "pdf" && translateAllWaitState.page !== null
            ? t("translation.progressRateLimitHitPage", {
                page: String(translateAllWaitState.page),
                remainingSeconds: String(remainingSeconds),
              })
            : t("translation.progressRateLimitHit", {
                remainingSeconds: String(remainingSeconds),
              }),
        state: "waiting" as const,
      };
    }

    if (translateAllUsageLimitPaused) {
      return {
        label: t("translation.progressPausedOutOfCredits"),
        state: "paused" as const,
      };
    }

    if (currentFileType === "pdf") {
      if (isTranslateAllStopRequested) {
        return {
          label:
            pageTranslationInFlightPage !== null
              ? t("translation.progressStoppingAfterPage", {
                  page: String(pageTranslationInFlightPage),
                })
              : t("translation.progressStoppingSimple"),
          state: "stopping" as const,
        };
      }

      return {
        label:
          pageTranslationInFlightPage !== null
            ? t("translation.progressTranslatingPage", {
                page: String(pageTranslationInFlightPage),
              })
            : t("translation.progressPreparingPages"),
        state: "running" as const,
      };
    }

    if (isTranslateAllStopRequested) {
      return {
        label: t("translation.progressStoppingAfterBatch"),
        state: "stopping" as const,
      };
    }

    return {
      label: translationProgress.isFullyTranslated
        ? t("translation.progressRetranslatingSections")
        : t("translation.progressTranslatingSections"),
      state: "running" as const,
    };
  })();

  // --- PDF loading message ---

  const currentPdfPagePayload =
    currentFileType !== "pdf" || pages.length === 0
      ? null
      : buildPageTranslationPayload(pages, currentPage);

  const currentPdfTranslation =
    currentFileType === "pdf" ? pageTranslations[currentPage] : undefined;
  const currentPdfPageDoc =
    currentFileType === "pdf"
      ? pages.find((entry) => entry.page === currentPage)
      : undefined;

  const showPdfSetupPrompt =
    settingsLoaded &&
    translationEnabled &&
    currentFileType === "pdf" &&
    Boolean(
      currentPdfPagePayload &&
        hasUsablePageText(currentPdfPagePayload.displayText),
    ) &&
    currentPdfTranslation?.status !== "done" &&
    currentPdfTranslation?.status !== "unavailable" &&
    (currentPdfTranslation?.status === "setup-required" ||
      !activePresetHasTranslationContext);

  const currentPdfLoadingMessage =
    currentFileType !== "pdf"
      ? null
      : getPdfPageLoadingMessage({
          currentPage,
          currentPageDoc: currentPdfPageDoc,
          currentPageTranslation: currentPdfTranslation,
          inFlightPage: pageTranslationInFlightPage,
        });

  const pdfBackgroundTranslationMessage =
    currentFileType === "pdf" && !currentPdfLoadingMessage
      ? getPdfBackgroundTranslationMessage({
          currentPage,
          inFlightPage: pageTranslationInFlightPage,
          isTranslateAllRunning,
        })
      : null;

  const pdfProgressDetailLabel =
    translateAllProgressDetail.label ?? pdfBackgroundTranslationMessage;
  const pdfProgressDetailState =
    translateAllProgressDetail.state ??
    (pdfBackgroundTranslationMessage ? ("running" as const) : null);

  const canRedoCurrentPage =
    translationEnabled &&
    currentFileType === "pdf" &&
    Boolean(pages.find((page) => page.page === currentPage)?.isExtracted) &&
    Boolean(
      currentPdfPagePayload &&
        hasUsablePageText(currentPdfPagePayload.displayText),
    );

  const canTranslateAll =
    translationEnabled &&
    ((currentFileType === "pdf" && allPdfPagesExtracted) ||
      currentFileType === "epub") &&
    translationProgress.totalCount > 0;

  // --- Core translation queue: PDF page translation ---

  const runPageTranslationQueue = useCallback(async () => {
    if (
      currentFileType !== "pdf" ||
      !translationEnabledRef.current ||
      pageTranslatingRef.current ||
      !docIdRef.current ||
      (isTranslateAllRunningRef.current &&
        translateAllUsageLimitPausedRef.current)
    ) {
      return;
    }

    const queued = dequeueNextPage({
      foregroundQueue: foregroundPageTranslateQueueRef.current,
      backgroundQueue: backgroundPageTranslateQueueRef.current,
      inFlightPages:
        pageTranslationInFlightRef.current === null
          ? []
          : [pageTranslationInFlightRef.current],
    });

    foregroundPageTranslateQueueRef.current = queued.foregroundQueue;
    backgroundPageTranslateQueueRef.current = queued.backgroundQueue;

    const nextPage = queued.page;
    if (!nextPage) return;

    const pageDoc = pagesRef.current.find((entry) => entry.page === nextPage);
    if (!pageDoc?.isExtracted) {
      void runPageTranslationQueue();
      return;
    }

    const payload = buildPageTranslationPayload(pagesRef.current, nextPage);
    const translatableParagraphs = getTranslatablePdfParagraphs(pageDoc);
    if (
      translatableParagraphs.length === 0 ||
      !hasUsablePageText(payload.displayText)
    ) {
      setPageTranslations((prev) => ({
        ...prev,
        [nextPage]: {
          page: nextPage,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          status: "unavailable",
        },
      }));
      void runPageTranslationQueue();
      return;
    }

    const pendingParagraphs = translatableParagraphs.filter((paragraph) => {
      return (
        forceFreshSentenceTranslationIdsRef.current.has(paragraph.pid) ||
        paragraph.status !== "done" ||
        !paragraph.translation?.trim()
      );
    });

    if (pendingParagraphs.length === 0) {
      setPageTranslations((prev) => ({
        ...prev,
        [nextPage]: {
          page: nextPage,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          translatedText: buildPdfPageTranslatedText(pageDoc),
          status: "done",
          activityMessage: undefined,
          error: undefined,
          errorChecks: undefined,
          fallbackTrace: prev[nextPage]?.fallbackTrace,
          isCached: prev[nextPage]?.isCached,
        },
      }));
      void runPageTranslationQueue();
      return;
    }

    const sessionId = pdfTranslationSessionRef.current;
    const requestVersion =
      pageTranslationRequestVersionsRef.current[nextPage] ?? 0;
    const pendingParagraphIds = new Set(
      pendingParagraphs.map((paragraph) => paragraph.pid),
    );
    pageTranslatingRef.current = true;
    pageTranslationInFlightRef.current = nextPage;
    setPageTranslationInFlightPage(nextPage);
    setPages((prev) =>
      prev.map((page) =>
        page.page === nextPage
          ? {
              ...page,
              paragraphs: page.paragraphs.map((paragraph) =>
                pendingParagraphIds.has(paragraph.pid)
                  ? { ...paragraph, status: "loading" as const }
                  : paragraph,
              ),
            }
          : page,
      ),
    );
    setPageTranslations((prev) => ({
      ...prev,
      [nextPage]: {
        page: nextPage,
        displayText: payload.displayText,
        previousContext: payload.previousContext,
        nextContext: payload.nextContext,
        translatedText: prev[nextPage]?.translatedText,
        status: "loading",
        isCached: prev[nextPage]?.isCached,
        activityMessage: "Translating this page...",
        error: undefined,
        errorChecks: undefined,
      },
    }));
    setTranslationStatusMessage(
      getReaderStatusLabel("translating-page", { page: nextPage }),
    );
    let didError = false;
    let scheduledResume = false;
    const fallbackRequestId = `pdf-page:${nextPage}:${requestVersion}:${sessionId}:${Date.now()}`;

    try {
      const currentSettings = settingsRef.current;
      const currentPreset = getEffectivePreset(currentSettings);
      if (!currentPreset) {
        throw new Error("No active preset configured.");
      }
      fallbackRequestContextsRef.current[fallbackRequestId] = {
        kind: "pdf-page",
        page: nextPage,
        requestVersion,
        sessionId,
      };
      delete fallbackFailureTracesRef.current[fallbackRequestId];

      const result = (await invokeWithTimeout(
        invoke("openrouter_translate", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          temperature: 0,
          targetLanguage: currentTargetLanguageRef.current,
          sentences: pendingParagraphs.map((paragraph) => ({
            sid: paragraph.pid,
            text: paragraph.source,
          })),
          forceFreshIds: pendingParagraphs
            .filter((paragraph) =>
              forceFreshSentenceTranslationIdsRef.current.has(paragraph.pid),
            )
            .map((paragraph) => paragraph.pid),
          requestId: fallbackRequestId,
        }) as Promise<BatchTranslationResult>,
        FRONTEND_TIMEOUT_MS,
        "Translation timed out after 90 seconds while waiting for this page.",
      )) as BatchTranslationResult;
      delete fallbackRequestContextsRef.current[fallbackRequestId];
      delete fallbackFailureTracesRef.current[fallbackRequestId];

      if (
        sessionId !== pdfTranslationSessionRef.current ||
        !isRequestVersionCurrent(
          pageTranslationRequestVersionsRef.current,
          nextPage,
          requestVersion,
        )
      ) {
        return;
      }

      const translationMap = new Map(
        result.results.map((item) => [item.sid, item.translation]),
      );
      const hasMissingTranslation = pendingParagraphs.some(
        (paragraph) => !translationMap.get(paragraph.pid),
      );
      if (hasMissingTranslation) {
        throw new Error("Translation returned incomplete segment results.");
      }

      const updatedPage: PageDoc = {
        ...pageDoc,
        paragraphs: pageDoc.paragraphs.map((paragraph) => {
          if (!pendingParagraphIds.has(paragraph.pid)) {
            return paragraph;
          }

          return {
            ...paragraph,
            translation: translationMap.get(paragraph.pid),
            status: "done" as const,
          };
        }),
      };

      setPages((prev) =>
        prev.map((page) => (page.page === nextPage ? updatedPage : page)),
      );
      pendingParagraphs.forEach((paragraph) =>
        forceFreshSentenceTranslationIdsRef.current.delete(paragraph.pid),
      );

      setPageTranslations((prev) => ({
        ...prev,
        [nextPage]: {
          page: nextPage,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          translatedText: buildPdfPageTranslatedText(updatedPage),
          status: "done",
          isCached: false,
          fallbackTrace: result.fallbackTrace,
        },
      }));
      const shouldShowFallbackToast =
        fallbackToastEligiblePdfPagesRef.current.has(nextPage) &&
        !isTranslateAllRunningRef.current;
      fallbackToastEligiblePdfPagesRef.current.delete(nextPage);
      if (shouldShowFallbackToast) {
        showFallbackSuccessToast(result.fallbackTrace);
      }
      if (isTranslateAllRunningRef.current) {
        translateAllRateLimitStreakRef.current = 0;
        translateAllPdfRetryCountRef.current.delete(nextPage);

        if (
          settingsRef.current.translateAllSlowMode &&
          backgroundPageTranslateQueueRef.current.length > 0
        ) {
          const completedUnits = addCompletedTranslateAllUnits(
            translateAllCompletedUnitsRef.current,
            1,
          );
          translateAllCompletedUnitsRef.current = completedUnits;

          if (shouldPauseTranslateAll(completedUnits)) {
            translateAllCompletedUnitsRef.current =
              resetCompletedUnitsAfterPause(completedUnits);
            scheduledResume = true;
            setTranslationStatusMessage(null);
            scheduleTranslateAllResume(
              TRANSLATE_ALL_SLOW_MODE_PAUSE_MS,
              {
                kind: "slow-pause",
                page: nextPage,
              },
              () => {
                void runPageTranslationQueue();
              },
            );
          }
        }
      }
    } catch (error) {
      const failureTrace = fallbackFailureTracesRef.current[fallbackRequestId];
      delete fallbackRequestContextsRef.current[fallbackRequestId];
      delete fallbackFailureTracesRef.current[fallbackRequestId];
      fallbackToastEligiblePdfPagesRef.current.delete(nextPage);
      if (
        sessionId !== pdfTranslationSessionRef.current ||
        !isRequestVersionCurrent(
          pageTranslationRequestVersionsRef.current,
          nextPage,
          requestVersion,
        )
      ) {
        return;
      }

      const friendlyError = getFriendlyFallbackError(failureTrace, error);
      const isSlowModeBulkRun =
        isTranslateAllRunningRef.current &&
        settingsRef.current.translateAllSlowMode;

      if (isSlowModeBulkRun) {
        const action = getTranslateAllSlowModeErrorAction(friendlyError.kind);

        if (action === "retry") {
          const currentRetryCount =
            translateAllPdfRetryCountRef.current.get(nextPage) ?? 0;

          if (currentRetryCount < TRANSLATE_ALL_MAX_RETRIES_PER_PAGE) {
            translateAllPdfRetryCountRef.current.set(
              nextPage,
              currentRetryCount + 1,
            );
            translateAllRateLimitStreakRef.current += 1;
            const retryDelayMs = getTranslateAllRateLimitBackoffMs(
              translateAllRateLimitStreakRef.current,
            );
            backgroundPageTranslateQueueRef.current = [
              nextPage,
              ...backgroundPageTranslateQueueRef.current.filter(
                (queuedPage) => queuedPage !== nextPage,
              ),
            ];
            setPages((prev) =>
              prev.map((page) =>
                page.page === nextPage
                  ? {
                      ...page,
                      paragraphs: page.paragraphs.map((paragraph) =>
                        pendingParagraphIds.has(paragraph.pid)
                          ? { ...paragraph, status: "idle" as const }
                          : paragraph,
                      ),
                    }
                  : page,
              ),
            );
            setPageTranslations((prev) => ({
              ...prev,
              [nextPage]: {
                page: nextPage,
                displayText: payload.displayText,
                previousContext: payload.previousContext,
                nextContext: payload.nextContext,
                translatedText: prev[nextPage]?.translatedText,
                status: "queued",
                activityMessage: undefined,
                error: undefined,
                errorChecks: undefined,
                fallbackTrace: failureTrace,
              },
            }));
            scheduledResume = true;
            setTranslationStatusMessage(null);
            scheduleTranslateAllResume(
              retryDelayMs,
              {
                kind: "transient-retry",
                page: nextPage,
                errorKind: friendlyError.kind,
              },
              () => {
                void runPageTranslationQueue();
              },
            );
            return;
          } else {
            translateAllPdfRetryCountRef.current.delete(nextPage);
            setPages((prev) =>
              prev.map((page) =>
                page.page === nextPage
                  ? {
                      ...page,
                      paragraphs: page.paragraphs.map((paragraph) =>
                        pendingParagraphIds.has(paragraph.pid)
                          ? { ...paragraph, status: "error" as const }
                          : paragraph,
                      ),
                    }
                  : page,
              ),
            );
            setPageTranslations((prev) => ({
              ...prev,
              [nextPage]: {
                page: nextPage,
                displayText: payload.displayText,
                previousContext: payload.previousContext,
                nextContext: payload.nextContext,
                status: "error",
                error: friendlyError.message,
                errorChecks: friendlyError.checks,
                fallbackTrace: failureTrace,
              },
            }));
            showToast({
              message: t("toast.skippedPageAfterRepeatedErrors", {
                page: String(nextPage),
              }),
              tone: "neutral",
              durationMs: 4000,
            });
            didError = false;
          }
        } else if (action === "pause") {
          backgroundPageTranslateQueueRef.current = [
            nextPage,
            ...backgroundPageTranslateQueueRef.current.filter(
              (queuedPage) => queuedPage !== nextPage,
            ),
          ];
          setPages((prev) =>
            prev.map((page) =>
              page.page === nextPage
                ? {
                    ...page,
                    paragraphs: page.paragraphs.map((paragraph) =>
                      pendingParagraphIds.has(paragraph.pid)
                        ? { ...paragraph, status: "idle" as const }
                        : paragraph,
                    ),
                  }
                : page,
            ),
          );
          setPageTranslations((prev) => ({
            ...prev,
            [nextPage]: {
              page: nextPage,
              displayText: payload.displayText,
              previousContext: payload.previousContext,
              nextContext: payload.nextContext,
              translatedText: prev[nextPage]?.translatedText,
              status: "queued",
              activityMessage: undefined,
              error: undefined,
              errorChecks: undefined,
              fallbackTrace: failureTrace,
            },
          }));
          setTranslateAllUsageLimitPaused(true);
          translateAllUsageLimitPausedRef.current = true;
          setTranslateAllWaitState({
            kind: "usage-limit",
            page: nextPage,
            errorKind: friendlyError.kind,
          });
          setTranslationStatusMessage(null);
          showToast({
            message: t("toast.pausedOutOfCredits"),
            detail: friendlyError.message,
            tone: "error",
            durationMs: 6000,
          });
          return;
        } else if (action === "skip") {
          setPageTranslations((prev) => ({
            ...prev,
            [nextPage]: {
              page: nextPage,
              displayText: payload.displayText,
              previousContext: payload.previousContext,
              nextContext: payload.nextContext,
              status: "error",
              error: friendlyError.message,
              errorChecks: friendlyError.checks,
              fallbackTrace: failureTrace,
            },
          }));
          showToast({
            message: t("toast.skippedPageTooLarge", {
              page: String(nextPage),
            }),
            tone: "neutral",
            durationMs: 4000,
          });
          setPages((prev) =>
            prev.map((page) =>
              page.page === nextPage
                ? {
                    ...page,
                    paragraphs: page.paragraphs.map((paragraph) =>
                      pendingParagraphIds.has(paragraph.pid)
                        ? { ...paragraph, status: "error" as const }
                        : paragraph,
                    ),
                  }
                : page,
            ),
          );
          didError = false;
        } else {
          // action === "stop"
          if (!translateAllErrorToastShownRef.current) {
            showToast({
              message: t("toast.translateAllErrorOnPage", {
                page: String(nextPage),
              }),
              detail: getFallbackFailureStatusMessage(failureTrace, error),
              tone: "error",
              durationMs: 5200,
            });
            translateAllErrorToastShownRef.current = true;
          }
          foregroundPageTranslateQueueRef.current = [];
          backgroundPageTranslateQueueRef.current = [];
          didError = true;
          const nextParagraphStatus =
            friendlyError.kind === "setup-required"
              ? ("idle" as const)
              : ("error" as const);
          setPages((prev) =>
            prev.map((page) =>
              page.page === nextPage
                ? {
                    ...page,
                    paragraphs: page.paragraphs.map((paragraph) =>
                      pendingParagraphIds.has(paragraph.pid)
                        ? { ...paragraph, status: nextParagraphStatus }
                        : paragraph,
                    ),
                  }
                : page,
            ),
          );
          setPageTranslations((prev) => ({
            ...prev,
            [nextPage]: {
              page: nextPage,
              displayText: payload.displayText,
              previousContext: payload.previousContext,
              nextContext: payload.nextContext,
              status:
                friendlyError.kind === "setup-required"
                  ? "setup-required"
                  : "error",
              activityMessage: undefined,
              error: friendlyError.message,
              errorChecks: friendlyError.checks,
              fallbackTrace: failureTrace,
            },
          }));
          setTranslationStatusMessage(
            friendlyError.kind === "setup-required"
              ? TRANSLATION_SETUP_REQUIRED_MESSAGE
              : getFallbackFailureStatusMessage(failureTrace, error),
          );
        }
      } else {
        // Non-slow-mode or non-bulk-run: original behavior
        if (
          isTranslateAllRunningRef.current &&
          !translateAllErrorToastShownRef.current
        ) {
          showToast({
            message: `Translate All hit an error on page ${nextPage}.`,
            detail: getFallbackFailureStatusMessage(failureTrace, error),
            tone: "error",
            durationMs: 5200,
          });
          translateAllErrorToastShownRef.current = true;
        }
        if (isTranslateAllRunningRef.current) {
          foregroundPageTranslateQueueRef.current = [];
          backgroundPageTranslateQueueRef.current = [];
        }
        if (friendlyError.kind === "setup-required") {
          foregroundPageTranslateQueueRef.current = [];
          backgroundPageTranslateQueueRef.current = [];
        }
        didError = true;
        const nextParagraphStatus =
          friendlyError.kind === "setup-required"
            ? ("idle" as const)
            : ("error" as const);
        setPages((prev) =>
          prev.map((page) =>
            page.page === nextPage
              ? {
                  ...page,
                  paragraphs: page.paragraphs.map((paragraph) =>
                    pendingParagraphIds.has(paragraph.pid)
                      ? { ...paragraph, status: nextParagraphStatus }
                      : paragraph,
                  ),
                }
              : page,
          ),
        );
        setPageTranslations((prev) => ({
          ...prev,
          [nextPage]: {
            page: nextPage,
            displayText: payload.displayText,
            previousContext: payload.previousContext,
            nextContext: payload.nextContext,
            status:
              friendlyError.kind === "setup-required"
                ? "setup-required"
                : "error",
            activityMessage: undefined,
            error: friendlyError.message,
            errorChecks: friendlyError.checks,
            fallbackTrace: failureTrace,
          },
        }));
        setTranslationStatusMessage(
          friendlyError.kind === "setup-required"
            ? TRANSLATION_SETUP_REQUIRED_MESSAGE
            : getFallbackFailureStatusMessage(failureTrace, error),
        );
      }
    } finally {
      pageTranslatingRef.current = false;
      pageTranslationInFlightRef.current = null;
      setPageTranslationInFlightPage(null);
      if (
        isTranslateAllRunningRef.current &&
        backgroundPageTranslateQueueRef.current.length === 0
      ) {
        isTranslateAllRunningRef.current = false;
        resetTranslateAllSlowModeRuntime();
        setIsTranslateAllRunning(false);
        setIsTranslateAllStopRequested(false);
        translateAllErrorToastShownRef.current = false;
        if (!didError) {
          setTranslationStatusMessage(null);
        }
      }
      const shouldContinuePdfQueue = shouldContinueQueuedPageTranslations({
        didError,
        isTranslateAllRunning: isTranslateAllRunningRef.current,
        foregroundQueue: foregroundPageTranslateQueueRef.current,
        backgroundQueue: backgroundPageTranslateQueueRef.current,
      });
      if (
        shouldAutoResumeTranslateAllQueue({
          hasQueuedWork: shouldContinuePdfQueue,
          scheduledResume,
          usageLimitPaused: translateAllUsageLimitPausedRef.current,
        })
      ) {
        void runPageTranslationQueue();
      } else if (
        !didError &&
        !scheduledResume &&
        !translateAllUsageLimitPausedRef.current
      ) {
        setTranslationStatusMessage(null);
      }
    }
  }, [
    currentFileType,
    getEffectivePreset,
    resetTranslateAllSlowModeRuntime,
    scheduleTranslateAllResume,
    setPages,
    setPageTranslationInFlightPage,
    setPageTranslations,
    setTranslationStatusMessage,
    showFallbackSuccessToast,
    showToast,
  ]);

  // --- Queue pages for translation ---

  const queuePagesForTranslation = useCallback(
    (
      pageNumbers: number[],
      options: {
        priority: "foreground" | "background";
        forceFresh?: boolean;
      } = { priority: "foreground" },
    ) => {
      if (currentFileType !== "pdf" || !settingsLoaded) return;

      const currentPreset = getEffectivePreset(settingsRef.current);
      let nextForegroundQueue =
        options.priority === "foreground"
          ? []
          : [...foregroundPageTranslateQueueRef.current];
      let nextBackgroundQueue = [...backgroundPageTranslateQueueRef.current];
      let nextRequestVersions = pageTranslationRequestVersionsRef.current;
      const updates: Record<number, PageTranslationState> = {};
      const nextPageDocs = new Map<number, PageDoc>();
      const orderedPages =
        options.priority === "foreground"
          ? [...pageNumbers].reverse()
          : pageNumbers;

      const getWorkingPageDoc = (pageNumber: number) =>
        nextPageDocs.get(pageNumber) ??
        pagesRef.current.find((entry) => entry.page === pageNumber);

      if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
        foregroundPageTranslateQueueRef.current = [];
        backgroundPageTranslateQueueRef.current = [];
        if (isTranslateAllRunningRef.current) {
          isTranslateAllRunningRef.current = false;
          setIsTranslateAllRunning(false);
        }
        for (const pageNumber of orderedPages) {
          const pageDoc = getWorkingPageDoc(pageNumber);
          if (!pageDoc?.isExtracted) continue;

          const payload = buildPageTranslationPayload(
            pagesRef.current,
            pageNumber,
          );
          if (isPdfPageFullyTranslated(pageDoc)) {
            continue;
          }

          updates[pageNumber] = hasUsablePageText(payload.displayText)
            ? {
                page: pageNumber,
                displayText: payload.displayText,
                previousContext: payload.previousContext,
                nextContext: payload.nextContext,
                status: "setup-required",
                error: TRANSLATION_SETUP_REQUIRED_MESSAGE,
                errorChecks: undefined,
              }
            : {
                page: pageNumber,
                displayText: payload.displayText,
                previousContext: payload.previousContext,
                nextContext: payload.nextContext,
                status: "unavailable",
                errorChecks: undefined,
              };
        }

        if (Object.keys(updates).length > 0) {
          setPageTranslations((prev) => ({ ...prev, ...updates }));
          setTranslationStatusMessage(TRANSLATION_SETUP_REQUIRED_MESSAGE);
        }
        return;
      }

      for (const pageNumber of orderedPages) {
        const pageDoc = getWorkingPageDoc(pageNumber);
        if (!pageDoc?.isExtracted) continue;

        const payload = buildPageTranslationPayload(
          pagesRef.current,
          pageNumber,
        );
        const existing = pageTranslationsRef.current[pageNumber];
        const inputChanged =
          Boolean(existing) &&
          existing.displayText !== payload.displayText;
        const shouldForceFresh = Boolean(options.forceFresh || inputChanged);
        const translatableParagraphs = getTranslatablePdfParagraphs(pageDoc);

        if (
          translatableParagraphs.length === 0 ||
          !hasUsablePageText(payload.displayText)
        ) {
          updates[pageNumber] = {
            page: pageNumber,
            displayText: payload.displayText,
            previousContext: payload.previousContext,
            nextContext: payload.nextContext,
            status: "unavailable",
            errorChecks: undefined,
          };
          continue;
        }

        if (shouldForceFresh) {
          const bumpedVersion = bumpRequestVersion(
            nextRequestVersions,
            pageNumber,
          );
          nextRequestVersions = bumpedVersion.versions;
          translatableParagraphs.forEach((paragraph) =>
            forceFreshSentenceTranslationIdsRef.current.add(paragraph.pid),
          );
          nextPageDocs.set(pageNumber, {
            ...pageDoc,
            paragraphs: pageDoc.paragraphs.map((paragraph) =>
              translatableParagraphs.some((item) => item.pid === paragraph.pid)
                ? {
                    ...paragraph,
                    translation: undefined,
                    status: "idle" as const,
                  }
                : paragraph,
            ),
          });
        }

        const workingPage = getWorkingPageDoc(pageNumber) ?? pageDoc;
        const nextState: PageTranslationState = {
          page: pageNumber,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          translatedText: shouldForceFresh
            ? undefined
            : buildPdfPageTranslatedText(workingPage),
          status: shouldForceFresh ? "idle" : (existing?.status ?? "idle"),
          isCached: shouldForceFresh ? false : existing?.isCached,
          activityMessage: shouldForceFresh
            ? undefined
            : existing?.activityMessage,
          error: shouldForceFresh ? undefined : existing?.error,
          errorChecks: shouldForceFresh ? undefined : existing?.errorChecks,
        };
        updates[pageNumber] = nextState;

        const alreadyTranslated =
          !shouldForceFresh && isPdfPageFullyTranslated(workingPage);
        const alreadyLoading =
          !shouldForceFresh && nextState.status === "loading";

        if (
          alreadyTranslated ||
          alreadyLoading ||
          nextState.status === "unavailable"
        ) {
          continue;
        }

        if (options.priority === "foreground") {
          updates[pageNumber] = {
            ...nextState,
            status: "queued",
            activityMessage: "Queued for translation...",
            error: undefined,
            errorChecks: undefined,
          };
          nextForegroundQueue = enqueueForegroundPage(
            nextForegroundQueue,
            pageNumber,
          );
        } else {
          nextBackgroundQueue = enqueueBackgroundPages(nextBackgroundQueue, [
            pageNumber,
          ]);
        }
      }

      if (Object.keys(updates).length > 0) {
        setPageTranslations((prev) => ({ ...prev, ...updates }));
      }
      if (nextPageDocs.size > 0) {
        setPages((prev) =>
          prev.map((page) => nextPageDocs.get(page.page) ?? page),
        );
      }

      pageTranslationRequestVersionsRef.current = nextRequestVersions;
      foregroundPageTranslateQueueRef.current = nextForegroundQueue;
      backgroundPageTranslateQueueRef.current = nextBackgroundQueue;

      if (
        shouldAutoResumeTranslateAllQueue({
          hasQueuedWork:
            nextForegroundQueue.length > 0 || nextBackgroundQueue.length > 0,
          scheduledResume: false,
          usageLimitPaused: translateAllUsageLimitPausedRef.current,
        })
      ) {
        void runPageTranslationQueue();
      }
    },
    [
      currentFileType,
      getEffectivePreset,
      runPageTranslationQueue,
      setPages,
      setPageTranslations,
      setTranslationStatusMessage,
      settingsLoaded,
    ],
  );

  // --- Cache hydration effect ---

  useEffect(() => {
    if (
      currentFileType !== "pdf" ||
      !docId ||
      !translationEnabled ||
      !settingsLoaded ||
      !allPdfPagesExtracted ||
      !effectivePreset ||
      !hasPresetTranslationContext(effectivePreset)
    ) {
      return;
    }

    const lookupPages = pagesRef.current
      .map((page) => ({
        page: page.page,
        paragraphs: getTranslatablePdfParagraphs(page).map((paragraph) => ({
          sid: paragraph.pid,
          text: paragraph.source,
        })),
      }))
      .filter((page) => page.paragraphs.length > 0);

    if (lookupPages.length === 0) {
      return;
    }

    const sessionId = pdfTranslationSessionRef.current;
    let cancelled = false;

    void invoke("get_cached_pdf_page_translations", {
      presetId: effectivePreset.id,
      model: effectivePreset.model,
      targetLanguage: resolvedCurrentTargetLanguageLocal,
      pages: lookupPages,
    })
      .then((cachedPages) => {
        if (
          cancelled ||
          pdfTranslationSessionRef.current !== sessionId ||
          docIdRef.current !== docId
        ) {
          return;
        }

        const hydrated = applyCachedPdfPageTranslations(
          pagesRef.current,
          cachedPages as CachedPdfPageTranslation[],
          pageTranslationsRef.current,
        );
        if (Object.keys(hydrated.pageTranslations).length === 0) {
          return;
        }

        setPages(hydrated.pages);
        setPageTranslations((prev) => ({
          ...prev,
          ...hydrated.pageTranslations,
        }));
      })
      .catch((error) => {
        console.error("Failed to load cached PDF translations:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    allPdfPagesExtracted,
    currentFileType,
    docId,
    effectivePreset,
    resolvedCurrentTargetLanguageLocal,
    setPages,
    setPageTranslations,
    settingsLoaded,
    translationEnabled,
  ]);

  // --- Auto-translate current page effect ---

  useEffect(() => {
    if (
      currentFileType !== "pdf" ||
      !translationEnabled ||
      !pdfDoc ||
      pages.length === 0 ||
      !settingsLoaded ||
      translateAllUsageLimitPaused
    )
      return;
    queuePagesForTranslation(
      getPagesToTranslate(
        currentPage,
        pages.length,
        settingsRef.current.autoTranslateNextPages,
      ),
      {
        priority: "foreground",
      },
    );
  }, [
    currentFileType,
    currentPage,
    pages,
    pdfDoc,
    queuePagesForTranslation,
    settingsLoaded,
    translateAllUsageLimitPaused,
    translationEnabled,
  ]);

  // --- Resume queue effect ---

  useEffect(() => {
    if (
      currentFileType !== "pdf" ||
      !docId ||
      !translationEnabled ||
      translateAllUsageLimitPaused
    )
      return;
    if (
      (foregroundPageTranslateQueueRef.current.length === 0 &&
        backgroundPageTranslateQueueRef.current.length === 0) ||
      pageTranslatingRef.current
    ) {
      return;
    }

    void runPageTranslationQueue();
  }, [
    currentFileType,
    docId,
    runPageTranslationQueue,
    translateAllUsageLimitPaused,
    translationEnabled,
  ]);

  // --- EPUB translate queue ---

  const runTranslateQueue = useCallback(async () => {
    if (translatingRef.current) return;
    if (!docIdRef.current) return;
    if (!translationEnabledRef.current) return;
    if (
      isTranslateAllRunningRef.current &&
      translateAllUsageLimitPausedRef.current
    )
      return;

    const uniqueQueue = Array.from(new Set(translateQueueRef.current));
    if (uniqueQueue.length === 0) return;

    const currentSettings = settingsRef.current;
    const isBulkRun =
      currentFileType === "epub" && isTranslateAllRunningRef.current;
    const isSlowModeBulkRun = isBulkRun && currentSettings.translateAllSlowMode;
    const activeQueue = isSlowModeBulkRun
      ? selectSlowModeEpubPageBatch(uniqueQueue, pagesRef.current)
      : uniqueQueue;
    translateQueueRef.current = uniqueQueue.slice(activeQueue.length);
    const activeQueueIds = new Set(activeQueue);

    const pending = pagesRef.current
      .flatMap((page) => page.paragraphs)
      .filter(
        (para) =>
          activeQueueIds.has(para.pid) &&
          (para.status === "idle" || para.status === "error"),
      );

    if (pending.length === 0) {
      if (translateQueueRef.current.length > 0) {
        void runTranslateQueue();
      }
      return;
    }

    translatingRef.current = true;
    const requestId = ++translationRequestId.current;
    const fallbackRequestId = `epub-batch:${requestId}:${Date.now()}`;

    setPages((prev) =>
      prev.map((page) => ({
        ...page,
        paragraphs: page.paragraphs.map((para) =>
          pending.some((item) => item.pid === para.pid)
            ? { ...para, status: "loading" as const }
            : para,
        ),
      })),
    );
    if (currentFileType === "epub") {
      setTranslationStatusMessage(
        isBulkRun
          ? "Translating all sections..."
          : getReaderStatusLabel("translating-section"),
      );
    }

    let didError = false;
    let scheduledResume = false;
    try {
      const payload = pending.map((para) => ({
        sid: para.pid,
        text: para.source,
      }));
      const forceFreshIds = pending
        .filter((para) =>
          forceFreshSentenceTranslationIdsRef.current.has(para.pid),
        )
        .map((para) => para.pid);
      const currentPreset = getEffectivePreset(currentSettings);
      if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
        throw new Error("No active preset configured.");
      }
      fallbackRequestContextsRef.current[fallbackRequestId] = {
        kind: "epub-batch",
        requestId,
      };
      delete fallbackFailureTracesRef.current[fallbackRequestId];
      const result = (await invokeWithTimeout(
        invoke("openrouter_translate", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          temperature: 0,
          targetLanguage: currentTargetLanguageRef.current,
          sentences: payload,
          forceFreshIds,
          requestId: fallbackRequestId,
        }) as Promise<BatchTranslationResult>,
        FRONTEND_TIMEOUT_MS,
        "Translation timed out after 90 seconds.",
      )) as BatchTranslationResult;
      delete fallbackRequestContextsRef.current[fallbackRequestId];
      delete fallbackFailureTracesRef.current[fallbackRequestId];

      if (translationRequestId.current !== requestId) {
        setPages((prev) =>
          prev.map((page) => ({
            ...page,
            paragraphs: page.paragraphs.map((para) =>
              pending.some((item) => item.pid === para.pid) &&
              para.status === "loading"
                ? { ...para, status: "idle" as const }
                : para,
            ),
          })),
        );
        return;
      }

      const translationMap = new Map(
        result.results.map((item) => [item.sid, item.translation]),
      );
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          paragraphs: page.paragraphs.map((para) => {
            if (!pending.some((item) => item.pid === para.pid)) return para;
            const translation = translationMap.get(para.pid);
            if (!translation) {
              return { ...para, status: "error" as const };
            }
            return { ...para, translation, status: "done" as const };
          }),
        })),
      );
      forceFreshIds.forEach((id) =>
        forceFreshSentenceTranslationIdsRef.current.delete(id),
      );
      if (isBulkRun) {
        translateAllRateLimitStreakRef.current = 0;
        const pendingPageNumbers = new Set(
          pending.map((paragraph) => paragraph.page),
        );
        for (const pageNum of pendingPageNumbers) {
          translateAllEpubRetryCountRef.current.delete(pageNum);
        }

        if (isSlowModeBulkRun && translateQueueRef.current.length > 0) {
          const completedUnits = addCompletedTranslateAllUnits(
            translateAllCompletedUnitsRef.current,
            1,
          );
          translateAllCompletedUnitsRef.current = completedUnits;

          if (shouldPauseTranslateAll(completedUnits)) {
            translateAllCompletedUnitsRef.current =
              resetCompletedUnitsAfterPause(completedUnits);
            scheduledResume = true;
            setTranslationStatusMessage(null);
            scheduleTranslateAllResume(
              TRANSLATE_ALL_SLOW_MODE_PAUSE_MS,
              {
                kind: "slow-pause",
                page: null,
              },
              () => {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = window.setTimeout(() => {
                  void runTranslateQueue();
                }, 0);
              },
            );
          }
        }
      }
      if (!isBulkRun) {
        showFallbackSuccessToast(result.fallbackTrace);
      }
    } catch (error) {
      const failureTrace = fallbackFailureTracesRef.current[fallbackRequestId];
      delete fallbackRequestContextsRef.current[fallbackRequestId];
      delete fallbackFailureTracesRef.current[fallbackRequestId];
      const friendlyError = getFriendlyFallbackError(failureTrace, error);
      const requiresSetup = friendlyError.kind === "setup-required";
      const activePageNumber = pending[0]?.page ?? 0;

      if (isSlowModeBulkRun) {
        const action = getTranslateAllSlowModeErrorAction(friendlyError.kind);

        if (action === "retry") {
          const currentRetryCount =
            translateAllEpubRetryCountRef.current.get(activePageNumber) ?? 0;

          if (currentRetryCount < TRANSLATE_ALL_MAX_RETRIES_PER_PAGE) {
            translateAllEpubRetryCountRef.current.set(
              activePageNumber,
              currentRetryCount + 1,
            );
            translateAllRateLimitStreakRef.current += 1;
            const retryDelayMs = getTranslateAllRateLimitBackoffMs(
              translateAllRateLimitStreakRef.current,
            );
            translateQueueRef.current = Array.from(
              new Set([...activeQueue, ...translateQueueRef.current]),
            );
            setPages((prev) =>
              prev.map((page) => ({
                ...page,
                paragraphs: page.paragraphs.map((para) =>
                  pending.some((item) => item.pid === para.pid)
                    ? { ...para, status: "idle" as const }
                    : para,
                ),
              })),
            );
            scheduledResume = true;
            setTranslationStatusMessage(null);
            scheduleTranslateAllResume(
              retryDelayMs,
              {
                kind: "transient-retry",
                page: activePageNumber,
                errorKind: friendlyError.kind,
              },
              () => {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = window.setTimeout(() => {
                  void runTranslateQueue();
                }, 0);
              },
            );
            return;
          } else {
            translateAllEpubRetryCountRef.current.delete(activePageNumber);
            setPages((prev) =>
              prev.map((page) => ({
                ...page,
                paragraphs: page.paragraphs.map((para) =>
                  pending.some((item) => item.pid === para.pid)
                    ? { ...para, status: "error" as const }
                    : para,
                ),
              })),
            );
            showToast({
              message: t("toast.skippedPageAfterRepeatedErrors", {
                page: String(activePageNumber),
              }),
              tone: "neutral",
              durationMs: 4000,
            });
            didError = false;
          }
        } else if (action === "pause") {
          translateQueueRef.current = Array.from(
            new Set([...activeQueue, ...translateQueueRef.current]),
          );
          setPages((prev) =>
            prev.map((page) => ({
              ...page,
              paragraphs: page.paragraphs.map((para) =>
                pending.some((item) => item.pid === para.pid)
                  ? { ...para, status: "idle" as const }
                  : para,
              ),
            })),
          );
          setTranslateAllUsageLimitPaused(true);
          translateAllUsageLimitPausedRef.current = true;
          setTranslateAllWaitState({
            kind: "usage-limit",
            page: activePageNumber,
            errorKind: friendlyError.kind,
          });
          setTranslationStatusMessage(null);
          showToast({
            message: t("toast.pausedOutOfCredits"),
            detail: friendlyError.message,
            tone: "error",
            durationMs: 6000,
          });
          return;
        } else if (action === "skip") {
          setPages((prev) =>
            prev.map((page) => ({
              ...page,
              paragraphs: page.paragraphs.map((para) =>
                pending.some((item) => item.pid === para.pid)
                  ? { ...para, status: "error" as const }
                  : para,
              ),
            })),
          );
          showToast({
            message: t("toast.skippedPageTooLarge", {
              page: String(activePageNumber),
            }),
            tone: "neutral",
            durationMs: 4000,
          });
          didError = false;
        } else {
          // action === "stop"
          if (!translateAllErrorToastShownRef.current) {
            showToast({
              message: "Translate All hit an error.",
              detail: getFallbackFailureStatusMessage(failureTrace, error),
              tone: "error",
              durationMs: 5200,
            });
            translateAllErrorToastShownRef.current = true;
          }
          didError = true;
          setPages((prev) =>
            prev.map((page) => ({
              ...page,
              paragraphs: page.paragraphs.map((para) =>
                pending.some((item) => item.pid === para.pid)
                  ? {
                      ...para,
                      status: requiresSetup
                        ? ("idle" as const)
                        : ("error" as const),
                    }
                  : para,
              ),
            })),
          );
          if (requiresSetup) {
            translateQueueRef.current = [];
          }
          setTranslationStatusMessage(
            requiresSetup
              ? TRANSLATION_SETUP_REQUIRED_MESSAGE
              : getFallbackFailureStatusMessage(failureTrace, error),
          );
          if (requiresSetup) {
            showTranslationSetupToast();
          }
        }
      } else {
        // Non-slow-mode or non-bulk: original behavior
        if (isBulkRun && !translateAllErrorToastShownRef.current) {
          showToast({
            message: "Translate All hit an error.",
            detail: getFallbackFailureStatusMessage(failureTrace, error),
            tone: "error",
            durationMs: 5200,
          });
          translateAllErrorToastShownRef.current = true;
        }
        didError = true;
        setPages((prev) =>
          prev.map((page) => ({
            ...page,
            paragraphs: page.paragraphs.map((para) =>
              pending.some((item) => item.pid === para.pid)
                ? {
                    ...para,
                    status: requiresSetup
                      ? ("idle" as const)
                      : ("error" as const),
                  }
                : para,
            ),
          })),
        );
        if (requiresSetup) {
          translateQueueRef.current = [];
        }
        setTranslationStatusMessage(
          requiresSetup
            ? TRANSLATION_SETUP_REQUIRED_MESSAGE
            : getFallbackFailureStatusMessage(failureTrace, error),
        );
        if (requiresSetup) {
          showTranslationSetupToast();
        } else if (!isBulkRun) {
          showToast({
            message: friendlyError.message,
            detail: getProviderErrorDetail(failureTrace?.lastError ?? error),
            tone: "error",
            durationMs: 5200,
          });
        }
      }
    } finally {
      translatingRef.current = false;
      if (
        shouldAutoResumeTranslateAllQueue({
          hasQueuedWork: translateQueueRef.current.length > 0,
          didErrorDuringBulkRun: didError && isBulkRun,
          scheduledResume,
          usageLimitPaused: translateAllUsageLimitPausedRef.current,
        })
      ) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void runTranslateQueue();
        }, 0);
      } else if (!scheduledResume && !translateAllUsageLimitPausedRef.current) {
        if (isBulkRun) {
          isTranslateAllRunningRef.current = false;
          resetTranslateAllSlowModeRuntime();
          setIsTranslateAllRunning(false);
          setIsTranslateAllStopRequested(false);
          translateAllErrorToastShownRef.current = false;
        }
        if (!didError) {
          setTranslationStatusMessage(null);
        }
      }
    }
  }, [
    currentFileType,
    getEffectivePreset,
    resetTranslateAllSlowModeRuntime,
    scheduleTranslateAllResume,
    setPages,
    setTranslationStatusMessage,
    showFallbackSuccessToast,
    showTranslationSetupToast,
    showToast,
  ]);

  // --- Translate-all start/stop/resume ---

  const startTranslateAll = useCallback(
    async (mode: "skip-cached" | "replace-all") => {
      if (
        currentFileType !== "pdf" ||
        !docIdRef.current ||
        !translationEnabledRef.current
      ) {
        return;
      }

      const pageNumbers = pagesRef.current
        .filter((page) => getTranslatablePdfParagraphs(page).length > 0)
        .map((page) => page.page);
      if (pageNumbers.length === 0) {
        return;
      }

      isTranslateAllRunningRef.current = true;
      resetTranslateAllSlowModeRuntime();
      setIsTranslateAllRunning(true);
      setIsTranslateAllStopRequested(false);
      translateAllErrorToastShownRef.current = false;

      if (mode === "replace-all") {
        queuePagesForTranslation(pageNumbers, {
          priority: "background",
          forceFresh: true,
        });
        setTranslationStatusMessage("Retranslating all pages...");
      } else {
        queuePagesForTranslation(pageNumbers, {
          priority: "background",
        });
        setTranslationStatusMessage("Translating all pages...");
      }
    },
    [
      currentFileType,
      queuePagesForTranslation,
      resetTranslateAllSlowModeRuntime,
      setIsTranslateAllRunning,
      setIsTranslateAllStopRequested,
      setTranslationStatusMessage,
    ],
  );

  const stopTranslateAll = useCallback(() => {
    clearTranslateAllResumeTimer();

    if (currentFileType === "pdf") {
      backgroundPageTranslateQueueRef.current = [];

      if (!pageTranslatingRef.current) {
        isTranslateAllRunningRef.current = false;
        resetTranslateAllSlowModeRuntime();
        setIsTranslateAllRunning(false);
        setIsTranslateAllStopRequested(false);
        translateAllErrorToastShownRef.current = false;
        setTranslationStatusMessage(null);
        return;
      }

      setIsTranslateAllStopRequested(true);
      setTranslationStatusMessage(
        pageTranslationInFlightRef.current !== null
          ? `Stopping after page ${pageTranslationInFlightRef.current}...`
          : "Stopping after current page...",
      );
      return;
    }

    if (currentFileType === "epub") {
      translateQueueRef.current = [];
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }

      if (!translatingRef.current) {
        isTranslateAllRunningRef.current = false;
        resetTranslateAllSlowModeRuntime();
        setIsTranslateAllRunning(false);
        setIsTranslateAllStopRequested(false);
        translateAllErrorToastShownRef.current = false;
        setTranslationStatusMessage(null);
        return;
      }

      setIsTranslateAllStopRequested(true);
      setTranslationStatusMessage("Stopping after current batch...");
    }
  }, [
    clearTranslateAllResumeTimer,
    currentFileType,
    resetTranslateAllSlowModeRuntime,
    setIsTranslateAllRunning,
    setIsTranslateAllStopRequested,
    setTranslationStatusMessage,
  ]);

  const handleTranslateAllAction = useCallback(async () => {
    if (isTranslateAllRunningRef.current) {
      stopTranslateAll();
      return;
    }

    if (!translationEnabledRef.current) {
      return;
    }

    if (currentFileType === "epub") {
      if (translatingRef.current) {
        return;
      }

      if (!activePresetHasTranslationContext) {
        setTranslationStatusMessage(TRANSLATION_SETUP_REQUIRED_MESSAGE);
        showTranslationSetupToast();
        return;
      }

      const shouldRetranslateAll = translationProgress.isFullyTranslated;
      const nextPages = pagesRef.current.map((page) => ({
        ...page,
        paragraphs: page.paragraphs.map((paragraph) => {
          if (!hasUsablePageText(paragraph.source)) {
            return paragraph;
          }

          if (!shouldRetranslateAll) {
            return paragraph;
          }

          return {
            ...paragraph,
            translation: undefined,
            status: "idle" as const,
          };
        }),
      }));

      const paragraphIds = nextPages
        .flatMap((page) => page.paragraphs)
        .filter((paragraph) => hasUsablePageText(paragraph.source))
        .filter((paragraph) =>
          shouldRetranslateAll
            ? true
            : paragraph.status === "idle" || paragraph.status === "error",
        )
        .map((paragraph) => paragraph.pid);

      if (paragraphIds.length === 0) {
        return;
      }

      if (shouldRetranslateAll) {
        pagesRef.current = nextPages;
        setPages(nextPages);
        paragraphIds.forEach((pid) =>
          forceFreshSentenceTranslationIdsRef.current.add(pid),
        );
      }

      isTranslateAllRunningRef.current = true;
      resetTranslateAllSlowModeRuntime();
      setIsTranslateAllRunning(true);
      setIsTranslateAllStopRequested(false);
      translateAllErrorToastShownRef.current = false;
      setTranslationStatusMessage(
        shouldRetranslateAll
          ? "Retranslating all sections..."
          : "Translating all sections...",
      );
      translateQueueRef.current = Array.from(
        new Set([...translateQueueRef.current, ...paragraphIds]),
      );
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runTranslateQueue();
      }, 0);
      return;
    }

    if (currentFileType !== "pdf" || !allPdfPagesExtracted) {
      return;
    }

    if (translationProgress.isFullyTranslated) {
      void startTranslateAll("replace-all");
      return;
    }

    void startTranslateAll("skip-cached");
  }, [
    activePresetHasTranslationContext,
    allPdfPagesExtracted,
    currentFileType,
    resetTranslateAllSlowModeRuntime,
    setPages,
    setIsTranslateAllRunning,
    setIsTranslateAllStopRequested,
    setTranslationStatusMessage,
    showTranslationSetupToast,
    startTranslateAll,
    stopTranslateAll,
    translationProgress.isFullyTranslated,
  ]);

  const resumeTranslateAllAfterUsageLimit = useCallback(() => {
    setTranslateAllUsageLimitPaused(false);
    translateAllUsageLimitPausedRef.current = false;
    setTranslateAllWaitState(null);
    if (currentFileType === "pdf") {
      void runPageTranslationQueue();
    } else {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runTranslateQueue();
      }, 0);
    }
  }, [currentFileType, runPageTranslationQueue, runTranslateQueue]);

  // --- Single PID translation ---

  const handleTranslatePid = useCallback(
    (pid: string, forceRetry = false) => {
      if (!docIdRef.current) return;
      if (!translationEnabledRef.current) return;
      if (!activePresetHasTranslationContext) {
        setTranslationStatusMessage(TRANSLATION_SETUP_REQUIRED_MESSAGE);
        showTranslationSetupToast();
        return;
      }
      const para = pagesRef.current
        .flatMap((page) => page.paragraphs)
        .find((item) => item.pid === pid);
      if (!para) return;
      if (para.status === "loading") return;
      if (para.status === "done" && !forceRetry) return;

      if (forceRetry) {
        forceFreshSentenceTranslationIdsRef.current.add(pid);
      }

      translateQueueRef.current = Array.from(
        new Set([...translateQueueRef.current, pid]),
      );
      if (currentFileType === "epub") {
        setTranslationStatusMessage(
          getReaderStatusLabel("translating-section"),
        );
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runTranslateQueue();
      }, 400);
    },
    [
      activePresetHasTranslationContext,
      currentFileType,
      runTranslateQueue,
      setTranslationStatusMessage,
      showTranslationSetupToast,
    ],
  );

  // --- Redo page translation ---

  const handleRedoPageTranslation = useCallback(
    async (pageNumber: number) => {
      if (currentFileType !== "pdf" || !docIdRef.current) {
        return;
      }

      const payload = buildPageTranslationPayload(pagesRef.current, pageNumber);
      if (!hasUsablePageText(payload.displayText)) {
        setPageTranslations((prev) => ({
          ...prev,
          [pageNumber]: {
            page: pageNumber,
            displayText: payload.displayText,
            previousContext: payload.previousContext,
            nextContext: payload.nextContext,
            status: "unavailable",
          },
        }));
        return;
      }

      queuePagesForTranslation([pageNumber], {
        priority: "foreground",
        forceFresh: true,
      });
      fallbackToastEligiblePdfPagesRef.current.add(pageNumber);
      setTranslationStatusMessage(
        getReaderStatusLabel("redoing-page", { page: pageNumber }),
      );
    },
    [currentFileType, queuePagesForTranslation, setTranslationStatusMessage],
  );

  // --- Translation preference change ---

  const handleTranslationPreferenceChange = useCallback(
    (preference: BookTranslationPreference) => {
      if (!docIdRef.current) {
        return;
      }

      const previousLanguageCode = currentTargetLanguageRef.current.code;
      const shouldClearVisibleTranslations =
        preference.enabled &&
        previousLanguageCode !== preference.targetLanguage.code;
      const id = docIdRef.current;
      setBookTranslationPreferences((prev) => {
        const next = {
          ...prev,
          [id]: preference,
        };
        saveBookTranslationPreferencesLocal(next);
        return next;
      });

      wordTranslationHook.textTranslationCacheRef.current.clear();
      translateQueueRef.current = [];
      foregroundPageTranslateQueueRef.current = [];
      backgroundPageTranslateQueueRef.current = [];
      forceFreshSentenceTranslationIdsRef.current.clear();
      pageTranslationRequestVersionsRef.current = {};
      pageTranslationInFlightRef.current = null;
      pageTranslatingRef.current = false;
      setPageTranslationInFlightPage(null);
      wordTranslationHook.handleClearSelectionTranslation();
      wordTranslationHook.handleClearWordTranslation();
      setTranslationStatusMessage(null);
      resetTranslateAllSlowModeRuntime();
      isTranslateAllRunningRef.current = false;
      setIsTranslateAllRunning(false);
      setIsTranslateAllStopRequested(false);
      translateAllErrorToastShownRef.current = false;
      pdfTranslationSessionRef.current += 1;
      translationRequestId.current += 1;
      translatingRef.current = false;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      if (shouldClearVisibleTranslations) {
        setPageTranslations({});
        setPages((prev) => clearPageTranslationsForTargetLanguageChange(prev));
      } else {
        setPageTranslations((prev) =>
          sanitizePdfTranslationsForPresetChange(prev),
        );
        setPages((prev) => sanitizeEpubPagesForPresetChange(prev));
      }
      currentTargetLanguageRef.current = resolveTargetLanguage(
        preference.targetLanguage,
        settingsRef.current.appLanguage,
        systemLocale,
      );
      translationEnabledRef.current = preference.enabled;
    },
    [resetTranslateAllSlowModeRuntime, setPages, systemLocale],
  );

  // --- Reader settings change ---

  const handleReaderSettingsChange = useCallback(
    async (nextSettings: TranslationSettings) => {
      updateSettingsDraftState(nextSettings);
      const previousSettings = settingsRef.current;
      const changedAppLanguage =
        previousSettings.appLanguage.code !== nextSettings.appLanguage.code;
      const changedDefaultLanguage =
        previousSettings.defaultLanguage.code !== nextSettings.defaultLanguage.code;
      const changedFallback =
        previousSettings.autoFallbackEnabled !==
        nextSettings.autoFallbackEnabled;
      const changedAutoTranslateNextPages =
        previousSettings.autoTranslateNextPages !==
        nextSettings.autoTranslateNextPages;
      const changedSlowMode =
        previousSettings.translateAllSlowMode !==
        nextSettings.translateAllSlowMode;
      const activeDocId = docIdRef.current;
      const currentBookPreference = activeDocId
        ? bookTranslationPreferences[activeDocId]
        : undefined;
      const shouldResetForDefaultLanguageChange =
        !currentBookPreference &&
        resolveTargetLanguage(
          previousSettings.defaultLanguage,
          previousSettings.appLanguage,
          systemLocale,
        ).code !==
          resolveTargetLanguage(
            nextSettings.defaultLanguage,
            nextSettings.appLanguage,
            systemLocale,
          ).code;

      try {
        const savedSettings = await persistSettings({
          ...settingsRef.current,
          appLanguage: nextSettings.appLanguage,
          defaultLanguage: nextSettings.defaultLanguage,
          autoFallbackEnabled: nextSettings.autoFallbackEnabled,
          autoTranslateNextPages: nextSettings.autoTranslateNextPages,
          translateAllSlowMode: nextSettings.translateAllSlowMode,
          accentColor: nextSettings.accentColor,
        });

        updateSettingsDraftState(
          settingsDraftRef.current
            ? {
                ...settingsDraftRef.current,
                appLanguage: savedSettings.appLanguage,
                defaultLanguage: savedSettings.defaultLanguage,
                autoFallbackEnabled: savedSettings.autoFallbackEnabled,
                autoTranslateNextPages: savedSettings.autoTranslateNextPages,
                translateAllSlowMode: savedSettings.translateAllSlowMode,
                accentColor: savedSettings.accentColor,
              }
            : settingsDraftRef.current,
        );

        if (shouldResetForDefaultLanguageChange) {
          wordTranslationHook.textTranslationCacheRef.current.clear();
          translateQueueRef.current = [];
          foregroundPageTranslateQueueRef.current = [];
          backgroundPageTranslateQueueRef.current = [];
          forceFreshSentenceTranslationIdsRef.current.clear();
          pageTranslationRequestVersionsRef.current = {};
          pageTranslationInFlightRef.current = null;
          pageTranslatingRef.current = false;
          setPageTranslationInFlightPage(null);
          wordTranslationHook.handleClearSelectionTranslation();
          wordTranslationHook.handleClearWordTranslation();
          setTranslationStatusMessage(null);
          resetTranslateAllSlowModeRuntime();
          isTranslateAllRunningRef.current = false;
          setIsTranslateAllRunning(false);
          setIsTranslateAllStopRequested(false);
          translateAllErrorToastShownRef.current = false;
          pdfTranslationSessionRef.current += 1;
          translationRequestId.current += 1;
          translatingRef.current = false;
          if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
          }
          setPageTranslations({});
          setPages((prev) => clearPageTranslationsForTargetLanguageChange(prev));
          currentTargetLanguageRef.current = resolveTargetLanguage(
            savedSettings.defaultLanguage,
            savedSettings.appLanguage,
            systemLocale,
          );
        }
      } catch (error) {
        console.error("Failed to save translation settings:", error);
        showToast({
          message: changedAppLanguage
            ? t("toast.couldNotSaveAppLanguage")
            : changedDefaultLanguage
              ? t("toast.couldNotSaveTranslateTo")
              : changedFallback
                ? t("toast.couldNotSaveAutoFallback")
                : changedAutoTranslateNextPages
                  ? t("toast.couldNotSaveAutoTranslate")
                  : changedSlowMode
                    ? t("toast.couldNotSaveSlowMode")
                    : t("toast.couldNotSaveTranslationSettings"),
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [
      bookTranslationPreferences,
      resetTranslateAllSlowModeRuntime,
      setPages,
      setPageTranslations,
      setTranslationStatusMessage,
      showToast,
      systemLocale,
    ],
  );

  // --- Reset for new document ---

  const resetTranslationQueueForNewDocument = useCallback(() => {
    translateQueueRef.current = [];
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    forceFreshSentenceTranslationIdsRef.current.clear();
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    setPageTranslationInFlightPage(null);
    setTranslationStatusMessage(null);
    resetTranslateAllSlowModeRuntime();
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    setIsTranslateAllStopRequested(false);
    translateAllErrorToastShownRef.current = false;
    pdfTranslationSessionRef.current += 1;
    translationRequestId.current += 1;
    translatingRef.current = false;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
  }, [resetTranslateAllSlowModeRuntime, setTranslationStatusMessage]);

  // --- Return ---

  return {
    // State
      isTranslateAllRunning,
      translateAllWaitState,
      translateAllWaitTick,
      isTranslateAllStopRequested,
      pageTranslationInFlightPage,
      translateAllUsageLimitPaused,
      translationEnabled,
      currentTargetLanguage,

    // Refs
    isTranslateAllRunningRef,
    pdfTranslationSessionRef,
    translateAllErrorToastShownRef,
    foregroundPageTranslateQueueRef,
    backgroundPageTranslateQueueRef,

    // Computed
    pageProgressMap,
    translationProgressLabel,
    translateAllActionLabel,
    translateAllProgressDetail,
    pdfProgressDetailLabel,
      pdfProgressDetailState,
      currentPdfLoadingMessage,
      currentPdfPageDoc,
      showPdfSetupPrompt,
    canRedoCurrentPage,
    canTranslateAll,

    // Methods
    resetTranslateAllSlowModeRuntime,
    queuePagesForTranslation,
    runPageTranslationQueue,
    runTranslateQueue,
    startTranslateAll,
    stopTranslateAll,
    handleTranslateAllAction,
    resumeTranslateAllAfterUsageLimit,
    handleTranslatePid,
    handleRedoPageTranslation,
    handleTranslationPreferenceChange,
    handleReaderSettingsChange,
    showFallbackSuccessToast,
    resetTranslationQueueForNewDocument,
  };
}

// --- Local helper functions (kept private to this module) ---

const BOOK_TRANSLATION_PREFS_STORAGE_KEY = "readani.bookTranslationPrefs.v1";

function resolveBookTranslationPreferenceLocal(args: {
  docId: string;
  preferences: Record<string, BookTranslationPreference>;
  defaultLanguage: TargetLanguage;
}) {
  const { docId, preferences, defaultLanguage } = args;
  if (!docId) {
    return {
      preference: {
        enabled: true,
        targetLanguage: defaultLanguage,
      },
      shouldPersist: false,
    };
  }

  const stored = preferences[docId];
  if (stored) {
    return { preference: stored, shouldPersist: false };
  }

  return {
    preference: {
      enabled: true,
      targetLanguage: defaultLanguage,
    },
    shouldPersist: true,
  };
}

function saveBookTranslationPreferencesLocal(
  preferences: Record<string, BookTranslationPreference>,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    BOOK_TRANSLATION_PREFS_STORAGE_KEY,
    JSON.stringify(preferences),
  );
}

function getPdfPageLoadingMessage(args: {
  currentPage: number;
  currentPageDoc: PageDoc | undefined;
  currentPageTranslation: PageTranslationState | undefined;
  inFlightPage: number | null;
}): string | null {
  const { currentPageDoc, currentPageTranslation, inFlightPage } = args;

  if (!currentPageDoc?.isExtracted) {
    return "Preparing this page...";
  }

  if (currentPageTranslation?.status === "loading") {
    return "Translating this page...";
  }

  if (currentPageTranslation?.status === "queued") {
    return "Queued for translation...";
  }

  if (inFlightPage !== null) {
    return `Translating page ${inFlightPage}...`;
  }

  return null;
}

function getPdfBackgroundTranslationMessage(args: {
  currentPage: number;
  inFlightPage: number | null;
  isTranslateAllRunning: boolean;
}): string | null {
  const { inFlightPage, isTranslateAllRunning } = args;

  if (!isTranslateAllRunning) {
    return null;
  }

  if (inFlightPage !== null) {
    return `Translating page ${inFlightPage}...`;
  }

  return "Preparing pages...";
}

function getPagesToTranslate(
  currentPage: number,
  totalPages: number,
  autoTranslateNextPages: number,
): number[] {
  if (totalPages === 0) return [];
  const pages: number[] = [currentPage];
  for (let i = 1; i <= autoTranslateNextPages; i++) {
    const next = currentPage + i;
    if (next > totalPages) break;
    pages.push(next);
  }
  for (let i = 1; i <= autoTranslateNextPages; i++) {
    const prev = currentPage - i;
    if (prev < 1) break;
    pages.push(prev);
  }
  return pages;
}
