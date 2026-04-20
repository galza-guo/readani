# Page Translation Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reusable PDF page-translation toolbar controls for redoing the current page, translating the entire PDF in the background, choosing how to handle cached pages, and showing always-on translation progress.

**Architecture:** Keep reader state in `src/App.tsx`, move shared queue/progress rules into a small pure helper module, and extend the Rust page-cache layer with inspect/clear commands so the UI can safely coordinate foreground and background page translation through one scheduler.

**Tech Stack:** React 19, TypeScript, Bun tests, Tauri, Rust, Radix UI, pdf.js

---

### Task 1: Add queue and progress helper coverage

**Files:**
- Create: `src/lib/pageTranslationScheduler.ts`
- Test: `src/lib/pageTranslationScheduler.test.ts`

**Step 1: Write the failing test**

Add tests for:

- deduplicating the same page across foreground and background queues
- promoting the current page without duplicating it
- counting translated vs translatable pages
- deciding when the full-book action should read `Translate All` vs `Replace All`

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pageTranslationScheduler.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Add pure helper functions for:

- queue insertion and promotion
- in-flight deduplication bookkeeping
- progress counting based on page translation state and usable source text
- resolving the toolbar label for the full-book action

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pageTranslationScheduler.test.ts`

Expected: PASS

### Task 2: Add backend page-cache inspection and clearing coverage

**Files:**
- Modify: `src-tauri/src/page_cache.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write the failing test**

Add Rust tests for:

- listing cached pages for a document/settings tuple
- clearing a single page cache entry
- clearing all matching page cache entries for one document/settings tuple without deleting unrelated documents or models

**Step 2: Run test to verify it fails**

Run: `cargo test page_cache`

Expected: FAIL because the list/clear helpers do not exist yet.

**Step 3: Write minimal implementation**

Add pure page-cache helper functions in `src-tauri/src/page_cache.rs`, then expose narrow Tauri commands in `src-tauri/src/lib.rs` for:

- listing matching cached pages
- clearing one cached page
- clearing matching cached pages for the current document/settings tuple

**Step 4: Run test to verify it passes**

Run: `cargo test page_cache`

Expected: PASS

### Task 3: Add reusable dialog UI for future confirmations

**Files:**
- Create: `src/components/ConfirmationDialog.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing behavior target**

Define the reusable dialog API needed for:

- title
- description
- primary and secondary actions
- optional destructive emphasis

**Step 2: Write minimal implementation**

Build a Radix `Dialog`-based reusable component using the existing `.dialog-*` styles and add only the extra CSS needed for dialog actions and destructive button treatment.

**Step 3: Verify behavior**

Run: `bun run build`

Expected: PASS

### Task 4: Refactor PDF page translation into one shared scheduler

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/types.ts`
- Modify: `src/lib/pageText.ts`
- Modify: `src/lib/pageQueue.ts`
- Modify only if needed: `src/components/TranslationPane.tsx`
- Test: `src/lib/pageTranslationScheduler.test.ts`

**Step 1: Write the failing test**

Extend the scheduler tests or add focused helper tests for:

- ignoring stale page translation responses after redo/replace
- selecting the next page from foreground before background

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/pageTranslationScheduler.test.ts`

Expected: FAIL because the new scheduler rules are not implemented yet.

**Step 3: Write minimal implementation**

In `src/App.tsx`:

- replace the current PDF page-translation queue with the shared scheduler
- track foreground queue, background queue, in-flight pages, and per-page request versions
- keep current-page translation responsive while `Translate All` continues in the background
- update per-page translation state without letting stale responses overwrite newer work
- treat non-translatable pages as resolved for progress purposes

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/pageTranslationScheduler.test.ts`

Expected: PASS

### Task 5: Add toolbar controls, progress UI, and cached-page decision flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify only if needed: `src/components/TranslationPane.tsx`
- Create only if helpful: `src/components/reader/PageTranslationToolbar.tsx`

**Step 1: Add the failing behavior target**

Wire the UI state for:

- `Redo Page`
- `Translate All`
- `Replace All`
- always-visible progress text
- the cached-page dialog flow

**Step 2: Write minimal implementation**

Add PDF-only toolbar controls that:

- redo the current page by clearing backend cache first
- start a background full-book run
- prompt with the reusable dialog when cached pages already exist elsewhere in the book
- show progress text continuously and `Fully translated` at completion

**Step 3: Verify behavior**

Run: `bun run build`

Expected: PASS

### Task 6: Run focused verification and fix any regressions

**Files:**
- Modify only if needed after verification: `src/App.tsx`, `src/App.css`, `src/types.ts`, `src/lib/pageTranslationScheduler.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/page_cache.rs`, `src/components/ConfirmationDialog.tsx`

**Step 1: Run automated verification**

Run:

- `bun test src/lib/pageTranslationScheduler.test.ts`
- `bun test src/lib/pageText.test.ts`
- `bun test src/lib/pageQueue.test.ts`
- `cargo test page_cache`
- `bun run build`

**Step 2: Fix any real regressions**

Adjust only the code required by failing output.

**Step 3: Re-run verification**

Run the same commands again and confirm they pass.
