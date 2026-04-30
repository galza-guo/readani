# Resilient Translate All Design

Status: Revised draft

## Problem

`Translate All` slow mode currently recovers only from `rate-limit` errors. That is not enough for real unattended runs:

- transient network failures still kill the whole run
- temporary provider failures still kill the whole run
- `usage-limit` errors stop instead of pausing cleanly
- `context-limit` errors on one page can block the rest of the book

In practice, the feature is still too fragile for the exact users who need it most: readers using free-tier, rate-limited, or occasionally flaky providers.

## Goal

Make slow mode reliable enough that a reader can start `Translate All`, leave it alone, and come back later to either:

- a completed document, or
- a clearly explained partial result with a few pages that need attention

Non-slow-mode behavior stays unchanged.

## Product Principles

### Reliability first

Slow mode should favor finishing the book over preserving maximum throughput.

### Never lose the active work item

If readani waits, retries, or pauses, the page being worked on must remain resumable. The app should resume that same page, not silently skip ahead.

### Fail at the smallest reasonable scope

If only one page is bad, skip or pause that page. Do not fail the whole document.

### Quiet automation, explicit human intervention

Automatic retries should be low-drama. Human-action-required states should be obvious and resumable.

### Skipped is not the same as unavailable

A page skipped because the model is too small or because repeated retries failed should remain visible as an error state, not as "no usable text".

## Scope

This design applies only when `Translate All slow mode` is ON.

It affects:

- PDF `Translate All`
- EPUB `Translate All`

It does not affect:

- single-page PDF translation
- single-paragraph or single-section EPUB translation
- selection translation
- word lookup
- non-slow-mode `Translate All`

## Slow-Mode Unit Of Work

To make retries and skips predictable, slow mode should use the same unit of work for both document types: one page at a time.

- PDF slow mode already works one page per request
- EPUB slow mode should switch to one virtual page per request
- non-slow-mode EPUB behavior stays unchanged

This is an intentional design change from the earlier slow-mode rollout. It trades some throughput for a much better failure model:

- retries are page-scoped
- `context-limit` handling becomes page-scoped
- skipped work is easy to explain to the user
- `usage-limit` resume always returns to one clear page

In slow mode, one successful page counts as one pacing unit for both PDF and EPUB.

## Error Policy

### Auto-retry, then continue

These errors should retry automatically with backoff. They are noisy, but usually temporary.

| Error kind | Handling in slow mode |
| --- | --- |
| `rate-limit` | Requeue the same page, wait, retry automatically |
| `network-request` | Requeue the same page, wait, retry automatically |
| `timeout` | Requeue the same page, wait, retry automatically |
| `provider-unavailable` | Requeue the same page, wait, retry automatically |
| `provider-response` | Requeue the same page, wait, retry automatically |
| `unknown` | Requeue the same page, wait, retry automatically |

Retry policy:

- backoff uses the existing exponential schedule: `45s -> 90s -> 180s -> 360s -> 600s`
- a page may auto-retry at most `3` times in one run
- after a page succeeds, both the page retry counter and the global backoff streak reset
- after the retry cap is reached, mark that page as `error`, surface a friendly skipped message, and continue with the rest of the run

This cap is what makes retrying `provider-response` and `unknown` safe enough for slow mode.

### Pause and wait for the user

| Error kind | Handling in slow mode |
| --- | --- |
| `usage-limit` | Restore the same page to the queue, pause the run, show `Continue`, let the user decide when to resume |

Examples:

- credits were exhausted
- daily quota reset has not happened yet
- the user adds more credits and wants to continue

If the user taps `Continue` and the same `usage-limit` happens again, the run should simply pause again without losing position.

### Skip the page and continue

| Error kind | Handling in slow mode |
| --- | --- |
| `context-limit` | Mark that page as `error`, explain that the current model is too small, continue with later pages |

This is page-scoped, not run-scoped.

Do not use `unavailable` for this. `unavailable` already means the page has no usable text or needs OCR. A model-size failure is a different user problem and needs different copy.

### Stop immediately

These still require direct user action and should preserve the current stop behavior:

| Error kind | Handling in slow mode |
| --- | --- |
| `setup-required` | Stop |
| `invalid-api-key` | Stop |
| `base-url` | Stop |
| `model` | Stop |
| `local-cache` | Stop |

## Queue And Resume Semantics

These rules are the core reliability contract.

### A page only leaves the run in three cases

The current page is considered finished only when one of these is true:

1. translation succeeded
2. the page was explicitly skipped
3. the user explicitly stopped the run

Waiting, retrying, and `usage-limit` pauses do not count as finished.

### When waiting or pausing

Before scheduling a retry or entering `usage-limit` pause, readani must:

- restore the current page to the front of the bulk queue
- reset that page's active sentence or paragraph statuses from `loading` back to `idle`
- clear in-flight runtime markers
- keep the run marked active unless the user stopped it

That rule applies to both PDF and EPUB slow mode.

### When stopping during a wait

If the user presses `Stop` while slow mode is:

- in a normal pause
- in an automatic retry countdown
- paused on `usage-limit`

then readani must:

- clear the timer
- cancel the remaining bulk queue
- leave not-yet-finished items in a retryable `idle` or `error` state
- guarantee that no delayed resume can fire later

### When document context changes

Document change, preset change, target-language change, and component unmount must all clear:

- the delayed resume timer
- the page retry counters
- the paused state
- the active run marker

No old timer should ever restart translation in a new context.

## User Experience

### Footer states

The existing translation-pane footer remains the right place for slow-mode feedback, but it should distinguish four states:

- `running`: actively translating now
- `waiting`: automatic countdown before resume
- `paused`: waiting for user action
- `stopping`: finishing the in-flight page before stopping

Suggested copy:

- `Translating page 8`
- `Slow mode pause. Continuing in 12s`
- `Network error on page 8. Retrying in 45s`
- `Paused - out of credits or quota.`
- `Stopping after page 8`

`waiting` and `paused` should not use the animated ellipsis that fits an active in-flight request.

### Footer actions

Default footer action behavior:

- while running or waiting: main action is `Stop Translating All`
- while paused on `usage-limit`: main action becomes `Continue`
- while paused on `usage-limit`: a secondary quiet `Stop` action remains available

This is clearer than burying `Continue` inside a message while leaving the main button stuck on `Stop`.

### Toast policy

- no red error toast for automatic retries
- one warning or neutral toast when `usage-limit` pauses the run
- a small info toast when a page is skipped, for example:
  - `Skipped page 12 - too large for this model.`
  - `Skipped page 12 after repeated errors.`
- existing fatal error toasts stay unchanged

### Completion behavior

If slow mode finishes after skipping some pages:

- the run ends normally
- the skipped pages remain in `error`
- overall progress remains incomplete
- the main action stays `Translate All`, not `Retranslate All`

This is important for honesty. The app should not imply the whole document is done when a few pages still need a larger model or a manual retry.

## PDF Behavior

PDF slow mode keeps the current page queue architecture.

For each page:

- success:
  - clear that page's retry counter
  - reset the global transient-error backoff streak
  - count one successful unit toward the normal pacing pause
- transient failure:
  - if retry count is below `3`, restore the page to the front of the background queue and auto-retry later
  - if retry count reaches `3`, mark the page `error`, show a skipped message, and continue
- `context-limit`:
  - mark the page `error` with the model-too-small copy
  - continue immediately
- `usage-limit`:
  - restore the page to the queue
  - enter paused state
  - wait for `Continue`
- fatal setup or provider errors:
  - preserve the current stop behavior

## EPUB Behavior

EPUB slow mode should become page-scoped.

### Slow-mode request shape

When slow mode is ON:

- select paragraph ids only from the next queued virtual page
- send one virtual page per translation request
- keep the existing non-slow-mode batching path unchanged

### Error handling

Apply the same page-level policy as PDF, but to all translatable paragraphs on that EPUB virtual page:

- success resets that page retry counter and the global backoff streak
- transient failures auto-retry up to `3` times for that page
- `context-limit` marks that page's paragraphs `error` and continues
- `usage-limit` restores that page to the front of the queue and pauses
- fatal setup or provider errors stop the run

This makes slow-mode EPUB behavior understandable in the same way as PDF: one page succeeds, retries, pauses, or gets skipped.

## Runtime State

The app needs a little more explicit runtime state for slow mode:

- a wait-state object with:
  - `kind: "slow-pause" | "transient-retry" | "usage-limit"`
  - `page: number | null`
  - `errorKind?: FriendlyProviderError["kind"]`
  - `resumeAt?: number`
- a delayed-resume timer handle
- per-page retry counters for the current run
- a paused boolean for swapping footer actions cleanly

This state is runtime-only. It should not be persisted across app restarts.

## Testing Expectations

Automated coverage should verify:

- the slow-mode error policy for every `FriendlyProviderError["kind"]`
- retry backoff remains `45 -> 90 -> 180 -> 360 -> 600`
- pages retry at most `3` times per run
- skipped pages stay in `error`, not `unavailable`
- `usage-limit` pauses preserve the current page for resume
- slow-mode EPUB selects one virtual page at a time
- footer progress-detail states render correctly for `running`, `waiting`, `paused`, and `stopping`
- stop, document switch, preset switch, language switch, and unmount all clear pending resumes

Manual verification should confirm:

- disconnecting the network mid-run retries and resumes the same page
- `context-limit` skips only the bad page
- wrong API key still stops immediately
- `Continue` on `usage-limit` resumes the same page, not the next one

## Out Of Scope

- automatic resume after app restart
- custom retry counts or custom wait durations
- changing non-slow-mode behavior
- adding a new background-job screen or history UI
