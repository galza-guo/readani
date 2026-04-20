# PDF Panel Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move PDF page navigation and zoom controls into the left reader pane, with fit-width as the default PDF zoom mode and a compact click-open zoom popover.

**Architecture:** Keep app-level state in `src/App.tsx`, move PDF-specific controls into `src/components/PdfViewer.tsx`, and add pure zoom-resolution helpers in `src/lib/readerLayout.ts` so the fit behavior can be tested. EPUB keeps its current zoom path.

**Tech Stack:** React 19, TypeScript, Bun tests, Radix UI, pdf.js

---

### Task 1: Add PDF zoom helper coverage

**Files:**
- Modify: `src/lib/readerLayout.ts`
- Test: `src/lib/readerLayout.test.ts`

**Step 1: Write the failing test**

Add tests for:

- fit-width scale calculation
- fit-height scale calculation
- manual PDF zoom clamping

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/readerLayout.test.ts`

**Step 3: Write minimal implementation**

Add pure helper functions/constants for PDF zoom calculation in `src/lib/readerLayout.ts`.

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/readerLayout.test.ts`

### Task 2: Move PDF controls into the viewer pane

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PdfViewer.tsx`
- Modify: `src/App.css`

**Step 1: Add the failing behavior target**

Use the new helper-backed zoom state in the PDF viewer and remove PDF navigation/zoom controls from the global header.

**Step 2: Write minimal implementation**

Add:

- top PDF navigation bar with chevrons and editable page number
- compact magnifier-triggered zoom popover with presets, slider, and percentage readout
- fit-width default PDF zoom state

**Step 3: Verify behavior**

Run the app build and targeted tests.

### Task 3: Verify the integrated reader flow

**Files:**
- Modify only if needed after verification: `src/App.tsx`, `src/components/PdfViewer.tsx`, `src/App.css`

**Step 1: Run automated verification**

Run:

- `bun test src/lib/readerLayout.test.ts`
- `bun run build`

**Step 2: Fix any regressions**

Adjust the implementation only if the verification output shows real failures.
