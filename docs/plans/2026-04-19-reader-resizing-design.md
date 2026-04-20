# Reader Resizing Design

Status: Approved on 2026-04-19

## Goal

Let the user adjust the width of the three reader regions that matter during PDF reading:

- the PDF navigation sidebar
- the left reading pane
- the right translation pane

The app should remember those widths the next time it opens.

## Product Decision

Add desktop-style draggable split bars to the reader layout.

There are two resize boundaries:

- one divider between the left reading pane and the right translation pane
- one divider inside the PDF pane between the PDF navigation sidebar and the PDF page viewport

This means the user can effectively control all three visible widths without adding extra controls or settings.

## Interaction Model

### Desktop behavior

On desktop-sized layouts:

- dragging the outer divider resizes the left and right panes live
- dragging the inner divider resizes the PDF navigation sidebar and the PDF page area live
- the cursor should clearly indicate horizontal resizing
- while dragging, text selection should not interfere with the movement

### Remembered widths

The app should remember:

- the last expanded width of the PDF navigation sidebar
- the left pane width in split view
- the right pane width in split view

These values should be stored locally in the frontend, alongside the existing remembered PDF navigation preferences.

### Hidden sidebar behavior

If the PDF navigation sidebar is hidden:

- its last expanded width should remain stored
- re-opening the sidebar should restore that previous width instead of a hard-coded size

### View mode behavior

When the user switches between:

- `split`
- `PDF only`
- `translation only`

the remembered split widths should stay intact. Hidden panes simply stop rendering their resize handles until they become visible again.

### Reset affordance

Double-clicking a divider should reset that divider to its default width.

This is a small recovery feature so the user can get back to a sensible layout quickly after an awkward drag.

## Constraints

### Minimum widths

Each resizable area needs a minimum width so the UI never collapses into unusable slivers.

Suggested constraints:

- PDF navigation sidebar: enough room for readable thumbnails and contents labels
- left PDF pane: enough room to keep the page usable at normal zoom
- right translation pane: enough room to keep reading text comfortable

The final implementation should clamp widths to those minimums during drag and when restoring saved values.

### Small screens

On narrower layouts, the app should keep the current responsive stacked layout instead of forcing draggable resizing into a cramped space.

Saved width preferences can remain stored, but the mobile-style layout should take priority whenever the viewport is too small.

## Architecture

### State ownership

`src/App.tsx` should remain the owner of top-level reader layout state:

- left pane width
- right pane width
- whether split-view resizing is active for the current viewport and view mode

`src/components/PdfViewer.tsx` should own or receive the PDF-internal sidebar width state:

- sidebar width
- divider drag callbacks
- reset behavior for the inner divider

### Preference storage

The existing PDF navigation preference storage should be extended so one small frontend storage layer handles:

- active PDF nav tab
- sidebar collapsed state
- sidebar width
- left pane width
- right pane width

### Layout calculations

Width restoration should go through validation and clamping helpers rather than using saved raw values blindly.

This avoids broken layouts when:

- the window is smaller than last time
- the app starts on a different monitor
- the user previously dragged a pane near the limit

## Testing Expectations

Manual and automated verification should cover:

- default widths apply when nothing is stored
- saved widths reload correctly
- dragging the outer divider resizes the left and right panes
- dragging the inner divider resizes the nav sidebar and PDF page area
- collapsing and re-opening the nav sidebar restores its previous width
- switching view modes preserves remembered widths
- double-clicking a divider resets its width to the default
- narrow layouts still use the current responsive stacked behavior

## Out Of Scope

- vertical resizing
- separate width controls for EPUB
- resize animations
- arbitrary multi-pane layout presets
