# Resilient Translate All Implementation Plan

> Design doc: `docs/plans/2026-04-30-resilient-translate-all-design.md`
>
> **For Codex:** Implement this directly in the main worktree and keep the write scope tight. Do not change non-slow-mode behavior.

**Goal:** Make `Translate All` slow mode resilient to transient provider failures, pause cleanly on `usage-limit`, skip page-scoped failures without killing the whole run, and keep PDF plus EPUB behavior understandable to the user.

**Architecture:** Keep the existing PDF queue and existing EPUB queue, but make slow mode explicitly page-scoped for both document types. Centralize the slow-mode error policy in shared helpers, move slow-mode EPUB page selection into a testable helper, and teach `App.tsx` to restore the active page before any retry or pause. Extend the translation footer so it can show `running`, `waiting`, `paused`, and `stopping` states without inventing a new status surface.

**Tech Stack:** React 19, TypeScript, Bun tests, Tauri, Rust

---

### Task 1: Add a shared slow-mode error policy helper

**Files:**
- Modify: `src/lib/providerErrors.ts`
- Modify: `src/lib/providerErrors.test.ts`

Add a small pure helper that classifies each `FriendlyProviderError["kind"]` for slow mode:

- `retry`
- `pause`
- `skip`
- `stop`

Recommended API:

```ts
export type TranslateAllSlowModeErrorAction =
  | "retry"
  | "pause"
  | "skip"
  | "stop";

export function getTranslateAllSlowModeErrorAction(
  kind: FriendlyProviderError["kind"],
): TranslateAllSlowModeErrorAction
```

Policy:

- `retry`: `rate-limit`, `network-request`, `timeout`, `provider-unavailable`, `provider-response`, `unknown`
- `pause`: `usage-limit`
- `skip`: `context-limit`
- `stop`: `setup-required`, `invalid-api-key`, `base-url`, `model`, `local-cache`

Tests should cover every error kind so later queue work does not duplicate classification logic inline.

---

### Task 2: Extend slow-mode helpers for retry limits and EPUB page selection

**Files:**
- Modify: `src/lib/translateAllSlowMode.ts`
- Modify: `src/lib/translateAllSlowMode.test.ts`
- Modify: `src/App.tsx`

Add:

```ts
export const TRANSLATE_ALL_MAX_RETRIES_PER_PAGE = 3;
```

Keep the existing pacing and backoff helpers, and add one focused helper for slow-mode EPUB page selection. In slow mode, EPUB should translate only the next queued virtual page, not a multi-page batch.

Recommended helper:

```ts
export function selectSlowModeEpubPageBatch(
  queuedParagraphIds: string[],
  pages: PageDoc[],
): string[]
```

Behavior:

- find the first queued paragraph id that still maps to a page
- return all queued paragraph ids that belong to that same page
- preserve reading order
- if mapping fails, fall back to the first queued id so work never stalls

Move the current inline `selectSlowModeEpubBatch` logic out of `App.tsx` and replace it with this shared helper.

Tests should verify:

- backoff still grows `45 -> 90 -> 180 -> 360 -> 600`
- the retry cap constant is `3`
- slow-mode EPUB selection returns one virtual page worth of paragraph ids
- non-slow-mode helpers remain unchanged

---

### Task 3: Teach the footer about waiting and paused bulk-run states

**Files:**
- Modify: `src/components/TranslationPane.tsx`
- Modify: `src/components/TranslationPane.test.tsx`
- Modify: `src/App.tsx`

Expand the footer props so the translation pane can render:

- `running`
- `waiting`
- `paused`
- `stopping`

instead of only `running` and `stopping`.

Also add support for an optional secondary footer action so `usage-limit` pause can show:

- primary action: `Continue`
- secondary quiet action: `Stop`

Expected behavior:

- `waiting` and `paused` do not show the animated ellipsis
- `running` and `stopping` keep the current "in progress" feel
- the footer layout stays stable when the extra pause action appears

Cover component rendering for:

- a retry countdown detail
- a paused `usage-limit` detail
- `Continue` plus `Stop` appearing only in the paused case

---

### Task 4: Add explicit slow-mode runtime state and cleanup paths

**File:** `src/App.tsx`

Add runtime-only state and refs for:

- delayed resume timer
- per-page retry counts for PDF
- per-page retry counts for EPUB
- slow-mode wait state
- `usage-limit` paused state

Recommended additions:

```ts
const translateAllPdfRetryCountRef = useRef<Map<number, number>>(new Map());
const translateAllEpubRetryCountRef = useRef<Map<number, number>>(new Map());
const [translateAllUsageLimitPaused, setTranslateAllUsageLimitPaused] =
  useState(false);
const translateAllUsageLimitPausedRef = useRef(false);
```

Expand `translateAllWaitState` so it can describe:

- `slow-pause`
- `transient-retry`
- `usage-limit`

with enough detail for footer copy:

- `page`
- `resumeAt` when auto-resuming
- optional `errorKind`

Update `resetTranslateAllSlowModeRuntime()` so it clears:

- timer
- completed-unit counter
- transient-error streak
- both retry maps
- paused state

Verify every existing stop or context-reset path still clears the new runtime state:

- stop button
- document change
- preset change
- target-language change
- queue drained
- component unmount

Add a `resumeTranslateAllAfterUsageLimit` callback that:

- clears the paused state
- clears the paused wait message
- restarts the correct pipeline for the current file type

Do not auto-resume from `usage-limit`.

---

### Task 5: Refactor PDF slow-mode error handling around the shared policy

**File:** `src/App.tsx`

Update `runPageTranslationQueue` so slow-mode PDF behavior follows the new design:

### On success

- clear the retry count for the completed page
- reset the global transient-error streak
- count one completed unit toward the normal slow-mode pause

### On `retry`

- only in slow mode bulk runs
- increment that page's retry count
- if still below the cap:
  - restore the page to the front of the background queue
  - reset active paragraph statuses from `loading` to `idle`
  - set the page translation state back to `queued`
  - schedule `transient-retry` wait with the shared backoff helper
- if the cap is reached:
  - mark the page translation state as `error`
  - keep the friendly provider message
  - show a small info toast such as `Skipped page X after repeated errors.`
  - continue with the rest of the queue

### On `pause`

- restore the page to the front of the queue
- reset active paragraph statuses from `loading` to `idle`
- set the page translation state back to `queued`
- enter `usage-limit` paused state
- do not clear the bulk queue
- do not auto-resume

### On `skip`

- mark the page translation state as `error`
- keep page paragraphs as `error`
- use the existing `context-limit` friendly copy
- show a small info toast such as `Skipped page X - too large for this model.`
- continue immediately with the rest of the queue

### On `stop`

- preserve the current fatal-error behavior
- preserve existing error toasts
- preserve non-slow-mode behavior unchanged

Important:

- do not reuse `unavailable` for skipped pages
- do not leave the active page removed from the queue during waits or pause
- if the user stops while waiting, no delayed resume should survive

---

### Task 6: Make slow-mode EPUB page-scoped and resilient

**Files:**
- Modify: `src/App.tsx`
- Modify if needed: `src/lib/pageTranslationScheduler.ts`
- Modify tests if needed: `src/lib/pageTranslationScheduler.test.ts`

Change slow-mode EPUB bulk translation so it works page by page.

When slow mode is ON:

- use `selectSlowModeEpubPageBatch(...)`
- translate paragraph ids from one virtual page only
- treat one successful page as one completed slow-mode unit

When slow mode is OFF:

- preserve the current multi-page EPUB batching behavior

Update `runTranslateQueue` so slow-mode EPUB follows the same policy as PDF, but for all paragraphs on the active virtual page:

### On success

- clear the retry count for that EPUB page
- reset the global transient-error streak
- count one completed unit

### On `retry`

- only in slow mode bulk runs
- increment the retry count for the active EPUB page
- if still below the cap:
  - restore that page's paragraph ids to the front of the queue
  - reset their statuses from `loading` to `idle`
  - schedule `transient-retry`
- if the cap is reached:
  - mark that page's affected paragraphs as `error`
  - show a small info toast
  - continue

### On `pause`

- restore that page's paragraph ids to the front of the queue
- reset their statuses from `loading` to `idle`
- enter `usage-limit` paused state
- wait for `Continue`

### On `skip`

- mark that page's affected paragraphs as `error`
- continue with the rest of the queue

### On `stop`

- preserve current fatal-error behavior
- preserve non-slow-mode behavior unchanged

Keep the user-facing copy page-scoped so EPUB slow mode feels the same as PDF slow mode.

---

### Task 7: Update progress-detail copy and action wiring in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify if needed: `src/components/TranslationPane.tsx`

Update `translateAllProgressDetail` so it can render the new states cleanly.

Suggested copy:

- active work: `Translating page X`
- normal pause: `Slow mode pause. Continuing in 12s`
- retry wait: `Network error on page X. Retrying in 45s`
- usage pause: `Paused - out of credits or quota.`
- stop requested: `Stopping after page X`

If the current page is unknown, fall back to a generic message instead of showing broken copy.

Also update the footer action wiring so:

- standard running state uses the existing `Stop Translating All`
- `usage-limit` paused state swaps the main action to `Continue`
- paused state still exposes a separate quiet `Stop`

Make sure PDF and EPUB both receive the correct props.

---

### Task 8: Run focused verification and manual reliability checks

**Files:**
- Modify only if needed after verification:
  - `src/App.tsx`
  - `src/components/TranslationPane.tsx`
  - `src/lib/providerErrors.ts`
  - `src/lib/translateAllSlowMode.ts`
  - related tests

Run:

```bash
bun test src/lib/providerErrors.test.ts
bun test src/lib/translateAllSlowMode.test.ts
bun test src/components/TranslationPane.test.tsx
bun run build
```

Then manually verify:

1. Start `Translate All` with slow mode ON and confirm normal page-by-page progress still works.
2. Disconnect the network mid-run and confirm the same page is retried after the countdown.
3. Trigger `context-limit` on one page and confirm only that page is left in `error` while the run continues.
4. Trigger `usage-limit` and confirm the run pauses, shows `Continue`, and resumes the same page.
5. Trigger `invalid-api-key` and confirm the run still stops immediately.
6. Press `Stop` during a countdown or `usage-limit` pause and confirm no delayed resume fires later.
7. Change document, preset, or target language during a wait and confirm the old run never resumes.
8. Turn slow mode OFF and confirm non-slow-mode bulk behavior is unchanged.
