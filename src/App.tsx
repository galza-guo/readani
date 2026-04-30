import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { NavItem } from "epubjs";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as Toolbar from "@radix-ui/react-toolbar";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AboutDialog } from "./components/AboutDialog";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { PdfNavigationSidebar } from "./components/PdfNavigationSidebar";
import { PdfViewer } from "./components/PdfViewer";
import { TranslationPane } from "./components/TranslationPane";
import { UpdateActionButton } from "./components/UpdateActionButton";
import { DocumentStatusSurface } from "./components/document/DocumentStatusSurface";
import { EpubNavigationSidebar } from "./components/document/EpubNavigationSidebar";
import {
  EpubViewer,
  type EpubParagraph,
  type EpubViewerHandle,
} from "./components/document/EpubViewer";
import { ChatPanel } from "./components/reader/ChatPanel";
import { ExpandableIconButton } from "./components/reader/ExpandableIconButton";
import { PageNavigationToolbar } from "./components/reader/PageNavigationToolbar";
import { PanelToggleGroup } from "./components/reader/PanelToggleGroup";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ThemeToggleButton } from "./components/ThemeToggleButton";
import { ToastProvider, useToast } from "./components/toast/ToastProvider";
import { HomeView } from "./views/HomeView";
import {
  canPersistPresetDraft,
  createDefaultSettings,
  createPresetDraft,
  getActivePreset,
  getDefaultModelForProvider,
  getPresetMissingRequirement,
  getPresetSaveStatus,
  getNextThemeMode,
  getPresetValidationState,
  hasPresetTranslationContext,
  hasUsableLiveTranslationSetup,
  isPresetUnchangedFromSavedState,
  normalizeSettingsFromStorage,
  normalizePresetDraft,
  providerUsesApiKey,
  serializePresetForCommand,
  serializeSettingsForCommand,
} from "./lib/appSettings";
import { extractPageParagraphs } from "./lib/textExtraction";
import { hashBuffer } from "./lib/hash";
import { LRUCache } from "./lib/lruCache";
import {
  buildPdfPageTranslatedText,
  getTranslatablePdfParagraphs,
  isPdfPageFullyTranslated,
} from "./lib/pdfSegments";
import {
  normalizePdfOutline,
  resolvePdfDestinationPage,
  type PdfNavTab,
  type PdfOutlineLink,
  type PdfPageTurnDirection,
} from "./lib/pdfNavigation";
import {
  loadPdfNavigationPrefs,
  savePdfNavigationPrefs,
} from "./lib/pdfNavigationPrefs";
import { canListModels } from "./lib/providerForm";
import { clampPdfManualScale, type PdfZoomMode } from "./lib/readerLayout";
import { getReaderStatusLabel } from "./lib/readerStatus";
import {
  READER_PANEL_MIN_HEIGHTS,
  clampReaderColumnPairSizes,
  clampReaderRailSectionPairSizes,
  DEFAULT_READER_PANELS,
  didReaderRailBecomeVisible,
  getReaderColumnLayoutKey,
  getReaderColumnMinWidth,
  getReaderRailLayoutKey,
  getReaderWorkspaceMinHeight,
  getReaderWorkspaceMinWidth,
  getVisibleRailSections,
  getVisibleReaderColumns,
  resolveReaderColumnWeights,
  resolveReaderRailSectionWeights,
  toggleReaderPanel,
  type ReaderColumnKey,
  type ReaderColumnWeightsByLayout,
  type ReaderPanelKey,
  type ReaderRailSectionKey,
  type ReaderRailSectionWeightsByLayout,
} from "./lib/readerWorkspace";
import { getPdfJsWorkerPort } from "./lib/pdfWorker";
import { buildPageTranslationPayload, hasUsablePageText } from "./lib/pageText";
import { clampPage, getPagesToTranslate } from "./lib/pageQueue";
import {
  applyCachedPdfPageTranslations,
  type CachedPdfPageTranslation,
} from "./lib/pdfCacheHydration";
import {
  getPdfBackgroundTranslationMessage,
  getPdfPageLoadingMessage,
} from "./lib/pdfTranslationFeedback";
import {
  TRANSLATION_SETUP_REQUIRED_MESSAGE,
  getProviderErrorDetail,
  getFriendlyProviderError,
  getTranslateAllSlowModeErrorAction,
} from "./lib/providerErrors";
import { READANI_RELEASES_URL } from "./lib/release";
import {
  bumpRequestVersion,
  dequeueNextPage,
  enqueueBackgroundPages,
  enqueueForegroundPage,
  getEpubSectionTranslationProgress,
  getFullBookActionLabel,
  getPageProgressMap,
  getPageTranslationProgress,
  shouldContinueQueuedPageTranslations,
  isRequestVersionCurrent,
} from "./lib/pageTranslationScheduler";
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
} from "./lib/translateAllSlowMode";
import type {
  BatchTranslationResult,
  FileType,
  PageDoc,
  PageTranslationState,
  PresetSaveStatus,
  PresetTestResult,
  RecentBook,
  SelectionTranslation,
  SelectionTranslationResult,
  TranslationFallbackTrace,
  TranslationCacheSummary,
  TranslationPreset,
  TranslationProviderKind,
  TranslationSettings,
  WordLookupResult,
  WordTranslation,
} from "./types";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerPort = getPdfJsWorkerPort();
(window as any).pdfjsLib = pdfjsLib;

const DEFAULT_SETTINGS: TranslationSettings = {
  ...createDefaultSettings(),
};

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
const PDF_KEYBOARD_ZOOM_STEP = 0.05;
const FRONTEND_TIMEOUT_MS = 95_000;

type AppView = "home" | "reader";
const APP_WINDOW_TITLE = "readani";

type UpdateCheckSource = "automatic" | "manual";

type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string }
  | { phase: "ready"; version: string }
  | { phase: "installing"; version: string }
  | { phase: "error"; message: string };

const PRESET_AUTOSAVE_DELAY_MS = 700;
const FALLBACK_PROGRESS_EVENT = "translation-fallback-progress";
const FALLBACK_FAILURE_EVENT = "translation-fallback-failure";

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

function getFriendlyPresetTestResult(result: PresetTestResult): PresetTestResult {
  if (result.ok) {
    return result;
  }

  const rawError = result.detail ?? result.message;
  const friendlyError = getFriendlyProviderError(rawError);

  return {
    ...result,
    message: friendlyError.message,
    detail: getProviderErrorDetail(rawError),
  };
}

function getUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function invokeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function hasLoadedPdfTranslation(translation?: PageTranslationState) {
  return Boolean(
    translation?.status === "done" && translation.translatedText?.trim(),
  );
}

function sanitizePdfTranslationsForPresetChange(
  translations: Record<number, PageTranslationState>,
) {
  return Object.fromEntries(
    Object.entries(translations).map(([page, translation]) => {
      if (translation.status === "unavailable") {
        return [page, translation];
      }

      if (hasLoadedPdfTranslation(translation)) {
        return [
          page,
          {
            ...translation,
            status: "done" as const,
            activityMessage: undefined,
            error: undefined,
          },
        ];
      }

      return [
        page,
        {
          ...translation,
          status: "idle" as const,
          activityMessage: undefined,
          error: undefined,
        },
      ];
    }),
  ) as Record<number, PageTranslationState>;
}

function sanitizeEpubPagesForPresetChange(pages: PageDoc[]) {
  return pages.map((page) => ({
    ...page,
    paragraphs: page.paragraphs.map((paragraph) => {
      if (paragraph.status !== "loading") {
        return paragraph;
      }

      return {
        ...paragraph,
        status: paragraph.translation?.trim() ? ("done" as const) : ("idle" as const),
      };
    }),
  }));
}

function getPresetById(
  presets: TranslationPreset[],
  presetId?: string | null,
) {
  if (!presetId) {
    return undefined;
  }

  return presets.find((preset) => preset.id === presetId);
}

function getFallbackAttemptSummary(trace?: TranslationFallbackTrace) {
  if (!trace || trace.attemptCount <= 1) {
    return undefined;
  }

  return `Tried ${trace.attemptCount} presets.`;
}

function getFriendlyFallbackError(
  trace?: TranslationFallbackTrace,
  error?: unknown,
) {
  return getFriendlyProviderError(trace?.lastError ?? error);
}

function getFallbackFailureStatusMessage(
  trace?: TranslationFallbackTrace,
  error?: unknown,
) {
  const summary = getFallbackAttemptSummary(trace);
  const friendlyError = getFriendlyFallbackError(trace, error);

  return summary ? `${summary} ${friendlyError.message}` : friendlyError.message;
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { showToast } = useToast();
  const [pdfNavPrefs] = useState(() => loadPdfNavigationPrefs());
  const [appView, setAppView] = useState<AppView>("home");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentBookTitle, setCurrentBookTitle] = useState<string | null>(null);
  const [currentFileType, setCurrentFileType] = useState<FileType>("pdf");
  const [epubData, setEpubData] = useState<Uint8Array | null>(null);
  const [epubTotalPages, setEpubTotalPages] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineLink[]>([]);
  const [pageSizes, setPageSizes] = useState<
    { width: number; height: number }[]
  >([]);
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [pageTranslations, setPageTranslations] = useState<
    Record<number, PageTranslationState>
  >({});
  const [docId, setDocId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfScrollAnchor, setPdfScrollAnchor] = useState<"top" | "bottom">(
    "top",
  );
  const [pdfNavTab, setPdfNavTab] = useState<PdfNavTab>(pdfNavPrefs.tab);
  const [scale, setScale] = useState<number>(1);
  const [pdfZoomMode, setPdfZoomMode] = useState<PdfZoomMode>("fit-width");
  const [pdfManualScale, setPdfManualScale] = useState<number>(1);
  const [resolvedPdfScale, setResolvedPdfScale] = useState<number>(1);
  const [settings, setSettings] =
    useState<TranslationSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] =
    useState<TranslationSettings | null>(null);
  const [sessionFallbackPresetId, setSessionFallbackPresetId] = useState<
    string | null
  >(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [hoverPid, setHoverPid] = useState<string | null>(null);
  const [activePid, setActivePid] = useState<string | null>(null);
  const [documentStatusMessage, setDocumentStatusMessage] = useState<
    string | null
  >(null);
  const [translationStatusMessage, setTranslationStatusMessage] = useState<
    string | null
  >(null);
  const [readerPanels, setReaderPanels] = useState(DEFAULT_READER_PANELS);
  const [readerColumnWeights, setReaderColumnWeights] =
    useState<ReaderColumnWeightsByLayout>({});
  const [readerRailSectionWeights, setReaderRailSectionWeights] =
    useState<ReaderRailSectionWeightsByLayout>({});
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCloseConfirmOpen, setSettingsCloseConfirmOpen] =
    useState(false);
  const [settingsClosePending, setSettingsClosePending] = useState(false);
  const [translationCacheSummary, setTranslationCacheSummary] =
    useState<TranslationCacheSummary | null>(null);
  const [translationCacheLoading, setTranslationCacheLoading] = useState(false);
  const [translationCacheActionTarget, setTranslationCacheActionTarget] =
    useState<string | "all" | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [apiKeyEditingPresetId, setApiKeyEditingPresetId] = useState<
    string | null
  >(null);
  const [presetApiKeyDrafts, setPresetApiKeyDrafts] = useState<
    Record<string, string>
  >({});
  const [presetStatuses, setPresetStatuses] = useState<
    Record<string, PresetTestResult | undefined>
  >({});
  const [presetSaveStatusById, setPresetSaveStatusById] = useState<
    Record<string, PresetSaveStatus>
  >({});
  const [presetTestRunningId, setPresetTestRunningId] = useState<string | null>(
    null,
  );
  const [presetModelsLoadingById, setPresetModelsLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [presetModels, setPresetModels] = useState<Record<string, string[]>>(
    {},
  );
  const [presetModelMessages, setPresetModelMessages] = useState<
    Record<string, string | undefined>
  >({});
  const [presetModelAutoLoadAttempts, setPresetModelAutoLoadAttempts] =
    useState<Record<string, boolean>>({});
  const [testAllPresetsRunning, setTestAllPresetsRunning] =
    useState<boolean>(false);
  const [scrollToTranslationPage, setScrollToTranslationPage] = useState<
    number | null
  >(null);
  const [wordTranslation, setWordTranslation] =
    useState<WordTranslation | null>(null);
  const [selectionTranslation, setSelectionTranslation] =
    useState<SelectionTranslation | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [epubToc, setEpubToc] = useState<NavItem[]>([]);
  const [epubCurrentChapter, setEpubCurrentChapter] = useState<string>("");
  const [pendingEpubNavigationHref, setPendingEpubNavigationHref] = useState<
    string | null
  >(null);
  const [pendingEpubScroll, setPendingEpubScroll] = useState<{
    href: string;
    requestId: number;
  } | null>(null);
  const [isTranslateAllRunning, setIsTranslateAllRunning] = useState(false);
  const [translateAllWaitState, setTranslateAllWaitState] = useState<{
    kind: "slow-pause" | "rate-limit" | "transient-retry" | "usage-limit";
    resumeAt?: number;
    page: number | null;
    errorKind?: string;
  } | null>(null);
  const [translateAllWaitTick, setTranslateAllWaitTick] = useState(() =>
    Date.now(),
  );
  const [isTranslateAllStopRequested, setIsTranslateAllStopRequested] =
    useState(false);
  const [pageTranslationInFlightPage, setPageTranslationInFlightPage] =
    useState<number | null>(null);
  const [activeColumnResizeKey, setActiveColumnResizeKey] = useState<
    string | null
  >(null);
  const [activeRailResizeKey, setActiveRailResizeKey] = useState<string | null>(
    null,
  );
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: "idle",
  });

  const pagesRef = useRef<PageDoc[]>([]);
  const pageTranslationsRef = useRef<Record<number, PageTranslationState>>({});
  const textTranslationCacheRef = useRef(new LRUCache<string, string>(100));
  const settingsRef = useRef(settings);
  const settingsDraftRef = useRef<TranslationSettings | null>(settingsDraft);
  const sessionFallbackPresetIdRef = useRef<string | null>(
    sessionFallbackPresetId,
  );
  const presetApiKeyDraftsRef =
    useRef<Record<string, string>>(presetApiKeyDrafts);
  const presetSaveStatusByIdRef =
    useRef<Record<string, PresetSaveStatus>>(presetSaveStatusById);
  const docIdRef = useRef(docId);
  const epubViewerRef = useRef<EpubViewerHandle>(null);
  const translationRequestId = useRef(0);
  const translatingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const presetAutosaveTimerRef = useRef<number | null>(null);
  const presetAutosavePresetIdRef = useRef<string | null>(null);
  const presetSavePromisesRef = useRef<Record<string, Promise<void>>>({});
  const settingsPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
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
  const [translateAllUsageLimitPaused, setTranslateAllUsageLimitPaused] =
    useState(false);
  const translateAllUsageLimitPausedRef = useRef(false);
  const fallbackToastEligiblePdfPagesRef = useRef<Set<number>>(new Set());
  const pdfTranslationSessionRef = useRef(0);
  const pdfOutlineRequestIdRef = useRef(0);
  const fallbackRequestContextsRef = useRef<
    Record<string, FallbackRequestContext>
  >({});
  const fallbackFailureTracesRef = useRef<
    Record<string, TranslationFallbackTrace>
  >({});
  const pdfLoadRequestIdRef = useRef(0);
  const epubScrollRequestIdRef = useRef(0);
  const autoUpdateCheckStartedRef = useRef(false);
  const pendingUpdateRef = useRef<Update | null>(null);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const readerHeaderRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Record<ReaderColumnKey, HTMLElement | null>>({
    navigation: null,
    original: null,
    rail: null,
  });
  const railSectionRefs = useRef<
    Record<ReaderRailSectionKey, HTMLElement | null>
  >({
    translation: null,
    chat: null,
  });
  const columnResizeRef = useRef<{
    pointerId: number;
    startX: number;
    leftColumn: ReaderColumnKey;
    rightColumn: ReaderColumnKey;
    leftSize: number;
    rightSize: number;
    visibleColumns: ReaderColumnKey[];
    layoutKey: string;
  } | null>(null);
  const railResizeRef = useRef<{
    pointerId: number;
    startY: number;
    topSection: ReaderRailSectionKey;
    bottomSection: ReaderRailSectionKey;
    topSize: number;
    bottomSize: number;
    visibleSections: ReaderRailSectionKey[];
    layoutKey: string;
  } | null>(null);
  const didMountPdfNavPrefsRef = useRef(false);
  const previousReaderPanelsRef = useRef(readerPanels);

  const getEffectivePreset = useCallback(
    (sourceSettings: TranslationSettings = settingsRef.current) =>
      getPresetById(sourceSettings.presets, sessionFallbackPresetIdRef.current) ??
      getActivePreset(sourceSettings),
    [],
  );

  const showFallbackSuccessToast = useCallback(
    (trace: TranslationFallbackTrace) => {
      if (!trace.usedFallback || trace.finalPresetId === trace.requestedPresetId) {
        return;
      }

      const finalPreset = getPresetById(
        settingsRef.current.presets,
        trace.finalPresetId,
      );
      const currentEffectivePresetId =
        sessionFallbackPresetIdRef.current ?? settingsRef.current.activePresetId;
      const canUseForSession =
        Boolean(finalPreset) && currentEffectivePresetId !== trace.finalPresetId;

      showToast({
        message: `Retried with ${finalPreset?.label ?? trace.finalPresetId}.`,
        tone: "success",
        durationMs: 4600,
        actionLabel: canUseForSession ? "Use for this session" : undefined,
        onAction: canUseForSession
          ? () => setSessionFallbackPresetId(trace.finalPresetId)
          : undefined,
      });
    },
    [showToast],
  );

  const persistPdfNavPrefs = useCallback(() => {
    savePdfNavigationPrefs({
      ...pdfNavPrefs,
      tab: pdfNavTab,
    });
  }, [pdfNavPrefs, pdfNavTab]);

  const requestTranslationScroll = useCallback((page: number) => {
    setScrollToTranslationPage(null);
    window.requestAnimationFrame(() => {
      setScrollToTranslationPage(page);
    });
  }, []);

  const handleSeekPage = useCallback(
    (page: number) => {
      const totalPages = pages.length;
      if (totalPages === 0) return;
      const target = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(target);
      setPdfScrollAnchor("top");
    },
    [pages.length],
  );

  const normalizeHref = useCallback((href: string) => href.split("#")[0], []);

  const matchHref = useCallback(
    (targetHref: string, sourceHref: string) => {
      const target = normalizeHref(targetHref);
      const source = normalizeHref(sourceHref);
      return (
        target === source || target.endsWith(source) || source.endsWith(target)
      );
    },
    [normalizeHref],
  );

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    pageTranslationsRef.current = pageTranslations;
  }, [pageTranslations]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  useEffect(() => {
    sessionFallbackPresetIdRef.current = sessionFallbackPresetId;
  }, [sessionFallbackPresetId]);

  useEffect(() => {
    presetApiKeyDraftsRef.current = presetApiKeyDrafts;
  }, [presetApiKeyDrafts]);

  useEffect(() => {
    presetSaveStatusByIdRef.current = presetSaveStatusById;
  }, [presetSaveStatusById]);

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

  const clearPendingUpdate = useCallback(() => {
    const currentUpdate = pendingUpdateRef.current;
    pendingUpdateRef.current = null;

    if (currentUpdate) {
      void currentUpdate.close().catch(() => {
        // Ignore updater resource cleanup failures.
      });
    }
  }, []);

  const storePendingUpdate = useCallback((update: Update) => {
    const previousUpdate = pendingUpdateRef.current;
    pendingUpdateRef.current = update;

    if (previousUpdate && previousUpdate !== update) {
      void previousUpdate.close().catch(() => {
        // Ignore updater resource cleanup failures.
      });
    }
  }, []);

  const handleCheckForUpdates = useCallback(
    async (source: UpdateCheckSource) => {
      if (updateState.phase === "checking") {
        return;
      }

      if (updateState.phase === "downloading") {
        if (source === "manual") {
          showToast({ message: "Update is already downloading." });
        }
        return;
      }

      if (updateState.phase === "ready") {
        if (source === "manual") {
          showToast({
            message: "Update is ready to install.",
            tone: "success",
          });
        }
        return;
      }

      if (updateState.phase === "installing") {
        return;
      }

      setUpdateState({ phase: "checking" });

      try {
        const update = await check();

        if (!update) {
          clearPendingUpdate();
          setUpdateState({ phase: "idle" });

          if (source === "manual") {
            showToast({
              message: "You're running the latest version.",
              tone: "success",
            });
          }
          return;
        }

        storePendingUpdate(update);
        setUpdateState({ phase: "downloading", version: update.version });
        showToast({ message: "Found an update. Downloading now." });
        await update.download();
        setUpdateState({ phase: "ready", version: update.version });
      } catch (error) {
        clearPendingUpdate();
        const message = getUpdateErrorMessage(error);
        setUpdateState({ phase: "error", message });

        if (source === "manual") {
          showToast({
            message: `Update failed: ${message}`,
            tone: "error",
            durationMs: 5200,
          });
        } else {
          console.error("Background updater failed:", error);
        }
      }
    },
    [clearPendingUpdate, showToast, storePendingUpdate, updateState.phase],
  );

  const handleInstallUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current;

    if (!update || updateState.phase !== "ready") {
      return;
    }

    setUpdateState({ phase: "installing", version: update.version });

    try {
      await update.install();
      await relaunch();
    } catch (error) {
      const message = getUpdateErrorMessage(error);
      setUpdateState({ phase: "ready", version: update.version });
      showToast({
        message: `Update failed: ${message}`,
        tone: "error",
        durationMs: 5200,
      });
    }
  }, [showToast, updateState.phase]);

  const handleOpenLatestRelease = useCallback(async () => {
    try {
      await openUrl(READANI_RELEASES_URL);
    } catch (error) {
      showToast({
        message: `Update failed: ${getUpdateErrorMessage(error)}`,
        tone: "error",
        durationMs: 5200,
      });
    }
  }, [showToast]);

  useEffect(() => {
    if (autoUpdateCheckStartedRef.current) {
      return;
    }

    autoUpdateCheckStartedRef.current = true;
    void handleCheckForUpdates("automatic");
  }, [handleCheckForUpdates]);

  useEffect(() => {
    return () => {
      clearPendingUpdate();
    };
  }, [clearPendingUpdate]);

  const releasePdfDocument = useCallback((doc: PDFDocumentProxy | null) => {
    if (!doc) {
      return;
    }

    try {
      doc.cleanup();
    } catch {
      // Ignore cleanup failures during teardown.
    }

    void doc.destroy().catch(() => {
      // Ignore destroy failures during teardown.
    });
  }, []);

  const lastCommittedPdfDocRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    const previousDoc = lastCommittedPdfDocRef.current;
    lastCommittedPdfDocRef.current = pdfDoc;

    if (previousDoc && previousDoc !== pdfDoc) {
      releasePdfDocument(previousDoc);
    }
  }, [pdfDoc, releasePdfDocument]);

  useEffect(() => {
    return () => {
      pdfLoadRequestIdRef.current += 1;
      releasePdfDocument(lastCommittedPdfDocRef.current);
    };
  }, [releasePdfDocument]);

  useEffect(() => {
    docIdRef.current = docId;
  }, [docId]);

  useEffect(() => {
    isTranslateAllRunningRef.current = isTranslateAllRunning;
  }, [isTranslateAllRunning]);

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

  const allPdfPagesExtracted = useMemo(
    () =>
      currentFileType === "pdf" &&
      pages.length > 0 &&
      pages.every((page) => page.isExtracted),
    [currentFileType, pages],
  );

  const pageTranslationProgress = useMemo(
    () =>
      getPageTranslationProgress({
        pages,
      }),
    [pages],
  );

  const pageProgressMap = useMemo(
    () =>
      currentFileType === "pdf" && pages.length > 0
        ? getPageProgressMap(pages, pageTranslations, {
            foregroundQueue: foregroundPageTranslateQueueRef.current,
            inFlightPage: pageTranslationInFlightPage,
          })
        : [],
    [currentFileType, pageTranslationInFlightPage, pages, pageTranslations],
  );

  const epubSectionTranslationProgress = useMemo(
    () => getEpubSectionTranslationProgress(pages),
    [pages],
  );

  const translationProgress = useMemo(
    () =>
      currentFileType === "pdf"
        ? pageTranslationProgress
        : epubSectionTranslationProgress,
    [currentFileType, epubSectionTranslationProgress, pageTranslationProgress],
  );

  const translationProgressLabel = useMemo(() => {
    if (
      (currentFileType === "pdf" && !allPdfPagesExtracted) ||
      translationProgress.totalCount === 0
    ) {
      return null;
    }

    if (translationProgress.isFullyTranslated) {
      return "Fully translated";
    }

    return `${translationProgress.translatedCount}/${translationProgress.totalCount} ${translationProgress.unitLabel} translated`;
  }, [
    allPdfPagesExtracted,
    currentFileType,
    translationProgress,
  ]);

  const translateAllActionLabel = useMemo(() => {
    if (translateAllUsageLimitPaused) {
      return "Continue";
    }

    if (isTranslateAllStopRequested) {
      return "Stopping...";
    }

    if (isTranslateAllRunning) {
      return "Stop Translating All";
    }

    return getFullBookActionLabel(translationProgress);
  }, [isTranslateAllRunning, isTranslateAllStopRequested, translateAllUsageLimitPaused, translationProgress]);

  const translateAllProgressDetail = useMemo(() => {
    if (!isTranslateAllRunning) {
      return {
        label: null,
        state: null,
      } as const;
    }

    if (translateAllWaitState) {
      if (translateAllWaitState.kind === "usage-limit") {
        return {
          label: "Paused — out of credits or quota.",
          state: "paused" as const,
        };
      }

      const remainingSeconds = translateAllWaitState.resumeAt
        ? Math.max(
            1,
            Math.ceil((translateAllWaitState.resumeAt - translateAllWaitTick) / 1_000),
          )
        : 0;

      if (translateAllWaitState.kind === "slow-pause") {
        return {
          label: `Slow mode pause. Continuing in ${remainingSeconds}s`,
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
            ? `Rate limit hit on page ${translateAllWaitState.page}. Retrying in ${remainingSeconds}s`
            : `Rate limit hit. Retrying in ${remainingSeconds}s`,
        state: "waiting" as const,
      };
    }

    if (translateAllUsageLimitPaused) {
      return {
        label: "Paused — out of credits or quota.",
        state: "paused" as const,
      };
    }

    if (currentFileType === "pdf") {
      if (isTranslateAllStopRequested) {
        return {
          label:
            pageTranslationInFlightPage !== null
              ? `Stopping after page ${pageTranslationInFlightPage}`
              : "Stopping",
          state: "stopping" as const,
        };
      }

      return {
        label:
          pageTranslationInFlightPage !== null
            ? `Translating page ${pageTranslationInFlightPage}`
            : "Preparing pages",
        state: "running" as const,
      };
    }

    if (isTranslateAllStopRequested) {
      return {
        label: "Stopping after current batch",
        state: "stopping" as const,
      };
    }

    return {
      label: translationProgress.isFullyTranslated
        ? "Retranslating sections"
        : "Translating sections",
      state: "running" as const,
    };
  }, [
    currentFileType,
    isTranslateAllRunning,
    isTranslateAllStopRequested,
    pageTranslationInFlightPage,
    translateAllUsageLimitPaused,
    translateAllWaitState,
    translateAllWaitTick,
    translationProgress.isFullyTranslated,
  ]);

  const showReadyUpdateAction = updateState.phase === "ready";

  const aboutUpdateStatusMessage = useMemo(() => {
    switch (updateState.phase) {
      case "checking":
        return "Checking for updates.";
      case "downloading":
        return `Downloading v${updateState.version} in the background.`;
      case "ready":
        return `Update v${updateState.version} is ready. Use Update in the toolbar.`;
      case "installing":
        return `Installing v${updateState.version}.`;
      case "error":
        return `Last update error: ${updateState.message}`;
      default:
        return null;
    }
  }, [updateState]);

  const currentPdfPagePayload = useMemo(() => {
    if (currentFileType !== "pdf" || pages.length === 0) {
      return null;
    }

    return buildPageTranslationPayload(pages, currentPage);
  }, [currentFileType, currentPage, pages]);

  const canRedoCurrentPage =
    currentFileType === "pdf" &&
    allPdfPagesExtracted &&
    Boolean(
      currentPdfPagePayload &&
      hasUsablePageText(currentPdfPagePayload.displayText),
    );

  const canTranslateAll =
    ((currentFileType === "pdf" && allPdfPagesExtracted) ||
      currentFileType === "epub") &&
    translationProgress.totalCount > 0;

  const visibleReaderColumns = useMemo(
    () => getVisibleReaderColumns(readerPanels),
    [readerPanels],
  );

  const visibleRailSections = useMemo(
    () => getVisibleRailSections(readerPanels),
    [readerPanels],
  );

  const currentColumnLayoutKey = useMemo(
    () => getReaderColumnLayoutKey(visibleReaderColumns),
    [visibleReaderColumns],
  );

  const currentRailLayoutKey = useMemo(
    () => getReaderRailLayoutKey(visibleRailSections),
    [visibleRailSections],
  );

  const currentColumnWeights = useMemo(
    () => resolveReaderColumnWeights(readerColumnWeights, visibleReaderColumns),
    [readerColumnWeights, visibleReaderColumns],
  );

  const currentRailSectionWeights = useMemo(
    () =>
      resolveReaderRailSectionWeights(
        readerRailSectionWeights,
        visibleRailSections,
      ),
    [readerRailSectionWeights, visibleRailSections],
  );

  const workspaceMinWidth = useMemo(
    () => getReaderWorkspaceMinWidth(readerPanels),
    [readerPanels],
  );

  const workspaceMinHeight = useMemo(
    () => getReaderWorkspaceMinHeight(readerPanels),
    [readerPanels],
  );

  const togglePanel = useCallback((panel: ReaderPanelKey) => {
    setReaderPanels((prev) => toggleReaderPanel(prev, panel));
  }, []);

  useEffect(() => {
    const previousPanels = previousReaderPanelsRef.current;
    previousReaderPanelsRef.current = readerPanels;

    if (
      currentFileType === "pdf" &&
      readerPanels.original &&
      pdfZoomMode !== "fit-width" &&
      didReaderRailBecomeVisible(previousPanels, readerPanels)
    ) {
      setPdfZoomMode("fit-width");
    }
  }, [currentFileType, pdfZoomMode, readerPanels]);

  const setColumnElementRef = useCallback(
    (column: ReaderColumnKey) => (element: HTMLElement | null) => {
      columnRefs.current[column] = element;
    },
    [],
  );

  const setRailSectionElementRef = useCallback(
    (section: ReaderRailSectionKey) => (element: HTMLElement | null) => {
      railSectionRefs.current[section] = element;
    },
    [],
  );

  const getColumnStyle = useCallback(
    (column: ReaderColumnKey): CSSProperties => {
      const isVisible = visibleReaderColumns.includes(column);

      if (!isVisible) {
        return {
          flex: "0 0 0px",
          width: 0,
          minWidth: 0,
        };
      }

      return {
        flex: `${currentColumnWeights[column] ?? 1} 1 0px`,
        minWidth: `${getReaderColumnMinWidth(column, readerPanels)}px`,
      };
    },
    [currentColumnWeights, readerPanels, visibleReaderColumns],
  );

  const getRailSectionStyle = useCallback(
    (section: ReaderRailSectionKey): CSSProperties => {
      const isVisible = visibleRailSections.includes(section);

      if (!isVisible) {
        return {
          flex: "0 0 0px",
          height: 0,
          minHeight: 0,
        };
      }

      if (visibleRailSections.length === 1) {
        return {
          flex: "1 1 0px",
          minHeight: `${READER_PANEL_MIN_HEIGHTS[section]}px`,
        };
      }

      return {
        flex: `${currentRailSectionWeights[section] ?? 1} 1 0px`,
        minHeight: `${READER_PANEL_MIN_HEIGHTS[section]}px`,
      };
    },
    [currentRailSectionWeights, visibleRailSections],
  );

  const handleColumnResizeStart = useCallback(
    (leftColumn: ReaderColumnKey, rightColumn: ReaderColumnKey) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const leftElement = columnRefs.current[leftColumn];
        const rightElement = columnRefs.current[rightColumn];
        if (!leftElement || !rightElement) {
          return;
        }

        event.preventDefault();
        columnResizeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          leftColumn,
          rightColumn,
          leftSize: Math.round(leftElement.getBoundingClientRect().width),
          rightSize: Math.round(rightElement.getBoundingClientRect().width),
          visibleColumns: visibleReaderColumns,
          layoutKey: currentColumnLayoutKey,
        };
        document.body.classList.add("is-resizing-split-x");
        setActiveColumnResizeKey(`${leftColumn}:${rightColumn}`);

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional here.
        }
      },
    [currentColumnLayoutKey, visibleReaderColumns],
  );

  useEffect(() => {
    if (!activeColumnResizeKey) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = columnResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const nextSizes = clampReaderColumnPairSizes({
        panels: readerPanels,
        leftColumn: resizeState.leftColumn,
        rightColumn: resizeState.rightColumn,
        leftSize: resizeState.leftSize,
        rightSize: resizeState.rightSize,
        delta: event.clientX - resizeState.startX,
      });

      setReaderColumnWeights((prev) => {
        const currentWeights = resolveReaderColumnWeights(
          prev,
          resizeState.visibleColumns,
        );

        return {
          ...prev,
          [resizeState.layoutKey]: {
            ...currentWeights,
            [resizeState.leftColumn]: nextSizes.leftSize,
            [resizeState.rightColumn]: nextSizes.rightSize,
          },
        };
      });
    };

    const finishPointerResize = (event: PointerEvent) => {
      const resizeState = columnResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      columnResizeRef.current = null;
      setActiveColumnResizeKey(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerResize);
    window.addEventListener("pointercancel", finishPointerResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerResize);
      window.removeEventListener("pointercancel", finishPointerResize);
      document.body.classList.remove("is-resizing-split-x");
    };
  }, [activeColumnResizeKey, readerPanels]);

  const handleRailResizeStart = useCallback(
    (topSection: ReaderRailSectionKey, bottomSection: ReaderRailSectionKey) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const topElement = railSectionRefs.current[topSection];
        const bottomElement = railSectionRefs.current[bottomSection];
        if (!topElement || !bottomElement) {
          return;
        }

        event.preventDefault();
        railResizeRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          topSection,
          bottomSection,
          topSize: Math.round(topElement.getBoundingClientRect().height),
          bottomSize: Math.round(bottomElement.getBoundingClientRect().height),
          visibleSections: visibleRailSections,
          layoutKey: currentRailLayoutKey,
        };
        document.body.classList.add("is-resizing-split-y");
        setActiveRailResizeKey(`${topSection}:${bottomSection}`);

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional here.
        }
      },
    [currentRailLayoutKey, visibleRailSections],
  );

  useEffect(() => {
    if (!activeRailResizeKey) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = railResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const nextSizes = clampReaderRailSectionPairSizes({
        topSection: resizeState.topSection,
        bottomSection: resizeState.bottomSection,
        topSize: resizeState.topSize,
        bottomSize: resizeState.bottomSize,
        delta: event.clientY - resizeState.startY,
      });

      setReaderRailSectionWeights((prev) => {
        const currentWeights = resolveReaderRailSectionWeights(
          prev,
          resizeState.visibleSections,
        );

        return {
          ...prev,
          [resizeState.layoutKey]: {
            ...currentWeights,
            [resizeState.topSection]: nextSizes.topSize,
            [resizeState.bottomSection]: nextSizes.bottomSize,
          },
        };
      });
    };

    const finishPointerResize = (event: PointerEvent) => {
      const resizeState = railResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      railResizeRef.current = null;
      setActiveRailResizeKey(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerResize);
    window.addEventListener("pointercancel", finishPointerResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerResize);
      window.removeEventListener("pointercancel", finishPointerResize);
      document.body.classList.remove("is-resizing-split-y");
    };
  }, [activeRailResizeKey]);

  useEffect(() => {
    if (!didMountPdfNavPrefsRef.current) {
      didMountPdfNavPrefsRef.current = true;
      return;
    }

    persistPdfNavPrefs();
  }, [pdfNavTab, persistPdfNavPrefs]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const resolveTheme = () => {
      const systemTheme = mediaQuery.matches ? "dark" : "light";
      const resolved =
        settings.theme === "system" ? systemTheme : settings.theme;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    };

    resolveTheme();

    if (settings.theme === "system") {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", resolveTheme);
        return () => mediaQuery.removeEventListener("change", resolveTheme);
      }
      mediaQuery.addListener(resolveTheme);
      return () => mediaQuery.removeListener(resolveTheme);
    }

    return undefined;
  }, [settings.theme]);

  useEffect(() => {
    const shell = readerShellRef.current;

    if (appView !== "reader" || !shell) {
      void getCurrentWindow()
        .setSizeConstraints(null)
        .catch(() => {});
      return;
    }

    const shellStyles = window.getComputedStyle(shell);
    const paddingX =
      Number.parseFloat(shellStyles.paddingLeft || "0") +
      Number.parseFloat(shellStyles.paddingRight || "0");
    const paddingY =
      Number.parseFloat(shellStyles.paddingTop || "0") +
      Number.parseFloat(shellStyles.paddingBottom || "0");
    const rowGap = Number.parseFloat(
      shellStyles.rowGap || shellStyles.gap || "0",
    );
    const headerHeight = Math.ceil(
      readerHeaderRef.current?.getBoundingClientRect().height ?? 0,
    );
    const minWidth = Math.ceil(workspaceMinWidth + paddingX);
    const minHeight = Math.ceil(
      workspaceMinHeight + paddingY + headerHeight + rowGap,
    );

    void getCurrentWindow()
      .setSizeConstraints({
        minWidth,
        minHeight,
      })
      .catch(() => {});
  }, [appView, workspaceMinHeight, workspaceMinWidth]);

  useEffect(() => {
    const trimmedBookTitle = currentBookTitle?.trim();
    const nextWindowTitle =
      appView === "reader" && trimmedBookTitle
        ? `${APP_WINDOW_TITLE} · ${trimmedBookTitle}`
        : APP_WINDOW_TITLE;

    document.title = nextWindowTitle;
    void getCurrentWindow()
      .setTitle(nextWindowTitle)
      .catch((error) => console.error("Failed to update window title:", error));
  }, [appView, currentBookTitle]);

  useEffect(() => {
    invoke<TranslationSettings>("get_app_settings")
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettingsFromStorage(loadedSettings);
        setSettings(normalizedSettings);
        setSettingsLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
        setSettingsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (
      sessionFallbackPresetId &&
      !getPresetById(settings.presets, sessionFallbackPresetId)
    ) {
      setSessionFallbackPresetId(null);
    }
  }, [sessionFallbackPresetId, settings.presets]);

  const savedActivePreset = useMemo(() => getActivePreset(settings), [settings]);
  const effectivePreset = useMemo(
    () =>
      getPresetById(settings.presets, sessionFallbackPresetId) ??
      savedActivePreset,
    [savedActivePreset, sessionFallbackPresetId, settings.presets],
  );
  const activePresetHasTranslationContext = useMemo(
    () => hasPresetTranslationContext(effectivePreset),
    [effectivePreset],
  );
  const activePresetHasLiveSetup = useMemo(
    () => hasUsableLiveTranslationSetup(effectivePreset),
    [effectivePreset],
  );
  const currentPdfTranslation =
    currentFileType === "pdf" ? pageTranslations[currentPage] : undefined;
  const currentPdfPageDoc =
    currentFileType === "pdf"
      ? pages.find((entry) => entry.page === currentPage)
      : undefined;
  const showPdfSetupPrompt =
    settingsLoaded &&
    currentFileType === "pdf" &&
    Boolean(
      currentPdfPagePayload &&
      hasUsablePageText(currentPdfPagePayload.displayText),
    ) &&
    currentPdfTranslation?.status !== "done" &&
    currentPdfTranslation?.status !== "unavailable" &&
    (currentPdfTranslation?.status === "setup-required" ||
      !activePresetHasTranslationContext);
  const currentPdfLoadingMessage = useMemo(
    () =>
      currentFileType !== "pdf"
        ? null
        : getPdfPageLoadingMessage({
            currentPage,
            currentPageDoc: currentPdfPageDoc,
            currentPageTranslation: currentPdfTranslation,
            inFlightPage: pageTranslationInFlightPage,
          }),
    [
      currentFileType,
      currentPage,
      currentPdfPageDoc,
      currentPdfTranslation,
      pageTranslationInFlightPage,
    ],
  );
  const pdfBackgroundTranslationMessage = useMemo(() => {
    if (currentFileType !== "pdf" || currentPdfLoadingMessage) {
      return null;
    }

    return getPdfBackgroundTranslationMessage({
      currentPage,
      inFlightPage: pageTranslationInFlightPage,
      isTranslateAllRunning,
    });
  }, [
    currentFileType,
    currentPage,
    currentPdfLoadingMessage,
    isTranslateAllRunning,
    pageTranslationInFlightPage,
  ]);
  const pdfProgressDetailLabel =
    translateAllProgressDetail.label ?? pdfBackgroundTranslationMessage;
  const pdfProgressDetailState =
    translateAllProgressDetail.state ??
    (pdfBackgroundTranslationMessage ? ("running" as const) : null);
  const currentEpubPageHasTranslation = useMemo(() => {
    if (currentFileType !== "epub") {
      return false;
    }

    const page = pages.find((entry) => entry.page === currentPage);
    return Boolean(
      page?.paragraphs.some(
        (paragraph) =>
          paragraph.status === "done" && paragraph.translation?.trim(),
      ),
    );
  }, [currentFileType, currentPage, pages]);
  const showEpubSetupPrompt =
    settingsLoaded &&
    currentFileType === "epub" &&
    translationStatusMessage === TRANSLATION_SETUP_REQUIRED_MESSAGE &&
    !currentEpubPageHasTranslation;
  const dialogSettings = settingsDraft ?? settings;

  const buildPersistableSettings = useCallback(
    (nextSettings: TranslationSettings) =>
      serializeSettingsForCommand({
        ...nextSettings,
        presets: nextSettings.presets.map((preset) => {
          const draftApiKey = presetApiKeyDraftsRef.current[preset.id]?.trim();
          return draftApiKey && providerUsesApiKey(preset.providerKind)
            ? { ...preset, apiKey: draftApiKey }
            : preset;
        }),
      }),
    [],
  );

  const persistSettings = useCallback(
    async (nextSettings: TranslationSettings) => {
      const runPersist = async () => {
        const saved = (await invoke("save_app_settings", {
          settings: buildPersistableSettings(nextSettings),
        })) as TranslationSettings;
        const normalizedSettings = normalizeSettingsFromStorage(saved);
        setSettings(normalizedSettings);
        return normalizedSettings;
      };

      const queuedPersist = settingsPersistQueueRef.current.then(
        runPersist,
        runPersist,
      );
      settingsPersistQueueRef.current = queuedPersist.then(
        () => undefined,
        () => undefined,
      );

      return queuedPersist;
    },
    [buildPersistableSettings],
  );

  const getPresetDraft = useCallback((preset: TranslationPreset) => {
    const draftApiKey = presetApiKeyDraftsRef.current[preset.id]?.trim();
    return serializePresetForCommand(
      draftApiKey && providerUsesApiKey(preset.providerKind)
        ? { ...preset, apiKey: draftApiKey }
        : preset,
    );
  }, []);

  const handleThemeToggle = useCallback(() => {
    const nextSettings = {
      ...settings,
      theme: getNextThemeMode(settings.theme),
    };
    setSettings(nextSettings);
    void persistSettings(nextSettings);
  }, [persistSettings, settings]);

  const loadPdfFromPath = useCallback(
    async (filePath: string, startPage?: number) => {
      const outlineRequestId = ++pdfOutlineRequestIdRef.current;
      const loadRequestId = ++pdfLoadRequestIdRef.current;
      let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
      let loadedDoc: PDFDocumentProxy | null = null;
      let committedDoc = false;
      const isStaleLoad = () => pdfLoadRequestIdRef.current !== loadRequestId;

      setAppView("reader");
      setCurrentFilePath(filePath);
      setCurrentFileType("pdf");
      setEpubData(null);
      setEpubToc([]);
      setEpubCurrentChapter("");
      setPendingEpubNavigationHref(null);
      setLoadingProgress(0);
      setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
      setTranslationStatusMessage(null);
      setPdfDoc(null);
      setPdfOutline([]);
      setPages([]);
      setPageTranslations({});
      setPageSizes([]);
      setPdfZoomMode("fit-width");
      setPdfManualScale(1);
      setResolvedPdfScale(1);
      setPdfScrollAnchor("top");
      setPendingEpubScroll(null);
      setScrollToTranslationPage(null);
      setSelectionTranslation(null);
      setWordTranslation(null);
      setHoverPid(null);
      setActivePid(null);
      resetTranslateAllSlowModeRuntime();
      isTranslateAllRunningRef.current = false;
      setIsTranslateAllRunning(false);
      translationRequestId.current = 0;
      translatingRef.current = false;
      translateQueueRef.current = [];
      forceFreshSentenceTranslationIdsRef.current.clear();
      foregroundPageTranslateQueueRef.current = [];
      backgroundPageTranslateQueueRef.current = [];
      pageTranslationRequestVersionsRef.current = {};
      pageTranslationInFlightRef.current = null;
      pageTranslatingRef.current = false;
      setPageTranslationInFlightPage(null);
      pdfTranslationSessionRef.current += 1;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);

      try {
        setLoadingProgress(5);
        const rawBytes = (await invoke("read_pdf_file", {
          path: filePath,
        })) as number[];
        const bytes = new Uint8Array(rawBytes);
        const buffer = bytes.buffer.slice(0);
        const hash = await hashBuffer(buffer);
        const nextDocId = hash.slice(0, 12);

        if (isStaleLoad()) {
          return;
        }

        setLoadingProgress(15);
        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        loadedDoc = doc;

        if (isStaleLoad()) {
          return;
        }

        setLoadingProgress(25);
        const sizes: { width: number; height: number }[] = [];
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          try {
            if (isStaleLoad()) {
              return;
            }

            const viewport = page.getViewport({ scale: 1 });
            sizes.push({ width: viewport.width, height: viewport.height });
            setLoadingProgress(25 + Math.round((i / doc.numPages) * 25));
          } finally {
            page.cleanup();
          }
        }

        const initialPages: PageDoc[] = sizes.map((_, index) => ({
          page: index + 1,
          paragraphs: [],
          isExtracted: false,
        }));

        // Extract filename and title from path
        const fileName = filePath.split(/[/\\]/).pop() || "Untitled";
        const title = fileName.replace(/\.[^.]+$/, "");
        setCurrentBookTitle(title);

        // Add to recent books
        try {
          await invoke("add_recent_book", {
            id: nextDocId,
            filePath: filePath,
            fileName: fileName,
            fileType: "pdf",
            title: title,
            author: null,
            coverImage: null,
            totalPages: doc.numPages,
          });
        } catch (error) {
          console.error("Failed to add to recent books:", error);
        }

        if (isStaleLoad()) {
          return;
        }

        setPdfDoc(doc);
        committedDoc = true;
        void doc
          .getOutline()
          .then((outline) =>
            normalizePdfOutline(outline as any, {
              getPageNumberFromDest: (dest) =>
                resolvePdfDestinationPage(dest, doc),
            }),
          )
          .then((normalizedOutline) => {
            if (pdfOutlineRequestIdRef.current !== outlineRequestId) {
              return;
            }
            setPdfOutline(normalizedOutline);
          })
          .catch((error) => {
            console.error("Failed to load PDF outline:", error);
          });
        setPageSizes(sizes);
        setPages(initialPages);
        setDocId(nextDocId);
        setCurrentPage(startPage || 1);
        setDocumentStatusMessage(getReaderStatusLabel("extracting-text"));

        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          try {
            if (isStaleLoad()) {
              return;
            }

            const { paragraphs, watermarks } = await extractPageParagraphs(
              page,
              nextDocId,
              i - 1,
            );

            if (isStaleLoad()) {
              return;
            }

            setPages((prev) =>
              prev.map((entry) =>
                entry.page === i
                  ? { ...entry, paragraphs, watermarks, isExtracted: true }
                  : entry,
              ),
            );
            setLoadingProgress(50 + Math.round((i / doc.numPages) * 50));
          } finally {
            page.cleanup();
          }
        }

        if (isStaleLoad()) {
          return;
        }

        setLoadingProgress(null);
        setDocumentStatusMessage(null);
      } catch (error) {
        if (isStaleLoad()) {
          return;
        }

        console.error("Failed to load PDF:", error);
        setLoadingProgress(null);
        setDocumentStatusMessage(
          "Failed to load PDF. The file may have been moved or deleted.",
        );
      } finally {
        if (!committedDoc) {
          if (loadedDoc) {
            releasePdfDocument(loadedDoc);
          } else if (loadingTask) {
            try {
              loadingTask.destroy();
            } catch {
              // Ignore loading-task teardown failures during cancellation.
            }
          }
        }
      }
    },
    [releasePdfDocument, resetTranslateAllSlowModeRuntime],
  );

  const loadEpubFromPath = useCallback(
    async (filePath: string, startPage?: number) => {
      pdfOutlineRequestIdRef.current += 1;
      pdfLoadRequestIdRef.current += 1;
      setAppView("reader");
      setCurrentFilePath(filePath);
      setCurrentFileType("epub");
      setPdfDoc(null);
      setPdfOutline([]);
      setEpubToc([]);
      setEpubCurrentChapter("");
      setPendingEpubNavigationHref(null);
      setPageSizes([]);
      setPageTranslations({});
      setSelectionTranslation(null);
      setHoverPid(null);
      setActivePid(null);
      setLoadingProgress(0);
      setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
      setTranslationStatusMessage(null);
      setPdfScrollAnchor("top");
      setPendingEpubScroll(null);
      setScrollToTranslationPage(null);
      resetTranslateAllSlowModeRuntime();
      isTranslateAllRunningRef.current = false;
      setIsTranslateAllRunning(false);
      translationRequestId.current = 0;
      translatingRef.current = false;
      translateQueueRef.current = [];
      forceFreshSentenceTranslationIdsRef.current.clear();
      foregroundPageTranslateQueueRef.current = [];
      backgroundPageTranslateQueueRef.current = [];
      pageTranslationRequestVersionsRef.current = {};
      pageTranslationInFlightRef.current = null;
      pageTranslatingRef.current = false;
      setPageTranslationInFlightPage(null);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);

      try {
        const rawBytes = (await invoke("read_pdf_file", {
          path: filePath,
        })) as number[];
        const bytes = new Uint8Array(rawBytes);
        const buffer = bytes.buffer.slice(0);
        const hash = await hashBuffer(buffer);
        const nextDocId = hash.slice(0, 12);

        // Extract filename and title from path
        const fileName = filePath.split(/[/\\]/).pop() || "Untitled";
        const title = fileName.replace(/\.[^.]+$/, "");
        setCurrentBookTitle(title);

        setEpubData(bytes);
        setDocId(nextDocId);
        setCurrentPage(startPage || 1);

        // Add to recent books (will be updated with proper metadata from EPUB)
        try {
          await invoke("add_recent_book", {
            id: nextDocId,
            filePath: filePath,
            fileName: fileName,
            fileType: "epub",
            title: title,
            author: null,
            coverImage: null,
            totalPages: 1,
          });
        } catch (error) {
          console.error("Failed to add to recent books:", error);
        }
      } catch (error) {
        console.error("Failed to load EPUB:", error);
        setDocumentStatusMessage(
          "Failed to load EPUB. The file may have been moved or deleted.",
        );
        setLoadingProgress(null);
      }
    },
    [resetTranslateAllSlowModeRuntime],
  );

  const handleEpubMetadata = useCallback(
    async (metadata: {
      title: string;
      author?: string;
      coverImage?: string;
    }) => {
      setCurrentBookTitle(metadata.title);
      // Update recent book with proper metadata
      if (docId) {
        try {
          await invoke("add_recent_book", {
            id: docId,
            filePath: currentFilePath,
            fileName: currentFilePath?.split(/[/\\]/).pop() || "Untitled",
            fileType: "epub",
            title: metadata.title,
            author: metadata.author || null,
            coverImage: metadata.coverImage || null,
            totalPages: epubTotalPages,
          });
        } catch (error) {
          console.error("Failed to update recent book metadata:", error);
        }
      }
    },
    [docId, currentFilePath, epubTotalPages],
  );

  const handleEpubParagraphs = useCallback(
    (paragraphs: EpubParagraph[]) => {
      // Split EPUB paragraphs into virtual pages while keeping chapter boundaries
      const PARAGRAPHS_PER_PAGE = 20;
      const epubPages: PageDoc[] = [];

      let pageNum = 1;
      let chunk: EpubParagraph[] = [];
      let chunkHref: string | undefined;
      let chunkTitle: string | undefined;

      const flushChunk = () => {
        if (chunk.length === 0) return;
        epubPages.push({
          page: pageNum,
          title: chunkTitle,
          isExtracted: true,
          paragraphs: chunk.map((p) => ({
            pid: p.pid,
            page: pageNum,
            source: p.source,
            translation: p.translation,
            status: p.status,
            rects: [],
            epubHref: p.href,
            sectionTitle: p.sectionTitle,
          })),
        });
        pageNum += 1;
        chunk = [];
        chunkHref = undefined;
        chunkTitle = undefined;
      };

      for (const paragraph of paragraphs) {
        const nextHref = paragraph.href;
        const startsNewSection = Boolean(
          chunkHref && nextHref && !matchHref(chunkHref, nextHref),
        );
        const chunkFull = chunk.length >= PARAGRAPHS_PER_PAGE;
        if (startsNewSection || chunkFull) {
          flushChunk();
        }

        if (chunk.length === 0) {
          chunkHref = nextHref;
          chunkTitle = paragraph.sectionTitle;
        }

        chunk.push(paragraph);
      }

      flushChunk();

      setPages(epubPages);
      setEpubTotalPages(epubPages.length);
    },
    [matchHref],
  );

  const handleEpubPageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setEpubTotalPages(total);
  }, []);

  const handleEpubLoadingProgress = useCallback((progress: number | null) => {
    setLoadingProgress(progress);
    setDocumentStatusMessage(
      progress === null ? null : getReaderStatusLabel("loading-document"),
    );
  }, []);

  const handleEpubTocChange = useCallback((toc: NavItem[]) => {
    setEpubToc(toc);
  }, []);

  const handleEpubCurrentChapterChange = useCallback((chapter: string) => {
    setEpubCurrentChapter(chapter);
  }, []);

  const handleEpubHrefChange = useCallback((href: string) => {
    const requestId = ++epubScrollRequestIdRef.current;
    setPendingEpubScroll({ href, requestId });
  }, []);

  const handleOpenFile = useCallback(async () => {
    const selection = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["pdf", "epub"] }],
    });

    if (!selection || Array.isArray(selection)) return;

    const ext = selection.split(".").pop()?.toLowerCase();
    if (ext === "epub") {
      await loadEpubFromPath(selection);
    } else {
      await loadPdfFromPath(selection);
    }
  }, [loadPdfFromPath, loadEpubFromPath]);

  const handleOpenBook = useCallback(
    async (book: RecentBook) => {
      if (book.fileType === "epub") {
        await loadEpubFromPath(book.filePath, book.lastPage);
      } else {
        await loadPdfFromPath(book.filePath, book.lastPage);
      }
    },
    [loadPdfFromPath, loadEpubFromPath],
  );

  const handleBackToHome = useCallback(() => {
    pdfOutlineRequestIdRef.current += 1;
    pdfLoadRequestIdRef.current += 1;
    // Save progress before leaving (works for both PDF and EPUB)
    const total = pdfDoc ? pdfDoc.numPages : epubTotalPages;
    if (docId && total > 0) {
      const progress = (currentPage / total) * 100;
      invoke("update_book_progress", {
        id: docId,
        lastPage: currentPage,
        progress: progress,
      }).catch(console.error);
    }
    setAppView("home");
    setPdfDoc(null);
    setPdfOutline([]);
    setEpubData(null);
    setPages([]);
    setPageTranslations({});
    setPageSizes([]);
    setPdfScrollAnchor("top");
    setCurrentFilePath(null);
    setCurrentBookTitle(null);
    setDocumentStatusMessage(null);
    setTranslationStatusMessage(null);
    setSelectionTranslation(null);
    setWordTranslation(null);
    setEpubToc([]);
    setEpubCurrentChapter("");
    setPendingEpubNavigationHref(null);
    setPendingEpubScroll(null);
    setScrollToTranslationPage(null);
    resetTranslateAllSlowModeRuntime();
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    translatingRef.current = false;
    translateQueueRef.current = [];
    forceFreshSentenceTranslationIdsRef.current.clear();
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    setPageTranslationInFlightPage(null);
  }, [currentPage, docId, epubTotalPages, pdfDoc, resetTranslateAllSlowModeRuntime]);

  // Helper functions for chat context
  const getCurrentPageText = useCallback(() => {
    const currentPageDoc = pages.find((p) => p.page === currentPage);
    if (!currentPageDoc) return "";
    return currentPageDoc.paragraphs.map((p) => p.source).join("\n\n");
  }, [pages, currentPage]);

  const getSurroundingPagesText = useCallback(() => {
    const radius = 3;
    const startPage = Math.max(1, currentPage - radius);
    const endPage = Math.min(pages.length, currentPage + radius);

    return pages
      .filter((p) => p.page >= startPage && p.page <= endPage)
      .map(
        (p) =>
          `--- Page ${p.page} ---\n${p.paragraphs.map((para) => para.source).join("\n\n")}`,
      )
      .join("\n\n");
  }, [pages, currentPage]);

  const updateSettingsDraftState = useCallback(
    (nextSettings: TranslationSettings | null) => {
      settingsDraftRef.current = nextSettings;
      setSettingsDraft(nextSettings);
    },
    [],
  );

  const updatePresetSaveStatus = useCallback(
    (presetId: string, status: PresetSaveStatus) => {
      setPresetSaveStatusById((prev) => {
        const next = {
          ...prev,
          [presetId]: status,
        };
        presetSaveStatusByIdRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearPresetSaveStatus = useCallback((presetId: string) => {
    setPresetSaveStatusById((prev) => {
      const { [presetId]: _removed, ...rest } = prev;
      presetSaveStatusByIdRef.current = rest;
      return rest;
    });
  }, []);

  const buildInitialPresetSaveStatuses = useCallback(
    (sourceSettings: TranslationSettings) => {
      return Object.fromEntries(
        sourceSettings.presets.map((preset) => [
          preset.id,
          getPresetSaveStatus(preset, ""),
        ]),
      );
    },
    [],
  );

  const clearPendingPresetAutosave = useCallback(() => {
    if (presetAutosaveTimerRef.current !== null) {
      window.clearTimeout(presetAutosaveTimerRef.current);
      presetAutosaveTimerRef.current = null;
    }
    presetAutosavePresetIdRef.current = null;
  }, []);

  const resetSettingsDialogState = useCallback(() => {
    clearPendingPresetAutosave();
    updateSettingsDraftState(null);
    setTranslationCacheSummary(null);
    setTranslationCacheLoading(false);
    setTranslationCacheActionTarget(null);
    setEditingPresetId(null);
    setApiKeyEditingPresetId(null);
    setPresetApiKeyDrafts({});
    setPresetStatuses({});
    setPresetTestRunningId(null);
    setPresetSaveStatusById({});
    presetSaveStatusByIdRef.current = {};
    setPresetModelsLoadingById({});
    setPresetModels({});
    setPresetModelMessages({});
    setPresetModelAutoLoadAttempts({});
    setSettingsClosePending(false);
    setSettingsCloseConfirmOpen(false);
  }, [clearPendingPresetAutosave, updateSettingsDraftState]);

  const refreshTranslationCacheSummary = useCallback(async () => {
    setTranslationCacheLoading(true);

    try {
      const summary = (await invoke(
        "get_translation_cache_summary",
      )) as TranslationCacheSummary;
      setTranslationCacheSummary(summary);
    } catch (error) {
      console.error("Failed to load translation cache summary:", error);
      showToast({
        message: "Could not load the translation cache.",
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setTranslationCacheLoading(false);
    }
  }, [showToast]);

  const handleOpenSettings = useCallback(() => {
    clearPendingPresetAutosave();
    updateSettingsDraftState(settings);
    void refreshTranslationCacheSummary();
    setEditingPresetId(null);
    setApiKeyEditingPresetId(null);
    setPresetApiKeyDrafts({});
    setPresetStatuses({});
    setPresetTestRunningId(null);
    const nextSaveStatuses = buildInitialPresetSaveStatuses(settings);
    presetSaveStatusByIdRef.current = nextSaveStatuses;
    setPresetSaveStatusById(nextSaveStatuses);
    setPresetModelsLoadingById({});
    setPresetModels({});
    setPresetModelMessages({});
    setPresetModelAutoLoadAttempts({});
    setSettingsClosePending(false);
    setSettingsCloseConfirmOpen(false);
    setSettingsOpen(true);
  }, [
    buildInitialPresetSaveStatuses,
    clearPendingPresetAutosave,
    refreshTranslationCacheSummary,
    settings,
    updateSettingsDraftState,
  ]);

  const showTranslationSetupToast = useCallback(() => {
    showToast({
      message: TRANSLATION_SETUP_REQUIRED_MESSAGE,
      actionLabel: "Open Settings",
      onAction: handleOpenSettings,
      durationMs: 4200,
    });
  }, [handleOpenSettings, showToast]);

  const getDraftPresetById = useCallback((presetId: string) => {
    const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
    return sourceSettings.presets.find((preset) => preset.id === presetId);
  }, []);

  const syncSavedPresetIntoDraft = useCallback(
    (savedSettings: TranslationSettings, presetId: string) => {
      updateSettingsDraftState(
        (() => {
          const currentDraft = settingsDraftRef.current;
          if (!currentDraft) {
            return currentDraft;
          }

          const savedPreset = savedSettings.presets.find(
            (preset) => preset.id === presetId,
          );
          const nextPresets = savedPreset
            ? currentDraft.presets.some((preset) => preset.id === presetId)
              ? currentDraft.presets.map((preset) =>
                  preset.id === presetId ? savedPreset : preset,
                )
              : [...currentDraft.presets, savedPreset]
            : currentDraft.presets.filter((preset) => preset.id !== presetId);

          return {
            ...currentDraft,
            presets: nextPresets,
          };
        })(),
      );
    },
    [updateSettingsDraftState],
  );

  const clearPresetLocalArtifacts = useCallback(
    (presetId: string) => {
      if (presetAutosavePresetIdRef.current === presetId) {
        clearPendingPresetAutosave();
      }

      setPresetStatuses((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetApiKeyDrafts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModels((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelsLoadingById((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelMessages((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelAutoLoadAttempts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      clearPresetSaveStatus(presetId);
    },
    [clearPendingPresetAutosave, clearPresetSaveStatus],
  );

  const handleFetchPresetModels = useCallback(
    async (presetId: string, options?: { auto?: boolean }) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      if (options?.auto) {
        setPresetModelAutoLoadAttempts((prev) => ({
          ...prev,
          [presetId]: true,
        }));
      }

      setPresetModelsLoadingById((prev) => ({
        ...prev,
        [presetId]: true,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));

      try {
        const models = (await invoke("list_preset_models", {
          preset: getPresetDraft(draftPreset),
        })) as string[];

        setPresetModels((prev) => ({
          ...prev,
          [presetId]: models,
        }));
      } catch (error) {
        console.error("Failed to fetch preset models:", error);
        const friendlyError = getFriendlyProviderError(error);
        setPresetModelMessages((prev) => ({
          ...prev,
          [presetId]:
            friendlyError.kind === "unknown"
              ? "Could not load models. You can still type one manually."
              : friendlyError.message,
        }));
      } finally {
        setPresetModelsLoadingById((prev) => ({
          ...prev,
          [presetId]: false,
        }));
      }
    },
    [getDraftPresetById, getPresetDraft],
  );

  const persistPresetDraft = useCallback(
    async (presetId: string, options?: { clearApiKeyAfterSave?: boolean }) => {
      const existingPromise = presetSavePromisesRef.current[presetId];
      if (existingPromise) {
        return existingPromise;
      }

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const apiKeyInput = presetApiKeyDraftsRef.current[presetId] ?? "";
      if (!canPersistPresetDraft(draftPreset, apiKeyInput)) {
        updatePresetSaveStatus(presetId, {
          state: "invalid",
          detail: getPresetMissingRequirement(draftPreset, apiKeyInput),
        });
        return;
      }

      const savePromise = (async () => {
        updatePresetSaveStatus(presetId, { state: "saving" });

        try {
          const nextSettings = (() => {
            const liveSettings = settingsRef.current;
            const nextPresets = liveSettings.presets.some(
              (preset) => preset.id === presetId,
            )
              ? liveSettings.presets.map((preset) =>
                  preset.id === presetId ? draftPreset : preset,
                )
              : [...liveSettings.presets, draftPreset];

            return {
              ...liveSettings,
              presets: nextPresets,
            };
          })();

          const savedSettings = await persistSettings(nextSettings);
          const savedPreset =
            savedSettings.presets.find((preset) => preset.id === presetId) ??
            draftPreset;

          syncSavedPresetIntoDraft(savedSettings, presetId);

          const shouldMaskApiKey = Boolean(
            options?.clearApiKeyAfterSave &&
            presetApiKeyDraftsRef.current[presetId]?.trim(),
          );

          if (shouldMaskApiKey) {
            setPresetApiKeyDrafts((prev) => {
              const { [presetId]: _removed, ...rest } = prev;
              return rest;
            });
          }

          updatePresetSaveStatus(
            presetId,
            getPresetSaveStatus(
              savedPreset,
              shouldMaskApiKey
                ? ""
                : (presetApiKeyDraftsRef.current[presetId] ?? ""),
            ),
          );

          const canLoadModels = canListModels({
            kind: savedPreset.providerKind,
            baseUrl: savedPreset.baseUrl,
            apiKey: shouldMaskApiKey
              ? ""
              : (presetApiKeyDraftsRef.current[presetId] ?? ""),
            apiKeyConfigured: savedPreset.apiKeyConfigured,
          });

          if (
            canLoadModels &&
            !savedPreset.model.trim() &&
            !presetModels[presetId]?.length &&
            !presetModelsLoadingById[presetId] &&
            !presetModelAutoLoadAttempts[presetId]
          ) {
            void handleFetchPresetModels(presetId, { auto: true });
          }
        } catch (error) {
          console.error("Failed to save preset:", error);
          updatePresetSaveStatus(presetId, {
            state: "error",
            detail: `Save failed: ${getFriendlyProviderError(error).message}`,
          });
        } finally {
          delete presetSavePromisesRef.current[presetId];
        }
      })();

      presetSavePromisesRef.current[presetId] = savePromise;
      return savePromise;
    },
    [
      getDraftPresetById,
      handleFetchPresetModels,
      persistSettings,
      presetModelAutoLoadAttempts,
      presetModels,
      presetModelsLoadingById,
      syncSavedPresetIntoDraft,
      updatePresetSaveStatus,
    ],
  );

  const flushPresetAutosave = useCallback(
    async (presetId: string, options?: { clearApiKeyAfterSave?: boolean }) => {
      if (presetAutosavePresetIdRef.current === presetId) {
        clearPendingPresetAutosave();
      }

      const inFlight = presetSavePromisesRef.current[presetId];
      if (inFlight) {
        await inFlight;
        return;
      }

      await persistPresetDraft(presetId, options);
    },
    [clearPendingPresetAutosave, persistPresetDraft],
  );

  const flushDirtyPresetSaves = useCallback(
    async (options?: { clearBlurredApiKeyPresetId?: string }) => {
      const sourceSettings = settingsDraftRef.current;
      if (!sourceSettings) {
        return;
      }

      if (presetAutosavePresetIdRef.current) {
        await flushPresetAutosave(presetAutosavePresetIdRef.current, {
          clearApiKeyAfterSave:
            options?.clearBlurredApiKeyPresetId ===
            presetAutosavePresetIdRef.current,
        });
      }

      const dirtyPresetIds = sourceSettings.presets
        .map((preset) => preset.id)
        .filter(
          (presetId) =>
            presetSaveStatusByIdRef.current[presetId]?.state === "dirty",
        );

      for (const presetId of dirtyPresetIds) {
        await persistPresetDraft(presetId, {
          clearApiKeyAfterSave:
            options?.clearBlurredApiKeyPresetId === presetId,
        });
      }
    },
    [flushPresetAutosave, persistPresetDraft],
  );

  const collectBlockingUnsavedPresetIds = useCallback(() => {
    const currentDraft = settingsDraftRef.current;
    if (!currentDraft) {
      return [];
    }

    return currentDraft.presets
      .filter((preset) => {
        const saveStatus = presetSaveStatusByIdRef.current[preset.id];
        const savedPreset = settingsRef.current.presets.find(
          (candidate) => candidate.id === preset.id,
        );
        const unchanged = isPresetUnchangedFromSavedState({
          preset,
          savedPreset,
          apiKeyInput: presetApiKeyDraftsRef.current[preset.id] ?? "",
        });

        return (
          !unchanged &&
          (saveStatus?.state === "invalid" || saveStatus?.state === "error")
        );
      })
      .map((preset) => preset.id);
  }, []);

  const handleEditingPresetChange = useCallback(
    async (presetId: string | null) => {
      const previousEditingPresetId = editingPresetId;
      if (previousEditingPresetId && previousEditingPresetId !== presetId) {
        await flushPresetAutosave(previousEditingPresetId, {
          clearApiKeyAfterSave:
            apiKeyEditingPresetId === previousEditingPresetId,
        });
      }

      setEditingPresetId(presetId);
    },
    [apiKeyEditingPresetId, editingPresetId, flushPresetAutosave],
  );

  const handleActivatePreset = useCallback(
    async (presetId: string) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const currentSaveState =
        presetSaveStatusByIdRef.current[presetId]?.state ?? "pristine";
      const shouldPersistDraftBeforeActivation =
        currentSaveState !== "pristine" && currentSaveState !== "saved";

      if (shouldPersistDraftBeforeActivation) {
        await flushPresetAutosave(presetId, {
          clearApiKeyAfterSave: apiKeyEditingPresetId === presetId,
        });
      }

      const refreshedPreset = getDraftPresetById(presetId);
      if (!refreshedPreset) {
        return;
      }

      if (
        !getPresetValidationState(
          refreshedPreset,
          presetApiKeyDraftsRef.current[presetId] ?? "",
        ).isValid
      ) {
        return;
      }

      try {
        const savedSettings = await persistSettings({
          ...settingsRef.current,
          activePresetId: presetId,
        });
        setSessionFallbackPresetId(null);

        updateSettingsDraftState(
          settingsDraftRef.current
            ? {
                ...settingsDraftRef.current,
                activePresetId: savedSettings.activePresetId,
              }
            : settingsDraftRef.current,
        );
      } catch (error) {
        console.error("Failed to activate preset:", error);
        showToast({
          message: "Could not switch the active provider.",
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [
      apiKeyEditingPresetId,
      flushPresetAutosave,
      getDraftPresetById,
      persistSettings,
      showToast,
      updateSettingsDraftState,
    ],
  );

  const handleAddPreset = useCallback(
    (providerKind: TranslationProviderKind) => {
      const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
      const nextPreset = normalizePresetDraft(
        createPresetDraft(providerKind, sourceSettings.presets),
        sourceSettings.presets,
      );
      const nextSettings = {
        ...sourceSettings,
        presets: [...sourceSettings.presets, nextPreset],
      };

      updateSettingsDraftState(nextSettings);
      updatePresetSaveStatus(
        nextPreset.id,
        getPresetSaveStatus(nextPreset, ""),
      );
      setPresetStatuses((prev) => ({
        ...prev,
        [nextPreset.id]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [nextPreset.id]: undefined,
      }));
      setEditingPresetId(nextPreset.id);

      return nextPreset.id;
    },
    [updatePresetSaveStatus, updateSettingsDraftState],
  );

  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      const liveSettings = settingsRef.current;
      const currentDraft = settingsDraftRef.current ?? liveSettings;
      const livePresetExists = liveSettings.presets.some(
        (preset) => preset.id === presetId,
      );

      if (!livePresetExists) {
        const nextDraft = {
          ...currentDraft,
          presets: currentDraft.presets.filter(
            (preset) => preset.id !== presetId,
          ),
        };
        updateSettingsDraftState(nextDraft);
        clearPresetLocalArtifacts(presetId);
        if (editingPresetId === presetId) {
          setEditingPresetId(null);
        }
        return;
      }

      const nextLivePresets = liveSettings.presets.filter(
        (preset) => preset.id !== presetId,
      );
      const nextActivePresetId =
        liveSettings.activePresetId === presetId
          ? (nextLivePresets[0]?.id ?? "")
          : liveSettings.activePresetId;

      try {
        const savedSettings = await persistSettings({
          ...liveSettings,
          activePresetId: nextActivePresetId,
          presets: nextLivePresets,
        });

        updateSettingsDraftState({
          ...currentDraft,
          activePresetId: savedSettings.activePresetId,
          presets: currentDraft.presets.filter(
            (preset) => preset.id !== presetId,
          ),
        });
        clearPresetLocalArtifacts(presetId);
        if (editingPresetId === presetId) {
          setEditingPresetId(null);
        }
      } catch (error) {
        console.error("Failed to delete preset:", error);
        showToast({
          message: "Could not delete that provider right now.",
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [
      clearPresetLocalArtifacts,
      editingPresetId,
      persistSettings,
      showToast,
      updateSettingsDraftState,
    ],
  );

  const schedulePresetAutosave = useCallback(
    (presetId: string) => {
      clearPendingPresetAutosave();

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const apiKeyInput = presetApiKeyDraftsRef.current[presetId] ?? "";
      if (!canPersistPresetDraft(draftPreset, apiKeyInput)) {
        updatePresetSaveStatus(presetId, {
          state: "invalid",
          detail: getPresetMissingRequirement(draftPreset, apiKeyInput),
        });
        return;
      }

      updatePresetSaveStatus(presetId, { state: "dirty" });
      presetAutosavePresetIdRef.current = presetId;
      presetAutosaveTimerRef.current = window.setTimeout(() => {
        presetAutosaveTimerRef.current = null;
        presetAutosavePresetIdRef.current = null;
        void persistPresetDraft(presetId);
      }, PRESET_AUTOSAVE_DELAY_MS);
    },
    [
      clearPendingPresetAutosave,
      getDraftPresetById,
      persistPresetDraft,
      updatePresetSaveStatus,
    ],
  );

  const handlePresetChange = useCallback(
    (nextPreset: TranslationPreset) => {
      const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
      const currentPreset = sourceSettings.presets.find(
        (preset) => preset.id === nextPreset.id,
      );
      const providerChanged =
        currentPreset?.providerKind !== undefined &&
        currentPreset.providerKind !== nextPreset.providerKind;
      const baseUrlChanged =
        (currentPreset?.baseUrl ?? "") !== (nextPreset.baseUrl ?? "");

      const candidate = providerChanged
        ? {
            ...nextPreset,
            model: "",
            baseUrl:
              nextPreset.providerKind === "openai-compatible"
                ? nextPreset.baseUrl
                : undefined,
          }
        : nextPreset;

      const normalizedPreset = normalizePresetDraft(
        candidate,
        sourceSettings.presets,
      );
      const nextSettings = {
        ...sourceSettings,
        presets: sourceSettings.presets.map((preset) =>
          preset.id === normalizedPreset.id ? normalizedPreset : preset,
        ),
      };

      updateSettingsDraftState(nextSettings);
      setPresetStatuses((prev) => ({
        ...prev,
        [normalizedPreset.id]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [normalizedPreset.id]: undefined,
      }));

      if (providerChanged || baseUrlChanged) {
        setPresetModels((prev) => {
          const { [normalizedPreset.id]: _removed, ...rest } = prev;
          return rest;
        });
        setPresetModelAutoLoadAttempts((prev) => {
          const { [normalizedPreset.id]: _removed, ...rest } = prev;
          return rest;
        });
      }

      schedulePresetAutosave(normalizedPreset.id);
    },
    [schedulePresetAutosave, updateSettingsDraftState],
  );

  const handlePresetApiKeyInputChange = useCallback(
    (presetId: string, apiKey: string) => {
      setPresetApiKeyDrafts((prev) => ({
        ...prev,
        [presetId]: apiKey,
      }));
      setPresetStatuses((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));
      setPresetModelAutoLoadAttempts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const nextStatus = canPersistPresetDraft(draftPreset, apiKey)
        ? { state: "dirty" as const }
        : {
            state: "invalid" as const,
            detail: getPresetMissingRequirement(draftPreset, apiKey),
          };
      updatePresetSaveStatus(presetId, nextStatus);

      clearPendingPresetAutosave();
      if (nextStatus.state === "dirty") {
        presetAutosavePresetIdRef.current = presetId;
        presetAutosaveTimerRef.current = window.setTimeout(() => {
          presetAutosaveTimerRef.current = null;
          presetAutosavePresetIdRef.current = null;
          void persistPresetDraft(presetId);
        }, PRESET_AUTOSAVE_DELAY_MS);
      }
    },
    [
      clearPendingPresetAutosave,
      getDraftPresetById,
      persistPresetDraft,
      updatePresetSaveStatus,
    ],
  );

  const handlePresetApiKeyBlur = useCallback(
    async (presetId: string) => {
      setApiKeyEditingPresetId((current) =>
        current === presetId ? null : current,
      );
      await flushDirtyPresetSaves({
        clearBlurredApiKeyPresetId: presetId,
      });
    },
    [flushDirtyPresetSaves],
  );

  const handleReaderSettingsChange = useCallback(
    async (nextSettings: TranslationSettings) => {
      updateSettingsDraftState(nextSettings);
      const previousSettings = settingsRef.current;
      const changedFallback =
        previousSettings.autoFallbackEnabled !== nextSettings.autoFallbackEnabled;
      const changedAutoTranslateNextPages =
        previousSettings.autoTranslateNextPages !==
        nextSettings.autoTranslateNextPages;
      const changedSlowMode =
        previousSettings.translateAllSlowMode !== nextSettings.translateAllSlowMode;

      try {
        const savedSettings = await persistSettings({
          ...settingsRef.current,
          defaultLanguage: nextSettings.defaultLanguage,
          autoFallbackEnabled: nextSettings.autoFallbackEnabled,
          autoTranslateNextPages: nextSettings.autoTranslateNextPages,
          translateAllSlowMode: nextSettings.translateAllSlowMode,
        });

        updateSettingsDraftState(
          settingsDraftRef.current
            ? {
                ...settingsDraftRef.current,
                defaultLanguage: savedSettings.defaultLanguage,
                autoFallbackEnabled: savedSettings.autoFallbackEnabled,
                autoTranslateNextPages: savedSettings.autoTranslateNextPages,
                translateAllSlowMode: savedSettings.translateAllSlowMode,
              }
            : settingsDraftRef.current,
        );
      } catch (error) {
        console.error("Failed to save translation settings:", error);
        showToast({
          message: changedFallback
            ? "Could not save automatic fallback."
            : changedAutoTranslateNextPages
              ? "Could not save auto-translate ahead."
              : changedSlowMode
              ? "Could not save Translate All slow mode."
              : "Could not save the default language.",
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [persistSettings, showToast, updateSettingsDraftState],
  );

  const handleClearAllTranslationCache = useCallback(async () => {
    setTranslationCacheActionTarget("all");

    try {
      await invoke("clear_all_translation_cache");
      textTranslationCacheRef.current.clear();
      await refreshTranslationCacheSummary();
      showToast({
        message: "Cleared cached translations.",
        durationMs: 3200,
      });
    } catch (error) {
      console.error("Failed to clear all translation cache:", error);
      showToast({
        message: "Could not clear the translation cache.",
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setTranslationCacheActionTarget((current) =>
        current === "all" ? null : current,
      );
    }
  }, [refreshTranslationCacheSummary, showToast]);

  const handleClearCachedBookTranslations = useCallback(
    async (docId: string, title: string) => {
      setTranslationCacheActionTarget(docId);

      try {
        await invoke("clear_cached_book_translations", { docId });
        await refreshTranslationCacheSummary();
        showToast({
          message: `Deleted cached pages for ${title}.`,
          durationMs: 3200,
        });
      } catch (error) {
        console.error("Failed to clear cached book translations:", error);
        showToast({
          message: "Could not delete that book's cached pages.",
          tone: "error",
          durationMs: 4200,
        });
      } finally {
        setTranslationCacheActionTarget((current) =>
          current === docId ? null : current,
        );
      }
    },
    [refreshTranslationCacheSummary, showToast],
  );

  const handleTestPreset = useCallback(
    async (presetId: string) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      setPresetTestRunningId(presetId);
      setPresetStatuses((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));

      try {
        const result = (await invoke("test_translation_preset", {
          preset: getPresetDraft(draftPreset),
        })) as PresetTestResult;
        const friendlyResult = getFriendlyPresetTestResult(result);
        setPresetStatuses((prev) => ({
          ...prev,
          [friendlyResult.presetId]: friendlyResult,
        }));
        if (!friendlyResult.ok) {
          showToast({
            message: friendlyResult.message,
            detail: friendlyResult.detail,
            tone: "error",
            durationMs: 5200,
          });
        }
      } catch (error) {
        console.error("Failed to test preset:", error);
        const friendlyError = getFriendlyProviderError(error);
        const detail = getProviderErrorDetail(error);
        setPresetStatuses((prev) => ({
          ...prev,
          [presetId]: {
            presetId,
            label: draftPreset.label,
            ok: false,
            message: friendlyError.message,
            detail,
          },
        }));
        showToast({
          message: friendlyError.message,
          detail,
          tone: "error",
          durationMs: 5200,
        });
      } finally {
        setPresetTestRunningId((current) =>
          current === presetId ? null : current,
        );
      }
    },
    [getPresetDraft, getDraftPresetById, showToast],
  );

  const handleTestAllPresets = useCallback(async () => {
    const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
    setTestAllPresetsRunning(true);

    try {
      const results = (await invoke("test_all_translation_presets", {
        presets: sourceSettings.presets.map((preset) => getPresetDraft(preset)),
      })) as PresetTestResult[];
      const friendlyResults = results.map(getFriendlyPresetTestResult);

      setPresetStatuses((prev) => ({
        ...prev,
        ...Object.fromEntries(
          friendlyResults.map((result) => [result.presetId, result]),
        ),
      }));
      const failedResults = friendlyResults.filter((result) => !result.ok);
      if (failedResults.length === 1) {
        showToast({
          message: failedResults[0].message,
          detail: failedResults[0].detail,
          tone: "error",
          durationMs: 5200,
        });
      } else if (failedResults.length > 1) {
        showToast({
          message: `${failedResults.length} preset tests failed.`,
          detail:
            "Hover the warning icon beside each provider to see the exact error.",
          tone: "error",
          durationMs: 5600,
        });
      }
    } catch (error) {
      console.error("Failed to test all presets:", error);
      showToast({
        message: "Could not test all presets.",
        detail: getProviderErrorDetail(error),
        tone: "error",
        durationMs: 5200,
      });
    } finally {
      setTestAllPresetsRunning(false);
    }
  }, [getPresetDraft, showToast]);

  const discardUnsavedSettingsAndClose = useCallback(() => {
    setSettingsOpen(false);
    resetSettingsDialogState();
  }, [resetSettingsDialogState]);

  const handleSettingsOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        if (!settingsOpen) {
          handleOpenSettings();
        }
        return;
      }

      setSettingsClosePending(true);
      try {
        await flushDirtyPresetSaves({
          clearBlurredApiKeyPresetId: apiKeyEditingPresetId ?? undefined,
        });

        if (collectBlockingUnsavedPresetIds().length > 0) {
          setSettingsCloseConfirmOpen(true);
          return;
        }

        discardUnsavedSettingsAndClose();
      } finally {
        setSettingsClosePending(false);
      }
    },
    [
      apiKeyEditingPresetId,
      collectBlockingUnsavedPresetIds,
      discardUnsavedSettingsAndClose,
      flushDirtyPresetSaves,
      handleOpenSettings,
      settingsOpen,
    ],
  );

  useEffect(() => {
    if (
      activePresetHasLiveSetup &&
      translationStatusMessage === TRANSLATION_SETUP_REQUIRED_MESSAGE
    ) {
      setTranslationStatusMessage(null);
    }
  }, [activePresetHasLiveSetup, translationStatusMessage]);

  useEffect(() => {
    if (currentFileType !== "pdf") return;
    setPageTranslations({});
    setSelectionTranslation(null);
    resetTranslateAllSlowModeRuntime();
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    setIsTranslateAllStopRequested(false);
    translateAllErrorToastShownRef.current = false;
    fallbackToastEligiblePdfPagesRef.current.clear();
    forceFreshSentenceTranslationIdsRef.current.clear();
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    setPageTranslationInFlightPage(null);
    pdfTranslationSessionRef.current += 1;
  }, [currentFileType, docId, resetTranslateAllSlowModeRuntime, settings.defaultLanguage.code]);

  useEffect(() => {
    if (currentFileType !== "pdf") return;

    setSelectionTranslation(null);
    setTranslationStatusMessage(null);
    resetTranslateAllSlowModeRuntime();
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    setIsTranslateAllStopRequested(false);
    translateAllErrorToastShownRef.current = false;
    fallbackToastEligiblePdfPagesRef.current.clear();
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    setPageTranslationInFlightPage(null);
    pdfTranslationSessionRef.current += 1;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setPageTranslations((prev) => sanitizePdfTranslationsForPresetChange(prev));
  }, [currentFileType, effectivePreset?.id, effectivePreset?.model, resetTranslateAllSlowModeRuntime]);

  useEffect(() => {
    if (currentFileType !== "epub") return;

    translatingRef.current = false;
    translationRequestId.current += 1;
    translateQueueRef.current = [];
    forceFreshSentenceTranslationIdsRef.current.clear();
    setTranslationStatusMessage(null);
    resetTranslateAllSlowModeRuntime();
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    setIsTranslateAllStopRequested(false);
    translateAllErrorToastShownRef.current = false;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setPages((prev) => sanitizeEpubPagesForPresetChange(prev));
  }, [currentFileType, effectivePreset?.id, effectivePreset?.model, resetTranslateAllSlowModeRuntime]);

  useEffect(() => {
    if (currentFileType !== "pdf" || pages.length === 0) return;
    setCurrentPage((prev) => clampPage(prev, pages.length));
  }, [currentFileType, pages.length]);

  const runPageTranslationQueue = useCallback(async () => {
    if (
      currentFileType !== "pdf" ||
      pageTranslatingRef.current ||
      !docIdRef.current
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
    if (translatableParagraphs.length === 0 || !hasUsablePageText(payload.displayText)) {
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
          targetLanguage: currentSettings.defaultLanguage,
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
              message: `Skipped page ${nextPage} after repeated errors.`,
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
            message: "Translation paused — account may be out of credits.",
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
            message: `Skipped page ${nextPage} — too large for this model.`,
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
              message: `Translate All hit an error on page ${nextPage}.`,
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
    showFallbackSuccessToast,
    showToast,
  ]);

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
          (existing.displayText !== payload.displayText ||
            existing.previousContext !== payload.previousContext ||
            existing.nextContext !== payload.nextContext);
        const shouldForceFresh = Boolean(options.forceFresh || inputChanged);
        const translatableParagraphs = getTranslatablePdfParagraphs(pageDoc);

        if (translatableParagraphs.length === 0 || !hasUsablePageText(payload.displayText)) {
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
        !pageTranslatingRef.current &&
        (nextForegroundQueue.length > 0 || nextBackgroundQueue.length > 0)
      ) {
        void runPageTranslationQueue();
      }
    },
    [currentFileType, getEffectivePreset, runPageTranslationQueue, settingsLoaded],
  );

  useEffect(() => {
    if (
      currentFileType !== "pdf" ||
      !docId ||
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
      targetLanguage: settings.defaultLanguage,
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
    settings.defaultLanguage,
    settingsLoaded,
  ]);

  useEffect(() => {
    if (
      currentFileType !== "pdf" ||
      !pdfDoc ||
      pages.length === 0 ||
      !settingsLoaded
    )
      return;
    queuePagesForTranslation(
      getPagesToTranslate(
        currentPage,
        pages.length,
        settings.autoTranslateNextPages,
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
    settings.autoTranslateNextPages,
    settingsLoaded,
  ]);

  useEffect(() => {
    if (currentFileType !== "pdf" || !docId) return;
    if (
      (foregroundPageTranslateQueueRef.current.length === 0 &&
        backgroundPageTranslateQueueRef.current.length === 0) ||
      pageTranslatingRef.current
    ) {
      return;
    }

    void runPageTranslationQueue();
  }, [currentFileType, docId, runPageTranslationQueue]);

  const startTranslateAll = useCallback(
    async (mode: "skip-cached" | "replace-all") => {
      if (currentFileType !== "pdf" || !docIdRef.current) {
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
    [currentFileType, queuePagesForTranslation, resetTranslateAllSlowModeRuntime],
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
  }, [clearTranslateAllResumeTimer, currentFileType, resetTranslateAllSlowModeRuntime]);

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
    [currentFileType, queuePagesForTranslation],
  );

  const handleTranslateAllAction = useCallback(async () => {
    if (isTranslateAllRunningRef.current) {
      stopTranslateAll();
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
    showTranslationSetupToast,
    startTranslateAll,
    stopTranslateAll,
    translationProgress.isFullyTranslated,
  ]);

  const handlePdfSelectionTranslate = useCallback(
    async (selection: { text: string; position: { x: number; y: number } }) => {
      setSelectionTranslation({
        text: selection.text,
        position: selection.position,
        isLoading: true,
      });

      const sessionId = pdfTranslationSessionRef.current;

      try {
        const currentPreset = getEffectivePreset(settingsRef.current);
        if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
          throw new Error("No active preset configured.");
        }

        const result = (await invoke("translate_selection_text", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          targetLanguage: settingsRef.current.defaultLanguage,
          text: selection.text,
        })) as SelectionTranslationResult;

        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          translation: result.translation,
        });
        showFallbackSuccessToast(result.fallbackTrace);
      } catch (error) {
        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        const friendlyError = getFriendlyProviderError(error);

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          error: friendlyError.message,
        });
      }
    },
    [],
  );

  const handleClearSelectionTranslation = useCallback(() => {
    setSelectionTranslation(null);
  }, []);

  const handlePdfPageChange = useCallback(
    (nextPage: number, options?: { anchor?: "top" | "bottom" }) => {
      if (currentFileType !== "pdf" || pages.length === 0) return;
      const clampedPage = clampPage(nextPage, pages.length);
      if (clampedPage === currentPage) return;

      setPdfScrollAnchor(options?.anchor ?? "top");
      setCurrentPage(clampedPage);
      setHoverPid(null);
      setActivePid(null);
      setSelectionTranslation(null);
    },
    [currentFileType, currentPage, pages.length],
  );

  const handlePdfPageTurnRequest = useCallback(
    (direction: PdfPageTurnDirection) => {
      const nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;
      handlePdfPageChange(nextPage, {
        anchor: direction === "next" ? "top" : "bottom",
      });
    },
    [currentPage, handlePdfPageChange],
  );

  const runTranslateQueue = useCallback(async () => {
    if (translatingRef.current) return;
    if (!docIdRef.current) return;

    const uniqueQueue = Array.from(new Set(translateQueueRef.current));
    if (uniqueQueue.length === 0) return;

    const currentSettings = settingsRef.current;
    const isBulkRun =
      currentFileType === "epub" && isTranslateAllRunningRef.current;
    const isSlowModeBulkRun =
      isBulkRun && currentSettings.translateAllSlowMode;
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
          targetLanguage: currentSettings.defaultLanguage,
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
              message: `Skipped page ${activePageNumber} after repeated errors.`,
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
            message: "Translation paused — account may be out of credits.",
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
            message: `Skipped page ${activePageNumber} — too large for this model.`,
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
    showFallbackSuccessToast,
    showTranslationSetupToast,
    showToast,
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

  const handleTranslatePid = useCallback(
    (pid: string, forceRetry = false) => {
      if (!docIdRef.current) return;
      if (!activePresetHasTranslationContext) {
        setTranslationStatusMessage(TRANSLATION_SETUP_REQUIRED_MESSAGE);
        showTranslationSetupToast();
        return;
      }
      const para = pagesRef.current
        .flatMap((page) => page.paragraphs)
        .find((item) => item.pid === pid);
      if (!para) return;
      // Allow retry for error status, or force retry
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
      showTranslationSetupToast,
    ],
  );

  const handleLocatePid = useCallback(
    (pid: string, page: number) => {
      setActivePid(pid);
      setCurrentPage(page);
      requestTranslationScroll(page);
      if (currentFileType === "epub") {
        const targetParagraph = pagesRef.current
          .flatMap((entry) => entry.paragraphs)
          .find((entry) => entry.pid === pid);

        if (readerPanels.original) {
          epubViewerRef.current?.navigateTo(pid);
        } else if (targetParagraph?.epubHref) {
          setPendingEpubNavigationHref(targetParagraph.epubHref);
        }
      }
    },
    [currentFileType, readerPanels.original, requestTranslationScroll],
  );

  const handleTranslateText = useCallback(
    async (text: string, position: { x: number; y: number }) => {
      const normalizedText = text.toLowerCase().trim();
      const isSingleWord = /^[a-zA-Z]+$/.test(text.trim());

      // Check cache first
      const cached = textTranslationCacheRef.current.get(normalizedText);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setWordTranslation({ word: text, ...parsed, position });
        } catch {
          setWordTranslation({
            word: text,
            definitions: [{ pos: "", meanings: cached }],
            position,
          });
        }
        return;
      }

      // Show loading state
      setWordTranslation({
        word: text,
        definitions: [],
        position,
        isLoading: true,
      });

      try {
        const currentSettings = settingsRef.current;
        const currentPreset = getEffectivePreset(currentSettings);
        if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
          throw new Error("No active preset configured.");
        }

        if (isSingleWord) {
          // Use dictionary lookup for single words
          const result = (await invoke("openrouter_word_lookup", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            targetLanguage: currentSettings.defaultLanguage,
            word: text,
          })) as WordLookupResult;

          // Cache the result
          textTranslationCacheRef.current.set(
            normalizedText,
            JSON.stringify({
              phonetic: result.phonetic,
              definitions: result.definitions,
            }),
          );

          setWordTranslation({
            word: text,
            phonetic: result.phonetic,
            definitions: result.definitions || [],
            position,
          });
          showFallbackSuccessToast(result.fallbackTrace);
        } else {
          // Use regular translation for phrases
          const result = (await invoke("openrouter_translate", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            temperature: 0,
            targetLanguage: currentSettings.defaultLanguage,
            sentences: [{ sid: "text", text }],
          })) as BatchTranslationResult;

          const translation =
            result.results[0]?.translation || "Translation failed";

          // Cache the result
          textTranslationCacheRef.current.set(normalizedText, translation);

          setWordTranslation({
            word: text,
            definitions: [{ pos: "", meanings: translation }],
            position,
          });
          showFallbackSuccessToast(result.fallbackTrace);
        }
      } catch (error) {
        const friendlyError = getFriendlyProviderError(error);
        setWordTranslation({
          word: text,
          definitions: [{ pos: "", meanings: friendlyError.message }],
          position,
        });
      }
    },
    [getEffectivePreset, showFallbackSuccessToast],
  );

  const handleClearWordTranslation = useCallback(() => {
    setWordTranslation(null);
  }, []);

  const handleZoomChange = (nextScale: number) => {
    setScale(nextScale);
  };

  const handleEpubPageStep = useCallback((direction: "prev" | "next") => {
    if (direction === "prev") {
      epubViewerRef.current?.goToPreviousPage();
      return;
    }

    epubViewerRef.current?.goToNextPage();
  }, []);

  const handlePdfZoomModeChange = useCallback((nextMode: PdfZoomMode) => {
    setPdfZoomMode(nextMode);
  }, []);

  const handlePdfManualScaleChange = useCallback((nextScale: number) => {
    setPdfManualScale(clampPdfManualScale(nextScale));
    setPdfZoomMode("custom");
  }, []);

  const handleResolvedPdfScaleChange = useCallback((nextScale: number) => {
    setResolvedPdfScale((prev) =>
      Math.abs(prev - nextScale) < 0.001 ? prev : nextScale,
    );
  }, []);

  const currentScaleIndex = useMemo(() => {
    const index = ZOOM_LEVELS.findIndex((level) => level === scale);
    return index >= 0 ? index : ZOOM_LEVELS.indexOf(1);
  }, [scale]);

  const handleScaleStep = (direction: "in" | "out") => {
    const nextIndex =
      direction === "in"
        ? Math.min(ZOOM_LEVELS.length - 1, currentScaleIndex + 1)
        : Math.max(0, currentScaleIndex - 1);
    handleZoomChange(ZOOM_LEVELS[nextIndex]);
  };

  const epubHrefToPage = useMemo(() => {
    const hrefToPage = new Map<string, number>();
    for (const page of pages) {
      for (const paragraph of page.paragraphs) {
        if (!paragraph.epubHref) continue;
        const href = normalizeHref(paragraph.epubHref);
        if (!hrefToPage.has(href)) {
          hrefToPage.set(href, page.page);
        }
      }
    }
    return hrefToPage;
  }, [pages, normalizeHref]);

  const handleEpubNavigateToHref = useCallback(
    (href: string) => {
      const normalizedHref = normalizeHref(href);
      let targetPage = epubHrefToPage.get(normalizedHref);

      if (!targetPage) {
        for (const [candidateHref, page] of epubHrefToPage) {
          if (matchHref(normalizedHref, candidateHref)) {
            targetPage = page;
            break;
          }
        }
      }

      if (targetPage) {
        setCurrentPage(targetPage);
        requestTranslationScroll(targetPage);
      }

      if (readerPanels.original) {
        epubViewerRef.current?.navigateToHref(href);
      } else {
        setPendingEpubNavigationHref(href);
      }
    },
    [
      epubHrefToPage,
      matchHref,
      normalizeHref,
      readerPanels.original,
      requestTranslationScroll,
    ],
  );

  const totalPages = pages.length;

  useEffect(() => {
    if (currentFileType !== "epub" || !pendingEpubScroll) return;

    const targetHref = normalizeHref(pendingEpubScroll.href);
    let targetPage = epubHrefToPage.get(targetHref);
    if (!targetPage) {
      for (const [href, page] of epubHrefToPage) {
        if (matchHref(targetHref, href)) {
          targetPage = page;
          break;
        }
      }
    }
    if (targetPage) {
      requestTranslationScroll(targetPage);
      setPendingEpubScroll((prev) =>
        prev && prev.requestId === pendingEpubScroll.requestId ? null : prev,
      );
    }
  }, [
    currentFileType,
    pendingEpubScroll,
    epubHrefToPage,
    matchHref,
    normalizeHref,
    requestTranslationScroll,
  ]);

  useEffect(() => {
    if (
      currentFileType !== "epub" ||
      !readerPanels.original ||
      !pendingEpubNavigationHref ||
      !epubViewerRef.current
    ) {
      return;
    }

    epubViewerRef.current.navigateToHref(pendingEpubNavigationHref);
    setPendingEpubNavigationHref(null);
  }, [currentFileType, pendingEpubNavigationHref, readerPanels.original]);

  // Save progress when page changes (works for both PDF and EPUB)
  useEffect(() => {
    if (docId && currentPage > 0 && totalPages > 0) {
      const progress = (currentPage / totalPages) * 100;
      invoke("update_book_progress", {
        id: docId,
        lastPage: currentPage,
        progress: progress,
      }).catch(() => {});
    }
  }, [docId, currentPage, totalPages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Cmd/Ctrl + O: Open file
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        handleOpenFile();
        return;
      }

      // Cmd/Ctrl + K: Toggle AI Chat
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setReaderPanels((prev) => toggleReaderPanel(prev, "chat"));
        return;
      }

      // Escape: Close chat panel or go back to home
      if (e.key === "Escape") {
        if (readerPanels.chat) {
          setReaderPanels((prev) => {
            if (
              !prev.chat ||
              Object.values(prev).filter(Boolean).length === 1
            ) {
              return prev;
            }

            return { ...prev, chat: false };
          });
        } else if (appView === "reader") {
          handleBackToHome();
        }
        return;
      }

      // Zoom shortcuts (when in reader)
      if (appView === "reader") {
        if (
          currentFileType === "pdf" &&
          (e.key === "ArrowLeft" || e.key === "PageUp")
        ) {
          e.preventDefault();
          handlePdfPageChange(currentPage - 1);
          return;
        }

        if (
          currentFileType === "pdf" &&
          (e.key === "ArrowRight" || e.key === "PageDown")
        ) {
          e.preventDefault();
          handlePdfPageChange(currentPage + 1);
          return;
        }

        // Cmd/Ctrl + Plus: Zoom in
        if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          if (currentFileType === "pdf") {
            setPdfManualScale(
              clampPdfManualScale(resolvedPdfScale + PDF_KEYBOARD_ZOOM_STEP),
            );
            setPdfZoomMode("custom");
          } else {
            const nextIndex = Math.min(
              ZOOM_LEVELS.length - 1,
              currentScaleIndex + 1,
            );
            setScale(ZOOM_LEVELS[nextIndex]);
          }
          return;
        }

        // Cmd/Ctrl + Minus: Zoom out
        if ((e.metaKey || e.ctrlKey) && e.key === "-") {
          e.preventDefault();
          if (currentFileType === "pdf") {
            setPdfManualScale(
              clampPdfManualScale(resolvedPdfScale - PDF_KEYBOARD_ZOOM_STEP),
            );
            setPdfZoomMode("custom");
          } else {
            const nextIndex = Math.max(0, currentScaleIndex - 1);
            setScale(ZOOM_LEVELS[nextIndex]);
          }
          return;
        }

        // Cmd/Ctrl + 0: Reset zoom
        if ((e.metaKey || e.ctrlKey) && e.key === "0") {
          e.preventDefault();
          if (currentFileType === "pdf") {
            setPdfZoomMode("fit-width");
          } else {
            setScale(1);
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    appView,
    currentFileType,
    currentPage,
    currentScaleIndex,
    handleBackToHome,
    handleOpenFile,
    handlePdfPageChange,
    readerPanels.chat,
    resolvedPdfScale,
  ]);

  const editingPreset = useMemo(
    () =>
      editingPresetId
        ? dialogSettings.presets.find((preset) => preset.id === editingPresetId)
        : undefined,
    [dialogSettings.presets, editingPresetId],
  );
  const hasInvalidPreset = dialogSettings.presets.some(
    (preset) =>
      !getPresetValidationState(preset, presetApiKeyDrafts[preset.id] ?? "")
        .isValid,
  );
  const blockingUnsavedPresetIds = settingsCloseConfirmOpen
    ? collectBlockingUnsavedPresetIds()
    : [];

  const settingsDialogProps = {
    settings: dialogSettings,
    liveActivePresetId: settings.activePresetId,
    editingPresetId,
    editingPreset,
    apiKeyEditingPresetId,
    presetApiKeyDrafts,
    presetStatuses,
    presetSaveStatusById,
    presetTestRunningId,
    presetModelsLoadingById,
    testAllRunning: testAllPresetsRunning,
    testAllDisabled: dialogSettings.presets.length === 0 || hasInvalidPreset,
    presetModels,
    presetModelMessages,
    translationCacheSummary,
    translationCacheLoading,
    translationCacheActionTarget,
    onSettingsChange: handleReaderSettingsChange,
    sessionFallbackPresetId,
    onAddPreset: handleAddPreset,
    onDeletePreset: handleDeletePreset,
    onDeleteAllTranslationCache: handleClearAllTranslationCache,
    onDeleteCachedBook: handleClearCachedBookTranslations,
    onEditingPresetChange: handleEditingPresetChange,
    onActivatePreset: handleActivatePreset,
    onPresetChange: handlePresetChange,
    onPresetApiKeyInputChange: handlePresetApiKeyInputChange,
    onPresetApiKeyFocus: setApiKeyEditingPresetId,
    onPresetApiKeyBlur: handlePresetApiKeyBlur,
    onRetryPresetSave: (presetId: string) => {
      void flushPresetAutosave(presetId);
    },
    onFetchPresetModels: handleFetchPresetModels,
    onTestPreset: handleTestPreset,
    onTestAllPresets: handleTestAllPresets,
  };

  const sharedSettingsDialog = (
    <SettingsDialog
      contentProps={settingsDialogProps}
      closeDisabled={settingsClosePending}
      onOpenChange={handleSettingsOpenChange}
      open={settingsOpen}
    />
  );
  const settingsDiscardDialog = (
    <ConfirmationDialog
      actions={[
        {
          label:
            blockingUnsavedPresetIds.length > 1
              ? "Discard drafts"
              : "Discard draft",
          variant: "danger",
          onSelect: discardUnsavedSettingsAndClose,
        },
      ]}
      cancelLabel="Keep editing"
      description="Some provider changes are not saved yet. If you close now, those unfinished edits will be lost."
      onOpenChange={setSettingsCloseConfirmOpen}
      open={settingsCloseConfirmOpen}
      title="Discard unsaved changes?"
    />
  );
  const sharedAboutDialog = (
    <AboutDialog
      onCheckForUpdates={() => {
        void handleCheckForUpdates("manual");
      }}
      onOpenChange={setAboutOpen}
      onOpenLatestRelease={() => {
        void handleOpenLatestRelease();
      }}
      open={aboutOpen}
      updateStatusMessage={aboutUpdateStatusMessage}
    />
  );

  const nextColumnAfterNavigation = visibleReaderColumns.includes("navigation")
    ? (visibleReaderColumns.find((column) => column !== "navigation") ?? null)
    : null;
  const loadingDocumentLabel = getReaderStatusLabel("loading-document");
  const extractingTextLabel = getReaderStatusLabel("extracting-text");
  const hasBlockingOriginalPaneStatus =
    !pdfDoc &&
    !epubData &&
    (documentStatusMessage !== null || loadingProgress !== null);
  const hasPdfExtractionOverlay =
    currentFileType === "pdf" &&
    pdfDoc !== null &&
    documentStatusMessage === extractingTextLabel;
  const originalPaneStatusMessage =
    documentStatusMessage ??
    (loadingProgress !== null ? loadingDocumentLabel : null);

  const viewContent =
    appView === "home" ? (
      <HomeView
        onOpenBook={handleOpenBook}
        onOpenFile={handleOpenFile}
        onOpenAbout={() => setAboutOpen(true)}
        onInstallUpdate={() => {
          void handleInstallUpdate();
        }}
        onOpenSettings={handleOpenSettings}
        showTranslationSetupCallout={
          settingsLoaded && !activePresetHasLiveSetup
        }
        showUpdateAction={showReadyUpdateAction}
        theme={settings.theme}
        onThemeToggle={handleThemeToggle}
      />
    ) : (
      <Tooltip.Provider delayDuration={300}>
        <div ref={readerShellRef} className="app-shell app-shell-reader">
          <Toolbar.Root
            ref={readerHeaderRef}
            className="app-header"
            aria-label="Toolbar"
          >
            <div className="header-left">
              <ExpandableIconButton
                onClick={handleBackToHome}
                aria-label="Home"
                label="Home"
                labelDirection="right"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M3 10.5 12 3l9 7.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 9.5V21h14V9.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 21v-6h4v6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ExpandableIconButton>
            </div>
            <div className="header-center">
              <PanelToggleGroup panels={readerPanels} onToggle={togglePanel} />
            </div>
            <div className="header-right">
              {showReadyUpdateAction ? (
                <UpdateActionButton
                  onClick={() => {
                    void handleInstallUpdate();
                  }}
                />
              ) : null}
              <ThemeToggleButton
                className=""
                theme={settings.theme}
                onToggle={handleThemeToggle}
                showHoverLabel={true}
                labelDirection="left"
                hoverLabel="Theme"
              />
              <ExpandableIconButton
                aria-label="Settings"
                label="Settings"
                labelDirection="left"
                onClick={handleOpenSettings}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </ExpandableIconButton>
            </div>
          </Toolbar.Root>
          <main
            className="app-main app-main--workspace"
            style={{
              minWidth: `${workspaceMinWidth}px`,
              minHeight: `${workspaceMinHeight}px`,
            }}
          >
            <section
              ref={setColumnElementRef("navigation")}
              className={`pane pane-navigation ${readerPanels.navigation ? "" : "is-hidden"}`}
              style={getColumnStyle("navigation")}
            >
              <div className="pane-body">
                {currentFileType === "pdf" ? (
                  pdfDoc ? (
                    <PdfNavigationSidebar
                      docId={docId}
                      pdfDoc={pdfDoc}
                      pageSizes={pageSizes}
                      currentPage={currentPage}
                      outline={pdfOutline}
                      activeTab={pdfNavTab}
                      onTabChange={setPdfNavTab}
                      onNavigate={(page: number) => handlePdfPageChange(page)}
                    />
                  ) : (
                    <div className="empty-state">
                      Navigation will appear here.
                    </div>
                  )
                ) : epubData ? (
                  <EpubNavigationSidebar
                    toc={epubToc}
                    currentChapter={epubCurrentChapter}
                    onNavigate={handleEpubNavigateToHref}
                  />
                ) : (
                  <div className="empty-state">
                    Navigation will appear here.
                  </div>
                )}
              </div>
            </section>
            {nextColumnAfterNavigation ? (
              <div
                className="split-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize navigation and ${
                  nextColumnAfterNavigation === "original"
                    ? "original"
                    : "right rail"
                } panels`}
                data-dragging={
                  activeColumnResizeKey ===
                  `navigation:${nextColumnAfterNavigation}`
                    ? "true"
                    : undefined
                }
                onPointerDown={handleColumnResizeStart(
                  "navigation",
                  nextColumnAfterNavigation,
                )}
              />
            ) : null}
            <section
              ref={setColumnElementRef("original")}
              className={`pane pane-original ${readerPanels.original ? "" : "is-hidden"}`}
              style={getColumnStyle("original")}
            >
              <div className="pane-body">
                {currentFileType === "epub" && epubData ? (
                  <div
                    className={`epub-original-host ${readerPanels.original ? "" : "is-detached"}`}
                  >
                    <PageNavigationToolbar
                      previousLabel="Previous page"
                      nextLabel="Next page"
                      previousDisabled={currentPage <= 1}
                      nextDisabled={currentPage >= epubTotalPages}
                      onPrevious={() => handleEpubPageStep("prev")}
                      onNext={() => handleEpubPageStep("next")}
                    >
                      <div className="document-page-label">
                        Page {currentPage} of {epubTotalPages || "-"}
                      </div>
                    </PageNavigationToolbar>
                    <div className="document-viewer-shell">
                      <EpubViewer
                        ref={epubViewerRef}
                        fileData={epubData}
                        onMetadata={handleEpubMetadata}
                        onParagraphsExtracted={handleEpubParagraphs}
                        onCurrentPageChange={handleEpubPageChange}
                        onTocChange={handleEpubTocChange}
                        onCurrentChapterChange={handleEpubCurrentChapterChange}
                        onLoadingProgress={handleEpubLoadingProgress}
                        onHrefChange={handleEpubHrefChange}
                        scale={scale}
                      />
                      <div className="document-zoom-dock epub-zoom-dock">
                        <div className="epub-zoom-stepper">
                          <Toolbar.Button
                            className="btn btn-ghost btn-icon-only"
                            onClick={() => handleScaleStep("out")}
                            disabled={currentScaleIndex <= 0}
                            aria-label="Zoom out"
                            title="Zoom out"
                          >
                            -
                          </Toolbar.Button>
                          <div className="epub-zoom-readout">
                            {Math.round(scale * 100)}%
                          </div>
                          <Toolbar.Button
                            className="btn btn-ghost btn-icon-only"
                            onClick={() => handleScaleStep("in")}
                            disabled={
                              currentScaleIndex >= ZOOM_LEVELS.length - 1
                            }
                            aria-label="Zoom in"
                            title="Zoom in"
                          >
                            +
                          </Toolbar.Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : pdfDoc ? (
                  <PdfViewer
                    pdfDoc={pdfDoc}
                    pageSizes={pageSizes}
                    currentPage={currentPage}
                    zoomMode={pdfZoomMode}
                    manualScale={pdfManualScale}
                    scrollAnchor={pdfScrollAnchor}
                    paragraphs={currentPdfPageDoc?.paragraphs ?? []}
                    highlightPid={hoverPid ?? activePid}
                    onNavigateToPage={(page) => handlePdfPageChange(page)}
                    onRequestPageChange={handlePdfPageTurnRequest}
                    onZoomModeChange={handlePdfZoomModeChange}
                    onManualScaleChange={handlePdfManualScaleChange}
                    onResolvedScaleChange={handleResolvedPdfScaleChange}
                    overlayStatusMessage={
                      hasPdfExtractionOverlay ? extractingTextLabel : null
                    }
                    overlayProgress={
                      hasPdfExtractionOverlay ? loadingProgress : null
                    }
                    onSelectionText={handlePdfSelectionTranslate}
                    onClearSelection={handleClearSelectionTranslation}
                  />
                ) : hasBlockingOriginalPaneStatus &&
                  originalPaneStatusMessage ? (
                  <DocumentStatusSurface
                    message={originalPaneStatusMessage}
                    progress={loadingProgress}
                    variant="blocking"
                  />
                ) : (
                  <div className="empty-state">No document loaded.</div>
                )}
              </div>
            </section>
            {visibleReaderColumns.includes("original") &&
            visibleReaderColumns.includes("rail") ? (
              <div
                className="split-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize original and right rail panels"
                data-dragging={
                  activeColumnResizeKey === "original:rail" ? "true" : undefined
                }
                onPointerDown={handleColumnResizeStart("original", "rail")}
              />
            ) : null}
            <section
              ref={setColumnElementRef("rail")}
              className={`pane pane-rail ${visibleReaderColumns.includes("rail") ? "" : "is-hidden"}`}
              style={getColumnStyle("rail")}
            >
              <div
                ref={setRailSectionElementRef("translation")}
                className={`rail-section rail-section-translation ${
                  readerPanels.translation ? "" : "is-hidden"
                }`}
                style={getRailSectionStyle("translation")}
              >
                {pdfDoc || epubData ? (
                  currentFileType === "pdf" ? (
                    <TranslationPane
                      mode="pdf"
                      currentPage={currentPage}
                      page={currentPdfPageDoc}
                      pageTranslation={pageTranslations[currentPage]}
                      loadingMessage={currentPdfLoadingMessage}
                      setupRequired={showPdfSetupPrompt}
                      progressLabel={translationProgressLabel}
                      progressDetailLabel={pdfProgressDetailLabel}
                      progressDetailState={pdfProgressDetailState}
                      bulkActionLabel={translateAllActionLabel}
                      bulkActionDisabled={
                        !canTranslateAll || isTranslateAllStopRequested
                      }
                      bulkActionRunning={isTranslateAllRunning}
                      secondaryActionLabel={
                        translateAllUsageLimitPaused ? "Stop" : null
                      }
                      onSecondaryAction={
                        translateAllUsageLimitPaused
                          ? stopTranslateAll
                          : undefined
                      }
                      onBulkAction={
                        translateAllUsageLimitPaused
                          ? resumeTranslateAllAfterUsageLimit
                          : handleTranslateAllAction
                      }
                      onOpenSettings={handleOpenSettings}
                      onRetryPage={handleRedoPageTranslation}
                      canRetryPage={canRedoCurrentPage}
                      activePid={activePid}
                      hoverPid={hoverPid}
                      onHoverPid={setHoverPid}
                      onLocatePid={handleLocatePid}
                      selectionTranslation={selectionTranslation}
                      onClearSelectionTranslation={
                        handleClearSelectionTranslation
                      }
                      statusMap={pageProgressMap}
                      onSeekPage={handleSeekPage}
                    />
                  ) : (
                    <TranslationPane
                      mode="epub"
                      pages={pages}
                      currentPage={currentPage}
                      setupRequired={showEpubSetupPrompt}
                      progressLabel={translationProgressLabel}
                      progressDetailLabel={translateAllProgressDetail.label}
                      progressDetailState={translateAllProgressDetail.state}
                      bulkActionLabel={translateAllActionLabel}
                      bulkActionDisabled={
                        !canTranslateAll || isTranslateAllStopRequested
                      }
                      bulkActionRunning={isTranslateAllRunning}
                      secondaryActionLabel={
                        translateAllUsageLimitPaused ? "Stop" : null
                      }
                      onSecondaryAction={
                        translateAllUsageLimitPaused
                          ? stopTranslateAll
                          : undefined
                      }
                      onBulkAction={
                        translateAllUsageLimitPaused
                          ? resumeTranslateAllAfterUsageLimit
                          : handleTranslateAllAction
                      }
                      onOpenSettings={handleOpenSettings}
                      activePid={activePid}
                      hoverPid={hoverPid}
                      onHoverPid={setHoverPid}
                      onTranslatePid={handleTranslatePid}
                      onLocatePid={handleLocatePid}
                      onTranslateText={handleTranslateText}
                      wordTranslation={wordTranslation}
                      onClearWordTranslation={handleClearWordTranslation}
                      scrollToPage={scrollToTranslationPage}
                      statusMap={[]}
                    />
                  )
                ) : (
                  <div className="empty-state">
                    Translations will appear here.
                  </div>
                )}
              </div>
              {readerPanels.translation && readerPanels.chat ? (
                <div
                  className="rail-resize-handle"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize translation and AI chat sections"
                  data-dragging={
                    activeRailResizeKey === "translation:chat"
                      ? "true"
                      : undefined
                  }
                  onPointerDown={handleRailResizeStart("translation", "chat")}
                />
              ) : null}
              <div
                ref={setRailSectionElementRef("chat")}
                className={`rail-section rail-section-chat ${readerPanels.chat ? "" : "is-hidden"}`}
                style={getRailSectionStyle("chat")}
              >
                <ChatPanel
                  isVisible={readerPanels.chat}
                  model={
                    effectivePreset?.model ||
                    getDefaultModelForProvider("openrouter")
                  }
                  getCurrentPageText={getCurrentPageText}
                  getSurroundingPagesText={getSurroundingPagesText}
                />
              </div>
            </section>
          </main>
        </div>
      </Tooltip.Provider>
    );

  return (
    <>
      {viewContent}
      {sharedAboutDialog}
      {sharedSettingsDialog}
      {settingsDiscardDialog}
    </>
  );
}
