# Changelog

All notable changes to **readani** since forking from upstream (v0.1.8).

## [1.3.0] — 2026-05-05

### Added

- **Sentence annotations** — highlight and annotate individual sentences on the PDF. Annotations appear as colored highlight overlays on the PDF and as inline note cards in the translation pane. Annotations persist across sessions and survive text extraction changes via source-hash matching. ([`01f1d8d`](src/components/AnnotationsPanel.tsx), [`fb57aeb`](src/lib/annotationMatching.ts))
- **Annotations panel** — sidebar panel listing all annotations for the current document, grouped by page, with note previews and "needs review" badges for annotations whose source text has drifted. ([`8f0ea5f`](src/components/AnnotationsPanel.tsx))
- **Per-book translation preferences** — each book remembers its own translation preset, target language, and enabled state. Switching between books restores the previous settings automatically. ([`8786dbe`](src/App.tsx))
- **Lazy PDF extraction caching** — extracted text is cached per-document and per-extraction version, avoiding redundant re-extraction when reopening documents. Cache writes are batched for efficiency. ([`86ea848`](src/lib/pdfExtractionCacheQueue.ts), [`d723322`](src/lib/pdfExtractionCacheQueue.ts))
- **Model-neutral translation cache** — cached translations are now shared across models when the source text, document, and target language match, reducing redundant API calls when switching presets. ([`65c227f`](src-tauri/src/lib.rs))
- **Neutral extraction progress** — extraction progress indicator shows status independently of translation state, with original-text highlights for extracted but not-yet-translated sentences. ([`67d5d67`](src/App.css))

### Changed

- Inline annotation notes display directly inside sentence cards instead of requiring a separate panel interaction. ([`8f0ea5f`](src/components/TranslationPane.tsx))
- Annotation comment editing is refined with improved focus handling and queue-pause behavior during edits. ([`6b7ef70`](src/App.tsx))
- Target language changes now fully clear visible translations to prevent stale content from persisting. ([`14193a7`](src/App.tsx))

## [1.2.1] — 2026-04-30

### Added

- **Interactive page progress bar** — the translation pane footer now shows a per-page color bar: green for translated pages, fading pulse for pages being translated, grey for pages yet to be translated. Click or drag anywhere on the bar to jump to that page. Full keyboard navigation (arrows, Home/End) and `prefers-reduced-motion` support.
- **Auto-translate ahead** — new setting in General tab to configure how many following pages are pre-translated automatically (Off / 1 / 2 / 3+).

### Changed

- Cache management now distinguishes **legacy cached books** (from older versions) from current cache entries, with clearer labeling in the settings cache tab.
- Translation queue logic: foreground page requests now reset the queue from scratch instead of accumulating stale entries; background pages no longer receive stale "queued" markers.

### Fixed

- **Resume where you left off** — previously translated pages failed to be automatically restored when a document was reopened; cached content now loads correctly so you never need to re-translate.
- Opening quotes (e.g., `"`, `「`) now stay with the sentence they introduce instead of being split into a separate segment.
- Page translation count derives from paragraph state only, eliminating false counts from empty or non-translatable pages.
- Empty-state guard prevents spurious "input changed" detection when no prior translation state exists.

## [1.2.0] — 2026-04-22

### Added

- **Intl.Segmenter text extraction** — two-pass pipeline replaces paragraph heuristics: builds normalized reading text, then splits into sentences using `Intl.Segmenter` with locale-aware guessing (ja/ko/zh/en); rule-based fallback when unavailable ([`4cae789`](src/lib/textExtraction.ts))
- **Ollama provider** — new translation backend kind alongside OpenRouter and DeepSeek; Rust command, preset config, and error classification ([`126c877`](src-tauri/src/lib.rs), [`e5868e8`](src/lib/providers.ts))
- **Preset auto-fallback** — when the active preset fails, automatically tries the next available preset; user-visible fallback trace in translation pane ([`c25bce1`](src/App.tsx), [`d898e82`](src/components/TranslationPane.tsx))
- **Segment-based PDF translation** — per-sentence cards with source/translation stacked, replacing page-level translation ([`f33ced4`](src/components/TranslationPane.tsx))
- **Segment card redesign** — copy buttons per row (translation & original), expandable original text with CSS slide animation, multi-select (click / Cmd-click / Shift-click) with floating batch-copy toolbar ([`fade83d`](src/components/TranslationPane.tsx))
- **Dot-style PDF highlights** — replaced full-width stripe overlays with small dot markers (10–18 px, capped by line thickness) ([`fade83d`](src/components/PdfPage.tsx))
- **Toast system** — enter/exit animations (`toast-enter`/`toast-exit` with cubic-bezier easing), suppressed under `prefers-reduced-motion`; status and error messages migrated from inline text to toasts ([`f706566`](src/components/ToastProvider.tsx), [`150e0c3`](src/App.tsx))
- **Setup prompt toast** — when no translation provider is configured, a toast with "Open Settings" action button appears ([`150e0c3`](src/App.tsx))
- **Tabbed settings** — three Radix Tabs: General (language, slow mode), Providers (presets, fallback), Cache (size, per-book deletion, delete-all) ([`0123f5b`](src/components/SettingsDialogContent.tsx))
- **Cache management commands** — Rust backend: `get_translation_cache_summary`, `clear_cached_book_translations`, `clear_all_translation_cache` ([`318ac8e`](src-tauri/src/lib.rs))
- **Translate-all slow mode** — adjustable delay between translation requests, toggleable in settings ([`2d8d0e0`](src/lib/slowMode.ts), [`b39ae79`](src/components/SettingsDialogContent.tsx))

### Changed

- CJK-specific text normalizations: OCR periods → 中点, ASCII commas → 、, stray apostrophes stripped
- Short page headings (y < 25%, ≤ 24 chars) preserved even when they resemble vertical marginalia
- Error reporting centralized through toast notifications instead of inline status text

### Fixed

- Async fallback closures now correctly clone captures to avoid borrow-after-move ([`fa6db6b`](src-tauri/src/lib.rs))

## [1.1.0] — 2026-04-21

### Added

- **Tauri auto-updater** — in-app update checking with signed manifests and DMG distribution ([`b8b5cd0`](src-tauri/tauri.conf.json))
- **Signed GitHub release pipeline** — notarized DMG artifacts, updater manifest generation, automated publishing on tag push ([`5c2bf72`](.github/workflows/))

### Fixed

- DMG notarization separated from build step and correctly applied to shipped artifacts ([`5a3a548`](.github/workflows/), [`c45e6fd`](.github/workflows/))
- Tauri JS package version alignment ([`d100b5b`](package.json))
- Updater signing key rotation ([`990600e`](src-tauri/tauri.conf.json))

## [1.0.0] — 2026-04-20

The first release of **readani** as a standalone bilingual PDF reader, forked from ReadAny.

### Added

- **Reader workspace** — two-pane resizable layout: PDF viewer on the left, translation pane on the right, with a status bar ([`c1e8fb2`](src/App.tsx))
- **PDF page rendering** — pdf.js-based viewer with page navigation sidebar, text-layer overlays, and highlight rects ([`9ef6463`](src/components/PdfViewer.tsx), [`09e98c6`](src/components/PdfPage.tsx))
- **Translation pane** — sentence-level source + translation display with hover/click highlighting linked to PDF rects ([`0eae317`](src/components/TranslationPane.tsx))
- **Provider system** — Rust backend translation with OpenRouter support, configurable model, temperature, and target language ([`e00a304`](src-tauri/src/lib.rs))
- **Settings dialog** — language combobox, provider presets with CRUD, model combobox with save/done UX, discard-on-close ([`30f5004`](src/components/SettingsDialogContent.tsx), [`96d1e32`](src/components/SettingsDialogContent.tsx))
- **About dialog** — app version, credits, and copyright ([`f1b40f7`](src/components/AboutDialog.tsx))
- **Typography system** — Fira Sans Condensed bundled, custom type scale, rail pane headers, polished resize handles ([`1673f39`](src/App.css), [`8b5a722`](src/App.css))
- **Dark theme** — theme-aware UI respecting system preference with manual override ([`8b5a722`](src/App.css))
- **EPUB translate-all** — batch translation for EPUB documents with progress tracking ([`090b47e`](src/App.tsx))
- **Navigation toolbar** — page navigation controls and expandable action buttons ([`0eae317`](src/components/NavigationToolbar.tsx))
- **App branding** — renamed to readani with updated icons, metadata, and home screen ([`3f63088`](src/App.tsx), [`711c331`](src/components/HomeView.tsx))
- **Shared translation cache** — local JSON cache under app config dir, keyed by docId + sentence + model + language ([`e00a304`](src-tauri/src/page_cache.rs))

### Changed

- Improved vertical text detection and glyph extraction for CJK PDFs ([`ca5a055`](src/lib/textExtraction.ts))
- Cleaner default presets and validated model names in backend ([`f99475b`](src-tauri/src/lib.rs))

### Fixed

- PDF memory leaks in reader lifecycle — proper cleanup of pdf.js resources on unmount ([`cf17b87`](src/components/PdfPage.tsx))
- Backend serde aliases for legacy provider kind values to maintain compatibility ([`aad5e20`](src-tauri/src/lib.rs))

[1.3.0]: https://github.com/galza-guo/readani/releases/tag/v1.3.0
[1.2.1]: https://github.com/galza-guo/readani/releases/tag/v1.2.1
[1.2.0]: https://github.com/galza-guo/readani/releases/tag/v1.2.0
[1.1.0]: https://github.com/galza-guo/readani/releases/tag/v1.1.0
[1.0.0]: https://github.com/galza-guo/readani/releases/tag/v1.0.0