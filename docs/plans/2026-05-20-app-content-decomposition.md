# AppContent Decomposition Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 7500-line `AppContent` component in `src/App.tsx` into ~8 focused custom hooks and a slim orchestrator, preserving all existing behavior.

**Architecture:** Extract stateful domains from `AppContent` into custom hooks under `src/hooks/`. Each hook owns a bounded set of `useState`/`useRef` declarations and returns a narrow API. A shared `ReaderContext` provides cross-cutting values (`docId`, `settings`, `currentTargetLanguage`, etc.) so hooks don't need 30-parameter signatures. The extraction proceeds from least-coupled (theme, resize, updates) to most-coupled (translation queue) to minimize risk.

**Tech Stack:** React 19, TypeScript, Tauri (invoke), Radix UI, pdf.js

---

## Dependency Map (from exploration)

### Cross-Domain Coupling Summary

The main shared hubs are:
- **`readerPanels`** — consumed by resize, PDF zoom, annotations, visibility
- **`settings`** — consumed by theme, translation, annotations, everything
- **`docId`** — consumed by translation, annotations, cache
- **`pages` / `pageTranslations`** — consumed by translation queue, PDF viewer, translation pane
- **`currentTargetLanguage`** — consumed by translation queue, word translation

Strategy: A `ReaderContext` holds these shared values. Hooks consume context for reads and accept setters/callbacks as parameters where needed.

### Extraction Order (least → most coupled)

| Task | Hook | Self-contained deps | Shared deps (from context) |
|------|------|-------------------|--------------------------|
| 1 | `useTheme` | None (pure DOM effects) | `settings.theme`, `settings.accentColor` |
| 2 | `useResizableLayout` | 5 useState, 6 useRef | `readerPanels`, `currentFileType`, `pdfZoomMode` |
| 3 | `useAppUpdates` | 1 useState | None (only toast + Tauri invoke) |
| 4 | `useAnnotations` | 4 useState | `docId`, `pages`, `settings`, `currentPage` |
| 5 | `useWordTranslation` | 2 useState | `settings`, `docId`, `currentTargetLanguage` |
| 6 | `useSettingsManager` | ~20 useState/useRef | None (owns its own state) |
| 7 | `useDocumentLoader` | ~15 useState/useRef | `settings`, toast |
| 8 | `useTranslationQueue` | ~25 useRef + 5 useState | `docId`, `settings`, `pages`, `pageTranslations`, `currentTargetLanguage`, `translationEnabled` |

---

## Shared Context Design

Before extracting hooks, we create a context that holds cross-cutting values. This avoids prop-drilling between hooks.

### File: `src/hooks/ReaderContext.tsx`

```tsx
import { createContext, useContext } from "react";
import type {
  Settings,
  TargetLanguage,
  FileType,
  PageDoc,
  PageTranslationState,
} from "../types";

export type ReaderContextValue = {
  // Identity
  docId: string | null;
  currentFileType: FileType | null;

  // Settings
  settings: Settings;
  settingsRef: React.RefObject<Settings>;

  // Translation config
  translationEnabled: boolean;
  translationEnabledRef: React.RefObject<boolean>;
  currentTargetLanguage: TargetLanguage;
  currentTargetLanguageRef: React.RefObject<TargetLanguage>;

  // Page data (refs for async access)
  pagesRef: React.RefObject<PageDoc[]>;
  pageTranslationsRef: React.RefObject<Record<number, PageTranslationState>>;
  docIdRef: React.RefObject<string | null>;

  // Toast
  showToast: (message: string, options?: { tone?: string; durationMs?: number }) => void;
};

export const ReaderContext = createContext<ReaderContextValue | null>(null);

export function useReaderContext(): ReaderContextValue {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error("useReaderContext must be used within ReaderContext.Provider");
  return ctx;
}
```

**The context is provided by `AppContent`** and wraps the reader view JSX. Home view does not need it.

---

## Task 1: Extract `useTheme`

**Files:**
- Create: `src/hooks/useTheme.ts`
- Modify: `src/App.tsx` (remove theme effects, call hook)

**Why first:** Pure DOM side-effects, zero local state, reads only `settings.theme` and `settings.accentColor`. No risk.

**Step 1: Create the hook file**

```ts
// src/hooks/useTheme.ts
import { useEffect } from "react";
import type { ThemeMode, AccentColor } from "../types";

const PALETTES: Record<AccentColor, { light: string[]; dark: string[] }> = {
  blue:    { light: [...], dark: [...] },
  purple:  { light: [...], dark: [...] },
  pink:    { light: [...], dark: [...] },
  red:     { light: [...], dark: [...] },
  orange:  { light: [...], dark: [...] },
  green:   { light: [...], dark: [...] },
  teal:    { light: [...], dark: [...] },
};

export function useTheme(theme: ThemeMode, accentColor: AccentColor) {
  // Effect 1: base theme + colorScheme
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const resolveTheme = (systemTheme: boolean) => {
      const resolved = theme === "system" ? (systemTheme ? "dark" : "light") : theme;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    };
    resolveTheme(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => resolveTheme(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  // Effect 2: accent color CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    const accent = accentColor;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "system" && systemDark);
    const palette = PALETTES[accent];
    const v = isDark ? palette.dark : palette.light;
    root.style.setProperty("--accent", v[0]);
    root.style.setProperty("--accent-hover", v[1]);
    // ... all 7 CSS vars from L2081-2126
  }, [theme, accentColor]);
}
```

**Step 2: Copy the exact palette data from App.tsx L2076-2105 into the PALETTES constant**

Read `src/App.tsx` lines 2045-2143 and copy the palette arrays verbatim.

**Step 3: Replace the two theme effects in AppContent**

In `src/App.tsx`, remove the two `useEffect` blocks for theme (approximately L2045-2079 and L2081-2126) and replace with:

```ts
useTheme(settings.theme, settings.accentColor);
```

**Step 4: Verify**

Run: `bun run build`
Expected: No TypeScript errors, app renders with same theme behavior.

**Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/App.tsx
git commit -m "refactor: extract useTheme hook from AppContent"
```

---

## Task 2: Extract `useResizableLayout`

**Files:**
- Create: `src/hooks/useResizableLayout.ts`
- Modify: `src/App.tsx` (remove resize state/effects/handlers, call hook)

**Why second:** 5 useState + 6 useRef are almost entirely self-contained. Only `readerPanels` and `pdfZoomMode` are shared — both passed as parameters.

**Hook interface:**

```ts
// src/hooks/useResizableLayout.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReaderPanels, ReaderColumnKey, ReaderRailSectionKey } from "../types";

export type ResizableLayoutAPI = {
  // State
  readerPanels: ReaderPanels;
  setReaderPanels: (panels: ReaderPanels) => void;
  readerColumnWeights: Record<string, number>;
  readerRailSectionWeights: Record<string, number>;

  // Active resize tracking
  activeColumnResizeKey: string | null;
  activeRailResizeKey: string | null;

  // Ref setters for DOM elements
  setColumnElementRef: (key: ReaderColumnKey, el: HTMLElement | null) => void;
  setRailSectionElementRef: (key: ReaderRailSectionKey, el: HTMLElement | null) => void;

  // Callbacks
  togglePanel: (panel: string) => void;
  handleColumnResizeStart: (leftKey: ReaderColumnKey, rightKey: ReaderColumnKey, e: React.PointerEvent) => void;
  handleRailResizeStart: (topKey: ReaderRailSectionKey, bottomKey: ReaderRailSectionKey, e: React.PointerEvent) => void;

  // Derived
  currentColumnLayoutKey: string;
  currentRailLayoutKey: string;
  currentColumnWeights: Record<string, number>;
  currentRailSectionWeights: Record<string, number>;
  workspaceMinWidth: number;
  workspaceMinHeight: number;
};
```

**Parameters the hook needs (passed from AppContent):**
- `readerShellRef: RefObject<HTMLDivElement>` — for size constraints
- `currentFileType: FileType | null` — for panel sync
- `pdfZoomMode: PdfZoomMode` — for panel sync effect
- `setPdfZoomMode: (mode: PdfZoomMode) => void` — written by panel sync effect
- Initial panel state values

**Step 1: Create the hook file**

Copy from App.tsx:
- State declarations: `readerPanels`, `readerColumnWeights`, `readerRailSectionWeights`, `activeColumnResizeKey`, `activeRailResizeKey` (L660-745)
- Refs: `columnRefs`, `railSectionRefs`, `columnResizeRef`, `railResizeRef`, `previousReaderPanelsRef` (L825-857)
- Derived computations: `visibleReaderColumns`, `visibleRailSections`, `currentColumnLayoutKey`, `currentRailLayoutKey`, `currentColumnWeights`, `currentRailSectionWeights`, `workspaceMinWidth`, `workspaceMinHeight` (L1727-1769)
- `togglePanel` callback (L1771-1773)
- `setColumnElementRef`, `setRailSectionElementRef` (L1789-1801)
- `getColumnStyle`, `getRailSectionStyle` (L1803-1848)
- Resize start handlers + pointer move effects + finish (L1850-2022)
- Panel sync effect (L1776-1798)

**Step 2: Wire the hook in AppContent**

```ts
const layout = useResizableLayout({
  readerShellRef,
  currentFileType,
  pdfZoomMode,
  setPdfZoomMode,
  // initial weights from persisted settings if any
});
```

Replace all the moved state/effects with destructured values from `layout`.

**Step 3: Verify**

Run: `bun run build`
Expected: No errors. Column/rail resize works identically.

**Step 4: Commit**

```bash
git add src/hooks/useResizableLayout.ts src/App.tsx
git commit -m "refactor: extract useResizableLayout hook from AppContent"
```

---

## Task 3: Extract `useAppUpdates`

**Files:**
- Create: `src/hooks/useAppUpdates.ts`
- Modify: `src/App.tsx` (remove update state/handlers, call hook)

**Why third:** Completely isolated — only touches `updateState` and Tauri invoke for updater. No shared deps except toast.

**Hook interface:**

```ts
// src/hooks/useAppUpdates.ts
export type AppUpdatesAPI = {
  updateState: UpdateState;
  handleCheckForUpdates: (source: UpdateCheckSource) => Promise<void>;
  handleInstallUpdate: () => Promise<void>;
  handleOpenLatestRelease: () => Promise<void>;
  clearPendingUpdate: () => void;
  storePendingUpdate: (version: string) => void;
  showReadyUpdateAction: boolean;
  aboutUpdateStatusMessage: string;
};
```

**Step 1: Create the hook file**

Copy from App.tsx:
- State: `updateState` (L746)
- Refs: `autoUpdateCheckStartedRef`, `pendingUpdateRef` (L821-822)
- `clearPendingUpdate` (L1149-1158)
- `storePendingUpdate` (L1160-1169)
- `handleCheckForUpdates` (L1171-1238)
- `handleInstallUpdate` (L1240-1261)
- `handleOpenLatestRelease` (L1263-1273)
- `showReadyUpdateAction` derived (L1685)
- `aboutUpdateStatusMessage` derived (L1687-1702)
- Auto-check effect (fires on mount)

Parameters: `showToast` callback, `t` i18n function.

**Step 2: Wire in AppContent**

```ts
const updates = useAppUpdates({ showToast, t });
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/useAppUpdates.ts src/App.tsx
git commit -m "refactor: extract useAppUpdates hook from AppContent"
```

---

## Task 4: Extract `useAnnotations`

**Files:**
- Create: `src/hooks/useAnnotations.ts`
- Modify: `src/App.tsx` (remove annotation state/handlers, call hook)

**Why fourth:** Moderate coupling — reads `docId`, `pages`, `settings`, `currentPage`. All available via `ReaderContext`.

**Hook interface:**

```ts
// src/hooks/useAnnotations.ts
export type AnnotationsAPI = {
  annotations: SentenceAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<SentenceAnnotation[]>>;
  annotationModeEnabled: boolean;
  setAnnotationModeEnabled: (enabled: boolean) => void;
  noteEditingAnnotationId: string | null;
  setNoteEditingAnnotationId: (id: string | null) => void;
  pendingAnnotationDeletion: string | null;
  setPendingAnnotationDeletion: (id: string | null) => void;
  annotationsPanelOpen: boolean;
  setAnnotationsPanelOpen: (open: boolean) => void;

  // Derived
  resolvedAnnotations: AnnotationDisplayGroup[];
  savedHighlightPids: Set<string>;

  // Actions
  deleteSentenceAnnotation: (id: string) => Promise<void>;
  requestDeleteSentenceAnnotation: (id: string) => void;
  ensureSentenceHighlight: (params: { pid: string; page: number; ... }) => Promise<void>;
  toggleSentenceHighlight: (params: { pid: string; ... }) => Promise<void>;
  highlightSelectedSentences: (paragraphs: Paragraph[], sentenceIndices: number[]) => Promise<void>;
  saveSentenceNote: (annotationId: string, note: string) => Promise<void>;
};
```

**Step 1: Create the hook file**

Copy from App.tsx:
- State: `annotations`, `annotationModeEnabled`, `noteEditingAnnotationId`, `pendingAnnotationDeletion`, `annotationsPanelOpen` (L751-758)
- Ref: `resolvedAnnotationsRef` (L858)
- Derived: `resolvedAnnotations`, `savedHighlightPids` (L871-889)
- Action functions: L6306-6490

Parameters: `docId`, `pages` (via ref), `settings`, `showToast`, `t`.

**Step 2: Wire in AppContent**

```ts
const annotations = useAnnotations({ docId, pagesRef, settings, showToast, t });
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/useAnnotations.ts src/App.tsx
git commit -m "refactor: extract useAnnotations hook from AppContent"
```

---

## Task 5: Extract `useWordTranslation`

**Files:**
- Create: `src/hooks/useWordTranslation.ts`
- Modify: `src/App.tsx` (remove word/selection translation state/handlers)

**Hook interface:**

```ts
// src/hooks/useWordTranslation.ts
export type WordTranslationAPI = {
  wordTranslation: WordTranslation | null;
  selectionTranslation: SelectionTranslation | null;
  handleTranslateText: (text: string, position: { x: number; y: number }) => Promise<void>;
  handleClearWordTranslation: () => void;
  handlePdfSelectionTranslate: (params: { text: string; position: { x: number; y: number }; isLoading: boolean }) => Promise<void>;
  handleClearSelectionTranslation: () => void;
};
```

**Step 1: Create the hook file**

Copy from App.tsx:
- State: `wordTranslation`, `selectionTranslation` (L712-714)
- Ref: `textTranslationCacheRef` (L762)
- Handlers: `handleTranslateText` (L6492-6587), `handleClearWordTranslation` (L6589-6591), `handlePdfSelectionTranslate` (L5735-5787), `handleClearSelectionTranslation` (L5789-5791)

Parameters: `settingsRef`, `getEffectivePreset`, `showToast`, `t`, `currentTargetLanguageRef`, `docIdRef`.

**Step 2: Wire in AppContent**

```ts
const wordTranslation = useWordTranslation({ settingsRef, getEffectivePreset, showToast, t, ... });
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/useWordTranslation.ts src/App.tsx
git commit -m "refactor: extract useWordTranslation hook from AppContent"
```

---

## Task 6: Extract `useSettingsManager`

**Files:**
- Create: `src/hooks/useSettingsManager.ts`
- Modify: `src/App.tsx` (remove settings-related state/handlers)

**Why sixth:** Heavy but self-contained — manages settings CRUD, preset lifecycle, autosave, model fetching. Only exports `settings`/`settingsRef` which other hooks consume.

**Hook interface:**

```ts
// src/hooks/useSettingsManager.ts
export type SettingsManagerAPI = {
  // Core state
  settings: Settings;
  settingsRef: React.RefObject<Settings>;
  settingsLoaded: boolean;
  settingsDraft: Settings | null;
  settingsDraftRef: React.RefObject<Settings | null>;

  // Preset state
  editingPresetId: string | null;
  presetApiKeyDrafts: Record<string, string>;
  presetStatuses: Record<string, PresetSaveStatus>;
  presetSaveStatusById: Record<string, PresetSaveStatus>;
  presetTestRunningId: string | null;
  presetModelsLoadingById: Record<string, boolean>;
  presetModels: Record<string, { id: string; name: string }[]>;
  presetModelMessages: Record<string, string>;
  presetModelAutoLoadAttempts: Record<string, number>;
  testAllPresetsRunning: boolean;

  // Session fallback
  sessionFallbackPresetId: string | null;
  sessionFallbackPresetIdRef: React.RefObject<string | null>;

  // Translation cache
  translationCacheSummary: TranslationCacheSummary | null;
  translationCacheLoading: boolean;
  translationCacheActionTarget: string | null;

  // Dialog state
  settingsOpen: boolean;
  settingsCloseConfirmOpen: boolean;
  settingsClosePending: boolean;

  // Key actions
  handleOpenSettings: () => void;
  handleSettingsOpenChange: (open: boolean) => void;
  handleSettingsChange: (next: Partial<Settings>) => void;
  handleEditingPresetChange: (id: string | null) => void;
  handleActivatePreset: (id: string) => Promise<void>;
  handleAddPreset: () => void;
  handleDeletePreset: (id: string) => void;
  handlePresetChange: (id: string, patch: Partial<TranslationPreset>) => void;
  handlePresetApiKeyInputChange: (id: string, value: string) => void;
  handlePresetApiKeyBlur: (id: string) => void;
  handleFetchPresetModels: (id: string) => Promise<void>;
  handleTestPreset: (id: string) => Promise<void>;
  handleTestAllPresets: () => Promise<void>;
  handleClearAllTranslationCache: () => Promise<void>;
  handleClearCachedBookTranslations: (docId: string) => Promise<void>;
  refreshTranslationCacheSummary: () => Promise<void>;

  // Helpers consumed by other hooks
  getEffectivePreset: () => TranslationPreset | null;

  // Persist
  persistSettings: (s: Settings) => Promise<void>;
  flushDirtyPresetSaves: () => Promise<void>;
  collectBlockingUnsavedPresetIds: () => string[];
  discardUnsavedSettingsAndClose: () => void;
};
```

**Step 1: Create the hook file**

This is the largest extraction (~20 useState, ~10 useRef). Copy from App.tsx:
- All settings-related useState declarations (L636-707)
- All settings-related useRef declarations (L771-789)
- All preset management functions (L3249-4368)
- `getEffectivePreset` (L891-898)
- `persistSettings`, `buildPersistableSettings` (L2302-2342)
- Settings persistence queue and autosave logic

Parameters: `showToast`, `t`, `handleReaderSettingsChange` callback.

**Step 2: Wire in AppContent**

```ts
const settingsManager = useSettingsManager({ showToast, t });
const { settings, settingsRef, getEffectivePreset, ... } = settingsManager;
```

**Step 3: Update other hooks that depend on settings**

`useWordTranslation`, `useAnnotations`, and the yet-to-be-extracted translation queue all receive `settings`/`settingsRef` from the settings manager.

**Step 4: Verify**

Run: `bun run build`

**Step 5: Commit**

```bash
git add src/hooks/useSettingsManager.ts src/App.tsx
git commit -m "refactor: extract useSettingsManager hook from AppContent"
```

---

## Task 7: Extract `useDocumentLoader`

**Files:**
- Create: `src/hooks/useDocumentLoader.ts`
- Modify: `src/App.tsx` (remove document loading state/handlers)

**What this owns:** PDF loading (`loadPdfFromPath` ~430 lines), EPUB loading (`loadEpubFromPath`), document inspection, recent book reconnection, PDF extraction cache, page sizes.

**Hook interface:**

```ts
// src/hooks/useDocumentLoader.ts
export type DocumentLoaderAPI = {
  // Document state
  pdfDoc: PDFDocumentProxy | null;
  pdfOutline: any[] | null;
  pageSizes: Map<number, { width: number; height: number }>;
  pages: PageDoc[];
  pageTranslations: Record<number, PageTranslationState>;
  docId: string | null;
  currentPage: number;

  // EPUB state
  epubData: ePub | null;
  epubTotalPages: number;
  epubToc: any[];
  epubCurrentChapter: string | null;

  // Loading state
  currentFilePath: string | null;
  currentBookTitle: string | null;
  currentFileType: FileType | null;
  openingDocumentTitle: string | null;
  documentStatusMessage: string | null;
  loadingProgress: number;

  // PDF-specific
  pdfScrollAnchor: string | null;
  scale: number;
  pdfZoomMode: PdfZoomMode;
  pdfManualScale: number;
  resolvedPdfScale: number;
  pdfNavTab: string;

  // Refs (for other hooks)
  pagesRef: React.RefObject<PageDoc[]>;
  pageTranslationsRef: React.RefObject<Record<number, PageTranslationState>>;
  docIdRef: React.RefObject<string | null>;
  pdfTranslationSessionRef: React.RefObject<string>;
  pdfOutlineRequestIdRef: React.RefObject<string>;
  pdfLoadRequestIdRef: React.RefObject<string>;
  pendingPdfExtractionCacheRef: React.RefObject<Map<number, PageDoc>>;
  pendingPdfExtractionCacheDocIdRef: React.RefObject<string | null>;
  pdfExtractionCacheFlushTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  pdfExtractionCacheFlushQueueRef: React.RefObject<Set<number>>;

  // Actions
  loadPdfFromPath: (filePath: string) => Promise<void>;
  loadEpubFromPath: (filePath: string) => Promise<void>;
  handleBackToHome: () => Promise<void>;
  handleOpenFile: () => Promise<void>;
  handleOpenBook: (filePath: string) => Promise<void>;
  chooseDocumentPath: () => Promise<void>;
  handleSeekPage: (page: number) => void;
  handlePdfPageChange: (page: number) => void;
  handlePdfPageTurnRequest: (delta: number, anchor?: string) => void;
  handleZoomChange: (delta: number) => void;
  handlePdfZoomModeChange: (mode: PdfZoomMode) => void;
  handlePdfManualScaleChange: (scale: number) => void;
  handleResolvedPdfScaleChange: (scale: number) => void;
  handleEpubPageStep: (delta: number) => void;
  handleEpubNavigateToHref: (href: string) => void;
  updateRecentBookLocation: () => void;

  // EPUB handlers
  handleEpubPageChange: (page: number) => void;
  handleEpubLoadingProgress: (progress: number) => void;
  handleEpubTocChange: (toc: any[]) => void;
  handleEpubCurrentChapterChange: (chapter: string) => void;
  handleEpubHrefChange: (href: string, requestId: string) => void;
};
```

**Step 1: Create the hook file**

Copy from App.tsx:
- All document-related useState (L608-635, L617-621, L626-628, L631-635, L651-654, L716-722)
- All document-related useRef (L760, L780-820)
- `loadPdfFromPath` (L2362-2794)
- `loadEpubFromPath` (L2796-2884)
- EPUB handlers (L2886-2997)
- `updateRecentBookLocation` (L2999-3010)
- `handleBackToHome` (L3169-3226)
- `handleOpenFile` / `handleOpenBook` / `chooseDocumentPath` (L3012-3167)
- PDF zoom handlers (L6593-6632)
- EPUB navigation (L6597-6680)
- PDF extraction cache functions (L987-1045)
- Recent book reconnection (L3036-3120)

Parameters: `settings`, `showToast`, `t`, `getEffectivePreset`, `translationEnabled`, `currentTargetLanguage`, `setAppView`.

**Step 2: Wire in AppContent**

```ts
const docLoader = useDocumentLoader({ settings, showToast, t, getEffectivePreset, ... });
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/useDocumentLoader.ts src/App.tsx
git commit -m "refactor: extract useDocumentLoader hook from AppContent"
```

---

## Task 8: Extract `useTranslationQueue`

**Files:**
- Create: `src/hooks/useTranslationQueue.ts`
- Modify: `src/App.tsx` (remove translation queue state/handlers)

**Why last:** The most coupled piece. Reads from ~35 refs/states. By extracting it last, all its dependencies (`settings`, `docId`, `pages`, `pageTranslations`, etc.) are already available from other hooks or `ReaderContext`.

**Hook interface:**

```ts
// src/hooks/useTranslationQueue.ts
export type TranslationQueueAPI = {
  // Status
  translationStatusMessage: string | null;
  isTranslateAllRunning: boolean;
  translateAllWaitState: TranslateAllWaitState;
  translateAllActionLabel: string;
  translateAllProgressDetail: { label: string; state?: any };
  pageTranslationInFlightPage: number | null;
  isTranslateAllStopRequested: boolean;
  translateAllUsageLimitPaused: boolean;

  // Derived progress
  translationProgress: number;
  translationProgressLabel: string;
  canTranslateAll: boolean;
  canRedoCurrentPage: boolean;

  // Actions
  startTranslateAll: (options?: { forceFresh?: boolean }) => void;
  stopTranslateAll: () => void;
  handleTranslateAllAction: () => Promise<void>;
  handleRedoPageTranslation: (pageNumber: number) => void;
  handleTranslatePid: (pid: string) => Promise<void>;
  resumeTranslateAllAfterUsageLimit: () => void;

  // EPUB translation
  epubSectionTranslationProgress: number;

  // Internal refs exposed for cross-hook communication
  isTranslateAllRunningRef: React.RefObject<boolean>;
  translateAllResumeTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
};
```

**Step 1: Create the hook file**

Copy from App.tsx:
- Translation queue state: `translationStatusMessage`, `isTranslateAllRunning`, `translateAllWaitState`, `translateAllWaitTick`, `isTranslateAllStopRequested`, `pageTranslationInFlightPage`, `translateAllUsageLimitPaused` (L657-738, L726-740)
- All translation queue refs (L782-812, L790-806)
- `runPageTranslationQueue` (L4459-5090)
- `queuePagesForTranslation` (L5092-5307)
- `runTranslateQueue` (L5818-6228)
- `startTranslateAll` / `stopTranslateAll` (L5443-5534)
- `handleTranslateAllAction` (L5631-5733)
- `handleRedoPageTranslation` (L5598-5629)
- `handleTranslatePid` (L6244-6284)
- `resumeTranslateAllAfterUsageLimit` (L6230-6242)
- All translate-all helper functions (clearResumeTimer, resetSlowMode, scheduleResume)
- Progress derivation (L1474-1579)

**Parameters** (received from other hooks or ReaderContext):
- `docIdRef`, `pagesRef`, `pageTranslationsRef`, `settingsRef`
- `translationEnabledRef`, `currentTargetLanguageRef`
- `pdfTranslationSessionRef` (from document loader)
- `getEffectivePreset` (from settings manager)
- `showToast`, `showTranslationSetupToast`, `showFallbackSuccessToast`
- `t`
- `setPages`, `setPageTranslations` (from document loader)
- `currentFileType` (from document loader)

**Step 2: Wire in AppContent**

```ts
const translationQueue = useTranslationQueue({
  docIdRef, pagesRef, pageTranslationsRef, settingsRef,
  translationEnabledRef, currentTargetLanguageRef,
  pdfTranslationSessionRef, getEffectivePreset,
  setPages, setPageTranslations, currentFileType,
  showToast, t,
});
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/useTranslationQueue.ts src/App.tsx
git commit -m "refactor: extract useTranslationQueue hook from AppContent"
```

---

## Task 9: Create `ReaderContext` Provider

**Files:**
- Create: `src/hooks/ReaderContext.tsx`
- Modify: `src/App.tsx` (wrap reader view with provider)

**Step 1: Create the context file**

As designed above in the Shared Context Design section.

**Step 2: Wrap the reader view JSX in AppContent with the provider**

```tsx
const readerContextValue = useMemo(() => ({
  docId, currentFileType,
  settings, settingsRef,
  translationEnabled, translationEnabledRef,
  currentTargetLanguage, currentTargetLanguageRef,
  pagesRef, pageTranslationsRef, docIdRef,
  showToast,
}), [docId, currentFileType, settings, translationEnabled, currentTargetLanguage, showToast]);

// In JSX:
{appView === "reader" && (
  <ReaderContext.Provider value={readerContextValue}>
    {/* reader view components */}
  </ReaderContext.Provider>
)}
```

**Step 3: Update hooks to consume `useReaderContext()` instead of receiving shared values as parameters**

Gradually migrate each hook to read from context. This is optional and can be deferred — hooks can still accept parameters explicitly.

**Step 4: Verify**

Run: `bun run build`

**Step 5: Commit**

```bash
git add src/hooks/ReaderContext.tsx src/App.tsx
git commit -m "refactor: add ReaderContext for cross-hook state sharing"
```

---

## Task 10: Create barrel export

**Files:**
- Create: `src/hooks/index.ts`
- Modify: `src/App.tsx` (import from barrel)

**Step 1: Create barrel**

```ts
// src/hooks/index.ts
export { useTheme } from "./useTheme";
export { useResizableLayout } from "./useResizableLayout";
export { useAppUpdates } from "./useAppUpdates";
export { useAnnotations } from "./useAnnotations";
export { useWordTranslation } from "./useWordTranslation";
export { useSettingsManager } from "./useSettingsManager";
export { useDocumentLoader } from "./useDocumentLoader";
export { useTranslationQueue } from "./useTranslationQueue";
export { ReaderContext, useReaderContext } from "./ReaderContext";
```

**Step 2: Update imports in App.tsx**

Replace individual imports with:

```ts
import {
  useTheme, useResizableLayout, useAppUpdates,
  useAnnotations, useWordTranslation, useSettingsManager,
  useDocumentLoader, useTranslationQueue, ReaderContext,
} from "./hooks";
```

**Step 3: Verify**

Run: `bun run build`

**Step 4: Commit**

```bash
git add src/hooks/index.ts src/App.tsx
git commit -m "refactor: add hooks barrel export"
```

---

## Task 11: Final cleanup and validation

**Step 1: Run full build**

```bash
bun run build
```

Expected: Clean build, no errors.

**Step 2: Run `bun run tauri dev` and manually smoke-test**

- [ ] Open a PDF → renders correctly
- [ ] Translate a page → translation appears
- [ ] Translate All → works end-to-end
- [ ] Resize columns → works
- [ ] Resize rail sections → works
- [ ] Change theme → applies immediately
- [ ] Change accent color → applies immediately
- [ ] Check for updates → dialog works
- [ ] Create/edit/delete a preset → persists
- [ ] Highlight a sentence → annotation works
- [ ] Word translation popup → appears and works
- [ ] EPUB open and navigate → works
- [ ] Back to home → works

**Step 3: Verify AppContent line count**

Target: `AppContent` should be under 1000 lines (wiring + JSX only).

**Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete AppContent decomposition into custom hooks"
```

---

## Risk Mitigation

### Ref/State Sync
Many refs mirror state for async access (e.g., `pagesRef` mirrors `pages`). The hooks must maintain this sync. **Rule:** The hook that owns the state also owns the ref. Consumers receive both.

### Stale Closure Risk
Functions like `runPageTranslationQueue` use refs specifically to avoid stale closures. When extracting, keep the ref-based access pattern — do not convert to direct state reads inside async functions.

### Circular Dependencies
If `useDocumentLoader` needs `getEffectivePreset` from `useSettingsManager`, and `useSettingsManager` needs nothing from `useDocumentLoader`, the dependency is unidirectional and safe. If a circular need arises, lift the shared value to `AppContent` and pass it to both.

### No Behavior Changes
This plan is pure refactoring. No new features, no bug fixes, no API changes. Every step must produce a build that behaves identically to the previous step.
