# Three-Column Reader Workspace Design

Status: Approved on 2026-04-20

## Goal

Keep the reader layout flexible without letting the workspace sprawl wider than the window.

The reader should use at most three visible columns:

- Navigation
- Original
- Right rail

The right rail contains Translation and AI chat as stacked sections instead of separate side-by-side columns.

## Product Decision

Replace the earlier four-column desktop model with a three-column workspace:

1. Navigation
2. Original
3. Right rail

The right rail is visible whenever either Translation or AI chat is visible.

Translation and AI chat stay independently toggleable:

- if only Translation is on, it fills the whole right rail
- if only AI chat is on, it fills the whole right rail
- if both are on, they stack vertically in the same rail

Default reader state:

- Navigation: off
- Original: on
- Translation: on
- AI chat: off

## Layout Model

### Horizontal structure

Visible columns always appear in this order:

- Navigation
- Original
- Right rail

Hidden columns take no width.

Each visible column has a minimum width so the workspace never collapses into unusable slivers.

The columns flex with the window size, but the user’s chosen proportions should be remembered for each visible column set. For example:

- Original + right rail can remember one split
- Navigation + Original + right rail can remember another split

### Right rail structure

The right rail contains:

- Translation
- AI chat

When both are visible, the default split is 60/40 with Translation above AI chat.

That vertical split is resizable and remembered.

Each visible rail section also has a minimum height.

## Window Sizing

The app should avoid horizontal scrolling.

Panels should shrink proportionally as the window shrinks until their minimum sizes are reached. After that point, the window itself should stop shrinking further.

This means the effective minimum window width and height depend on which panels are visible:

- width depends on the visible columns
- height depends on the tallest visible column requirement, including the stacked right rail when both Translation and AI chat are enabled

## Toolbar

The top toolbar should stay minimal:

- Back
- Translate all
- independent toggles for Navigation, Original, Translation, AI chat
- icon-only Settings on the far right

The toolbar should not carry document-local actions or long status text.

## Status Bar

Keep the bottom status bar.

Left side:

- short system-style status text
- loading bar when needed

Right side:

- concise translation progress

Examples:

- `Ready`
- `Loading document`
- `Extracting text`
- `Translating page 6`
- `Redoing page 6`
- `12/40 pages`
- `Fully translated`

## Panel Responsibilities

### Navigation column

- PDF thumbnails / outline
- EPUB table of contents
- navigation works even when Original is hidden

### Original column

- PDF viewer or EPUB reader
- document-local controls stay here

### Right rail

Translation section:

- current page label
- cached badge when relevant
- icon-only redo action
- vocabulary action

AI chat section:

- title
- clear action
- normal panel behavior, not overlay behavior

## Architecture

`src/App.tsx` should own:

- panel visibility
- remembered horizontal column proportions by visible column set
- remembered vertical rail split
- active resize handle state
- computed minimum workspace size and window size constraints

`src/lib/readerWorkspace.ts` should define the pure layout rules:

- visible columns from panel toggles
- visible rail sections from panel toggles
- default and minimum sizes
- pair-resize clamping for horizontal and vertical splits
- minimum workspace width and height calculations

## Constraints

- UI remains English-only
- translation pipeline stays unchanged
- no new reader features beyond layout cleanup
- no horizontal scrolling as a normal layout strategy
- preserve working thumbnail navigation and resize handles

## Verification Expectations

Verification should cover:

- default visible panels
- rail visibility when either Translation or AI chat is enabled
- 60/40 default rail split when both are enabled
- remembered horizontal proportions for different visible column sets
- remembered rail split after toggling panels
- minimum workspace width and height calculation
- no regression in PDF thumbnails
- no regression in split handles
- PDF and EPUB navigation still working when Original is hidden
