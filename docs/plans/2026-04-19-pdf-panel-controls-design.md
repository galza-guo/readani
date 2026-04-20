# PDF Panel Controls Design

Status: Approved on 2026-04-19

## Goal

Move PDF-only reading controls out of the global header and into the left document pane so they feel attached to the page they affect.

## Product Decision

The PDF pane gets two dedicated control regions:

- a top navigation strip inside the left pane
- a bottom zoom strip inside the left pane

The global app header keeps app-level actions only.

## Top Navigation Strip

The top strip is a slim reader bar inside the PDF pane.

Layout:

- left edge: previous-page chevron button
- center: `Page [X] of Y`
- right edge: next-page chevron button

Behavior:

- chevrons disable at the first and last page
- `X` is an editable number input
- pressing Enter or blurring the field jumps to the typed page
- invalid input resets to the current page
- out-of-range input clamps to the nearest valid page

## Zoom Control

The PDF pane keeps zoom available, but the UI should be lighter than a full-width bottom toolbar.

Controls:

- a magnifier button near the bottom-right area of the left pane
- clicking the magnifier opens a compact zoom popover
- the popover contains a single-row control set:
  - preset chooser: `Fit width`, `Fit height`, `100%`, `150%`
  - zoom slider
  - current zoom percentage readout

Behavior:

- opening a PDF defaults to `Fit width`
- `Fit width` and `Fit height` recompute automatically when the left pane size changes
- moving the slider switches the reader into manual zoom
- `100%` and `150%` are manual zoom shortcuts
- the zoom popover opens on click, not hover
- the zoom popover auto-hides when focus leaves it or the pointer moves away

## Architecture

`src/App.tsx` remains the source of truth for:

- current page
- PDF zoom preference state
- document type
- app-level header actions

`src/components/PdfViewer.tsx` becomes responsible for:

- rendering the top and bottom PDF control bars
- measuring the PDF viewport area
- resolving fit-width and fit-height zoom into an effective render scale
- reporting the effective PDF scale back to the app when needed

`src/lib/readerLayout.ts` should own the pure helper logic for PDF fit zoom so it can be tested without mounting React components.

## Testing Expectations

Automated coverage should verify:

- fit-width scale uses the available viewer width
- fit-height scale uses the available viewer height
- manual zoom values clamp to supported limits

Manual verification should cover:

- chevron navigation
- typed page jump
- default fit-width behavior on PDF load
- correct zoom updates after pane resize
- quick-select and slider interaction
