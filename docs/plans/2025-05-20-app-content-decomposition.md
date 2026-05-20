# AppContent Decomposition Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the ~7,000-line `AppContent` component in `src/App.tsx` into focused hooks and supporting modules while preserving current behavior.

**Architecture:** This is a pure refactor. Extract the least coupled domains first, keep cross-domain dependencies explicit through hook parameters and callbacks, and defer React Context until there is a proven need for it. The first milestone should make `AppContent` easier to work in without changing behavior; the second milestone can split the harder translation and document-loading domains.

**Tech Stack:** React 19 custom hooks, TypeScript, Tauri commands/events, existing project utilities. No new runtime dependencies.

---

## Important Execution Rules

- Work in the main worktree unless the user explicitly asks for a branch or worktree.
- Do not change behavior while moving code. If a behavior change seems necessary, stop and make it a separate task.
- Run `bun run build` after every extraction task.
- Prefer focused manual regression for the touched domain after each task.
- Keep commits small: one extracted domain per commit.
- Do not introduce `as any`, `@ts-ignore`, broad catch-and-ignore blocks, or global stores.
- Preserve the existing `docId` semantics during the first pass. It is currently a `string` that may be `""`, not `string | null`.
- Treat `pagesRef`, `docIdRef`, and `pageTranslationsRef` as orchestration-owned refs. They are initialized and kept in `AppContent` during this plan, or in a future top-level reader orchestrator. Sub-hooks may read/write them when passed in, but they do not own or recreate them.
- Treat line numbers in this plan as approximate. Confirm the current source before editing.

---

## Revised Strategy

The original plan has the right instinct, but the execution order needs tightening:

1. Extract clearly isolated logic first.
2. Keep explicit hook arguments during the first pass.
3. Use bridge callbacks for cross-domain actions such as "reset translations after language change" or "clear document state after closing a book."
4. Split the hardest domains only after their dependencies are cleaner.
5. Add context only as a later cleanup if explicit wiring becomes too noisy.

This keeps the refactor boring and reversible. In plain terms: first move the furniture that is already separate, then deal with the heavy cabinet in the corner.

---

## Target Shape

After Milestone 1, `AppContent` should still own the main orchestration, but several obvious domains should be gone:

- theme DOM effects
- reader resize state and handlers
- app update state and handlers
- annotations state and handlers
- word/selection translation popup state and handlers

After Milestone 2, document loading and translation should be smaller, but they do not need to become tiny in one pass. A 1,000-line hook is still an improvement over a 7,000-line component if it has a clear boundary and tests still pass.

---

## Dependency Map

```text
settings / presets
  |-- theme
  |-- word translation
  |-- document open preferences
  |-- translation queue

document loading
  |-- pdf/epub state
  |-- pages
  |-- page translations
  |-- document identity

translation queue
  |-- settings / active preset
  |-- target language
  |-- pages
  |-- page translations
  |-- docId
  |-- cache / fallback / slow mode

reader layout
  |-- visible panels
  |-- resize refs
  |-- pdf zoom reset when rail appears

annotations
  |-- docId
  |-- pages
```

The key point: `translation queue`, `document loading`, and `settings` are a knot. Do not pretend they are independent. Extract them only after smaller domains are already out of `AppContent`.

---

## Milestone 0: Baseline Inventory

**Files:**
- Read: `src/App.tsx`
- Read: existing tests touching App behavior, especially `src/App*.test*`, `src/lib/*translation*.test*`, and reader layout tests

**Steps:**

1. Run `git status --short` and note unrelated user changes.
2. Run `bun run build`.
3. Run targeted tests if available through the project scripts.
4. Record the current behavior areas that must be manually checked:
   - open PDF
   - open EPUB
   - translate current page
   - translate all / stop
   - change target language or preset
   - resize columns and rail sections
   - create/delete annotation and note
   - word/selection translation popup
   - update dialog/status

**Expected result:** Baseline build status is known before refactoring starts.

**Commit:** None unless a baseline note is added.

---

## Milestone 1: Low-Risk Extractions

### Task 1: Extract `useTheme`

**Files:**
- Create: `src/hooks/useTheme.ts`
- Modify: `src/App.tsx`

**Owns:**
- theme resolution effect
- accent color CSS variable effect

**Interface:**

```ts
export function useTheme(theme: ThemeMode, accentColor: AccentColor): void;
```

**Steps:**

1. Move the two DOM effects from `AppContent` into `useTheme`.
2. Keep the accent palette exactly as-is.
3. Replace the effects in `AppContent` with `useTheme(settings.theme, settings.accentColor)`.
4. Run `bun run build`.
5. Manually verify theme and accent changes in Tauri dev if practical.

**Risk:** Very low.

**Commit:** `refactor: extract theme hook`

---

### Task 2: Extract `useResizableLayout`

**Files:**
- Create: `src/hooks/useResizableLayout.ts`
- Modify: `src/App.tsx`

**Owns:**
- `readerPanels`
- `readerColumnWeights`
- `readerRailSectionWeights`
- `activeColumnResizeKey`
- `activeRailResizeKey`
- column and rail element refs
- pointer resize refs
- previous reader panels ref
- visible column/rail derived values
- workspace min width/height derived values
- resize handlers and style helpers

**Interface:**

```ts
export type ResizableLayoutResult = {
  readerPanels: ReaderPanels;
  setReaderPanels: React.Dispatch<React.SetStateAction<ReaderPanels>>;
  activeColumnResizeKey: string | null;
  activeRailResizeKey: string | null;
  visibleReaderColumns: ReaderColumnKey[];
  visibleRailSections: ReaderRailSectionKey[];
  currentColumnWeights: Record<ReaderColumnKey, number>;
  currentRailSectionWeights: Record<ReaderRailSectionKey, number>;
  workspaceMinWidth: number;
  workspaceMinHeight: number;
  setColumnElementRef: (key: ReaderColumnKey) => (el: HTMLElement | null) => void;
  setRailSectionElementRef: (key: ReaderRailSectionKey) => (el: HTMLElement | null) => void;
  getColumnStyle: (key: ReaderColumnKey) => React.CSSProperties;
  getRailSectionStyle: (key: ReaderRailSectionKey) => React.CSSProperties;
  handleColumnResizeStart: (
    leftKey: ReaderColumnKey,
    rightKey: ReaderColumnKey,
  ) => (event: React.PointerEvent<HTMLDivElement>) => void;
  handleRailResizeStart: (
    topKey: ReaderRailSectionKey,
    bottomKey: ReaderRailSectionKey,
  ) => (event: React.PointerEvent<HTMLDivElement>) => void;
  togglePanel: (panel: ReaderPanelKey) => void;
};

export function useResizableLayout(args: {
  initialReaderPanels?: ReaderPanels;
  currentFileType: FileType;
  pdfZoomMode: PdfZoomMode;
  setPdfZoomMode: React.Dispatch<React.SetStateAction<PdfZoomMode>>;
}): ResizableLayoutResult;
```

**Steps:**

1. Move resize state, refs, derived values, and handlers into the hook.
2. Move `readerPanels` and `togglePanel` into the hook as well. This gives one owner for panel visibility, resize calculations, and panel-derived layout.
3. Initialize the hook with `DEFAULT_READER_PANELS` unless a caller explicitly passes `initialReaderPanels`.
4. Pass `currentFileType`, `pdfZoomMode`, and `setPdfZoomMode` explicitly so the hook can preserve the existing PDF zoom reset behavior.
5. Replace JSX references with the returned `layout` object, including `layout.readerPanels` and `layout.togglePanel`.
6. Run `bun run build`.
7. Manually verify column resizing, rail resizing, panel toggles, and PDF zoom reset when the rail becomes visible.

**Risk:** Low.

**Commit:** `refactor: extract resizable layout hook`

---

### Task 3: Extract `useAppUpdates`

**Files:**
- Create: `src/hooks/useAppUpdates.ts`
- Modify: `src/App.tsx`

**Owns:**
- `updateState`
- `autoUpdateCheckStartedRef`
- `pendingUpdateRef`
- pending update helpers
- update check/install/open-release handlers
- derived update status strings
- automatic update check effect

**Interface:**

```ts
export type AppUpdatesResult = {
  updateState: UpdateState;
  showReadyUpdateAction: boolean;
  aboutUpdateStatusMessage: string | null;
  handleCheckForUpdates: (source: UpdateCheckSource) => Promise<void>;
  handleInstallUpdate: () => Promise<void>;
  handleOpenLatestRelease: () => Promise<void>;
};

export function useAppUpdates(showToast: ShowToastFn): AppUpdatesResult;
```

**Steps:**

1. Move update state, refs, handlers, and effects into the hook.
2. Keep translation Tauri events out of this hook.
3. Replace `AppContent` references with `updates.*`.
4. Run `bun run build`.
5. Manually verify About/update status if practical.

**Risk:** Very low.

**Commit:** `refactor: extract app updates hook`

---

### Task 4: Extract `useAnnotations`

**Files:**
- Create: `src/hooks/useAnnotations.ts`
- Modify: `src/App.tsx`

**Owns:**
- `annotations`
- `annotationModeEnabled`
- `noteEditingAnnotationId`
- `pendingAnnotationDeletion`
- `annotationsPanelOpen`
- `resolvedAnnotationsRef`
- `resolvedAnnotations`
- `savedHighlightPids`
- annotation load/persist effects
- create/delete/highlight/note handlers

**Interface:**

```ts
export type AnnotationsResult = {
  annotations: SentenceAnnotation[];
  annotationModeEnabled: boolean;
  setAnnotationModeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noteEditingAnnotationId: string | null;
  setNoteEditingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingAnnotationDeletion: SentenceAnnotation | null;
  setPendingAnnotationDeletion: React.Dispatch<
    React.SetStateAction<SentenceAnnotation | null>
  >;
  annotationsPanelOpen: boolean;
  setAnnotationsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  resolvedAnnotations: ResolvedSentenceAnnotation[];
  resolvedAnnotationsRef: React.MutableRefObject<ResolvedSentenceAnnotation[]>;
  savedHighlightPids: Set<string>;
  deleteSentenceAnnotation: (id: string) => Promise<void>;
  requestDeleteSentenceAnnotation: (annotation: SentenceAnnotation) => void;
  ensureSentenceHighlight: (pid: string, page: number) => Promise<void>;
  toggleSentenceHighlight: (pid: string, page: number) => Promise<void>;
  highlightSelectedSentences: (pids: string[], page: number) => Promise<void>;
  saveSentenceNote: (annotationId: string, note: string) => Promise<void>;
};

export function useAnnotations(args: {
  // Empty string means no active document. Do not widen to string | null in this refactor.
  docId: string;
  pages: PageDoc[];
  pagesRef: React.MutableRefObject<PageDoc[]>;
  currentPage: number;
}): AnnotationsResult;
```

**Steps:**

1. Move annotation state, refs, derived values, effects, and handlers into the hook.
2. Pass `docId`, `pages`, `pagesRef`, and `currentPage` explicitly.
3. Replace JSX and handler references with `annotations.*`.
4. Run `bun run build`.
5. Manually verify highlight creation, deletion, note editing, and overlay rendering.

**Risk:** Low to medium. The matching logic depends on current page/page refs, so verify carefully.

**Commit:** `refactor: extract annotations hook`

---

### Task 5: Extract `useWordTranslation`

**Files:**
- Create: `src/hooks/useWordTranslation.ts`
- Modify: `src/App.tsx`

**Owns:**
- `wordTranslation`
- `selectionTranslation`
- word translation handler
- PDF selection translation handler
- clear handlers

**Interface:**

```ts
export type WordTranslationResult = {
  wordTranslation: WordTranslation | null;
  selectionTranslation: SelectionTranslation | null;
  handleTranslateText: (
    text: string,
    position: { x: number; y: number },
  ) => Promise<void>;
  handleClearWordTranslation: () => void;
  handlePdfSelectionTranslate: (
    text: string,
    position: { x: number; y: number },
  ) => Promise<void>;
  handleClearSelectionTranslation: () => void;
};

export function useWordTranslation(args: {
  getEffectivePreset: () => TranslationPreset | null;
  settingsRef: React.MutableRefObject<TranslationSettings>;
  currentTargetLanguageRef: React.MutableRefObject<TargetLanguage>;
  translationEnabledRef: React.MutableRefObject<boolean>;
  showToast: ShowToastFn;
}): WordTranslationResult;
```

**Steps:**

1. Move popup translation state and handlers into the hook.
2. Keep all backend calls through the existing Tauri command path.
3. Replace `AppContent` references with `wordTranslation.*`.
4. Run `bun run build`.
5. Manually verify word translation and PDF selection translation.

**Risk:** Low.

**Commit:** `refactor: extract word translation hook`

---

## Milestone 2: Medium-Risk Extractions

### Task 6: Extract Settings and Preset Management

**Files:**
- Create: `src/hooks/useSettingsManager.ts`
- Modify: `src/App.tsx`

**Owns:**
- settings state and draft state
- settings dialog state
- active preset/session fallback state
- API key draft state
- preset test/model/status state
- translation cache summary state
- settings load/persist effects
- preset CRUD/autosave/test/model-fetch handlers
- cache clear/summary handlers
- locale change effect
- `getEffectivePreset`
- `buildPersistableSettings`

**Does not own yet:**
- page translation state
- document loading state
- translation queue refs

**Bridge callbacks accepted by the hook:**

```ts
type SettingsManagerCallbacks = {
  onTranslationPreferencesChanged: (change: {
    languageChanged: boolean;
    presetChanged: boolean;
    nextSettings: TranslationSettings;
  }) => void;
};
```

**Interface guidance:**

Return a grouped object instead of dozens of top-level names:

```ts
export type SettingsManagerResult = {
  state: {
    settings: TranslationSettings;
    settingsLoaded: boolean;
    settingsOpen: boolean;
    settingsDraft: TranslationSettings | null;
    systemLocale: string;
    sessionFallbackPresetId: string | null;
    translationCacheSummary: TranslationCacheSummary | null;
    translationCacheLoading: boolean;
    translationCacheActionTarget: string | "all" | null;
    editingPresetId: string | null;
    apiKeyEditingPresetId: string | null;
    presetApiKeyDrafts: Record<string, string>;
    presetStatuses: Record<string, PresetTestResult | undefined>;
    presetSaveStatusById: Record<string, PresetSaveStatus>;
    presetTestRunningId: string | null;
    presetModelsLoadingById: Record<string, boolean>;
    presetModels: Record<string, string[]>;
    presetModelMessages: Record<string, string | undefined>;
    presetModelAutoLoadAttempts: Record<string, boolean>;
    testAllPresetsRunning: boolean;
  };
  refs: {
    settingsRef: React.MutableRefObject<TranslationSettings>;
    settingsDraftRef: React.MutableRefObject<TranslationSettings | null>;
    sessionFallbackPresetIdRef: React.MutableRefObject<string | null>;
    presetApiKeyDraftsRef: React.MutableRefObject<Record<string, string>>;
    presetSaveStatusByIdRef: React.MutableRefObject<Record<string, PresetSaveStatus>>;
  };
  actions: {
    handleOpenSettings: () => void;
    handleSettingsOpenChange: (open: boolean) => void;
    handleThemeToggle: () => void;
    handleReaderSettingsChange: (next: Partial<TranslationSettings>) => void;
    getEffectivePreset: () => TranslationPreset | null;
    buildPersistableSettings: () => TranslationSettings;
    refreshTranslationCacheSummary: () => Promise<void>;
    handleClearAllTranslationCache: () => Promise<void>;
    handleClearCachedBookTranslations: (docId: string) => Promise<void>;
    // Include existing preset handlers here.
  };
};
```

**Steps:**

1. Move settings state/refs first without changing handler behavior.
2. Move pure derived values next.
3. Move persistence and dialog handlers.
4. Move preset CRUD/autosave/model/test handlers.
5. Add explicit callback calls where settings changes currently reset translation state.
6. Replace `AppContent` references gradually with `settingsManager.state.*`, `.refs.*`, and `.actions.*`.
7. Run `bun run build`.
8. Manually verify settings open/close, dirty close confirmation, preset add/edit/delete, preset test, model fetch, language change, theme toggle, and cache clearing.

**Risk:** Medium-high. Settings is a shared hub.

**Commit:** `refactor: extract settings manager hook`

---

### Task 7: Extract PDF/EPUB Document Loading in Two Hooks

Avoid one giant `useDocumentLoader` if the code separates cleanly. Prefer two hooks plus a small orchestrator:

- `usePdfDocument`
- `useEpubDocument`
- optional `useDocumentController`

**Files:**
- Create: `src/hooks/usePdfDocument.ts`
- Create: `src/hooks/useEpubDocument.ts`
- Create if useful: `src/hooks/useDocumentController.ts`
- Modify: `src/App.tsx`
- Move helpers if useful: `src/lib/documentLoading.ts`

**Owns:**
- file path/title/type state if using `useDocumentController`
- PDF document state, outline, page sizes, pages, zoom/navigation state
- EPUB data, total pages, toc, current chapter, pending navigation/scroll state
- loading progress and document status message
- recent book reconnect/open logic if it stays cohesive
- PDF extraction cache flush logic
- release PDF document cleanup

**Bridge callbacks accepted by the hook/controller:**

```ts
type DocumentCallbacks = {
  onDocumentWillChange: () => void;
  onDocumentLoaded: (info: {
    // Empty string means no active document. Preserve the current App.tsx semantics.
    docId: string;
    fileType: FileType;
    pages: PageDoc[];
  }) => void;
  onDocumentClosed: () => void;
};
```

**Important guidance:**

- `pagesRef`, `pageTranslationsRef`, and `docIdRef` are permanently orchestration-owned for this plan. Keep them initialized in `AppContent` and pass them into document/translation hooks as shared current-value mirrors. Document loading may write them; translation queue may read them; neither hook owns or recreates them.
- `docId` remains a `string`; an empty string means no active document. Do not introduce `string | null` while extracting document loading.
- If document loading must update page translations, expose explicit setters/callbacks rather than reaching into translation internals.
- Move top-level helper functions to `src/lib/documentLoading.ts` only when doing so reduces hook size. Do not turn this task into a broad helper rewrite.

**Steps:**

1. Extract PDF-only helpers/state first if the boundary is clear.
2. Run `bun run build`.
3. Extract EPUB-only helpers/state next.
4. Run `bun run build`.
5. Extract shared open/recent/reconnect orchestration only after PDF and EPUB pieces compile.
6. Run `bun run build`.
7. Manually verify open PDF, open EPUB, recent book reopen, reconnect missing book, PDF page navigation, EPUB chapter navigation, zoom, and back-to-home cleanup.

**Risk:** High. This area touches many states and refs.

**Commit options:**
- `refactor: extract pdf document hook`
- `refactor: extract epub document hook`
- `refactor: extract document controller hook`

---

## Milestone 3: Translation Queue Extraction

### Task 8: Split Translation Queue Internals Before Creating the Hook

**Files:**
- Create if useful: `src/lib/translationQueue.ts`
- Create if useful: `src/lib/translationFallbackRuntime.ts`
- Modify: `src/App.tsx`

**Goal:** Reduce the size and risk of the final hook by moving pure or near-pure helpers first.

**Candidate extractions:**

- fallback trace/status formatting
- translate-all progress label helpers
- queue de-duplication helpers
- page selection helpers for window/chunk translation mode
- cache key/request construction helpers, if currently embedded in callbacks

**Steps:**

1. Identify helper logic inside translation callbacks that does not directly call React setters.
2. Move one helper group at a time into `src/lib`.
3. Add or update focused unit tests for helpers where practical.
4. Run `bun run build` after each helper group.

**Risk:** Medium. This is safer than moving the whole queue at once.

**Commit:** `refactor: extract translation queue helpers`

---

### Task 9: Extract `useTranslationQueue`

**Files:**
- Create: `src/hooks/useTranslationQueue.ts`
- Modify: `src/App.tsx`

**Owns:**
- translate-all running/wait/stop state
- page translation in-flight state
- translation status message
- translation request refs
- page translation queues
- translate-all runtime refs
- fallback request/trace refs
- PDF translation session ref
- text translation LRU cache ref, unless a helper module owns it better
- Tauri translation progress/failure event listeners
- queue/run/redo/translate-all/pid translation handlers

**Inputs should be explicit:**

```ts
export function useTranslationQueue(args: {
  currentFileType: FileType;
  currentPage: number;
  // Empty string means no active document. Do not widen to string | null in this refactor.
  docId: string;
  docIdRef: React.MutableRefObject<string>;
  pages: PageDoc[];
  setPages: React.Dispatch<React.SetStateAction<PageDoc[]>>;
  pagesRef: React.MutableRefObject<PageDoc[]>;
  pageTranslations: Record<number, PageTranslationState>;
  setPageTranslations: React.Dispatch<
    React.SetStateAction<Record<number, PageTranslationState>>
  >;
  pageTranslationsRef: React.MutableRefObject<Record<number, PageTranslationState>>;
  settingsRef: React.MutableRefObject<TranslationSettings>;
  currentTargetLanguageRef: React.MutableRefObject<TargetLanguage>;
  translationEnabledRef: React.MutableRefObject<boolean>;
  getEffectivePreset: () => TranslationPreset | null;
  showToast: ShowToastFn;
  requestTranslationScroll: (page: number) => void;
}): TranslationQueueResult;
```

If the argument list becomes unmanageable, introduce context only after this hook compiles and behavior is stable.

**Steps:**

1. Move translation state and refs into the hook.
2. Move Tauri translation event effects.
3. Move `queuePagesForTranslation` and verify current-page translation.
4. Run `bun run build`.
5. Move redo and single-PID translation handlers.
6. Run `bun run build`.
7. Move translate-all start/stop/resume logic.
8. Run `bun run build`.
9. Manually verify current page translation, translate all, stop, resume after usage/rate limit, redo page, fallback behavior, stale response handling, PDF and EPUB translation flows.

**Risk:** Very high. This is the main event.

**Commit:** `refactor: extract translation queue hook`

---

## Milestone 4: Optional Context and Final Slimming

### Task 10: Decide Whether `AppReaderContext` Is Worth It

Do this only after the hooks are extracted and compiling.

**Use context if:**

- multiple hooks need the same stable read-only values,
- prop lists are making real changes error-prone,
- the provider can stay local to `AppContent`,
- the context value is memoized and does not cause broad rerender churn.

**Skip context if:**

- explicit hook arguments are understandable,
- only one hook has a long parameter list,
- context would hide important write paths.

**Possible file:**
- Create: `src/hooks/AppReaderContext.tsx`

**Possible shape:**

```ts
export type AppReaderState = {
  // Empty string means no active document.
  docId: string;
  currentFileType: FileType;
  settings: TranslationSettings;
  settingsLoaded: boolean;
  translationEnabled: boolean;
  currentTargetLanguage: TargetLanguage;
  effectivePreset: TranslationPreset | null;
  pagesRef: React.MutableRefObject<PageDoc[]>;
  pageTranslationsRef: React.MutableRefObject<Record<number, PageTranslationState>>;
  settingsRef: React.MutableRefObject<TranslationSettings>;
  currentTargetLanguageRef: React.MutableRefObject<TargetLanguage>;
  translationEnabledRef: React.MutableRefObject<boolean>;
  docIdRef: React.MutableRefObject<string>;
};
```

**Risk:** Medium. Context can make code nicer, but it can also make data flow harder to see.

**Commit if done:** `refactor: add reader context`

---

### Task 11: Final Cleanup

**Files:**
- Modify: `src/App.tsx`
- Create if useful: `src/hooks/index.ts`

**Steps:**

1. Remove unused imports from `src/App.tsx`.
2. Ensure hook result names are grouped and readable.
3. Add a hooks barrel only if it improves import clarity.
4. Run `bun run build`.
5. Run relevant tests.
6. Manually smoke test the full app:
   - PDF open/render
   - EPUB open/render
   - current page translation
   - translate all / stop
   - fallback preset path
   - target language change
   - settings preset CRUD
   - cache clear
   - annotations
   - word/selection translation
   - resize panels
   - theme/accent
   - update status UI

**Commit:** `refactor: complete AppContent decomposition`

---

## Testing Strategy

Because this is a refactor, the primary goal is unchanged behavior.

Minimum verification after every task:

```bash
bun run build
```

Use focused manual checks after each domain extraction:

- Theme: toggle system/light/dark and accent color.
- Resize: drag column and rail splitters; toggle panels.
- Updates: open About and check update controls/status.
- Annotations: create, delete, and edit notes.
- Word translation: select text and clear popup.
- Settings: edit presets, test models, change language, clear cache.
- Documents: open PDF and EPUB, navigate, zoom, reopen recent book.
- Translation queue: translate current page, translate all, stop, redo, fallback, stale-response behavior.

Run existing focused test files when touching related utilities. Do not add broad snapshot tests for the refactor.

---

## Rollback Strategy

Each task should be one commit. If a regression appears:

```bash
git revert HEAD
```

Then either retry the extraction in smaller pieces or leave that domain in `AppContent` until there is better test coverage.

---

## Revised Effort Estimate

The original 7-hour estimate is optimistic. A safer estimate:

| Milestone | Scope | Estimate |
|---|---|---:|
| 0 | Baseline inventory | 30-60 min |
| 1 | Low-risk hooks | 3-5 hours |
| 2 | Settings + document loading | 1-2 days |
| 3 | Translation queue | 1-2 days |
| 4 | Optional context + cleanup | 2-4 hours |

Total: roughly 2-4 focused days, depending on how cleanly document loading and translation queue separate.

---

## Recommendation

Do Milestone 1 soon. It is worth it, low risk, and will make `App.tsx` less intimidating.

Do Milestones 2 and 3 only when there is time to verify carefully. Those parts touch the behavior users care about most: opening books and getting translations. Keep them incremental, explicit, and reversible.
