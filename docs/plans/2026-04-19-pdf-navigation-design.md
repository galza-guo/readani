# PDF Navigation Sidebar Design

Status: Approved on 2026-04-19

## Goal

Add faster PDF navigation without changing the core reading model.

The reader should stay page-based and calm:

- the PDF remains a single-page reading view
- the user can jump quickly with thumbnails or table of contents
- the user can hide the navigation chrome when they want more page space
- scroll wheel movement at the page edges should turn pages naturally

## Product Decision

The PDF reader gets a collapsible navigation sidebar inside the left document pane.

The sidebar has two tabs:

- `Thumbnails`
- `Contents`

Behavior:

- default tab for a new user is `Thumbnails`
- after the first switch, remember the last-used tab
- remember whether the sidebar is collapsed or expanded
- clicking any thumbnail or contents item jumps to that page immediately

This keeps fast navigation attached to the original document instead of spreading controls across the header or opening overlays.

## Layout

The app keeps its current top-level split layout:

- left: original document
- right: translation pane

Inside the left PDF pane, the layout becomes:

- navigation sidebar
- main PDF viewport

The sidebar is PDF-specific. EPUB keeps its existing contents sidebar behavior.

## Sidebar Behavior

### Thumbnails tab

The thumbnails tab shows one preview per page.

Requirements:

- preview image is recognizable enough for fast scanning
- current page is visually highlighted
- clicking a thumbnail sets `currentPage`
- thumbnails should be loaded lazily so large PDFs do not freeze the UI

### Contents tab

The contents tab uses the PDF outline from `pdf.js`.

Requirements:

- show outline items in a scrollable list
- map each outline destination to a page number
- highlight the item that matches the current page when possible
- if the PDF has no outline, show a small empty state: `No contents available.`

## Page-Turn Scrolling

The PDF view stays single-page, but scrolling gains edge-triggered page turns.

Behavior:

- normal scrolling inside a zoomed page still works normally
- when the user scrolls downward while already at the bottom edge, move to the next page
- when the user scrolls upward while already at the top edge, move to the previous page
- after moving forward, the new page opens at the top
- after moving backward, the new page opens at the bottom

This should feel like continuous reading without switching the reader to a continuous-scroll architecture.

## State And Persistence

New lightweight reader UI state:

- active PDF navigation tab
- PDF sidebar collapsed or expanded

These are frontend-only UI preferences, not book data. They can be stored locally in the frontend.

Reading progress remains in the current Rust-backed recent-books flow.

## Architecture

### App-level responsibilities

`src/App.tsx` stays the source of truth for:

- `currentPage`
- total pages
- document type
- PDF navigation preferences
- page-change handlers

### PDF viewer responsibilities

`src/components/PdfViewer.tsx` should be extended to:

- render the PDF page viewport
- handle edge-based scroll page turns
- accept callbacks for page-turn requests
- host the PDF navigation sidebar shell or a closely related child component

### PDF navigation responsibilities

A PDF navigation component should handle:

- tab switching
- collapse toggle
- thumbnail list rendering
- contents list rendering
- current-page highlighting

### Thumbnail generation

Thumbnails should come from `pdf.js` page rendering at a smaller scale than the main page.

To keep the UI responsive:

- generate only what is needed first
- cache generated preview URLs or image data in memory for the current document session

## Testing Expectations

Manual and automated coverage should verify:

- PDF sidebar appears with `Thumbnails` selected by default
- last-used tab and collapsed state are remembered
- clicking a thumbnail jumps to the correct page
- clicking a contents item jumps to the correct page
- contents tab shows an empty state when no outline exists
- scrolling inside a zoomed page does not turn pages too early
- scrolling past the bottom turns to the next page
- scrolling past the top turns to the previous page

## Out Of Scope

- redesigning EPUB navigation
- continuous-scroll PDF mode
- search
- annotations
- multi-page thumbnail grids outside the sidebar
