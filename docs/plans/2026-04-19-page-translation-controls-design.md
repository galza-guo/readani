# Page Translation Controls Design

Status: Approved on 2026-04-19

## Goal

Add PDF page-translation toolbar controls for redoing the current page and translating the whole book, while keeping reading uninterrupted and making cache decisions explicit.

## Product Decision

The PDF reader toolbar gets:

- a `Redo Page` action for the current page
- a `Translate All` action for the whole PDF
- a persistent translation progress indicator

These controls are PDF-only. EPUB keeps its current paragraph-level translation flow.

## User Experience

### Redo Page

`Redo Page` clears the cached page translation for the page the user is currently reading, then immediately requests a fresh translation for that page.

If an older translation request for that page is still in flight, its response must be ignored when the newer redo request finishes later.

### Translate All

`Translate All` starts a background job that translates the PDF page by page in reading order.

This job does not block reading:

- the user can keep scrolling and changing pages
- the current page can be prioritized without creating duplicate requests
- the app remains responsive while the background job progresses

When all translatable pages are already translated, the primary full-book action label becomes `Replace All`.

Choosing `Replace All` redoes the entire PDF from scratch for the current translation settings.

## Cached Page Decision Dialog

Before a full-book run starts, the app checks whether other pages in the current PDF already have cached page translations for the active provider, model, target language, and current extracted source text.

If cached pages are found outside the current page, the app opens a styled in-app dialog with the existing Radix dialog visual language already used for `Settings` and `Vocabulary`.

Dialog actions:

- `Replace All`: clear this PDF's page-translation cache for the active translation settings, then queue every translatable page again
- `Skip Cached`: keep cached pages and queue only missing pages
- `Cancel`: close the dialog and do nothing

This dialog should be implemented as a reusable confirmation/prompt component so future in-app dialogs can follow the same pattern.

## Progress Indicator

The toolbar should always show page-translation progress for PDFs.

Examples:

- `101/149 pages translated`
- `Fully translated`

The denominator should count only translatable pages, meaning pages whose extracted main text is usable for page translation.

Pages with empty, image-only, or OCR-noise-only content should be considered resolved-but-not-translatable so they do not block `Fully translated`.

## Architecture

`src/App.tsx` remains the source of truth for:

- current PDF page
- per-page translation state shown in the translation pane
- toolbar status text and progress display
- background full-book translation mode and dialog visibility

The page-translation flow should be refactored behind one shared scheduler path so foreground page requests and background full-book requests cannot issue duplicate API calls for the same page.

The scheduler should track:

- pages queued for foreground priority
- pages queued for background translation
- pages currently in flight
- a per-page request version used to discard stale responses

The scheduler must prefer the current page when needed, but reuse the existing queued or in-flight work for that page instead of creating a second request.

Pure queue/progress logic should live in a small testable helper module under `src/lib/` rather than being embedded entirely inside the component body.

## Backend Cache Support

The Rust backend already owns page-translation caching and should continue to do so.

Add small page-cache commands that let the frontend:

- inspect which pages in the current document already have matching cached page translations for the active translation settings
- clear a single cached page translation
- clear cached page translations for the whole document under the active translation settings

These commands must respect the existing page cache key inputs:

- `docId`
- `page`
- source text hash
- provider
- model
- target language
- prompt version

## Race-Condition Handling

The clean way to avoid duplicate page translation calls is:

- one shared queueing path for all page-translation requests
- one in-flight request per page at most
- request-version checks before applying success or error state
- full-book translation work remaining background-only until it reaches the front of the shared queue

This means:

- changing pages during `Translate All` does not duplicate work
- pressing `Redo Page` during `Translate All` supersedes any older pending result for that page
- replacing the whole cache during an active run invalidates stale responses instead of letting them overwrite fresh work

## Testing Expectations

Automated coverage should verify:

- queue deduplication between foreground and background page requests
- progress counting for translated vs translatable pages
- full-book action label rules (`Translate All` vs `Replace All`)
- backend page-cache listing and clearing behavior

Manual verification should cover:

- `Redo Page` on the current page
- `Translate All` while freely navigating to other pages
- cached-page dialog choices for `Replace All`, `Skip Cached`, and `Cancel`
- always-visible progress text updating during the run
- `Fully translated` state when all translatable pages are complete
