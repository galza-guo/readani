import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Gear, HighlighterCircle, House } from "@phosphor-icons/react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { NavItem } from "epubjs";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
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
import { useAppUpdates } from "./hooks/useAppUpdates";
import { useTheme } from "./hooks/useTheme";
import { useResizableLayout } from "./hooks/useResizableLayout";
import { useWordTranslation } from "./hooks/useWordTranslation";
import { AnnotationsPanel } from "./components/AnnotationsPanel";
import { HomeView } from "./views/HomeView";
import {
  resolveTargetLanguage,
  getDefaultModelForProvider,
  getPresetValidationState,
} from "./lib/appSettings";
import {
  getDocumentFileName,
  getDocumentTitleFromPath,
  resolveLoadedDocumentIdentity,
  type LoadDocumentIdentity,
} from "./lib/documentIdentity";
import {
  inspectDocument,
  releasePdfDocument,
  yieldToBrowserPaint,
  isStructurallySimilarRecentCandidate,
  readDocumentBytes,
  type DocumentInspection,
} from "./lib/documentLoading";
import { hashBuffer } from "./lib/hash";
import { useAnnotations } from "./hooks/useAnnotations";
import {
  type PdfNavTab,
  type PdfOutlineLink,
  type PdfPageTurnDirection,
} from "./lib/pdfNavigation";
import {
  loadPdfNavigationPrefs,
  savePdfNavigationPrefs,
} from "./lib/pdfNavigationPrefs";
import {
  splitEpubParagraphsIntoPages,
  normalizeHref,
  matchHref,
} from "./lib/epubPagination";
import { useSettingsManager } from "./hooks/useSettingsManager";
import { useTranslationQueue } from "./hooks/useTranslationQueue";
import { loadPdfFromPath as loadPdfFromPathImpl, type LoadPdfContext } from "./lib/loadPdfDocument";
import { usePdfExtractionCache } from "./hooks/usePdfExtractionCache";
import { getDocumentProgressSnapshot } from "./lib/readingProgress";
import { clampPdfManualScale, type PdfZoomMode } from "./lib/readerLayout";
import { formatPageCountLabel } from "./lib/pageCountLabel";
import { getReaderStatusLabel } from "./lib/readerStatus";
import { getPdfJsWorkerPort } from "./lib/pdfWorker";
import { clampPage } from "./lib/pageQueue";
import {
  type PdfPageSizeEntry,
} from "./lib/pdfPageSizes";
import { TRANSLATION_SETUP_REQUIRED_MESSAGE } from "./lib/providerErrors";
import {
  getPresetById,
  sanitizeEpubPagesForPresetChange,
  sanitizePdfTranslationsForPresetChange,
} from "./lib/translationHelpers";
import type {
  BookTranslationPreference,
  FileType,
  PageDoc,
  PageTranslationState,
  RecentBook,
  TranslationFallbackTrace,
} from "./types";
import { t } from "./lib/i18n";
import "./lib/locales/index";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerPort = getPdfJsWorkerPort();
(window as any).pdfjsLib = pdfjsLib;

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
const PDF_KEYBOARD_ZOOM_STEP = 0.05;
const PDF_EXTRACTION_HYDRATION_BATCH_SIZE = 24;

type PendingReconnectResolution = {
  mode: "similar" | "different";
  book: RecentBook;
  candidate: DocumentInspection;
};

function loadBookTranslationPreferences() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BOOK_TRANSLATION_PREFS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, BookTranslationPreference>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, preference]) =>
          typeof preference?.enabled === "boolean" &&
          typeof preference?.targetLanguage?.code === "string" &&
          typeof preference?.targetLanguage?.label === "string",
      ),
    );
  } catch {
    return {};
  }
}

type AppView = "home" | "reader";
const APP_WINDOW_TITLE = "readani";

const BOOK_TRANSLATION_PREFS_STORAGE_KEY = "readani.bookTranslationPrefs.v1";

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
  const [openingDocumentTitle, setOpeningDocumentTitle] = useState<string | null>(
    null,
  );
  const [epubData, setEpubData] = useState<Uint8Array | null>(null);
  const [epubTotalPages, setEpubTotalPages] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineLink[]>([]);
  const [pageSizes, setPageSizes] = useState<PdfPageSizeEntry[]>([]);
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
  const sm = useSettingsManager({ showToast });
  const {
    settings,
    settingsDraft,
    settingsLoaded,
    settingsOpen,
    settingsCloseConfirmOpen,
    setSettingsCloseConfirmOpen,
    settingsClosePending,
    sessionFallbackPresetId,
    setSessionFallbackPresetId,
    systemLocale,
    translationCacheSummary,
    translationCacheLoading,
    translationCacheActionTarget,
    editingPresetId,
    apiKeyEditingPresetId,
    setApiKeyEditingPresetId,
    presetApiKeyDrafts,
    presetStatuses,
    presetSaveStatusById,
    presetTestRunningId,
    presetModelsLoadingById,
    presetModels,
    presetModelMessages,
    testAllPresetsRunning,
    effectivePreset,
    activePresetHasTranslationContext,
    activePresetHasLiveSetup,
    settingsRef,
    settingsDraftRef,
    sessionFallbackPresetIdRef,
    getEffectivePreset,
    persistSettings,
    updateSettingsDraftState,
    handleThemeToggle,
    handleOpenSettings,
    handleSettingsOpenChange,
    handleEditingPresetChange,
    handleActivatePreset,
    handleAddPreset,
    handleDeletePreset,
    handlePresetChange,
    handlePresetApiKeyInputChange,
    handlePresetApiKeyBlur,
    flushPresetAutosave,
    handleTestPreset,
    handleTestAllPresets,
    handleFetchPresetModels,
    handleClearAllTranslationCache,
    handleClearCachedBookTranslations,
    discardUnsavedSettingsAndClose,
    collectBlockingUnsavedPresetIds,
    showTranslationSetupToast,
  } = sm;

  const [bookTranslationPreferences, setBookTranslationPreferences] =
    useState<Record<string, BookTranslationPreference>>(() =>
      loadBookTranslationPreferences(),
    );
  const [hoverPid, setHoverPid] = useState<string | null>(null);
  const [activePid, setActivePid] = useState<string | null>(null);
  const [documentStatusMessage, setDocumentStatusMessage] = useState<
    string | null
  >(null);
  const [translationStatusMessage, setTranslationStatusMessage] = useState<
    string | null
  >(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [missingRecentBook, setMissingRecentBook] = useState<RecentBook | null>(
    null,
  );
  const [pendingReconnectResolution, setPendingReconnectResolution] =
    useState<PendingReconnectResolution | null>(null);
  const [scrollToTranslationPage, setScrollToTranslationPage] = useState<
    number | null
  >(null);
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
  const {
    showReadyUpdateAction,
    aboutUpdateStatusMessage,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleOpenLatestRelease,
  } = useAppUpdates(showToast);

  const {
    annotationModeEnabled,
    setAnnotationModeEnabled,
    noteEditingAnnotationId,
    setNoteEditingAnnotationId,
    pendingAnnotationDeletion,
    setPendingAnnotationDeletion,
    annotationsPanelOpen,
    setAnnotationsPanelOpen,
    resolvedAnnotations,
    savedHighlightPids,
    deleteSentenceAnnotation,
    requestDeleteSentenceAnnotation,
    ensureSentenceHighlight,
    toggleSentenceHighlight,
    highlightSelectedSentences,
    saveSentenceNote,
    resetAnnotationUi,
  } = useAnnotations({ docId, pages, currentPage });

  const { queuePage: queuePdfExtractionCachePage, flush: flushPendingPdfExtractionCache, cacheVersion: PDF_EXTRACTION_CACHE_VERSION } = usePdfExtractionCache();

  const pagesRef = useRef<PageDoc[]>([]);
  const pageTranslationsRef = useRef<Record<number, PageTranslationState>>({});
  const currentTargetLanguageRef = useRef(
    resolveTargetLanguage(
      settings.defaultLanguage,
      settings.appLanguage,
      systemLocale,
    ),
  );
  const translationEnabledRef = useRef(true);
  const docIdRef = useRef(docId);
  const epubViewerRef = useRef<EpubViewerHandle>(null);
  const pdfTranslationSessionRef = useRef(0);
  const pdfOutlineRequestIdRef = useRef(0);
  const pdfLoadRequestIdRef = useRef(0);
  const epubScrollRequestIdRef = useRef(0);
  const readerHeaderRef = useRef<HTMLDivElement | null>(null);
  const didMountPdfNavPrefsRef = useRef(false);

  const showFallbackSuccessToast = useCallback(
    (trace: TranslationFallbackTrace) => {
      if (
        !trace.usedFallback ||
        trace.finalPresetId === trace.requestedPresetId
      ) {
        return;
      }

      const finalPreset = getPresetById(
        settingsRef.current.presets,
        trace.finalPresetId,
      );
      const currentEffectivePresetId =
        sessionFallbackPresetIdRef.current ??
        settingsRef.current.activePresetId;
      const canUseForSession =
        Boolean(finalPreset) &&
        currentEffectivePresetId !== trace.finalPresetId;

      showToast({
        message: t("toast.retriedWithPreset", { preset: finalPreset?.label ?? trace.finalPresetId }),
        tone: "success",
        durationMs: 4600,
        actionLabel: canUseForSession ? t("toast.useForThisSession") : undefined,
        onAction: canUseForSession
          ? () => setSessionFallbackPresetId(trace.finalPresetId)
          : undefined,
      });
    },
    [showToast],
  );

  const wordTranslationHook = useWordTranslation({
    getEffectivePreset,
    settingsRef,
    currentTargetLanguageRef,
    translationEnabledRef,
    pdfTranslationSessionRef,
    showFallbackSuccessToast,
    showToast,
  });

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

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    pageTranslationsRef.current = pageTranslations;
  }, [pageTranslations]);

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


  const allPdfPagesExtracted = useMemo(
    () =>
      currentFileType === "pdf" &&
      pages.length > 0 &&
      pages.every((page) => page.isExtracted),
    [currentFileType, pages],
  );

  const translationQueue = useTranslationQueue({
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
  });

  const {
    isTranslateAllStopRequested,
    translateAllUsageLimitPaused,
    translationEnabled,
    currentTargetLanguage,
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
    stopTranslateAll,
    handleTranslateAllAction,
    resumeTranslateAllAfterUsageLimit,
    handleTranslatePid,
    handleRedoPageTranslation,
    handleTranslationPreferenceChange,
    handleReaderSettingsChange,
    resetTranslationQueueForNewDocument,
  } = translationQueue;

  const pdfExtractionProgress = useMemo(() => {
    if (currentFileType !== "pdf" || allPdfPagesExtracted) {
      return null;
    }

    const totalCount = pdfDoc?.numPages ?? pages.length;
    if (totalCount <= 0) {
      return null;
    }

    const completedCount = Math.min(
      totalCount,
      pages.filter((page) => page.isExtracted).length,
    );

    return {
      completedCount,
      totalCount,
      progressLabel: `Preparing pages ${completedCount}/${totalCount}`,
    };
  }, [allPdfPagesExtracted, currentFileType, pages, pdfDoc]);

  const layout = useResizableLayout({
    currentFileType,
    pdfZoomMode,
    setPdfZoomMode,
  });

  useEffect(() => {
    if (!didMountPdfNavPrefsRef.current) {
      didMountPdfNavPrefsRef.current = true;
      return;
    }

    persistPdfNavPrefs();
  }, [pdfNavTab, persistPdfNavPrefs]);

  useTheme(settings.theme, settings.accentColor);

  useEffect(() => {
    const shell = layout.readerShellRef.current;

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
    const minWidth = Math.ceil(layout.workspaceMinWidth + paddingX);
    const minHeight = Math.ceil(
      layout.workspaceMinHeight + paddingY + headerHeight + rowGap,
    );

    void getCurrentWindow()
      .setSizeConstraints({
        minWidth,
        minHeight,
      })
      .catch(() => {});
  }, [appView, layout.workspaceMinHeight, layout.workspaceMinWidth]);

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
    translationEnabled &&
    currentFileType === "epub" &&
    translationStatusMessage === TRANSLATION_SETUP_REQUIRED_MESSAGE &&
    !currentEpubPageHasTranslation;
  const dialogSettings = settingsDraft ?? settings;

  const pdfLoadContext = useMemo<LoadPdfContext>(() => ({
    pdfOutlineRequestIdRef,
    pdfLoadRequestIdRef,
    queuePdfExtractionCachePage,
    flushPendingPdfExtractionCache,
    resetTranslationQueueForNewDocument,
    wordTranslationClearSelection: wordTranslationHook.handleClearSelectionTranslation,
    wordTranslationClearWord: wordTranslationHook.handleClearWordTranslation,
    setAppView,
    setCurrentFilePath,
    setCurrentFileType,
    setEpubData,
    setEpubToc,
    setEpubCurrentChapter,
    setPendingEpubNavigationHref,
    setLoadingProgress,
    setDocumentStatusMessage,
    setTranslationStatusMessage,
    setPdfDoc,
    setPdfOutline,
    setPages,
    setPageTranslations,
    setPageSizes,
    setPdfZoomMode,
    setPdfManualScale,
    setResolvedPdfScale,
    setPdfScrollAnchor,
    setPendingEpubScroll,
    setScrollToTranslationPage,
    setHoverPid,
    setActivePid,
    setCurrentBookTitle,
    setDocId,
    setCurrentPage,
    extractionCacheVersion: PDF_EXTRACTION_CACHE_VERSION,
    hydrationBatchSize: PDF_EXTRACTION_HYDRATION_BATCH_SIZE,
  }), [
    pdfOutlineRequestIdRef,
    pdfLoadRequestIdRef,
    queuePdfExtractionCachePage,
    flushPendingPdfExtractionCache,
    resetTranslationQueueForNewDocument,
    wordTranslationHook.handleClearSelectionTranslation,
    wordTranslationHook.handleClearWordTranslation,
    setAppView,
    setCurrentFilePath,
    setCurrentFileType,
    setEpubData,
    setEpubToc,
    setEpubCurrentChapter,
    setPendingEpubNavigationHref,
    setLoadingProgress,
    setDocumentStatusMessage,
    setTranslationStatusMessage,
    setPdfDoc,
    setPdfOutline,
    setPages,
    setPageTranslations,
    setPageSizes,
    setPdfZoomMode,
    setPdfManualScale,
    setResolvedPdfScale,
    setPdfScrollAnchor,
    setPendingEpubScroll,
    setScrollToTranslationPage,
    setHoverPid,
    setActivePid,
    setCurrentBookTitle,
    setDocId,
    setCurrentPage,
    PDF_EXTRACTION_CACHE_VERSION,
    PDF_EXTRACTION_HYDRATION_BATCH_SIZE,
  ]);

  const loadPdfFromPath = useCallback(
    async (filePath: string, startPage?: number, identity?: LoadDocumentIdentity) => {
      await loadPdfFromPathImpl(filePath, pdfLoadContext, startPage, identity);
    },
    [pdfLoadContext],
  );

  const loadEpubFromPath = useCallback(
    async (
      filePath: string,
      startPage?: number,
      identity?: LoadDocumentIdentity,
    ) => {
      pdfOutlineRequestIdRef.current += 1;
      pdfLoadRequestIdRef.current += 1;
      flushPendingPdfExtractionCache();
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
      wordTranslationHook.handleClearSelectionTranslation();
      setHoverPid(null);
      setActivePid(null);
      setLoadingProgress(0);
      setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
      setTranslationStatusMessage(null);
      setPdfScrollAnchor("top");
      setPendingEpubScroll(null);
      setScrollToTranslationPage(null);
      resetTranslationQueueForNewDocument();
      await yieldToBrowserPaint();

      try {
        const bytes = await readDocumentBytes(filePath);
        const buffer = bytes.buffer.slice(0);
        const hash = await hashBuffer(buffer);
        const resolvedIdentity = resolveLoadedDocumentIdentity({
          hash,
          filePath,
          identity,
        });
        const nextDocId = resolvedIdentity.docId;

        // Extract filename and title from path
        const fileName = getDocumentFileName(filePath);
        const title = resolvedIdentity.title;
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
    [flushPendingPdfExtractionCache, resetTranslationQueueForNewDocument],
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
      const epubPages = splitEpubParagraphsIntoPages(paragraphs);
      setPages(epubPages);
      setEpubTotalPages(epubPages.length);
    },
    [],
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

  const updateRecentBookLocation = useCallback(
    async (book: RecentBook, candidate: DocumentInspection) => {
      await invoke("update_recent_book_location", {
        id: book.id,
        filePath: candidate.filePath,
        fileName: candidate.fileName,
        title: candidate.title,
        totalPages: candidate.totalPages,
      });
    },
    [],
  );

  const loadInspectedDocument = useCallback(
    async (
      candidate: DocumentInspection,
      startPage?: number,
      identity?: LoadDocumentIdentity,
    ) => {
      if (candidate.fileType === "epub") {
        await loadEpubFromPath(candidate.filePath, startPage, identity);
      } else {
        await loadPdfFromPath(candidate.filePath, startPage, identity);
      }
    },
    [loadEpubFromPath, loadPdfFromPath],
  );

  const chooseDocumentPath = useCallback(async () => {
    const selection = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["pdf", "epub"] }],
    });

    return typeof selection === "string" ? selection : null;
  }, []);

  const resolveRecentBookCandidate = useCallback(
    async (book: RecentBook, candidate: DocumentInspection) => {
      if (candidate.fileType !== book.fileType) {
        setPendingReconnectResolution({ mode: "different", book, candidate });
        return;
      }

      if (candidate.docId === book.id) {
        await updateRecentBookLocation(book, candidate);
        await loadInspectedDocument(candidate, book.lastPage);
        return;
      }

      setPendingReconnectResolution({
        mode: isStructurallySimilarRecentCandidate(book, candidate)
          ? "similar"
          : "different",
        book,
        candidate,
      });
    },
    [loadInspectedDocument, updateRecentBookLocation],
  );

  const locateRecentBook = useCallback(
    async (book: RecentBook) => {
      setMissingRecentBook(null);
      const selection = await chooseDocumentPath();
      if (!selection) {
        return;
      }

      try {
        const candidate = await inspectDocument(selection);
        await resolveRecentBookCandidate(book, candidate);
      } catch (error) {
        console.error("Failed to inspect located document:", error);
        showToast({
          message: t("toast.couldNotOpenDocument"),
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [chooseDocumentPath, resolveRecentBookCandidate, showToast],
  );

  const reconnectAsSameBook = useCallback(async () => {
    if (!pendingReconnectResolution) {
      return;
    }

    const { book, candidate } = pendingReconnectResolution;
    setPendingReconnectResolution(null);

    try {
      await updateRecentBookLocation(book, candidate);
      await loadInspectedDocument(candidate, book.lastPage, {
        docId: book.id,
        title: candidate.title,
      });
    } catch (error) {
      console.error("Failed to reconnect recent book:", error);
      showToast({
        message: t("toast.couldNotReconnectBook"),
        tone: "error",
        durationMs: 4200,
      });
    }
  }, [
    loadInspectedDocument,
    pendingReconnectResolution,
    showToast,
    updateRecentBookLocation,
  ]);

  const openReconnectCandidateAsNewBook = useCallback(async () => {
    if (!pendingReconnectResolution) {
      return;
    }

    const { candidate } = pendingReconnectResolution;
    setPendingReconnectResolution(null);
    await loadInspectedDocument(candidate);
  }, [loadInspectedDocument, pendingReconnectResolution]);

  const handleOpenFile = useCallback(async () => {
    const selection = await chooseDocumentPath();
    if (!selection) return;

    setOpeningDocumentTitle(getDocumentTitleFromPath(selection));
    await yieldToBrowserPaint();

    const ext = selection.split(".").pop()?.toLowerCase();
    try {
      if (ext === "epub") {
        await loadEpubFromPath(selection);
      } else {
        await loadPdfFromPath(selection);
      }
    } finally {
      setOpeningDocumentTitle(null);
    }
  }, [chooseDocumentPath, loadPdfFromPath, loadEpubFromPath]);

  const handleOpenBook = useCallback(
    async (book: RecentBook) => {
      setOpeningDocumentTitle(book.title);
      await yieldToBrowserPaint();

      try {
        if (book.fileType === "epub") {
          await loadEpubFromPath(book.filePath, book.lastPage, {
            docId: book.id,
            title: book.title,
          });
          return;
        }

        await loadPdfFromPath(book.filePath, book.lastPage, {
          docId: book.id,
          title: book.title,
        });
      } catch (error) {
        console.warn("Recent book path could not be opened:", error);
        setMissingRecentBook(book);
      } finally {
        setOpeningDocumentTitle(null);
      }
    },
    [loadEpubFromPath, loadPdfFromPath],
  );

  const handleBackToHome = useCallback(() => {
    flushPendingPdfExtractionCache();
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
    wordTranslationHook.handleClearSelectionTranslation();
    wordTranslationHook.handleClearWordTranslation();
    setEpubToc([]);
    setEpubCurrentChapter("");
    setPendingEpubNavigationHref(null);
    setPendingEpubScroll(null);
    setScrollToTranslationPage(null);
    resetTranslationQueueForNewDocument();
    resetAnnotationUi();
  }, [
    currentPage,
    docId,
    epubTotalPages,
    flushPendingPdfExtractionCache,
    pdfDoc,
    resetAnnotationUi,
    resetTranslationQueueForNewDocument,
  ]);

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
    wordTranslationHook.handleClearSelectionTranslation();
    wordTranslationHook.handleClearWordTranslation();
    resetTranslationQueueForNewDocument();
  }, [
    currentFileType,
    docId,
    currentTargetLanguage.code,
    translationEnabled,
    resetTranslationQueueForNewDocument,
  ]);

  useEffect(() => {
    if (currentFileType !== "pdf") return;

    wordTranslationHook.handleClearSelectionTranslation();
    setTranslationStatusMessage(null);
    resetTranslationQueueForNewDocument();
    setPageTranslations((prev) => sanitizePdfTranslationsForPresetChange(prev));
  }, [
    currentFileType,
    effectivePreset?.id,
    effectivePreset?.model,
    resetTranslationQueueForNewDocument,
  ]);

  useEffect(() => {
    if (currentFileType !== "epub") return;

    setTranslationStatusMessage(null);
    resetTranslationQueueForNewDocument();
    setPages((prev) => sanitizeEpubPagesForPresetChange(prev));
  }, [
    currentFileType,
    effectivePreset?.id,
    effectivePreset?.model,
    resetTranslationQueueForNewDocument,
  ]);

  useEffect(() => {
    if (currentFileType !== "pdf" || pages.length === 0) return;
    setCurrentPage((prev) => clampPage(prev, pages.length));
  }, [currentFileType, pages.length]);

  const handlePdfPageChange = useCallback(
    (nextPage: number, options?: { anchor?: "top" | "bottom" }) => {
      if (currentFileType !== "pdf" || pages.length === 0) return;
      const clampedPage = clampPage(nextPage, pages.length);
      if (clampedPage === currentPage) return;

      setPdfScrollAnchor(options?.anchor ?? "top");
      setCurrentPage(clampedPage);
      setHoverPid(null);
      setActivePid(null);
      wordTranslationHook.handleClearSelectionTranslation();
    },
    [currentFileType, currentPage, pages.length, wordTranslationHook],
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

  const handleLocatePid = useCallback(
    (pid: string, page: number) => {
      setActivePid(pid);
      setCurrentPage(page);
      requestTranslationScroll(page);
      if (currentFileType === "epub") {
        const targetParagraph = pagesRef.current
          .flatMap((entry) => entry.paragraphs)
          .find((entry) => entry.pid === pid);

        if (layout.readerPanels.original) {
          epubViewerRef.current?.navigateTo(pid);
        } else if (targetParagraph?.epubHref) {
          setPendingEpubNavigationHref(targetParagraph.epubHref);
        }
      }
    },
    [currentFileType, layout.readerPanels.original, requestTranslationScroll],
  );

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

      if (layout.readerPanels.original) {
        epubViewerRef.current?.navigateToHref(href);
      } else {
        setPendingEpubNavigationHref(href);
      }
    },
    [
      epubHrefToPage,
      matchHref,
      normalizeHref,
      layout.readerPanels.original,
      requestTranslationScroll,
    ],
  );

  const readingProgress = useMemo(
    () =>
      getDocumentProgressSnapshot({
        currentFileType,
        currentPage,
        pdfPageCount: currentFileType === "pdf" ? pdfDoc?.numPages ?? null : null,
        pagesLength: pages.length,
        epubTotalPages,
      }),
    [currentFileType, currentPage, epubTotalPages, pages.length, pdfDoc],
  );
  const totalPages = readingProgress.totalPages;

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
      !layout.readerPanels.original ||
      !pendingEpubNavigationHref ||
      !epubViewerRef.current
    ) {
      return;
    }

    epubViewerRef.current.navigateToHref(pendingEpubNavigationHref);
    setPendingEpubNavigationHref(null);
  }, [currentFileType, pendingEpubNavigationHref, layout.readerPanels.original]);

  // Save progress when page changes (works for both PDF and EPUB)
  useEffect(() => {
    if (docId && currentPage > 0 && totalPages > 0) {
      invoke("update_book_progress", {
        id: docId,
        lastPage: currentPage,
        progress: readingProgress.percent,
      }).catch(() => {});
    }
  }, [currentPage, docId, readingProgress.percent, totalPages]);

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
        layout.togglePanel("chat");
        return;
      }

      // Escape: Close chat panel or go back to home
      if (e.key === "Escape") {
        if (layout.readerPanels.chat) {
          layout.setReaderPanels((prev) => {
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
    layout.readerPanels.chat,
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
              ? t("dialog.discardDrafts")
              : t("dialog.discardDraft"),
          variant: "danger",
          onSelect: discardUnsavedSettingsAndClose,
        },
      ]}
      cancelLabel={t("dialog.keepEditing")}
      description={t("dialog.discardUnsavedChangesDescription")}
      onOpenChange={setSettingsCloseConfirmOpen}
      open={settingsCloseConfirmOpen}
      title={t("dialog.discardUnsavedChangesTitle")}
    />
  );
  const missingRecentBookDialog = (
    <ConfirmationDialog
      actions={[
        {
          label: t("dialog.locateDocument"),
          variant: "primary",
          onSelect: () => {
            if (!missingRecentBook) {
              return;
            }

            void locateRecentBook(missingRecentBook);
          },
        },
      ]}
      description={
        missingRecentBook
          ? t("dialog.bookNotFoundDescription")
          : ""
      }
      onOpenChange={(open) => {
        if (!open) {
          setMissingRecentBook(null);
        }
      }}
      open={Boolean(missingRecentBook)}
      title={t("dialog.bookNotFoundTitle")}
    />
  );
  const reconnectResolutionDialog = (
    <ConfirmationDialog
      actions={
        pendingReconnectResolution?.mode === "similar"
          ? [
              {
                label: t("dialog.sameBook"),
                variant: "primary",
                onSelect: reconnectAsSameBook,
              },
              {
                label: t("dialog.differentBookOpenAsNew"),
                onSelect: openReconnectCandidateAsNewBook,
              },
            ]
          : [
              {
                label: t("dialog.openAsNewBook"),
                variant: "primary",
                onSelect: openReconnectCandidateAsNewBook,
              },
              {
                label: t("dialog.chooseAnotherFile"),
                onSelect: () => {
                  if (!pendingReconnectResolution) {
                    return;
                  }

                  const book = pendingReconnectResolution.book;
                  setPendingReconnectResolution(null);
                  void locateRecentBook(book);
                },
              },
            ]
      }
      cancelLabel={t("common.cancel")}
      description={
        pendingReconnectResolution?.mode === "similar"
          ? t("dialog.fileNotExactMatch")
          : t("dialog.fileDifferentDocument")
      }
      onOpenChange={(open) => {
        if (!open) {
          setPendingReconnectResolution(null);
        }
      }}
      open={Boolean(pendingReconnectResolution)}
      title={
        pendingReconnectResolution?.mode === "similar"
          ? t("dialog.reconnectBook")
          : t("dialog.differentDocument")
      }
    />
  );
  const annotationDeleteDialog = (
    <ConfirmationDialog
      actions={[
        {
          label: t("dialog.deleteHighlight"),
          variant: "danger",
          onSelect: () => {
            if (!pendingAnnotationDeletion) {
              return;
            }

            const annotationId = pendingAnnotationDeletion.id;
            setPendingAnnotationDeletion(null);
            void deleteSentenceAnnotation(annotationId);
          },
        },
      ]}
      cancelLabel={t("dialog.keepHighlight")}
      description={t("dialog.deleteHighlightDescription")}
      onOpenChange={(open) => {
        if (!open) {
          setPendingAnnotationDeletion(null);
        }
      }}
      open={pendingAnnotationDeletion !== null}
      title={t("dialog.deleteHighlightAndNoteTitle")}
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

  const nextColumnAfterNavigation = layout.visibleReaderColumns.includes("navigation")
    ? (layout.visibleReaderColumns.find((column) => column !== "navigation") ?? null)
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
        openingDocumentTitle={openingDocumentTitle}
      />
    ) : (
      <Tooltip.Provider delayDuration={300}>
        <div ref={layout.readerShellRef} className="app-shell app-shell-reader">
          <Toolbar.Root
            ref={readerHeaderRef}
            className="app-header"
            aria-label={t("reader.toolbar")}
          >
            <div className="header-left">
              <ExpandableIconButton
                onClick={handleBackToHome}
                aria-label={t("common.home")}
                label={t("common.home")}
                labelDirection="right"
              >
                <House size={20} weight="regular" />
              </ExpandableIconButton>
            </div>
            <div className="header-center">
              <PanelToggleGroup panels={layout.readerPanels} onToggle={layout.togglePanel} />
            </div>
            <div className="header-right">
              {showReadyUpdateAction ? (
                <UpdateActionButton
                  onClick={() => {
                    void handleInstallUpdate();
                  }}
                />
              ) : null}
              <ExpandableIconButton
                aria-label={t("annotations.title")}
                label={t("annotations.title")}
                labelDirection="left"
                onClick={() => setAnnotationsPanelOpen((prev) => !prev)}
              >
                <HighlighterCircle size={20} weight="regular" />
              </ExpandableIconButton>
              <ThemeToggleButton
                className=""
                theme={settings.theme}
                onToggle={handleThemeToggle}
                showHoverLabel={true}
                labelDirection="left"
                hoverLabel={t("theme.switch")}
              />
              <ExpandableIconButton
                aria-label={t("common.settings")}
                label={t("common.settings")}
                labelDirection="left"
                onClick={handleOpenSettings}
              >
                <Gear size={18} weight="regular" />
              </ExpandableIconButton>
            </div>
          </Toolbar.Root>
          <main
            className="app-main app-main--workspace"
            style={{
              minWidth: `${layout.workspaceMinWidth}px`,
              minHeight: `${layout.workspaceMinHeight}px`,
            }}
          >
            <section
              ref={layout.setColumnElementRef("navigation")}
              className={`pane pane-navigation ${layout.readerPanels.navigation ? "" : "is-hidden"}`}
              style={layout.getColumnStyle("navigation")}
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
                      {t("nav.noContents")}
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
                aria-label={t("reader.resizeNavigationPanels", {
                  next: nextColumnAfterNavigation === "original"
                    ? "original"
                    : "right rail",
                })}
                data-dragging={
                  layout.activeColumnResizeKey ===
                  `navigation:${nextColumnAfterNavigation}`
                    ? "true"
                    : undefined
                }
                onPointerDown={layout.handleColumnResizeStart(
                  "navigation",
                  nextColumnAfterNavigation,
                )}
              />
            ) : null}
            <section
              ref={layout.setColumnElementRef("original")}
              className={`pane pane-original ${layout.readerPanels.original ? "" : "is-hidden"}`}
              style={layout.getColumnStyle("original")}
            >
              <div className="pane-body">
                {currentFileType === "epub" && epubData ? (
                  <div
                    className={`epub-original-host ${layout.readerPanels.original ? "" : "is-detached"}`}
                  >
                    <PageNavigationToolbar
                      previousLabel={t("reader.previousPage")}
                      nextLabel={t("reader.nextPage")}
                      previousDisabled={currentPage <= 1}
                      nextDisabled={currentPage >= epubTotalPages}
                      onPrevious={() => handleEpubPageStep("prev")}
                      onNext={() => handleEpubPageStep("next")}
                    >
                      <div className="document-page-label">
                        {formatPageCountLabel(currentPage, epubTotalPages)}
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
                          <div className="epub-zoom-readout">
                            {Math.round(scale * 100)}%
                          </div>
                          <button
                            className="epub-zoom-symbol"
                            type="button"
                            onClick={() => handleScaleStep("out")}
                            disabled={currentScaleIndex <= 0}
                            aria-label={t("reader.zoomOut")}
                            title={t("reader.zoomOut")}
                          >
                            -
                          </button>
                          <button
                            className="epub-zoom-symbol"
                            type="button"
                            onClick={() => handleScaleStep("in")}
                            disabled={
                              currentScaleIndex >= ZOOM_LEVELS.length - 1
                            }
                            aria-label={t("reader.zoomIn")}
                            title={t("reader.zoomIn")}
                          >
                            +
                          </button>
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
                    savedHighlightPids={savedHighlightPids}
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
                    onSelectionText={wordTranslationHook.handlePdfSelectionTranslate}
                    onClearSelection={wordTranslationHook.handleClearSelectionTranslation}
                  />
                ) : hasBlockingOriginalPaneStatus &&
                  originalPaneStatusMessage ? (
                  <DocumentStatusSurface
                    message={originalPaneStatusMessage}
                    progress={loadingProgress}
                    variant="blocking"
                  />
                ) : (
                  <div className="empty-state">{t("reader.noDocumentLoaded")}</div>
                )}
              </div>
            </section>
            {layout.visibleReaderColumns.includes("original") &&
            layout.visibleReaderColumns.includes("rail") ? (
              <div
                className="split-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label={t("reader.resizePanels")}
                data-dragging={
                  layout.activeColumnResizeKey === "original:rail" ? "true" : undefined
                }
                onPointerDown={layout.handleColumnResizeStart("original", "rail")}
              />
            ) : null}
            <section
              ref={layout.setColumnElementRef("rail")}
              className={`pane pane-rail ${layout.visibleReaderColumns.includes("rail") ? "" : "is-hidden"}`}
              style={layout.getColumnStyle("rail")}
            >
              <div
                ref={layout.setRailSectionElementRef("translation")}
                className={`rail-section rail-section-translation ${
                  layout.readerPanels.translation ? "" : "is-hidden"
                }`}
                style={layout.getRailSectionStyle("translation")}
              >
                {pdfDoc || epubData ? (
                  currentFileType === "pdf" ? (
                    <TranslationPane
                      mode="pdf"
                      translationEnabled={translationEnabled}
                      targetLanguage={currentTargetLanguage}
                      onTranslationPreferenceChange={
                        handleTranslationPreferenceChange
                      }
                      providerPresets={settings.presets}
                      activeProviderPresetId={effectivePreset?.id}
                      onActiveProviderPresetChange={handleActivatePreset}
                      currentPage={currentPage}
                      page={currentPdfPageDoc}
                      pageTranslation={pageTranslations[currentPage]}
                      loadingMessage={currentPdfLoadingMessage}
                      setupRequired={showPdfSetupPrompt}
                      extractionProgress={pdfExtractionProgress}
                      progressLabel={translationProgressLabel}
                      progressDetailLabel={pdfProgressDetailLabel}
                      progressDetailState={pdfProgressDetailState}
                      bulkActionLabel={translateAllActionLabel}
                      bulkActionDisabled={
                        !canTranslateAll || isTranslateAllStopRequested
                      }
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
                      selectionTranslation={wordTranslationHook.selectionTranslation}
                      onClearSelectionTranslation={
                        wordTranslationHook.handleClearSelectionTranslation
                      }
                      statusMap={pageProgressMap}
                      onSeekPage={handleSeekPage}
                      annotations={resolvedAnnotations.filter(
                        (a) => a.page === currentPage,
                      )}
                      annotationModeEnabled={annotationModeEnabled}
                      onToggleAnnotationMode={() =>
                        setAnnotationModeEnabled((prev) => !prev)
                      }
                      onAnnotateSentence={(para, sentenceIndex) =>
                        ensureSentenceHighlight({
                          pid: para.pid,
                          page: para.page,
                          source: para.source,
                          sentenceIndex,
                          rects: para.rects,
                        })
                      }
                      onToggleSentenceAnnotation={(para, sentenceIndex) =>
                        toggleSentenceHighlight({
                          pid: para.pid,
                          page: para.page,
                          source: para.source,
                          sentenceIndex,
                          rects: para.rects,
                        })
                      }
                      onDeleteAnnotation={requestDeleteSentenceAnnotation}
                      onSaveNote={saveSentenceNote}
                      noteEditingAnnotationId={noteEditingAnnotationId}
                      onNoteEditingChange={setNoteEditingAnnotationId}
                      onHighlightSelected={highlightSelectedSentences}
                    />
                  ) : (
                    <TranslationPane
                      mode="epub"
                      translationEnabled={translationEnabled}
                      targetLanguage={currentTargetLanguage}
                      onTranslationPreferenceChange={
                        handleTranslationPreferenceChange
                      }
                      providerPresets={settings.presets}
                      activeProviderPresetId={effectivePreset?.id}
                      onActiveProviderPresetChange={handleActivatePreset}
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
                      onTranslateText={wordTranslationHook.handleTranslateText}
                      wordTranslation={wordTranslationHook.wordTranslation}
                      onClearWordTranslation={wordTranslationHook.handleClearWordTranslation}
                      scrollToPage={scrollToTranslationPage}
                      statusMap={[]}
                      annotations={resolvedAnnotations}
                      annotationModeEnabled={annotationModeEnabled}
                      onToggleAnnotationMode={() =>
                        setAnnotationModeEnabled((prev) => !prev)
                      }
                      onAnnotateSentence={(para, sentenceIndex) =>
                        ensureSentenceHighlight({
                          pid: para.pid,
                          page: para.page,
                          source: para.source,
                          sentenceIndex,
                          rects: para.rects,
                        })
                      }
                      onToggleSentenceAnnotation={(para, sentenceIndex) =>
                        toggleSentenceHighlight({
                          pid: para.pid,
                          page: para.page,
                          source: para.source,
                          sentenceIndex,
                          rects: para.rects,
                        })
                      }
                      onDeleteAnnotation={requestDeleteSentenceAnnotation}
                      onSaveNote={saveSentenceNote}
                      noteEditingAnnotationId={noteEditingAnnotationId}
                      onNoteEditingChange={setNoteEditingAnnotationId}
                      onHighlightSelected={highlightSelectedSentences}
                    />
                  )
                ) : (
                  <div className="empty-state">
                    Translations will appear here.
                  </div>
                )}
              </div>
              {layout.readerPanels.translation && layout.readerPanels.chat ? (
                <div
                  className="rail-resize-handle"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={t("reader.resizeTranslateChat")}
                  data-dragging={
                    layout.activeRailResizeKey === "translation:chat"
                      ? "true"
                      : undefined
                  }
                  onPointerDown={layout.handleRailResizeStart("translation", "chat")}
                />
              ) : null}
              <div
                ref={layout.setRailSectionElementRef("chat")}
                className={`rail-section rail-section-chat ${layout.readerPanels.chat ? "" : "is-hidden"}`}
                style={layout.getRailSectionStyle("chat")}
              >
                <ChatPanel
                  isVisible={layout.readerPanels.chat}
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
      {missingRecentBookDialog}
      {reconnectResolutionDialog}
      {annotationDeleteDialog}
      {appView === "reader" && docId ? (
        <AnnotationsPanel
          annotations={resolvedAnnotations}
          open={annotationsPanelOpen}
          onClose={() => setAnnotationsPanelOpen(false)}
          onNavigateToPage={(page, pids) => {
            if (pids && pids.length > 0) {
              handleLocatePid(pids[0], page);
              return;
            }

            if (currentFileType === "pdf") {
              handlePdfPageChange(page);
              return;
            }

            setActivePid(null);
            setCurrentPage(page);
            requestTranslationScroll(page);
          }}
          onDeleteAnnotation={requestDeleteSentenceAnnotation}
        />
      ) : null}
    </>
  );
}
