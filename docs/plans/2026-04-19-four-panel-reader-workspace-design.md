# Four-Panel Reader Workspace Design

Status: Approved on 2026-04-19

## Goal

Clean up the reader chrome so the workspace feels calmer and more flexible.

The reader should support four independent desktop-style panels, ordered from left to right:

- Navigation
- Original
- Translation
- AI chat

## Product Decision

Replace the current single view mode selector with four independent panel toggles.

Each panel can be shown or hidden on its own. Hidden panels take up no width. Visible panels always stay in a stable left-to-right order so the layout does not jump around.

The default reading setup should stay focused:

- Navigation: off
- Original: on
- Translation: on
- AI chat: off

## Reader Layout

### Panel model

The reader becomes a four-panel workspace:

1. Navigation
2. Original document
3. Translation
4. AI chat

This allows combinations such as:

- Original + Translation
- Navigation + Translation
- Translation + AI chat
- all four panels together

At least one panel must remain visible so the workspace can never collapse into an empty screen.

### Width behavior

Visible panels share the available width. Hidden panels take no space.

The intended weight of each panel is:

- Navigation: narrow support column
- Original: primary, widest column
- Translation: medium reading column
- AI chat: medium support column

When a panel is turned off, the remaining visible panels expand. When it is turned back on, the app should restore the last sensible width if possible.

Resize handles should appear only between adjacent visible panels.

## Top Bar

The top bar should only contain global controls.

Keep:

- Back
- Translate all
- four independent panel toggles
- Settings as an icon-only button on the far right

Remove from the top bar:

- app icon and title
- Open File
- long status text
- translation progress text
- Redo page
- Vocabulary

The top bar should answer one question only: what workspace and global action does the user want right now?

## Bottom Status Bar

Move system feedback into a dedicated bottom status bar.

Left side:

- short status text such as `Ready`, `Loading PDF`, `Extracting text`, `Translating page 6`, `Redoing page 6`, `Translation failed`

Right side:

- translation progress such as `12/40 pages` or `Fully translated`

If loading is active, the loading bar should live in this bottom bar so status and progress are grouped together.

Status wording should become short and system-like instead of sentence-like.

## Panel Headers

Panel-local controls should move into the panel they belong to.

### Navigation

- header label such as `Navigate`
- local tabs for PDF thumbnails and contents
- no extra collapse button inside the panel because the global toggle handles visibility

### Original

- keep document-facing controls here
- for PDF, page movement and zoom stay with the document view
- the document itself remains the visual priority

### Translation

- header shows the current page
- keep the cached badge here when relevant
- move Redo page here as an icon-only action
- move Vocabulary here because it is part of translation and word lookup

### AI chat

- render as a normal panel instead of a fixed overlay
- keep the title and Clear action in the panel header
- panel visibility should come from the global toggle, not a close button model

## PDF And EPUB Consistency

The four-panel mental model should be the same for both formats.

### PDF

- Navigation: thumbnails / contents
- Original: PDF page view
- Translation: page translation
- AI chat: chat panel

### EPUB

- Navigation: table of contents
- Original: EPUB reading area
- Translation: paragraph translation view
- AI chat: chat panel

Shared behavior:

- Navigation can change reading position even when Original is hidden
- Translation and AI chat follow the same current reading position
- background translation work can continue while Translation is hidden
- empty but visible panels should show a short empty state instead of breaking the layout

## Architecture

### Reader shell responsibilities

`src/App.tsx` should own:

- panel visibility state
- panel width state
- global toolbar actions
- bottom status bar data

### Panel responsibilities

Each panel should own its own header and local controls:

- navigation tabs inside the Navigation panel
- document controls inside the Original panel
- retry and vocabulary inside the Translation panel
- title and clear inside the AI chat panel

### Structural change

The current PDF navigation sidebar must be separated from the PDF viewer so it can exist without the Original panel.

The current AI chat panel must stop using fixed overlay positioning and instead render as part of the main panel layout.

The EPUB reader should follow the same separation so contents navigation can exist independently from the Original EPUB reading column.

## Constraints

- keep the UI English-only
- do not add new product features beyond the layout cleanup
- keep translation requests and caches unchanged
- preserve current translation behavior while moving controls around
- maintain sane minimum widths for all visible panels

## Testing Expectations

Verification should cover:

- default visible panels
- independent panel toggles
- one-panel minimum safety rule
- width redistribution when panels appear or disappear
- standalone navigation plus translation layouts
- standalone chat panel behavior inside the grid
- bottom status text and progress display
- Redo page from the Translation panel
- PDF and EPUB navigation working without the Original panel visible

## Out Of Scope

- mobile-first redesign
- new AI chat capabilities
- new vocabulary workflows
- changing the translation pipeline
