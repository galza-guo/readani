# PDF Navigation Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible PDF navigation sidebar with thumbnails and contents, plus edge-triggered wheel navigation for the single-page PDF reader.

**Architecture:** Keep `src/App.tsx` as the source of truth for page state and PDF-only reader preferences. Add focused helpers for local preference persistence and PDF outline resolution, extend `PdfViewer` to request page turns from edge scrolling, and introduce a PDF navigation component that renders thumbnails and outline links without changing the EPUB path.

**Tech Stack:** Bun tests, React 19 + TypeScript, Radix UI, pdf.js, Tauri desktop app

---

### Task 1: Add failing tests for PDF navigation helpers

**Files:**
- Create: `src/lib/pdfNavigation.test.ts`
- Create: `src/lib/pdfNavigation.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  decideEdgePageTurn,
  getInitialPdfNavTab,
  normalizePdfOutline,
} from "./pdfNavigation";

describe("getInitialPdfNavTab", () => {
  test("defaults to thumbnails when nothing has been stored", () => {
    expect(getInitialPdfNavTab(null)).toBe("thumbnails");
  });

  test("restores a stored valid tab", () => {
    expect(getInitialPdfNavTab("contents")).toBe("contents");
  });
});

describe("decideEdgePageTurn", () => {
  test("moves forward only when the user scrolls down at the bottom edge", () => {
    expect(
      decideEdgePageTurn({
        deltaY: 24,
        scrollTop: 600,
        clientHeight: 300,
        scrollHeight: 900,
      })
    ).toBe("next");
  });
});

describe("normalizePdfOutline", () => {
  test("maps resolved outline items into page links", async () => {
    const result = await normalizePdfOutline(
      [
        { title: "Intro", dest: [{ num: 10, gen: 0 }], items: [] },
      ] as any,
      {
        getPageNumberFromDest: async () => 3,
      }
    );

    expect(result).toEqual([
      { id: "0", title: "Intro", page: 3, depth: 0 },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: FAIL because `src/lib/pdfNavigation.ts` does not exist yet.

**Step 3: Write minimal implementation**

Create the helper module with:

- `PdfNavTab` type: `"thumbnails" | "contents"`
- `getInitialPdfNavTab(storedValue)`
- `getInitialPdfSidebarCollapsed(storedValue)`
- `decideEdgePageTurn({ deltaY, scrollTop, clientHeight, scrollHeight, tolerance? })`
- `normalizePdfOutline(outline, resolver)`

Use a small tolerance so page turns only happen at the true top or bottom edge.

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pdfNavigation.ts src/lib/pdfNavigation.test.ts
git commit -m "test: add pdf navigation helpers"
```

### Task 2: Add failing tests for frontend preference persistence

**Files:**
- Create: `src/lib/pdfNavigationPrefs.test.ts`
- Create: `src/lib/pdfNavigationPrefs.ts`

**Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  PDF_NAV_COLLAPSED_KEY,
  PDF_NAV_TAB_KEY,
  loadPdfNavigationPrefs,
  savePdfNavigationPrefs,
} from "./pdfNavigationPrefs";

describe("pdfNavigationPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("returns safe defaults when nothing is stored", () => {
    expect(loadPdfNavigationPrefs()).toEqual({
      tab: "thumbnails",
      collapsed: false,
    });
  });

  test("persists tab and collapsed state", () => {
    savePdfNavigationPrefs({ tab: "contents", collapsed: true });

    expect(localStorage.getItem(PDF_NAV_TAB_KEY)).toBe("contents");
    expect(localStorage.getItem(PDF_NAV_COLLAPSED_KEY)).toBe("true");
    expect(loadPdfNavigationPrefs()).toEqual({
      tab: "contents",
      collapsed: true,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pdfNavigationPrefs.test.ts`

Expected: FAIL because `src/lib/pdfNavigationPrefs.ts` does not exist yet.

**Step 3: Write minimal implementation**

Create a small helper that:

- defines storage keys
- loads validated values from `localStorage`
- writes updated values back to `localStorage`
- falls back safely when storage is unavailable

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigationPrefs.test.ts
git commit -m "test: add pdf navigation preference storage"
```

### Task 3: Add failing component tests or a focused DOM test for edge scroll behavior

**Files:**
- Modify: `src/components/PdfViewer.tsx`
- Create: `src/components/PdfViewer.test.tsx`
- Reuse: `src/lib/pdfNavigation.ts`

**Step 1: Write the failing test**

Add a DOM-focused test that mounts `PdfViewer` with a stubbed page size and verifies:

- wheel scroll at the bottom calls `onRequestPageChange("next")`
- wheel scroll at the top calls `onRequestPageChange("prev")`
- wheel scroll away from the edges does not trigger page turns

If the current test setup cannot mount React components cleanly with Bun alone, replace this with a pure helper-level test expansion inside `src/lib/pdfNavigation.test.ts` and document the manual verification needed.

**Step 2: Run test to verify it fails**

Run: `bun test src/components/PdfViewer.test.tsx`

Expected: FAIL because `PdfViewer` does not yet expose or use the new edge-scroll behavior.

**Step 3: Write minimal implementation**

Update `src/components/PdfViewer.tsx` to:

- accept a new `onRequestPageChange(direction)` callback
- listen for wheel events on the scroll container
- use the helper logic from `src/lib/pdfNavigation.ts`
- preserve normal in-page scrolling when not at the edge
- scroll to top on forward page changes and bottom on backward page changes after the page updates

**Step 4: Run test to verify it passes**

Run: `bun test src/components/PdfViewer.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/PdfViewer.tsx src/components/PdfViewer.test.tsx src/lib/pdfNavigation.ts
git commit -m "feat: add edge scroll page turns"
```

### Task 4: Add failing tests for PDF outline loading and normalization in App state

**Files:**
- Modify: `src/App.tsx`
- Reuse: `src/lib/pdfNavigation.ts`

**Step 1: Write the failing test**

Add or expand helper-level tests so outline normalization covers:

- nested outline items flatten with depth preserved
- items without a resolvable destination are skipped
- string destinations are resolved through `pdfDoc.getDestination`

If `App.tsx` is hard to unit test directly, keep this logic in helper tests and make `App.tsx` a thin integration layer.

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: FAIL because the helper does not yet support the full outline resolution cases.

**Step 3: Write minimal implementation**

Extend the outline helper and integrate it into `src/App.tsx`:

- load the outline after a PDF is opened
- resolve each destination to a page number
- store normalized items in PDF-only state
- clear outline state when a new document is loaded or when switching away from PDF

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/lib/pdfNavigation.ts src/lib/pdfNavigation.test.ts
git commit -m "feat: load pdf outline navigation"
```

### Task 5: Add the PDF navigation sidebar UI

**Files:**
- Create: `src/components/PdfNavigationSidebar.tsx`
- Modify: `src/components/PdfViewer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/types.ts` if shared PDF nav types help keep props readable

**Step 1: Write the failing test**

Add helper or component tests for:

- `Thumbnails` is the default tab when no preference exists
- saved tab restores to `Contents`
- collapse toggle updates state
- empty contents state renders when no outline items exist

If a full component test is too heavy in the current setup, keep the state and preference logic in helper tests and rely on manual UI verification for rendering.

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pdfNavigationPrefs.test.ts src/lib/pdfNavigation.test.ts`

Expected: FAIL until the sidebar wiring and defaults match the approved design.

**Step 3: Write minimal implementation**

Add a new sidebar component that:

- renders a collapse button
- renders Radix tabs for `Thumbnails` and `Contents`
- shows the current page highlight
- calls back to `onNavigate(pageNumber)`
- renders a clear empty state for missing contents

Update `PdfViewer` and `App.tsx` to:

- pass current page, total pages, sidebar state, and outline data
- wire tab changes and collapse changes through stored preferences
- keep EPUB rendering unchanged

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pdfNavigationPrefs.test.ts src/lib/pdfNavigation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/PdfNavigationSidebar.tsx src/components/PdfViewer.tsx src/App.tsx src/App.css src/types.ts src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigation.ts
git commit -m "feat: add pdf navigation sidebar"
```

### Task 6: Add thumbnail rendering with lazy loading

**Files:**
- Create: `src/components/PdfThumbnailList.tsx`
- Modify: `src/components/PdfNavigationSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing test**

Add helper tests for thumbnail state management if extracted into a helper:

- generates a thumbnail request only once per page
- reuses cached thumbnail data for the same document

If thumbnail rendering remains view-driven, document this as a manual verification task and keep automated coverage on the caching helper only.

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: FAIL because thumbnail caching or request de-duplication is not implemented yet.

**Step 3: Write minimal implementation**

Implement thumbnail rendering with `pdf.js` at a small scale:

- generate previews lazily for visible rows first
- cache preview results in memory for the open document
- show lightweight skeleton boxes while previews are loading
- keep click targets large enough for quick navigation

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pdfNavigation.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/PdfThumbnailList.tsx src/components/PdfNavigationSidebar.tsx src/App.tsx src/App.css src/lib/pdfNavigation.test.ts
git commit -m "feat: render lazy pdf thumbnails"
```

### Task 7: Verify the end-to-end reader behavior

**Files:**
- Modify: `src/App.tsx` if small fixes are needed
- Modify: `src/components/PdfViewer.tsx` if scroll edge polish is needed
- Modify: `src/App.css` if final layout polish is needed

**Step 1: Run targeted automated tests**

Run: `bun test src/lib/pdfNavigation.test.ts src/lib/pdfNavigationPrefs.test.ts`

Expected: PASS

**Step 2: Run the app for manual verification**

Run: `bun run dev`

Manual checks:

- open a PDF and confirm the sidebar appears inside the left pane
- confirm `Thumbnails` is selected the first time
- switch to `Contents`, close and reopen the reader, and confirm the tab is remembered
- collapse the sidebar, reopen the reader, and confirm collapsed state is remembered
- click a thumbnail and confirm the correct page opens
- click a contents item and confirm the correct page opens
- zoom in and scroll inside the page without triggering unwanted page turns
- scroll past the bottom and confirm next page navigation
- scroll past the top and confirm previous page navigation
- verify EPUB still opens with its current contents sidebar

**Step 3: Run a production build**

Run: `bun run build`

Expected: PASS

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css src/components/PdfViewer.tsx src/components/PdfNavigationSidebar.tsx src/components/PdfThumbnailList.tsx src/lib/pdfNavigation.ts src/lib/pdfNavigationPrefs.ts src/lib/pdfNavigation.test.ts src/lib/pdfNavigationPrefs.test.ts
git commit -m "feat: ship pdf navigation sidebar"
```
