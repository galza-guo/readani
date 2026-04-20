# Reader Resizing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add remembered draggable width controls for the PDF navigation sidebar and the main left/right reader panes.

**Architecture:** Extend the existing frontend preference storage to keep pane widths, add small helper functions to clamp and restore saved sizes safely, then wire two draggable resize handles: one in `src/App.tsx` for the left/right split and one in `src/components/PdfViewer.tsx` for the PDF sidebar split. Keep responsive mobile behavior as the override on narrow screens.

**Tech Stack:** Bun tests, React 19 + TypeScript, CSS grid/flex layout, Radix UI, Tauri desktop app

---

### Task 1: Add failing tests for stored reader width preferences

**Files:**
- Modify: `src/lib/pdfNavigationPrefs.test.ts`
- Modify: `src/lib/pdfNavigationPrefs.ts`

**Step 1: Write the failing test**

Add tests that verify the stored preference payload now includes width values:

```ts
test("returns default widths when none are stored", () => {
  expect(loadPdfNavigationPrefs()).toEqual({
    tab: "thumbnails",
    collapsed: false,
    sidebarWidth: 252,
    leftPaneWidth: 0,
    rightPaneWidth: 0,
  });
});

test("persists saved width preferences", () => {
  savePdfNavigationPrefs({
    tab: "contents",
    collapsed: false,
    sidebarWidth: 300,
    leftPaneWidth: 640,
    rightPaneWidth: 560,
  });

  expect(loadPdfNavigationPrefs()).toEqual({
    tab: "contents",
    collapsed: false,
    sidebarWidth: 300,
    leftPaneWidth: 640,
    rightPaneWidth: 560,
  });
});
```

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/pdfNavigationPrefs.test.ts`

Expected: FAIL because the current preference model does not store any widths yet.

**Step 3: Write minimal implementation**

Extend `src/lib/pdfNavigationPrefs.ts` so it stores and restores:

- `sidebarWidth`
- `leftPaneWidth`
- `rightPaneWidth`

Validate all width values before returning them. Invalid or missing values should fall back to defaults.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigationPrefs.test.ts
git commit -m "test: persist reader width preferences"
```

### Task 2: Add failing tests for width clamping and reset helpers

**Files:**
- Create: `src/lib/readerLayout.test.ts`
- Create: `src/lib/readerLayout.ts`

**Step 1: Write the failing test**

Add helper tests for the layout math:

```ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_SPLIT_LEFT_WIDTH,
  clampSidebarWidth,
  clampSplitWidths,
  getResetSidebarWidth,
  getResetSplitWidths,
} from "./readerLayout";

describe("clampSidebarWidth", () => {
  test("keeps the sidebar above the minimum width", () => {
    expect(clampSidebarWidth(80, 1200)).toBeGreaterThanOrEqual(180);
  });
});

describe("clampSplitWidths", () => {
  test("keeps both reader panes above their minimum widths", () => {
    expect(
      clampSplitWidths({
        containerWidth: 900,
        leftPaneWidth: 850,
        rightPaneWidth: 50,
        gap: 12,
      })
    ).toEqual({
      leftPaneWidth: 528,
      rightPaneWidth: 360,
    });
  });
});

describe("reset widths", () => {
  test("returns the default sidebar width", () => {
    expect(getResetSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  test("returns the default split widths", () => {
    expect(getResetSplitWidths(1200)).toEqual({
      leftPaneWidth: DEFAULT_SPLIT_LEFT_WIDTH,
      rightPaneWidth: 1200 - 12 - DEFAULT_SPLIT_LEFT_WIDTH,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts`

Expected: FAIL because the helper file does not exist yet.

**Step 3: Write minimal implementation**

Create `src/lib/readerLayout.ts` with:

- default widths
- minimum widths
- `clampSidebarWidth`
- `clampSplitWidths`
- reset helpers for double-click behavior

Keep the math small and explicit. The helpers should not know anything about React state.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/readerLayout.ts src/lib/readerLayout.test.ts
git commit -m "test: add reader layout sizing helpers"
```

### Task 3: Add the top-level left/right pane resize handle

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Reuse: `src/lib/pdfNavigationPrefs.ts`
- Reuse: `src/lib/readerLayout.ts`

**Step 1: Write the failing test**

If a practical DOM test is possible, add a focused test that verifies dragging the outer divider updates the split widths.

If the current Bun setup makes full pointer-drag component tests too heavy, keep the automated coverage in the helper layer and explicitly rely on manual verification for the drag interaction.

At minimum, add one helper-level failing test if needed for any split-width edge case discovered while wiring `App.tsx`.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: FAIL if new edge cases were added, or remain green while the UI work is still pending.

**Step 3: Write minimal implementation**

Update `src/App.tsx` to:

- load saved split widths from preferences
- keep `leftPaneWidth` and `rightPaneWidth` in state
- render a vertical resize handle between the visible left and right panes in split view
- use pointer events to drag live
- clamp widths against container size and minimums
- persist widths on drag end
- reset widths on divider double-click

Update `src/App.css` to:

- support explicit pane widths in split mode
- style the outer resize handle clearly
- hide the handle in `PDF only`, `translation only`, and narrow responsive layouts

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigationPrefs.test.ts src/lib/readerLayout.ts src/lib/readerLayout.test.ts
git commit -m "feat: add resizable reader split panes"
```

### Task 4: Add the PDF sidebar resize handle

**Files:**
- Modify: `src/components/PdfViewer.tsx`
- Modify: `src/components/PdfNavigationSidebar.tsx`
- Modify: `src/App.css`
- Reuse: `src/lib/pdfNavigationPrefs.ts`
- Reuse: `src/lib/readerLayout.ts`

**Step 1: Write the failing test**

Add helper tests for any sidebar-width clamping and restore behavior not already covered.

If a direct component drag test is practical, add one for:

- dragging the inner divider updates sidebar width
- double-clicking resets to the default width
- collapsed sidebar restores the last expanded width

If not practical, keep these as manual verification items and rely on helper coverage for the math.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts`

Expected: FAIL if new sidebar sizing cases were added beyond the current helper coverage.

**Step 3: Write minimal implementation**

Update `src/components/PdfViewer.tsx` to:

- accept sidebar width and resize callbacks
- render an inner vertical resize handle only when the sidebar is visible
- update the PDF internal layout live during drag

Update `src/components/PdfNavigationSidebar.tsx` so:

- collapsing preserves the current expanded width
- re-opening restores the saved width

Update CSS so the inner divider looks and behaves consistently with the outer divider.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerLayout.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/PdfViewer.tsx src/components/PdfNavigationSidebar.tsx src/App.css src/lib/readerLayout.ts src/lib/readerLayout.test.ts src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigationPrefs.test.ts
git commit -m "feat: add resizable pdf sidebar"
```

### Task 5: Verify the remembered resizing behavior end to end

**Files:**
- Modify: `src/App.tsx` if small integration fixes are needed
- Modify: `src/components/PdfViewer.tsx` if drag polish is needed
- Modify: `src/App.css` if handle polish is needed

**Step 1: Run automated tests**

Run: `~/.bun/bin/bun test src/lib/pdfNavigationPrefs.test.ts src/lib/readerLayout.test.ts`

Expected: PASS

**Step 2: Run the production build**

Run: `~/.bun/bin/bun run build`

Expected: PASS

**Step 3: Manually verify in the app**

Run: `~/.bun/bin/bun run tauri dev`

Manual checks:

- drag the left/right divider and confirm both panes resize live
- drag the PDF sidebar divider and confirm the sidebar resizes live
- close and reopen the app and confirm both saved widths are restored
- collapse and reopen the PDF sidebar and confirm its previous width returns
- double-click each divider and confirm it resets to the default width
- switch between `split`, `PDF only`, and `translation only` and confirm saved widths survive
- reduce the window width and confirm the responsive stacked layout still takes priority

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css src/components/PdfViewer.tsx src/components/PdfNavigationSidebar.tsx src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigationPrefs.test.ts src/lib/readerLayout.ts src/lib/readerLayout.test.ts
git commit -m "feat: ship remembered reader resizing"
```
