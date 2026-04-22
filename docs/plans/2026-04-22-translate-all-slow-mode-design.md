# Translate All Slow Mode Design

Status: Approved on 2026-04-22

## Goal

Add an optional `Translate All slow mode` setting so readers can let readani work through an entire PDF or EPUB slowly when the selected provider or model has strict rate limits, especially on OpenRouter free models.

The mode should reduce avoidable rate-limit failures during `Translate All`, automatically recover from rate-limit errors, and leave ordinary one-off translation actions unchanged.

## External Constraint

OpenRouter's current public limits for free models are:

- `20 requests/minute`
- `50 requests/day` for free accounts
- `1000 requests/day` for accounts that have purchased at least `$10` of credits

OpenRouter also notes that popular free models may be additionally rate-limited by upstream providers during high demand, and failed requests still count toward daily free-model usage.

Reference:

- https://openrouter.ai/docs/api-reference/limits/
- https://openrouter.ai/pricing

## Approved Product Behavior

### Scope

The slow mode applies only to `Translate All`.

It affects both:

- PDF `Translate All`
- EPUB `Translate All`

It does not affect:

- single-page PDF translation
- single-paragraph or single-section EPUB translation
- selection translation
- word lookup

### Errors

If `Translate All` hits a non-rate-limit error, behavior stays the same as today:

- stop the bulk run
- surface the error in the existing reader status area
- keep the current error toast behavior

If `Translate All` hits a rate-limit error, the run should not be treated as failed when slow mode is enabled. Instead, readani should wait and retry automatically.

## UX Shape

### Settings

Add a compact global setting near the top of Settings:

- label: `Translate All slow mode`
- control: a simple on/off switch
- helper affordance: a `?` tooltip button beside the label

Tooltip copy should explain the purpose in plain English:

`Useful for rate-limited providers and free models. During Translate All, readani pauses between small batches and retries automatically after rate-limit errors. Other errors still stop the run.`

This setting should be persisted with the existing app settings and default to off.

### Reader Feedback

Do not add a new status surface.

Instead, reuse the same existing footer progress-detail location that already shows messages such as `Translating page X`.

When slow mode is active, that same footer detail should show:

- the normal translating message while work is actively running
- a pause message while the app is intentionally waiting between batches
- a retry message when the app is backing off after a rate-limit error

The footer progress row should continue to use the current progress presentation.

Rate-limit retries in slow mode should not produce a red failure toast because the run is still healthy and continuing.

## Shared Slow-Mode Policy

The UI should expose one setting, and both PDF and EPUB bulk translation should use the same slow-mode policy.

That policy should be implemented as shared scheduler helpers instead of duplicating timing rules in two places.

The shared policy should answer:

- when to insert a normal pause
- how long to wait after a rate-limit error
- how the backoff grows across repeated rate-limit hits
- when the backoff stops growing

## Timing Rules

### Normal pacing

When slow mode is enabled, `Translate All` should process a small batch and then pause briefly before continuing.

Approved initial pacing:

- process `3` units, then pause
- normal pause duration: `12 seconds`

For PDFs, one unit is one translated page.

For EPUBs, one unit is one successful translation batch using the existing queue flow. The first version does not need to rebatch EPUB work to exact page-sized chunks; it only needs to apply the same slow pacing concept to the existing bulk queue.

### Rate-limit backoff

When a bulk translation request fails with a rate-limit error and slow mode is enabled:

- do not mark the run as failed
- do not clear the bulk queue
- put the current work back at the front of the queue
- wait, then retry automatically

Approved retry schedule:

- first wait: `45 seconds`
- second wait: `90 seconds`
- third wait: `180 seconds`
- fourth wait: `360 seconds`
- maximum wait: `600 seconds`

In plain terms, the backoff doubles until it reaches a ten-minute cap.

After a successful translated batch or page, the consecutive rate-limit counter should reset so the next future rate-limit starts again from the first backoff step.

## PDF Integration

PDF `Translate All` already uses a page queue with foreground and background work. The slow mode should layer onto that existing queue instead of replacing it.

### PDF changes

- keep the current queue structure
- keep the current stop behavior
- after every 3 successfully translated pages in a bulk run, pause for 12 seconds before dequeuing the next page
- if the active page translation fails with a rate-limit error during a bulk run and slow mode is enabled, requeue that page at the front and retry after the calculated backoff
- if the failure is not a rate-limit error, preserve the existing stop-and-error behavior

## EPUB Integration

EPUB `Translate All` already uses a paragraph-id queue and a debounced batch request flow. Slow mode should apply to the existing bulk queue without changing the underlying translation model.

### EPUB changes

- keep the current translate queue
- keep the current stop behavior
- after every 3 successful bulk batches in a `Translate All` run, pause for 12 seconds before dispatching the next batch
- if a bulk batch fails with a rate-limit error during slow mode, restore that batch to the front of the queue and retry after the calculated backoff
- if the failure is not a rate-limit error, preserve the existing stop-and-error behavior

This keeps the user-facing behavior aligned across document types without forcing PDF and EPUB onto one identical internal pipeline.

## State Model

The app needs a small amount of extra bulk-run state so it can wait and resume cleanly.

Recommended state:

- persisted setting: `translateAllSlowMode`
- runtime counter for successful units or batches since the last pause
- runtime counter for consecutive rate-limit hits
- runtime timer handle for the current scheduled resume
- runtime label or mode so the existing status area can describe:
  - active translation
  - normal slow-mode pause
  - rate-limit retry wait

Timer cleanup must happen when:

- the user stops `Translate All`
- the document changes
- the translation session resets
- the component unmounts

## Error Handling

### When slow mode is off

Keep all current behavior unchanged.

### When slow mode is on

For rate-limit errors only:

- retry automatically
- do not show a failure toast
- keep the queue intact
- keep the run marked as active

For all other provider errors:

- preserve the existing stop behavior
- preserve the existing toast behavior
- preserve existing per-page or per-paragraph error states

## Testing Expectations

Frontend coverage should verify:

- app settings default `translateAllSlowMode` to `false`
- saved settings normalize the new field safely when missing
- settings dialog renders the new switch and tooltip copy
- PDF slow-mode helpers pause after every third successful page
- EPUB slow-mode helpers pause after every third successful bulk batch
- rate-limit backoff grows as `45 -> 90 -> 180 -> 360 -> 600`
- successful work resets the consecutive rate-limit backoff
- non-rate-limit failures still stop bulk translation
- stop/cancel clears any pending resume timer

## Non-Goals

This change should not:

- add a separate background-job UI
- change single-item translation behavior
- skip non-rate-limit failures and silently continue
- make the user configure custom pause timings in the MVP
- force PDF and EPUB to share one internal translation pipeline
