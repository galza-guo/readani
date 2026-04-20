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
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as Toolbar from "@radix-ui/react-toolbar";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AboutDialog } from "./components/AboutDialog";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { PdfNavigationSidebar } from "./components/PdfNavigationSidebar";
import { PdfViewer } from "./components/PdfViewer";
import { TranslationPane } from "./components/TranslationPane";
import { DocumentStatusSurface } from "./components/document/DocumentStatusSurface";
import { EpubNavigationSidebar } from "./components/document/EpubNavigationSidebar";
import { EpubViewer, type EpubParagraph, type EpubViewerHandle } from "./components/document/EpubViewer";
import { ChatPanel } from "./components/reader/ChatPanel";
import { ExpandableIconButton } from "./components/reader/ExpandableIconButton";
import { PageNavigationToolbar } from "./components/reader/PageNavigationToolbar";
import { PanelToggleGroup } from "./components/reader/PanelToggleGroup";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ThemeToggleButton } from "./components/ThemeToggleButton";
import { HomeView } from "./views/HomeView";
import {
  createDefaultSettings,
  createPresetDraft,
  discardUnsavedPresetEdits,
  getActivePreset,
  getDefaultModelForProvider,
  getNextThemeMode,
  getPresetValidationState,
  isPresetUnchangedFromSavedState,
  normalizeSettingsFromStorage,
  normalizePresetDraft,
  serializePresetForCommand,
  serializeSettingsForCommand,
} from "./lib/appSettings";
import { extractPageParagraphs } from "./lib/textExtraction";
import { hashBuffer } from "./lib/hash";
import { LRUCache } from "./lib/lruCache";
import {
  normalizePdfOutline,
  resolvePdfDestinationPage,
  type PdfNavTab,
  type PdfOutlineLink,
  type PdfPageTurnDirection,
} from "./lib/pdfNavigation";
import { loadPdfNavigationPrefs, savePdfNavigationPrefs } from "./lib/pdfNavigationPrefs";
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
  bumpRequestVersion,
  dequeueNextPage,
  enqueueBackgroundPages,
  enqueueForegroundPage,
  getEpubSectionTranslationProgress,
  getFullBookActionLabel,
  getPageTranslationProgress,
  isRequestVersionCurrent,
} from "./lib/pageTranslationScheduler";
import type {
  FileType,
  PageDoc,
  PageTranslationResult,
  PageTranslationState,
  PresetTestResult,
  RecentBook,
  SelectionTranslation,
  TranslationPreset,
  TranslationSettings,
  WordDefinition,
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

type AppView = "home" | "reader";
const APP_WINDOW_TITLE = "readani";

export default function App() {
  const [pdfNavPrefs] = useState(() => loadPdfNavigationPrefs());
  const [appView, setAppView] = useState<AppView>("home");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentBookTitle, setCurrentBookTitle] = useState<string | null>(null);
  const [currentFileType, setCurrentFileType] = useState<FileType>("pdf");
  const [epubData, setEpubData] = useState<Uint8Array | null>(null);
  const [epubTotalPages, setEpubTotalPages] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineLink[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [pageTranslations, setPageTranslations] = useState<Record<number, PageTranslationState>>(
    {}
  );
  const [docId, setDocId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfScrollAnchor, setPdfScrollAnchor] = useState<"top" | "bottom">("top");
  const [pdfNavTab, setPdfNavTab] = useState<PdfNavTab>(pdfNavPrefs.tab);
  const [scale, setScale] = useState<number>(1);
  const [pdfZoomMode, setPdfZoomMode] = useState<PdfZoomMode>("fit-width");
  const [pdfManualScale, setPdfManualScale] = useState<number>(1);
  const [resolvedPdfScale, setResolvedPdfScale] = useState<number>(1);
  const [settings, setSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] =
    useState<TranslationSettings>(DEFAULT_SETTINGS);
  const [hoverPid, setHoverPid] = useState<string | null>(null);
  const [activePid, setActivePid] = useState<string | null>(null);
  const [documentStatusMessage, setDocumentStatusMessage] = useState<string | null>(null);
  const [translationStatusMessage, setTranslationStatusMessage] = useState<string | null>(null);
  const [readerPanels, setReaderPanels] = useState(DEFAULT_READER_PANELS);
  const [readerColumnWeights, setReaderColumnWeights] = useState<ReaderColumnWeightsByLayout>({});
  const [readerRailSectionWeights, setReaderRailSectionWeights] =
    useState<ReaderRailSectionWeightsByLayout>({});
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presetApiKeyDrafts, setPresetApiKeyDrafts] = useState<Record<string, string>>({});
  const [presetStatuses, setPresetStatuses] = useState<
    Record<string, PresetTestResult | undefined>
  >({});
  const [presetSaving, setPresetSaving] = useState<boolean>(false);
  const [presetTestRunningId, setPresetTestRunningId] = useState<string | null>(null);
  const [presetModelsLoading, setPresetModelsLoading] = useState<boolean>(false);
  const [presetModels, setPresetModels] = useState<Record<string, string[]>>({});
  const [testAllPresetsRunning, setTestAllPresetsRunning] = useState<boolean>(false);
  const [scrollToTranslationPage, setScrollToTranslationPage] = useState<number | null>(null);
  const [wordTranslation, setWordTranslation] = useState<WordTranslation | null>(null);
  const [selectionTranslation, setSelectionTranslation] = useState<SelectionTranslation | null>(
    null
  );
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [epubToc, setEpubToc] = useState<NavItem[]>([]);
  const [epubCurrentChapter, setEpubCurrentChapter] = useState<string>("");
  const [pendingEpubNavigationHref, setPendingEpubNavigationHref] = useState<string | null>(null);
  const [pendingEpubScroll, setPendingEpubScroll] = useState<{ href: string; requestId: number } | null>(null);
  const [cachedPageTranslations, setCachedPageTranslations] = useState<number[]>([]);
  const [translateAllDialogOpen, setTranslateAllDialogOpen] = useState(false);
  const [translateAllCachedCount, setTranslateAllCachedCount] = useState(0);
  const [isTranslateAllRunning, setIsTranslateAllRunning] = useState(false);
  const [activeColumnResizeKey, setActiveColumnResizeKey] = useState<string | null>(null);
  const [activeRailResizeKey, setActiveRailResizeKey] = useState<string | null>(null);

  const pagesRef = useRef<PageDoc[]>([]);
  const pageTranslationsRef = useRef<Record<number, PageTranslationState>>({});
  const cachedPageTranslationsRef = useRef<number[]>([]);
  const textTranslationCacheRef = useRef(new LRUCache<string, string>(100));
  const settingsRef = useRef(settings);
  const docIdRef = useRef(docId);
  const epubViewerRef = useRef<EpubViewerHandle>(null);
  const translationRequestId = useRef(0);
  const translatingRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const translateQueueRef = useRef<string[]>([]);
  const foregroundPageTranslateQueueRef = useRef<number[]>([]);
  const backgroundPageTranslateQueueRef = useRef<number[]>([]);
  const pageTranslationRequestVersionsRef = useRef<Record<number, number>>({});
  const pageTranslationInFlightRef = useRef<number | null>(null);
  const pageTranslatingRef = useRef(false);
  const isTranslateAllRunningRef = useRef(false);
  const pdfTranslationSessionRef = useRef(0);
  const cachedPageLookupRequestIdRef = useRef(0);
  const pdfOutlineRequestIdRef = useRef(0);
  const pdfLoadRequestIdRef = useRef(0);
  const epubScrollRequestIdRef = useRef(0);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const readerHeaderRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Record<ReaderColumnKey, HTMLElement | null>>({
    navigation: null,
    original: null,
    rail: null,
  });
  const railSectionRefs = useRef<Record<ReaderRailSectionKey, HTMLElement | null>>({
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

  const persistPdfNavPrefs = useCallback(
    () => {
      savePdfNavigationPrefs({
        ...pdfNavPrefs,
        tab: pdfNavTab,
      });
    },
    [pdfNavPrefs, pdfNavTab]
  );

  const requestTranslationScroll = useCallback((page: number) => {
    setScrollToTranslationPage(null);
    window.requestAnimationFrame(() => {
      setScrollToTranslationPage(page);
    });
  }, []);

  const normalizeHref = useCallback((href: string) => href.split("#")[0], []);

  const matchHref = useCallback(
    (targetHref: string, sourceHref: string) => {
      const target = normalizeHref(targetHref);
      const source = normalizeHref(sourceHref);
      return target === source || target.endsWith(source) || source.endsWith(target);
    },
    [normalizeHref]
  );

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    pageTranslationsRef.current = pageTranslations;
  }, [pageTranslations]);

  useEffect(() => {
    cachedPageTranslationsRef.current = cachedPageTranslations;
  }, [cachedPageTranslations]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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

  const allPdfPagesExtracted = useMemo(
    () => currentFileType === "pdf" && pages.length > 0 && pages.every((page) => page.isExtracted),
    [currentFileType, pages]
  );

  const pageTranslationProgress = useMemo(
    () =>
      getPageTranslationProgress({
        pages,
        pageTranslations,
        cachedPages: cachedPageTranslations,
      }),
    [cachedPageTranslations, pageTranslations, pages]
  );

  const epubSectionTranslationProgress = useMemo(
    () => getEpubSectionTranslationProgress(pages),
    [pages]
  );

  const translationProgress = useMemo(
    () => (currentFileType === "pdf" ? pageTranslationProgress : epubSectionTranslationProgress),
    [currentFileType, epubSectionTranslationProgress, pageTranslationProgress]
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
  }, [allPdfPagesExtracted, currentFileType, translationProgress]);

  const translateAllActionLabel = useMemo(
    () => getFullBookActionLabel(translationProgress),
    [translationProgress]
  );

  const currentPdfPagePayload = useMemo(() => {
    if (currentFileType !== "pdf" || pages.length === 0) {
      return null;
    }

    return buildPageTranslationPayload(pages, currentPage);
  }, [currentFileType, currentPage, pages]);

  const canRedoCurrentPage =
    currentFileType === "pdf" &&
    allPdfPagesExtracted &&
    Boolean(currentPdfPagePayload && hasUsablePageText(currentPdfPagePayload.displayText));

  const canTranslateAll =
    ((currentFileType === "pdf" && allPdfPagesExtracted) || currentFileType === "epub") &&
    translationProgress.totalCount > 0;

  const visibleReaderColumns = useMemo(
    () => getVisibleReaderColumns(readerPanels),
    [readerPanels]
  );

  const visibleRailSections = useMemo(
    () => getVisibleRailSections(readerPanels),
    [readerPanels]
  );

  const currentColumnLayoutKey = useMemo(
    () => getReaderColumnLayoutKey(visibleReaderColumns),
    [visibleReaderColumns]
  );

  const currentRailLayoutKey = useMemo(
    () => getReaderRailLayoutKey(visibleRailSections),
    [visibleRailSections]
  );

  const currentColumnWeights = useMemo(
    () => resolveReaderColumnWeights(readerColumnWeights, visibleReaderColumns),
    [readerColumnWeights, visibleReaderColumns]
  );

  const currentRailSectionWeights = useMemo(
    () => resolveReaderRailSectionWeights(readerRailSectionWeights, visibleRailSections),
    [readerRailSectionWeights, visibleRailSections]
  );

  const workspaceMinWidth = useMemo(
    () => getReaderWorkspaceMinWidth(readerPanels),
    [readerPanels]
  );

  const workspaceMinHeight = useMemo(
    () => getReaderWorkspaceMinHeight(readerPanels),
    [readerPanels]
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
    []
  );

  const setRailSectionElementRef = useCallback(
    (section: ReaderRailSectionKey) => (element: HTMLElement | null) => {
      railSectionRefs.current[section] = element;
    },
    []
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
    [currentColumnWeights, readerPanels, visibleReaderColumns]
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
    [currentRailSectionWeights, visibleRailSections]
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
    [currentColumnLayoutKey, visibleReaderColumns]
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
        const currentWeights = resolveReaderColumnWeights(prev, resizeState.visibleColumns);

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
    [currentRailLayoutKey, visibleRailSections]
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
        const currentWeights = resolveReaderRailSectionWeights(prev, resizeState.visibleSections);

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
      const resolved = settings.theme === "system" ? systemTheme : settings.theme;
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
      void getCurrentWindow().setSizeConstraints(null).catch(() => {});
      return;
    }

    const shellStyles = window.getComputedStyle(shell);
    const paddingX =
      Number.parseFloat(shellStyles.paddingLeft || "0") +
      Number.parseFloat(shellStyles.paddingRight || "0");
    const paddingY =
      Number.parseFloat(shellStyles.paddingTop || "0") +
      Number.parseFloat(shellStyles.paddingBottom || "0");
    const rowGap = Number.parseFloat(shellStyles.rowGap || shellStyles.gap || "0");
    const headerHeight = Math.ceil(readerHeaderRef.current?.getBoundingClientRect().height ?? 0);
    const minWidth = Math.ceil(workspaceMinWidth + paddingX);
    const minHeight = Math.ceil(workspaceMinHeight + paddingY + headerHeight + rowGap);

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
        setSavedSettingsSnapshot(normalizedSettings);
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
      });
  }, []);

  const activePreset = useMemo(() => getActivePreset(settings), [settings]);

  const buildPersistableSettings = useCallback(
    (nextSettings: TranslationSettings) =>
      serializeSettingsForCommand({
        ...nextSettings,
        presets: nextSettings.presets.map((preset) => {
        const draftApiKey = presetApiKeyDrafts[preset.id]?.trim();
        return draftApiKey ? { ...preset, apiKey: draftApiKey } : preset;
        }),
      }),
    [presetApiKeyDrafts]
  );

  const persistSettings = useCallback(
    async (
      nextSettings: TranslationSettings,
      options?: {
        showSaving?: boolean;
        clearDrafts?: boolean;
      }
    ) => {
      if (options?.showSaving) {
        setPresetSaving(true);
      }

      try {
        const saved = (await invoke("save_app_settings", {
          settings: buildPersistableSettings(nextSettings),
        })) as TranslationSettings;
        const normalizedSettings = normalizeSettingsFromStorage(saved);
        setSettings(normalizedSettings);
        setSavedSettingsSnapshot(normalizedSettings);
        if (options?.clearDrafts) {
          setPresetApiKeyDrafts({});
        }
        return normalizedSettings;
      } catch (error) {
        console.error("Failed to save settings:", error);
        if (activePreset) {
          setPresetStatuses((prev) => ({
            ...prev,
            [activePreset.id]: {
              presetId: activePreset.id,
              label: activePreset.label,
              ok: false,
              message: `Save failed: ${String(error)}`,
            },
          }));
        }
        throw error;
      } finally {
        if (options?.showSaving) {
          setPresetSaving(false);
        }
      }
    },
    [activePreset, buildPersistableSettings]
  );

  const getPresetDraft = useCallback(
    (preset: TranslationPreset) => {
      const draftApiKey = presetApiKeyDrafts[preset.id]?.trim();
      return serializePresetForCommand(
        draftApiKey ? { ...preset, apiKey: draftApiKey } : preset
      );
    },
    [presetApiKeyDrafts]
  );

  const handleThemeToggle = useCallback(() => {
    const nextSettings = {
      ...settings,
      theme: getNextThemeMode(settings.theme),
    };
    setSettings(nextSettings);
    void persistSettings(nextSettings);
  }, [persistSettings, settings]);

  const loadPdfFromPath = useCallback(async (filePath: string, startPage?: number) => {
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
    setCachedPageTranslations([]);
    setTranslateAllDialogOpen(false);
    setTranslateAllCachedCount(0);
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    translationRequestId.current = 0;
    translatingRef.current = false;
    translateQueueRef.current = [];
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    pdfTranslationSessionRef.current += 1;
    cachedPageLookupRequestIdRef.current += 1;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    try {
      setLoadingProgress(5);
      const rawBytes = (await invoke("read_pdf_file", { path: filePath })) as number[];
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
            getPageNumberFromDest: (dest) => resolvePdfDestinationPage(dest, doc),
          })
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

          const { paragraphs, watermarks } = await extractPageParagraphs(page, nextDocId, i - 1);

          if (isStaleLoad()) {
            return;
          }

          setPages((prev) =>
            prev.map((entry) =>
              entry.page === i
                ? { ...entry, paragraphs, watermarks, isExtracted: true }
                : entry
            )
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
      setDocumentStatusMessage("Failed to load PDF. The file may have been moved or deleted.");
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
  }, [releasePdfDocument]);

  const loadEpubFromPath = useCallback(async (filePath: string, startPage?: number) => {
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
    setCachedPageTranslations([]);
    setSelectionTranslation(null);
    setLoadingProgress(0);
    setDocumentStatusMessage(getReaderStatusLabel("loading-document"));
    setTranslationStatusMessage(null);
    setPdfScrollAnchor("top");
    setPendingEpubScroll(null);
    setScrollToTranslationPage(null);
    setTranslateAllDialogOpen(false);
    setTranslateAllCachedCount(0);
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    translationRequestId.current = 0;
    translatingRef.current = false;
    translateQueueRef.current = [];
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    cachedPageLookupRequestIdRef.current += 1;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    try {
      const rawBytes = (await invoke("read_pdf_file", { path: filePath })) as number[];
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
      setDocumentStatusMessage("Failed to load EPUB. The file may have been moved or deleted.");
      setLoadingProgress(null);
    }
  }, []);

  const handleEpubMetadata = useCallback(async (metadata: { title: string; author?: string; coverImage?: string }) => {
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
  }, [docId, currentFilePath, epubTotalPages]);

  const handleEpubParagraphs = useCallback((paragraphs: EpubParagraph[]) => {
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
      const startsNewSection = Boolean(chunkHref && nextHref && !matchHref(chunkHref, nextHref));
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
  }, [matchHref]);

  const handleEpubPageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setEpubTotalPages(total);
  }, []);

  const handleEpubLoadingProgress = useCallback((progress: number | null) => {
    setLoadingProgress(progress);
    setDocumentStatusMessage(
      progress === null ? null : getReaderStatusLabel("loading-document")
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

    const ext = selection.split('.').pop()?.toLowerCase();
    if (ext === 'epub') {
      await loadEpubFromPath(selection);
    } else {
      await loadPdfFromPath(selection);
    }
  }, [loadPdfFromPath, loadEpubFromPath]);

  const handleOpenBook = useCallback(async (book: RecentBook) => {
    if (book.fileType === 'epub') {
      await loadEpubFromPath(book.filePath, book.lastPage);
    } else {
      await loadPdfFromPath(book.filePath, book.lastPage);
    }
  }, [loadPdfFromPath, loadEpubFromPath]);

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
    setCachedPageTranslations([]);
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
    setTranslateAllDialogOpen(false);
    setTranslateAllCachedCount(0);
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    cachedPageLookupRequestIdRef.current += 1;
  }, [docId, pdfDoc, epubTotalPages, currentPage]);

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
      .map((p) => `--- Page ${p.page} ---\n${p.paragraphs.map((para) => para.source).join("\n\n")}`)
      .join("\n\n");
  }, [pages, currentPage]);

  const handlePresetSelect = useCallback((presetId: string) => {
    setSettings((prev) => ({
      ...prev,
      activePresetId: presetId,
    }));
  }, []);

  const handleAddPreset = useCallback(() => {
    let createdPreset: TranslationPreset | undefined;

    setSettings((prev) => {
      const nextPreset = createPresetDraft("openai-compatible", prev.presets);
      createdPreset = nextPreset;
      return {
        ...prev,
        activePresetId: nextPreset.id,
        presets: [...prev.presets, nextPreset],
      };
    });

    if (!createdPreset) {
      return "";
    }

    const nextPreset = createdPreset;
    setPresetStatuses((prev) => ({
      ...prev,
      [nextPreset.id]: undefined,
    }));

    return nextPreset.id;
  }, []);

  const handleDeletePreset = useCallback((presetId: string) => {
    setSettings((prev) => {
      const nextPresets = prev.presets.filter((preset) => preset.id !== presetId);
      const nextActivePresetId =
        prev.activePresetId !== presetId
          ? nextPresets.some((preset) => preset.id === prev.activePresetId)
            ? prev.activePresetId
            : (nextPresets[0]?.id ?? "")
          : (nextPresets[0]?.id ?? "");

      return {
        ...prev,
        activePresetId: nextActivePresetId,
        presets: nextPresets,
      };
    });
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
  }, []);

  const handleDiscardPresetEdits = useCallback((presetId: string) => {
    setSettings((prev) =>
      discardUnsavedPresetEdits({
        settings: prev,
        savedSettings: savedSettingsSnapshot,
        presetId,
      })
    );
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
  }, [savedSettingsSnapshot]);

  const handlePresetChange = useCallback((nextPreset: TranslationPreset) => {
    const currentPreset = settings.presets.find((preset) => preset.id === nextPreset.id);
    const providerChanged =
      currentPreset?.providerKind !== undefined &&
      currentPreset.providerKind !== nextPreset.providerKind;

    setSettings((prev) => {
      const candidate =
        providerChanged
          ? {
              ...nextPreset,
              model: "",
              baseUrl:
                nextPreset.providerKind === "openai-compatible"
                  ? nextPreset.baseUrl
                  : undefined,
            }
          : nextPreset;

      return {
        ...prev,
        presets: prev.presets.map((preset) =>
          preset.id === candidate.id
            ? normalizePresetDraft(candidate, prev.presets)
            : preset
        ),
      };
    });

    setPresetStatuses((prev) => ({
      ...prev,
      [nextPreset.id]: undefined,
    }));

    if (providerChanged) {
      setPresetModels((prev) => {
        const { [nextPreset.id]: _removed, ...rest } = prev;
        return rest;
      });
    }
  }, [settings.presets]);

  const handleSaveSettings = useCallback(async () => {
    await persistSettings(settings, {
      showSaving: true,
      clearDrafts: true,
    });
  }, [persistSettings, settings]);

  const handleFetchPresetModels = useCallback(async () => {
    if (!activePreset) return;

    setPresetModelsLoading(true);
    setPresetStatuses((prev) => ({
      ...prev,
      [activePreset.id]: undefined,
    }));

    try {
      const models = (await invoke("list_preset_models", {
        preset: getPresetDraft(activePreset),
      })) as string[];

      setPresetModels((prev) => ({
        ...prev,
        [activePreset.id]: models,
      }));
      setPresetStatuses((prev) => ({
        ...prev,
        [activePreset.id]: undefined,
      }));
    } catch (error) {
      console.error("Failed to fetch preset models:", error);
      setPresetStatuses((prev) => ({
        ...prev,
        [activePreset.id]: {
          presetId: activePreset.id,
          label: activePreset.label,
          ok: false,
          message: "Model fetch failed. Manual model entry still works.",
        },
      }));
    } finally {
      setPresetModelsLoading(false);
    }
  }, [activePreset, getPresetDraft]);

  const handleTestPreset = useCallback(async () => {
    if (!activePreset) return;

    setPresetTestRunningId(activePreset.id);
    setPresetStatuses((prev) => ({
      ...prev,
      [activePreset.id]: undefined,
    }));

    try {
      const result = (await invoke("test_translation_preset", {
        preset: getPresetDraft(activePreset),
      })) as PresetTestResult;
      setPresetStatuses((prev) => ({
        ...prev,
        [result.presetId]: result,
      }));
    } catch (error) {
      console.error("Failed to test preset:", error);
      setPresetStatuses((prev) => ({
        ...prev,
        [activePreset.id]: {
          presetId: activePreset.id,
          label: activePreset.label,
          ok: false,
          message: String(error),
        },
      }));
    } finally {
      setPresetTestRunningId((current) =>
        current === activePreset.id ? null : current
      );
    }
  }, [activePreset, getPresetDraft]);

  const handleTestAllPresets = useCallback(async () => {
    setTestAllPresetsRunning(true);

    try {
      const results = (await invoke("test_all_translation_presets", {
        presets: settings.presets.map((preset) => getPresetDraft(preset)),
      })) as PresetTestResult[];

      setPresetStatuses((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((result) => [result.presetId, result])),
      }));
    } catch (error) {
      console.error("Failed to test all presets:", error);
    } finally {
      setTestAllPresetsRunning(false);
    }
  }, [getPresetDraft, settings.presets]);

  const activeSavedPreset = useMemo(
    () =>
      activePreset
        ? savedSettingsSnapshot.presets.find((preset) => preset.id === activePreset.id)
        : undefined,
    [activePreset, savedSettingsSnapshot.presets]
  );

  const activePresetIsSaved = useMemo(
    () =>
      isPresetUnchangedFromSavedState({
        preset: activePreset,
        savedPreset: activeSavedPreset,
        apiKeyInput: activePreset ? presetApiKeyDrafts[activePreset.id] ?? "" : "",
      }),
    [activePreset, activeSavedPreset, presetApiKeyDrafts]
  );

  const discardAllUnsavedSettings = useCallback(() => {
    setSettings(savedSettingsSnapshot);
    setPresetApiKeyDrafts({});
    setPresetStatuses({});
    setPresetModels({});
  }, [savedSettingsSnapshot]);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        discardAllUnsavedSettings();
      }

      setSettingsOpen(open);
    },
    [discardAllUnsavedSettings]
  );

  const handleSettingsDone = useCallback(async () => {
    await handleSaveSettings();
    setSettingsOpen(false);
  }, [handleSaveSettings]);

  useEffect(() => {
    if (currentFileType !== "pdf") return;
    setPageTranslations({});
    setSelectionTranslation(null);
    setCachedPageTranslations([]);
    setTranslateAllDialogOpen(false);
    setTranslateAllCachedCount(0);
    isTranslateAllRunningRef.current = false;
    setIsTranslateAllRunning(false);
    foregroundPageTranslateQueueRef.current = [];
    backgroundPageTranslateQueueRef.current = [];
    pageTranslationRequestVersionsRef.current = {};
    pageTranslationInFlightRef.current = null;
    pageTranslatingRef.current = false;
    pdfTranslationSessionRef.current += 1;
    cachedPageLookupRequestIdRef.current += 1;
  }, [
    activePreset?.id,
    activePreset?.model,
    currentFileType,
    docId,
    settings.defaultLanguage.code,
  ]);

  useEffect(() => {
    if (currentFileType !== "pdf" || pages.length === 0) return;
    setCurrentPage((prev) => clampPage(prev, pages.length));
  }, [currentFileType, pages.length]);

  const buildPdfPageCacheLookups = useCallback(() => {
    return pagesRef.current
      .filter((page) => page.isExtracted)
      .map((page) => {
        const payload = buildPageTranslationPayload(pagesRef.current, page.page);
        return {
          page: page.page,
          displayText: payload.displayText,
        };
      })
      .filter((page) => hasUsablePageText(page.displayText));
  }, []);

  const runPageTranslationQueue = useCallback(async () => {
    if (currentFileType !== "pdf" || pageTranslatingRef.current || !docIdRef.current) {
      return;
    }

    const queued = dequeueNextPage({
      foregroundQueue: foregroundPageTranslateQueueRef.current,
      backgroundQueue: backgroundPageTranslateQueueRef.current,
      inFlightPages:
        pageTranslationInFlightRef.current === null ? [] : [pageTranslationInFlightRef.current],
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
    if (!hasUsablePageText(payload.displayText)) {
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

    const sessionId = pdfTranslationSessionRef.current;
    const requestVersion = pageTranslationRequestVersionsRef.current[nextPage] ?? 0;
    pageTranslatingRef.current = true;
    pageTranslationInFlightRef.current = nextPage;
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
        error: undefined,
      },
    }));
    setTranslationStatusMessage(getReaderStatusLabel("translating-page", { page: nextPage }));
    let didError = false;

    try {
      const currentSettings = settingsRef.current;
      const currentPreset = getActivePreset(currentSettings);
      if (!currentPreset) {
        throw new Error("No active preset configured.");
      }

      const result = (await invoke("translate_page_text", {
        presetId: currentPreset.id,
        model: currentPreset.model,
        temperature: 0,
        targetLanguage: currentSettings.defaultLanguage,
        docId: docIdRef.current,
        page: nextPage,
        displayText: payload.displayText,
        previousContext: payload.previousContext,
        nextContext: payload.nextContext,
      })) as PageTranslationResult;

      if (
        sessionId !== pdfTranslationSessionRef.current ||
        !isRequestVersionCurrent(pageTranslationRequestVersionsRef.current, nextPage, requestVersion)
      ) {
        return;
      }

      setPageTranslations((prev) => ({
        ...prev,
        [nextPage]: {
          page: nextPage,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          translatedText: result.translatedText,
          status: "done",
          isCached: result.isCached,
        },
      }));
      if (result.isCached) {
        setCachedPageTranslations((prev) =>
          prev.includes(nextPage) ? prev : [...prev, nextPage].sort((a, b) => a - b)
        );
      }
    } catch (error) {
      if (
        sessionId !== pdfTranslationSessionRef.current ||
        !isRequestVersionCurrent(pageTranslationRequestVersionsRef.current, nextPage, requestVersion)
      ) {
        return;
      }

      didError = true;
      setPageTranslations((prev) => ({
        ...prev,
        [nextPage]: {
          page: nextPage,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          status: "error",
          error: String(error),
        },
      }));
      setTranslationStatusMessage(`Translation error: ${String(error)}`);
    } finally {
      pageTranslatingRef.current = false;
      pageTranslationInFlightRef.current = null;
      if (
        isTranslateAllRunningRef.current &&
        backgroundPageTranslateQueueRef.current.length === 0
      ) {
        isTranslateAllRunningRef.current = false;
        setIsTranslateAllRunning(false);
        if (!didError) {
          setTranslationStatusMessage(null);
        }
      }
      if (
        foregroundPageTranslateQueueRef.current.length > 0 ||
        backgroundPageTranslateQueueRef.current.length > 0
      ) {
        void runPageTranslationQueue();
      } else if (!didError) {
        setTranslationStatusMessage(null);
      }
    }
  }, [currentFileType]);

  const queuePagesForTranslation = useCallback(
    (
      pageNumbers: number[],
      options: {
        priority: "foreground" | "background";
        forceFresh?: boolean;
      } = { priority: "foreground" }
    ) => {
      if (currentFileType !== "pdf") return;

      let nextForegroundQueue = [...foregroundPageTranslateQueueRef.current];
      let nextBackgroundQueue = [...backgroundPageTranslateQueueRef.current];
      let nextRequestVersions = pageTranslationRequestVersionsRef.current;
      const nextCachedPages = new Set(cachedPageTranslationsRef.current);
      const updates: Record<number, PageTranslationState> = {};
      const orderedPages =
        options.priority === "foreground" ? [...pageNumbers].reverse() : pageNumbers;

      for (const pageNumber of orderedPages) {
        const pageDoc = pagesRef.current.find((entry) => entry.page === pageNumber);
        if (!pageDoc?.isExtracted) continue;

        const payload = buildPageTranslationPayload(pagesRef.current, pageNumber);
        const existing = pageTranslationsRef.current[pageNumber];
        const inputChanged =
          existing?.displayText !== payload.displayText ||
          existing?.previousContext !== payload.previousContext ||
          existing?.nextContext !== payload.nextContext;
        const shouldForceFresh = Boolean(options.forceFresh || inputChanged);

        if (!hasUsablePageText(payload.displayText)) {
          updates[pageNumber] = {
            page: pageNumber,
            displayText: payload.displayText,
            previousContext: payload.previousContext,
            nextContext: payload.nextContext,
            status: "unavailable",
          };
          continue;
        }

        if (shouldForceFresh) {
          const bumpedVersion = bumpRequestVersion(nextRequestVersions, pageNumber);
          nextRequestVersions = bumpedVersion.versions;
          nextCachedPages.delete(pageNumber);
        }

        const nextState: PageTranslationState = {
          page: pageNumber,
          displayText: payload.displayText,
          previousContext: payload.previousContext,
          nextContext: payload.nextContext,
          translatedText: shouldForceFresh ? undefined : existing?.translatedText,
          status: shouldForceFresh ? "idle" : existing?.status ?? "idle",
          isCached: shouldForceFresh ? false : existing?.isCached,
          error: shouldForceFresh ? undefined : existing?.error,
        };
        updates[pageNumber] = nextState;

        const alreadyTranslated =
          !shouldForceFresh &&
          (nextCachedPages.has(pageNumber) || nextState.status === "done");
        const alreadyLoading = !shouldForceFresh && nextState.status === "loading";

        if (alreadyTranslated || alreadyLoading || nextState.status === "unavailable") {
          continue;
        }

        if (options.priority === "foreground") {
          nextForegroundQueue = enqueueForegroundPage(nextForegroundQueue, pageNumber);
        } else {
          nextBackgroundQueue = enqueueBackgroundPages(nextBackgroundQueue, [pageNumber]);
        }
      }

      if (Object.keys(updates).length > 0) {
        setPageTranslations((prev) => ({ ...prev, ...updates }));
      }

      pageTranslationRequestVersionsRef.current = nextRequestVersions;
      foregroundPageTranslateQueueRef.current = nextForegroundQueue;
      backgroundPageTranslateQueueRef.current = nextBackgroundQueue;
      const sortedCachedPages = Array.from(nextCachedPages).sort((a, b) => a - b);
      setCachedPageTranslations((prev) =>
        prev.length === sortedCachedPages.length &&
        prev.every((page, index) => page === sortedCachedPages[index])
          ? prev
          : sortedCachedPages
      );

      if (
        !pageTranslatingRef.current &&
        (nextForegroundQueue.length > 0 || nextBackgroundQueue.length > 0)
      ) {
        void runPageTranslationQueue();
      }
    },
    [currentFileType, runPageTranslationQueue]
  );

  useEffect(() => {
    if (currentFileType !== "pdf" || !pdfDoc || pages.length === 0) return;
    queuePagesForTranslation(getPagesToTranslate(currentPage, pages.length), {
      priority: "foreground",
    });
  }, [currentFileType, currentPage, pages, pdfDoc, queuePagesForTranslation]);

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

  useEffect(() => {
    if (currentFileType !== "pdf" || !docId || !allPdfPagesExtracted) return;

    const requestId = ++cachedPageLookupRequestIdRef.current;
    const pageLookups = buildPdfPageCacheLookups();

    if (pageLookups.length === 0) {
      setCachedPageTranslations([]);
      return;
    }

    if (!activePreset) {
      setCachedPageTranslations([]);
      return;
    }

    invoke<number[]>("list_cached_page_translations", {
      presetId: activePreset.id,
      model: activePreset.model,
      targetLanguage: settings.defaultLanguage,
      docId,
      pages: pageLookups,
    })
      .then((cachedPages) => {
        if (requestId !== cachedPageLookupRequestIdRef.current) {
          return;
        }

        setCachedPageTranslations(cachedPages.sort((a, b) => a - b));
      })
      .catch((error) => {
        if (requestId !== cachedPageLookupRequestIdRef.current) {
          return;
        }

        console.error("Failed to list cached page translations:", error);
        setCachedPageTranslations([]);
      });
  }, [
    allPdfPagesExtracted,
    activePreset,
    buildPdfPageCacheLookups,
    currentFileType,
    docId,
    settings.defaultLanguage,
  ]);

  const startTranslateAll = useCallback(
    async (mode: "skip-cached" | "replace-all") => {
      if (currentFileType !== "pdf" || !docIdRef.current) {
        return;
      }

      const pageLookups = buildPdfPageCacheLookups();
      const pageNumbers = pageLookups.map((page) => page.page);
      if (pageNumbers.length === 0) {
        return;
      }

      isTranslateAllRunningRef.current = true;
      setIsTranslateAllRunning(true);

      if (mode === "replace-all") {
        try {
          const currentPreset = getActivePreset(settingsRef.current);
          if (!currentPreset) {
            throw new Error("No active preset configured.");
          }

          await invoke("clear_document_page_translations", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            targetLanguage: settingsRef.current.defaultLanguage,
            docId: docIdRef.current,
          });
        } catch (error) {
          setTranslationStatusMessage(`Failed to reset page translation cache: ${String(error)}`);
          isTranslateAllRunningRef.current = false;
          setIsTranslateAllRunning(false);
          return;
        }

        setCachedPageTranslations([]);
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

      setTranslateAllDialogOpen(false);
      setTranslateAllCachedCount(0);
    },
    [buildPdfPageCacheLookups, currentFileType, queuePagesForTranslation]
  );

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

      try {
        const currentPreset = getActivePreset(settingsRef.current);
        if (!currentPreset) {
          throw new Error("No active preset configured.");
        }

        await invoke("clear_cached_page_translation", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          targetLanguage: settingsRef.current.defaultLanguage,
          docId: docIdRef.current,
          page: pageNumber,
        });
      } catch (error) {
        setTranslationStatusMessage(`Failed to reset page translation cache: ${String(error)}`);
        return;
      }

      setCachedPageTranslations((prev) => prev.filter((cachedPage) => cachedPage !== pageNumber));
      queuePagesForTranslation([pageNumber], {
        priority: "foreground",
        forceFresh: true,
      });
      setTranslationStatusMessage(getReaderStatusLabel("redoing-page", { page: pageNumber }));
    },
    [currentFileType, queuePagesForTranslation]
  );

  const handleTranslateAllAction = useCallback(() => {
    if (isTranslateAllRunningRef.current) {
      return;
    }

    if (currentFileType === "epub") {
      if (translatingRef.current) {
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
          shouldRetranslateAll ? true : paragraph.status === "idle" || paragraph.status === "error"
        )
        .map((paragraph) => paragraph.pid);

      if (paragraphIds.length === 0) {
        return;
      }

      if (shouldRetranslateAll) {
        pagesRef.current = nextPages;
        setPages(nextPages);
      }

      isTranslateAllRunningRef.current = true;
      setIsTranslateAllRunning(true);
      setTranslationStatusMessage(
        shouldRetranslateAll ? "Retranslating all sections..." : "Translating all sections..."
      );
      translateQueueRef.current = Array.from(new Set([...translateQueueRef.current, ...paragraphIds]));
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

    const cachedPagesOutsideCurrent = cachedPageTranslationsRef.current.filter(
      (page) => page !== currentPage
    );

    if (cachedPagesOutsideCurrent.length > 0) {
      setTranslateAllCachedCount(cachedPagesOutsideCurrent.length);
      setTranslateAllDialogOpen(true);
      return;
    }

    void startTranslateAll("skip-cached");
  }, [
    allPdfPagesExtracted,
    currentFileType,
    currentPage,
    startTranslateAll,
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
        const currentPreset = getActivePreset(settingsRef.current);
        if (!currentPreset) {
          throw new Error("No active preset configured.");
        }

        const translation = (await invoke("translate_selection_text", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          targetLanguage: settingsRef.current.defaultLanguage,
          text: selection.text,
        })) as string;

        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          translation,
        });
      } catch (error) {
        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          error: String(error),
        });
      }
    },
    []
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
      setSelectionTranslation(null);
    },
    [currentFileType, currentPage, pages.length]
  );

  const handlePdfPageTurnRequest = useCallback(
    (direction: PdfPageTurnDirection) => {
      const nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;
      handlePdfPageChange(nextPage, { anchor: direction === "next" ? "top" : "bottom" });
    },
    [currentPage, handlePdfPageChange]
  );

  const runTranslateQueue = useCallback(async () => {
    if (translatingRef.current) return;
    if (!docIdRef.current) return;

    const uniqueQueue = Array.from(new Set(translateQueueRef.current));
    translateQueueRef.current = [];
    if (uniqueQueue.length === 0) return;

    const pending = pagesRef.current
      .flatMap((page) => page.paragraphs)
      .filter(
        (para) =>
          uniqueQueue.includes(para.pid) &&
          (para.status === "idle" || para.status === "error")
      );

    if (pending.length === 0) return;

    translatingRef.current = true;
    const requestId = ++translationRequestId.current;
    const isBulkRun = currentFileType === "epub" && isTranslateAllRunningRef.current;

    setPages((prev) =>
      prev.map((page) => ({
        ...page,
        paragraphs: page.paragraphs.map((para) =>
          pending.some((item) => item.pid === para.pid)
            ? { ...para, status: "loading" as const }
            : para
        ),
      }))
    );
    if (currentFileType === "epub") {
      setTranslationStatusMessage(
        isBulkRun ? "Translating all sections..." : getReaderStatusLabel("translating-section")
      );
    }

    let didError = false;
    try {
      const payload = pending.map((para) => ({ sid: para.pid, text: para.source }));
      const invokeWithTimeout = <T,>(promise: Promise<T>, timeoutMs: number) => {
        let timeoutId: number | undefined;
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("Translation timed out.")), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
          if (timeoutId) window.clearTimeout(timeoutId);
        });
      };
      const currentSettings = settingsRef.current;
      const currentPreset = getActivePreset(currentSettings);
      if (!currentPreset) {
        throw new Error("No active preset configured.");
      }
      const results = (await invokeWithTimeout(
        invoke("openrouter_translate", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          temperature: 0,
          targetLanguage: currentSettings.defaultLanguage,
          sentences: payload,
        }) as Promise<{ sid: string; translation: string }[]>,
        60000
      )) as { sid: string; translation: string }[];

      if (translationRequestId.current !== requestId) {
        setPages((prev) =>
          prev.map((page) => ({
            ...page,
            paragraphs: page.paragraphs.map((para) =>
              pending.some((item) => item.pid === para.pid) && para.status === "loading"
                ? { ...para, status: "idle" as const }
                : para
            ),
          }))
        );
        return;
      }

      const translationMap = new Map(results.map((item) => [item.sid, item.translation]));
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
        }))
      );
    } catch (error) {
      didError = true;
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          paragraphs: page.paragraphs.map((para) =>
            pending.some((item) => item.pid === para.pid)
              ? { ...para, status: "error" as const }
              : para
          ),
        }))
      );
      const errorText = String(error);
      const friendlyMessage =
        errorText.includes("API key is missing") || errorText.includes("openrouter_key.txt")
        ? "API key is not configured for the active preset."
        : `Translation error: ${errorText}`;
      setTranslationStatusMessage(friendlyMessage);
    } finally {
      translatingRef.current = false;
      if (translateQueueRef.current.length > 0) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void runTranslateQueue();
        }, 0);
      } else {
        if (isBulkRun) {
          isTranslateAllRunningRef.current = false;
          setIsTranslateAllRunning(false);
        }
        if (!didError) {
          setTranslationStatusMessage(null);
        }
      }
    }
  }, [currentFileType]);

  const handleTranslatePid = useCallback(
    (pid: string, forceRetry = false) => {
      if (!docIdRef.current) return;
      const para = pagesRef.current
        .flatMap((page) => page.paragraphs)
        .find((item) => item.pid === pid);
      if (!para) return;
      // Allow retry for error status, or force retry
      if (para.status === "loading") return;
      if (para.status === "done" && !forceRetry) return;

      translateQueueRef.current = Array.from(new Set([...translateQueueRef.current, pid]));
      if (currentFileType === "epub") {
        setTranslationStatusMessage(getReaderStatusLabel("translating-section"));
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void runTranslateQueue();
      }, 400);
    },
    [currentFileType, runTranslateQueue]
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
    [currentFileType, readerPanels.original, requestTranslationScroll]
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
          setWordTranslation({ word: text, definitions: [{ pos: "", meanings: cached }], position });
        }
        return;
      }

      // Show loading state
      setWordTranslation({ word: text, definitions: [], position, isLoading: true });

      try {
        const currentSettings = settingsRef.current;
        const currentPreset = getActivePreset(currentSettings);
        if (!currentPreset) {
          throw new Error("No active preset configured.");
        }

        if (isSingleWord) {
          // Use dictionary lookup for single words
          const result = (await invoke("openrouter_word_lookup", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            targetLanguage: currentSettings.defaultLanguage,
            word: text,
          })) as { phonetic?: string; definitions: WordDefinition[] };

          // Cache the result
          textTranslationCacheRef.current.set(normalizedText, JSON.stringify(result));

          setWordTranslation({
            word: text,
            phonetic: result.phonetic,
            definitions: result.definitions || [],
            position,
          });
        } else {
          // Use regular translation for phrases
          const results = (await invoke("openrouter_translate", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            temperature: 0,
            targetLanguage: currentSettings.defaultLanguage,
            sentences: [{ sid: "text", text }],
          })) as { sid: string; translation: string }[];

          const translation = results[0]?.translation || "Translation failed";

          // Cache the result
          textTranslationCacheRef.current.set(normalizedText, translation);

          setWordTranslation({
            word: text,
            definitions: [{ pos: "", meanings: translation }],
            position,
          });
        }
      } catch (error) {
        setWordTranslation({
          word: text,
          definitions: [{ pos: "", meanings: "Translation failed" }],
          position,
        });
      }
    },
    []
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
    setResolvedPdfScale((prev) => (Math.abs(prev - nextScale) < 0.001 ? prev : nextScale));
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
    [epubHrefToPage, matchHref, normalizeHref, readerPanels.original, requestTranslationScroll]
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
        prev && prev.requestId === pendingEpubScroll.requestId ? null : prev
      );
    }
  }, [currentFileType, pendingEpubScroll, epubHrefToPage, matchHref, normalizeHref, requestTranslationScroll]);

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
            if (!prev.chat || Object.values(prev).filter(Boolean).length === 1) {
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
            setPdfManualScale(clampPdfManualScale(resolvedPdfScale + PDF_KEYBOARD_ZOOM_STEP));
            setPdfZoomMode("custom");
          } else {
            const nextIndex = Math.min(ZOOM_LEVELS.length - 1, currentScaleIndex + 1);
            setScale(ZOOM_LEVELS[nextIndex]);
          }
          return;
        }

        // Cmd/Ctrl + Minus: Zoom out
        if ((e.metaKey || e.ctrlKey) && e.key === "-") {
          e.preventDefault();
          if (currentFileType === "pdf") {
            setPdfManualScale(clampPdfManualScale(resolvedPdfScale - PDF_KEYBOARD_ZOOM_STEP));
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

  const hasInvalidPreset = settings.presets.some(
    (preset) =>
      !getPresetValidationState(preset, presetApiKeyDrafts[preset.id] ?? "").isValid
  );

  const settingsDialogProps = {
    settings,
    activePreset,
    presetApiKeyInput: activePreset ? presetApiKeyDrafts[activePreset.id] ?? "" : "",
    presetStatuses,
    activePresetIsSaved,
    presetSaving,
    presetTestRunning: activePreset ? presetTestRunningId === activePreset.id : false,
    presetModelsLoading,
    testAllRunning: testAllPresetsRunning,
    testAllDisabled: hasInvalidPreset,
    presetModels,
    onSettingsChange: setSettings,
    onAddPreset: handleAddPreset,
    onDeletePreset: handleDeletePreset,
    onDiscardPresetEdits: handleDiscardPresetEdits,
    onPresetSelect: handlePresetSelect,
    onPresetChange: handlePresetChange,
    onPresetApiKeyInputChange: (apiKey: string) => {
      if (!activePreset) return;
      setPresetApiKeyDrafts((prev) => ({
        ...prev,
        [activePreset.id]: apiKey,
      }));
      setPresetStatuses((prev) => ({
        ...prev,
        [activePreset.id]: undefined,
      }));
    },
    onSaveSettings: handleSaveSettings,
    onFetchPresetModels: handleFetchPresetModels,
    onTestPreset: handleTestPreset,
    onTestAllPresets: handleTestAllPresets,
  };

  const sharedSettingsDialog = (
    <SettingsDialog
      contentProps={settingsDialogProps}
      onDone={handleSettingsDone}
      onOpenChange={handleSettingsOpenChange}
      open={settingsOpen}
      saveDisabled={presetSaving || hasInvalidPreset}
    />
  );
  const sharedAboutDialog = <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />;

  const nextColumnAfterNavigation = visibleReaderColumns.includes("navigation")
    ? visibleReaderColumns.find((column) => column !== "navigation") ?? null
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
    documentStatusMessage ?? (loadingProgress !== null ? loadingDocumentLabel : null);

  const viewContent = appView === "home" ? (
    <HomeView
      onOpenBook={handleOpenBook}
      onOpenFile={handleOpenFile}
      onOpenAbout={() => setAboutOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      theme={settings.theme}
      onThemeToggle={handleThemeToggle}
    />
  ) : (
    <Tooltip.Provider delayDuration={300}>
      <div ref={readerShellRef} className="app-shell app-shell-reader">
      <Toolbar.Root ref={readerHeaderRef} className="app-header" aria-label="Toolbar">
        <div className="header-left">
          <ExpandableIconButton
            onClick={handleBackToHome}
            aria-label="Home"
            label="Home"
            labelDirection="right"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 21v-6h4v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ExpandableIconButton>
        </div>
        <div className="header-center">
          <PanelToggleGroup panels={readerPanels} onToggle={togglePanel} />
        </div>
        <div className="header-right">
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
            onClick={() => setSettingsOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <div className="empty-state">Navigation will appear here.</div>
              )
            ) : epubData ? (
              <EpubNavigationSidebar
                toc={epubToc}
                currentChapter={epubCurrentChapter}
                onNavigate={handleEpubNavigateToHref}
              />
            ) : (
              <div className="empty-state">Navigation will appear here.</div>
            )}
          </div>
        </section>
        {nextColumnAfterNavigation ? (
          <div
            className="split-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize navigation and ${
              nextColumnAfterNavigation === "original" ? "original" : "right rail"
            } panels`}
            data-dragging={
              activeColumnResizeKey === `navigation:${nextColumnAfterNavigation}` ? "true" : undefined
            }
            onPointerDown={handleColumnResizeStart("navigation", nextColumnAfterNavigation)}
          />
        ) : null}
        <section
          ref={setColumnElementRef("original")}
          className={`pane pane-original ${readerPanels.original ? "" : "is-hidden"}`}
          style={getColumnStyle("original")}
        >
          <div className="pane-body">
            {currentFileType === "epub" && epubData ? (
              <div className={`epub-original-host ${readerPanels.original ? "" : "is-detached"}`}>
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
                      <div className="epub-zoom-readout">{Math.round(scale * 100)}%</div>
                      <Toolbar.Button
                        className="btn btn-ghost btn-icon-only"
                        onClick={() => handleScaleStep("in")}
                        disabled={currentScaleIndex >= ZOOM_LEVELS.length - 1}
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
                onNavigateToPage={(page) => handlePdfPageChange(page)}
                onRequestPageChange={handlePdfPageTurnRequest}
                onZoomModeChange={handlePdfZoomModeChange}
                onManualScaleChange={handlePdfManualScaleChange}
                onResolvedScaleChange={handleResolvedPdfScaleChange}
                overlayStatusMessage={hasPdfExtractionOverlay ? extractingTextLabel : null}
                overlayProgress={hasPdfExtractionOverlay ? loadingProgress : null}
                onSelectionText={handlePdfSelectionTranslate}
                onClearSelection={handleClearSelectionTranslation}
              />
            ) : hasBlockingOriginalPaneStatus && originalPaneStatusMessage ? (
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
        {visibleReaderColumns.includes("original") && visibleReaderColumns.includes("rail") ? (
          <div
            className="split-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize original and right rail panels"
            data-dragging={activeColumnResizeKey === "original:rail" ? "true" : undefined}
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
            {(pdfDoc || epubData) ? (
              currentFileType === "pdf" ? (
                <TranslationPane
                  mode="pdf"
                  currentPage={currentPage}
                  pageTranslation={pageTranslations[currentPage]}
                  statusMessage={translationStatusMessage}
                  progressLabel={translationProgressLabel}
                  bulkActionLabel={translateAllActionLabel}
                  onBulkAction={handleTranslateAllAction}
                  bulkActionDisabled={!canTranslateAll || isTranslateAllRunning}
                  bulkActionRunning={isTranslateAllRunning}
                  onRetryPage={handleRedoPageTranslation}
                  canRetryPage={canRedoCurrentPage}
                  selectionTranslation={selectionTranslation}
                  onClearSelectionTranslation={handleClearSelectionTranslation}
                />
              ) : (
                <TranslationPane
                  mode="epub"
                  pages={pages}
                  currentPage={currentPage}
                  statusMessage={translationStatusMessage}
                  progressLabel={translationProgressLabel}
                  bulkActionLabel={translateAllActionLabel}
                  onBulkAction={handleTranslateAllAction}
                  bulkActionDisabled={!canTranslateAll || isTranslateAllRunning}
                  bulkActionRunning={isTranslateAllRunning}
                  activePid={activePid}
                  hoverPid={hoverPid}
                  onHoverPid={setHoverPid}
                  onTranslatePid={handleTranslatePid}
                  onLocatePid={handleLocatePid}
                  onTranslateText={handleTranslateText}
                  wordTranslation={wordTranslation}
                  onClearWordTranslation={handleClearWordTranslation}
                  scrollToPage={scrollToTranslationPage}
                />
              )
            ) : (
              <div className="empty-state">Translations will appear here.</div>
            )}
          </div>
          {readerPanels.translation && readerPanels.chat ? (
            <div
              className="rail-resize-handle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize translation and AI chat sections"
              data-dragging={activeRailResizeKey === "translation:chat" ? "true" : undefined}
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
              model={activePreset?.model || getDefaultModelForProvider("openrouter")}
              getCurrentPageText={getCurrentPageText}
              getSurroundingPagesText={getSurroundingPagesText}
            />
          </div>
        </section>
      </main>
      <ConfirmationDialog
        open={translateAllDialogOpen}
        onOpenChange={setTranslateAllDialogOpen}
        title="Cached translations found"
        description={`Found ${translateAllCachedCount} translated ${
          translateAllCachedCount === 1 ? "page" : "pages"
        } elsewhere in this PDF. Retranslate everything from scratch, or keep those pages and translate the rest?`}
        actions={[
          {
            label: "Skip Cached",
            onSelect: () => void startTranslateAll("skip-cached"),
            variant: "primary",
          },
          {
            label: "Retranslate All",
            onSelect: () => void startTranslateAll("replace-all"),
            variant: "danger",
          },
        ]}
      />
    </div>
    </Tooltip.Provider>
  );

  return (
    <>
      {viewContent}
      {sharedAboutDialog}
      {sharedSettingsDialog}
    </>
  );
}
