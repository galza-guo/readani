# Translate All Slow Mode Implementation Plan

> For Codex: the dedicated writing-plans skill is not available in this workspace, so execute this plan directly and keep the write scope tight.

**Goal:** Add an optional `Translate All slow mode` setting that slows bulk translation for both PDFs and EPUBs, automatically retries after rate-limit errors, and preserves current stop-on-error behavior for non-rate-limit failures.

**Architecture:** Persist one global setting, add a shared slow-mode scheduler helper for pause and backoff logic, thread that helper into both the PDF page queue and EPUB bulk batch queue, and surface slow-mode waiting in the existing footer progress-detail area.

**Tech Stack:** React 19, TypeScript, Bun tests, Tauri, Rust

---

### Task 1: Extend app settings with the new slow-mode flag

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/appSettings.ts`
- Modify: `src/lib/appSettings.test.ts`
- Modify: `src-tauri/src/app_settings.rs`

**Step 1: Write failing tests**

Add coverage that verifies:

- `createDefaultSettings()` includes `translateAllSlowMode: false`
- saved settings normalize the new field to `false` when older data does not include it
- Rust app settings default and normalization also preserve `false`

**Step 2: Implement the setting**

Thread the new persisted boolean through the frontend and Rust settings models without disturbing existing presets or theme behavior.

**Step 3: Verify**

Run:

- `bun test src/lib/appSettings.test.ts`
- `cargo test app_settings`

### Task 2: Add the settings-row UI and tooltip copy

**Files:**
- Modify: `src/components/settings/SettingsDialogContent.tsx`
- Modify: `src/components/settings/SettingsDialogContent.test.tsx`
- Modify if needed: `src/App.css`

**Step 1: Write failing tests**

Cover:

- the presence of `Translate All slow mode`
- the helper tooltip copy
- the new row living in the top settings area instead of the preset editor

**Step 2: Implement**

Add a compact switch row that updates `onSettingsChange` with the persisted boolean. Reuse existing tooltip patterns and keep the control visually quiet.

**Step 3: Verify**

Run:

- `bun test src/components/settings/SettingsDialogContent.test.tsx`

### Task 3: Add shared slow-mode scheduling helpers

**Files:**
- Add: `src/lib/translateAllSlowMode.ts`
- Add tests: `src/lib/translateAllSlowMode.test.ts`

**Step 1: Write failing tests**

Cover helper logic for:

- pause after every 3 successful units
- no pause before the threshold
- backoff growth `45 -> 90 -> 180 -> 360 -> 600`
- reset of rate-limit backoff after a successful unit

**Step 2: Implement**

Create focused pure helpers that decide:

- whether a normal pause is due
- how to increment the success counter
- how to compute the next rate-limit wait
- how to reset counters after success

Keep this module UI-agnostic so PDF and EPUB can both call it.

**Step 3: Verify**

Run:

- `bun test src/lib/translateAllSlowMode.test.ts`

### Task 4: Integrate slow mode into the PDF Translate All queue

**Files:**
- Modify: `src/App.tsx`
- Modify if needed: `src/lib/pageTranslationScheduler.ts`
- Modify tests if needed: `src/lib/pageTranslationScheduler.test.ts`

**Step 1: Add the failing behavior target**

Cover or manually verify:

- bulk PDF translation pauses after every third successful page when slow mode is on
- a rate-limit error requeues the same page and resumes automatically
- a non-rate-limit error still stops the run

**Step 2: Implement**

Add runtime refs/state for:

- successful PDF pages since last pause
- consecutive PDF rate-limit hits
- pending bulk resume timer

Then:

- schedule a delayed resume after every third successful page
- schedule a delayed resume with backoff after a rate-limit failure
- keep the existing queue, stop flow, and stale-request protections

**Step 3: Verify**

Run:

- `bun test src/lib/pageTranslationScheduler.test.ts`

### Task 5: Integrate slow mode into the EPUB Translate All queue

**Files:**
- Modify: `src/App.tsx`
- Modify or add focused tests near EPUB queue behavior

**Step 1: Add the failing behavior target**

Cover or manually verify:

- EPUB bulk translation pauses after every third successful batch when slow mode is on
- a rate-limit error restores the batch to the front of the queue
- a non-rate-limit error still stops the run

**Step 2: Implement**

Add EPUB runtime refs/state parallel to the PDF flow and reuse the shared slow-mode helper for:

- normal batch pauses
- rate-limit backoff
- counter resets after success

Avoid changing the underlying EPUB batching model beyond what is needed to pause and retry safely.

**Step 3: Verify**

Run:

- focused `bun test` for touched EPUB behavior if available

### Task 6: Reuse the existing status area for slow-mode waiting

**Files:**
- Modify: `src/App.tsx`
- Modify tests only if needed: `src/components/TranslationPane.test.tsx` or nearby status coverage

**Step 1: Add the behavior target**

Verify that the same footer progress-detail area used for `Translating page X` can also show:

- normal slow-mode pauses
- rate-limit retry waits

without introducing a new status surface.

**Step 2: Implement**

Set `translationStatusMessage` from the slow-mode scheduling points so the reader can show messages such as:

- `Translating all pages slowly...`
- `Slow mode pause. Continuing in 12s...`
- `Rate limit hit on page 42. Retrying in 45s...`

Keep the footer progress UI unchanged.

**Step 3: Verify**

Run focused frontend tests if status rendering coverage exists.

### Task 7: Clean up timers and verify stop/reset behavior

**Files:**
- Modify: `src/App.tsx`
- Modify tests if needed

**Step 1: Add the behavior target**

Verify that stop/reset/document-switch flows clear any delayed resume timer and prevent the queue from unexpectedly restarting later.

**Step 2: Implement**

Clear slow-mode timers when:

- the user stops Translate All
- the document changes
- the translation session resets
- the component unmounts

**Step 3: Verify**

Run the focused automated suite plus a build:

- `bun test src/lib/appSettings.test.ts`
- `bun test src/components/settings/SettingsDialogContent.test.tsx`
- `bun test src/lib/translateAllSlowMode.test.ts`
- `bun test src/lib/pageTranslationScheduler.test.ts`
- `cargo test app_settings`
- `bun run build`
