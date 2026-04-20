# Four-Panel Reader Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current reader toolbar and split-view mode with a calmer four-panel workspace that supports independent Navigation, Original, Translation, and AI chat columns plus a bottom status bar.

**Architecture:** Introduce a top-level reader workspace model in `src/App.tsx` that tracks which panels are visible, how wide they are, and what status text should appear in the bottom bar. Pull PDF and EPUB navigation out of the document viewers so navigation becomes its own panel, move translation/chat controls into local panel headers, and render AI chat as a normal column instead of a fixed overlay.

**Tech Stack:** Bun tests, React 19 + TypeScript, Tauri desktop app, Radix UI, pdf.js, epub.js, CSS grid/flex layout

---

### Task 1: Add failing tests for four-panel workspace state helpers

**Files:**
- Create: `src/lib/readerWorkspace.test.ts`
- Create: `src/lib/readerWorkspace.ts`

**Step 1: Write the failing test**

Add tests that lock down the panel visibility and width rules:

```ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_READER_PANELS,
  ensureAtLeastOnePanelVisible,
  getOrderedVisiblePanels,
  getVisiblePanelTemplate,
  toggleReaderPanel,
} from "./readerWorkspace";

describe("toggleReaderPanel", () => {
  test("turns a hidden panel on", () => {
    expect(
      toggleReaderPanel(DEFAULT_READER_PANELS, "navigation")
    ).toMatchObject({ navigation: true });
  });

  test("keeps the last visible panel on", () => {
    expect(
      toggleReaderPanel(
        { navigation: false, original: true, translation: false, chat: false },
        "original"
      )
    ).toEqual({ navigation: false, original: true, translation: false, chat: false });
  });
});

describe("getOrderedVisiblePanels", () => {
  test("returns visible panels in stable left-to-right order", () => {
    expect(
      getOrderedVisiblePanels({
        navigation: true,
        original: false,
        translation: true,
        chat: true,
      })
    ).toEqual(["navigation", "translation", "chat"]);
  });
});

describe("getVisiblePanelTemplate", () => {
  test("returns one track per visible panel", () => {
    expect(
      getVisiblePanelTemplate(["navigation", "translation", "chat"])
    ).toBe("minmax(220px, 0.75fr) minmax(320px, 1fr) minmax(280px, 0.9fr)");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Create `src/lib/readerWorkspace.ts` with:

- a `ReaderPanelKey` type for `navigation`, `original`, `translation`, `chat`
- default panel visibility values
- a stable ordered list of panel keys
- `toggleReaderPanel`
- `ensureAtLeastOnePanelVisible`
- helpers for turning visible panel lists into CSS grid tracks

Keep the logic framework-free so UI rendering can stay simple.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/readerWorkspace.ts src/lib/readerWorkspace.test.ts
git commit -m "test: add reader workspace helpers"
```

### Task 2: Add failing tests for concise reader status text

**Files:**
- Create: `src/lib/readerStatus.test.ts`
- Create: `src/lib/readerStatus.ts`

**Step 1: Write the failing test**

Add tests for short bottom-bar status labels:

```ts
import { describe, expect, test } from "bun:test";
import { getReaderStatusLabel } from "./readerStatus";

describe("getReaderStatusLabel", () => {
  test("keeps ready short", () => {
    expect(getReaderStatusLabel("ready")).toBe("Ready");
  });

  test("includes the page number when translating", () => {
    expect(getReaderStatusLabel("translating-page", { page: 6 })).toBe("Translating page 6");
  });

  test("includes the page number when redoing", () => {
    expect(getReaderStatusLabel("redoing-page", { page: 9 })).toBe("Redoing page 9");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerStatus.test.ts`

Expected: FAIL because the status helper does not exist yet.

**Step 3: Write minimal implementation**

Create `src/lib/readerStatus.ts` with a small mapper that returns short user-facing labels for the bottom bar.

Use it only for reader chrome status text, not for translation payloads or backend state.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerStatus.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/readerStatus.ts src/lib/readerStatus.test.ts
git commit -m "test: add concise reader status labels"
```

### Task 3: Add the top toolbar toggles and bottom status bar shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Reuse: `src/lib/readerWorkspace.ts`
- Reuse: `src/lib/readerStatus.ts`

**Step 1: Write the failing test**

If lightweight component tests are practical, add focused tests for:

- the four panel toggle buttons reflecting active state
- the last visible panel staying enabled
- the bottom status bar showing short status text and translation progress

If component tests are too heavy in the current setup, keep automated coverage in the helper layer and rely on manual verification for toolbar rendering.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts src/lib/readerStatus.test.ts`

Expected: PASS for helpers before UI work, with any new UI-specific helper cases failing if added.

**Step 3: Write minimal implementation**

Update `src/App.tsx` to:

- remove the app title and Open File button from the reader toolbar
- replace `viewMode` with four independent panel toggles
- keep Back and Translate all in the top bar
- move Settings to an icon-only button on the far right
- add a bottom status bar with short status text, loading progress, and translation progress
- keep progress labels compact, such as `12/40 pages` and `Fully translated`

Update `src/App.css` to style:

- the lighter top bar
- the active/inactive panel toggles
- the bottom status bar
- responsive spacing without reintroducing card-heavy chrome

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts src/lib/readerStatus.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/lib/readerWorkspace.ts src/lib/readerWorkspace.test.ts src/lib/readerStatus.ts src/lib/readerStatus.test.ts
git commit -m "feat: add reader workspace toolbar and status bar"
```

### Task 4: Split PDF navigation into its own panel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PdfViewer.tsx`
- Modify: `src/components/PdfNavigationSidebar.tsx`
- Modify: `src/App.css`
- Reuse: `src/lib/pdfNavigation.ts`
- Reuse: `src/lib/pdfNavigationPrefs.ts`

**Step 1: Write the failing test**

Add helper or component-level coverage for any newly extracted PDF navigation behavior, especially:

- rendering PDF navigation without the Original PDF panel
- keeping tab selection and current-page highlighting intact

If rendering tests are not practical, document these as required manual checks and keep automated coverage in the existing navigation helper tests.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/pdfNavigation.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS for current helper behavior, with any newly added edge-case tests failing until extraction is wired.

**Step 3: Write minimal implementation**

Refactor PDF reader rendering so:

- `PdfNavigationSidebar` becomes a standalone panel component rendered by `App.tsx`
- `PdfViewer` owns only the document viewport and its document-local controls
- the PDF navigation panel can stay visible even when the Original panel is hidden
- the old in-panel collapse button is removed because the global panel toggle now controls visibility

Keep current page syncing and navigation callbacks unchanged from the user’s point of view.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/pdfNavigation.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/components/PdfViewer.tsx src/components/PdfNavigationSidebar.tsx src/App.css src/lib/pdfNavigation.ts src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigation.test.ts src/lib/pdfNavigationPrefs.test.ts
git commit -m "feat: split pdf navigation into its own panel"
```

### Task 5: Split EPUB contents into its own panel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/document/EpubViewer.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing test**

Add coverage for any new helper logic extracted from the EPUB viewer, or document manual verification for:

- contents navigation rendering as its own panel
- moving through the EPUB when only Navigation and Translation are visible

If no clean automated seam exists yet, do not invent a brittle browser test; rely on small helper tests plus manual verification.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test`

Expected: Any new helper tests fail until the EPUB structure is extracted.

**Step 3: Write minimal implementation**

Refactor `src/components/document/EpubViewer.tsx` so:

- the contents list can render outside the reading viewport
- the original reading area becomes its own panel body
- `App.tsx` can render EPUB Navigation and EPUB Original independently while sharing the same callbacks

Preserve current chapter tracking, page tracking, and paragraph extraction.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/components/document/EpubViewer.tsx src/App.css
git commit -m "feat: split epub contents into its own panel"
```

### Task 6: Move translation actions into the Translation panel header

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TranslationPane.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing test**

Add helper or component-level coverage for:

- PDF translation header showing page label and cached badge
- Redo page being rendered as a local action instead of a top-toolbar action
- Vocabulary access living inside the Translation panel instead of the top bar

If UI tests are not practical, record these as manual checks and keep the current translation helper tests green.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/pageText.test.ts src/lib/pageTranslationScheduler.test.ts`

Expected: PASS for the existing logic, with any new helper cases failing until header wiring is complete.

**Step 3: Write minimal implementation**

Update `src/components/TranslationPane.tsx` so:

- PDF mode renders a panel header with page label, cached badge, and icon-only Redo action
- EPUB mode has a panel header suitable for vocabulary-related controls
- panel-local controls stay inside the Translation panel

Update `src/App.tsx` so the Vocabulary entry point is removed from the top bar and opened from the Translation panel instead.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/pageText.test.ts src/lib/pageTranslationScheduler.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/components/TranslationPane.tsx src/App.css
git commit -m "feat: move translation controls into panel header"
```

### Task 7: Render AI chat as a normal reader panel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/reader/ChatPanel.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing test**

Add focused coverage for any extracted helper logic, or document manual verification for:

- AI chat panel rendering inside the main workspace grid
- hiding AI chat through the top toggle instead of overlay close state
- Clear still working

If DOM-level tests are heavy, rely on helper coverage plus manual verification.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test`

Expected: New helper tests fail until the panel behavior is updated.

**Step 3: Write minimal implementation**

Update `src/components/reader/ChatPanel.tsx` so:

- it behaves like a normal column panel
- the header keeps the title and Clear action
- the overlay-style close button and fixed positioning model are removed

Update `src/App.tsx` and `src/App.css` so the chat panel is just another visible workspace column.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/components/reader/ChatPanel.tsx src/App.css
git commit -m "feat: render ai chat as workspace panel"
```

### Task 8: Verify the full reader workspace behavior

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/App.css`
- Verify: `src/components/PdfViewer.tsx`
- Verify: `src/components/PdfNavigationSidebar.tsx`
- Verify: `src/components/TranslationPane.tsx`
- Verify: `src/components/reader/ChatPanel.tsx`
- Verify: `src/components/document/EpubViewer.tsx`

**Step 1: Write the failing test**

Add any last missing helper-level regression tests discovered during manual verification.

Do not add broad brittle UI tests just to satisfy the checklist.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test`

Expected: Any newly added regression test fails before the final fix.

**Step 3: Write minimal implementation**

Apply only the minimal final fixes needed to make the workspace behave consistently for:

- default panel visibility
- one-panel minimum safety rule
- PDF navigation + translation without Original
- EPUB navigation + translation without Original
- bottom status bar updates
- translation progress display
- chat panel width and layout

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test`

Expected: PASS

Then run the app-level manual check:

Run: `~/.bun/bin/bun run tauri dev`

Manual verification checklist:

- Back, Translate all, panel toggles, and Settings appear in the top bar
- app title and Open File are gone from the reader toolbar
- bottom status bar shows short status text and progress
- each panel toggle independently shows and hides its panel
- the last visible panel cannot be turned off
- PDF navigation works without the Original panel
- EPUB contents work without the Original panel
- Redo page and Vocabulary live in the Translation panel
- AI chat behaves like a fourth column, not an overlay

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/components/PdfViewer.tsx src/components/PdfNavigationSidebar.tsx src/components/TranslationPane.tsx src/components/reader/ChatPanel.tsx src/components/document/EpubViewer.tsx src/lib/readerWorkspace.ts src/lib/readerWorkspace.test.ts src/lib/readerStatus.ts src/lib/readerStatus.test.ts
git commit -m "feat: add four-panel reader workspace"
```
