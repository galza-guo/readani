# Three-Column Reader Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current four-way horizontal reader workspace with a three-column layout where Translation and AI chat share a stacked right rail, resize cleanly, and keep remembered proportions.

**Architecture:** Move the workspace model in `src/lib/readerWorkspace.ts` from four sibling panels to three columns plus a stacked rail. Let `src/App.tsx` render navigation, original, and right rail columns using flex proportions saved per visible layout, while the right rail manages a remembered vertical split between Translation and AI chat. Apply dynamic window size constraints through the Tauri window API so the app stops shrinking before horizontal scrolling becomes necessary.

**Tech Stack:** Bun tests, React 19 + TypeScript, Tauri desktop app, CSS flex layout, Radix UI

---

### Task 1: Rewrite workspace helper tests for the three-column model

**Files:**
- Modify: `src/lib/readerWorkspace.test.ts`
- Modify: `src/lib/readerWorkspace.ts`

**Step 1: Write the failing test**

Replace the old four-horizontal-panel expectations with tests for:

- visible columns derived from Navigation / Original / rail
- visible rail sections derived from Translation / AI chat
- default column weights for each visible column set
- default 60/40 rail split
- pair resize clamping with minimum sizes
- workspace minimum width and height

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: FAIL because the helper still models four sibling panels.

**Step 3: Write minimal implementation**

Refactor `src/lib/readerWorkspace.ts` to expose:

- visible column helpers
- rail section helpers
- default weight lookup
- resize clamp helpers
- minimum workspace size helpers

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: PASS

### Task 2: Refactor the app layout state around columns and rail sections

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Reuse: `src/lib/readerWorkspace.ts`
- Reuse: `src/lib/readerStatus.ts`

**Step 1: Write the failing test**

Keep helper tests as the red-green anchor for layout behavior. If a new pure helper is needed for view-state bookkeeping, add a focused test there first.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: FAIL until the new layout helpers are in place.

**Step 3: Write minimal implementation**

Update `src/App.tsx` to:

- derive visible columns from panel toggles
- treat Translation and AI chat as sections inside a single right rail
- keep the four toolbar toggles
- render at most two horizontal resize handles
- render one vertical resize handle inside the rail when both sections are visible
- remember horizontal proportions by visible column set
- remember the rail split when both sections are visible

Update `src/App.css` to:

- style a three-column workspace
- style the stacked right rail
- keep hidden columns and sections at zero size
- preserve stable panel minimum sizes

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: PASS

### Task 3: Apply dynamic minimum window size constraints

**Files:**
- Modify: `src/App.tsx`
- Reuse: `src/lib/readerWorkspace.ts`

**Step 1: Write the failing test**

Add helper coverage for the minimum workspace width and height calculations if Task 1 did not already cover the final cases needed by the app.

**Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: FAIL if the size calculations are incomplete.

**Step 3: Write minimal implementation**

Use the Tauri window API in `src/App.tsx` to compute the current minimum inner width and height from the visible layout and apply them whenever panel visibility changes.

**Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/readerWorkspace.test.ts`

Expected: PASS

### Task 4: Verify the full reader still behaves correctly

**Files:**
- Modify if needed: `src/App.tsx`
- Modify if needed: `src/App.css`

**Step 1: Run targeted automated verification**

Run:

```bash
~/.bun/bin/bun test src/lib/readerWorkspace.test.ts src/lib/readerStatus.test.ts
~/.bun/bin/bunx tsc --noEmit
~/.bun/bin/bun run build
```

**Step 2: Manually verify critical reader flows**

Check:

- PDF thumbnails still render
- horizontal resize handles still work
- rail split handle works
- no horizontal scrolling in approved panel combinations
- translation-only rail fills full height
- chat-only rail fills full height
- 60/40 default rail split when both are visible
- EPUB navigation still works when Original is hidden

**Step 3: Make focused fixes if verification finds regressions**

Keep changes scoped to layout and state handling only.
