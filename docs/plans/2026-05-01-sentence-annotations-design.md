# Sentence-Level Annotations Design

Status: Approved

## Problem

readani already treats each extracted reading unit as a sentence-like block with:

- a page-local reading order
- a source text string
- a stable-ish sentence id
- mapped PDF rects when available

That makes annotations a natural next step, but it also creates a design trap: if annotations introduce a second, larger "passage object" above the sentence level, the feature becomes harder to understand, harder to render, and less stable when extraction changes.

The goal is to add highlights and notes without fighting the sentence-based model that powers translation today.

## Goal

Add persistent reader annotations that let users:

- highlight a sentence quickly while reading
- add a note to one sentence
- review all saved annotations for the current document in one overlay panel
- see annotations inline in the current page translation pane
- keep annotations stable across translation reruns and most parser changes

## Product Decisions

### Sentence is the only stored annotation unit

Each saved annotation belongs to exactly one sentence.

- A sentence is either highlighted or not.
- A note belongs to one sentence only.
- There is no saved multi-sentence annotation object in MVP.

### Bulk highlight is allowed, but storage stays per sentence

Users may still highlight several selected sentences in one action. Under the hood, that creates one saved sentence annotation per sentence.

### Grouping is display-only

The annotations overlay panel may automatically group adjacent highlighted sentences for readability, but that grouping is derived at render time and never saved as a real object.

### No cross-page annotations

Annotations are page-scoped.

- A saved sentence annotation must stay on one page.
- Grouping stops at page boundaries.
- If a user wants to mark a long passage that crosses pages, they create separate highlights.

This matches the current page-bounded extraction and translation model and keeps annotation recovery much simpler.

## Non-Goals

This design does not include:

- saved multi-sentence annotation objects
- cross-page highlights or notes
- PDF drag-to-select and snap-to-sentence annotation creation
- highlight color customization UI in MVP
- document-wide freeform comments not tied to a sentence

Future highlight color customization should remain possible through theming tokens, but yellow ships first.

## Core UX

### Reader header

Reading view gets a new annotations button beside Theme and Settings.

- Clicking it opens or closes a document-scoped overlay annotations panel.
- The panel does not permanently add a new workspace column.

### Translation pane header

The PDF translation pane header gets a new annotation button to the left of `Redo page`.

Behavior:

- If one or more sentences are selected, clicking it highlights the selected sentences.
- If no sentence is selected, clicking it toggles persistent annotation mode on or off.

Annotation mode:

- stays on across page changes
- turns the sentence cards into one-click highlight targets
- is intended for fast consecutive marking while reading

### Inline sentence actions

Each sentence block already reveals copy actions on hover. Add an `Annotate` button alongside them.

- Clicking `Annotate` immediately highlights that sentence.
- The same action should work whether the user is focusing the original text or the translation text inside the sentence block.

### Linked sentence highlighting

Highlighting is sentence-wide.

- translation and original text inside the sentence block are always highlighted together
- the corresponding PDF overlay highlight is shown together for PDF pages

Users do not need to think about separate "source-side" and "translation-side" annotations.

### Highlighted sentence actions

When a sentence is highlighted, hovering it reveals a small minimalist action clip with:

- `Comment`
- `Delete`

`Delete` removes the sentence highlight and its note.

`Comment` creates or edits that sentence's note.

### Inline notes

If a sentence has a note, the sentence block shows three layers:

1. translation
2. original
3. comment

Comment styling:

- always visible once present
- visually distinct from translation text
- more like a reader note or margin comment than body content

Comments do not follow the original-text hide/show behavior. They stay visible like translation.

## Annotations Overlay Panel

The overlay panel shows annotations for the current document only.

It should:

- group adjacent highlighted sentences on the same page
- sort by page, then sentence order within that page
- show page number
- show a combined excerpt for each group
- show note count when any grouped sentence has a note
- show a `Needs review` badge if any sentence in the displayed group is unresolved

Click behavior:

- clicking a grouped item jumps to that page
- focuses the current-page sentence range inline in the translation pane
- highlights the corresponding PDF region for PDF documents
- allows expansion into individual sentence rows when needed

Important: grouped items are display bundles only. Editing still happens per sentence.

## Data Model

Annotations are separate user data, not cache data.

Recommended stored shape:

```ts
type SentenceAnnotation = {
  id: string;
  docId: string;
  page: number;
  pid: string;
  sentenceIndex: number;
  sourceSnapshot: string;
  sourceHash: string;
  rectsSnapshot: Rect[];
  note?: string;
  status: "attached" | "needs-review";
  createdAt: string;
  updatedAt: string;
};
```

Notes on the fields:

- `pid` is the current sentence id.
- `sentenceIndex` is the sentence's page order at the time of saving. This helps disambiguate duplicate text on the same page.
- `sourceSnapshot` is the saved source text for recovery and review.
- `sourceHash` is a fast text fingerprint.
- `rectsSnapshot` preserves where the sentence lived on the PDF page when it was saved.

Derived display-only shape:

```ts
type AnnotationDisplayGroup = {
  docId: string;
  page: number;
  annotationIds: string[];
  startSentenceIndex: number;
  endSentenceIndex: number;
  excerpt: string;
  noteCount: number;
  hasNeedsReview: boolean;
};
```

## Storage And Persistence

Annotations should live in a new `annotations.json` file under the Tauri app config directory.

Reasons:

- annotations are user-authored data
- translation caches are derived model output
- old vocabulary storage is word-based and not document-anchored

Annotations must not be stored in:

- `translation_cache.json`
- `page_translation_cache.json`
- `vocabulary.json`

The existing vocabulary backend should be treated as unrelated legacy code. It is not a base for this feature.

## Stability Strategy

Primary product requirement: `Needs review` is a rare backup path, not a normal workflow.

To maximize stability, sentence annotations should resolve in this order:

1. exact `docId + page + pid`
2. exact `page + sourceHash`
3. exact `page + sourceSnapshot`
4. best sentence candidate on the same page using text similarity, `sentenceIndex`, and rect similarity
5. if confidence is still low, mark the annotation `needs-review`

Important behaviors:

- Redoing page translation must not delete annotations.
- Switching translation provider or model must not delete annotations.
- Reordering sentences without changing their source text should usually preserve attachment.
- Parser changes that merge or split sentences may require fallback rematching.
- Failed rematching must never silently delete the user's annotation.

## Needs Review

If an annotation cannot be confidently reattached, it remains visible as `Needs review`.

User-facing meaning:

- readani still has the saved note and saved source passage
- readani cannot confidently pin it to the current parsed sentence anymore

Review flow:

1. show a subtle warning inside the translation pane when the current page contains unresolved annotations
2. show `Needs review` badges in the annotations overlay panel
3. opening that annotation should:
   - show the saved old passage
   - show the saved note
   - offer `Reattach` if a strong candidate exists
   - always offer `Reselect on this page`
   - offer `Delete`

Unresolved annotations should stay visible in the overlay panel, but they should not pretend to have a fully trusted live PDF location.

## Visual Tokens

MVP highlight color ships as yellow, but the feature should use a dedicated token instead of hardcoding color values into logic.

Recommended token direction:

- `--annotation-highlight`
- optional stronger or border variant later if needed

This allows later settings-based color customization without changing the annotation data model.

## Architecture Mapping

Likely frontend touchpoints:

- `src/types.ts`
- `src/App.tsx`
- `src/components/TranslationPane.tsx`
- `src/components/PdfViewer.tsx`
- `src/components/PdfPage.tsx`
- `src/App.css`
- new overlay component such as `src/components/AnnotationsPanel.tsx`

Likely backend touchpoint:

- `src-tauri/src/lib.rs`

## Rollout Shape

MVP should focus on:

- per-sentence highlight persistence
- per-sentence notes
- inline annotate actions
- annotation mode toggle
- overlay annotations panel
- display-only grouping
- stable rematching with `needs-review` fallback

Later phases can add:

- PDF drag-to-snap annotation creation
- highlight color settings UI
- richer annotation filtering or search
- broader original-document highlighting beyond the current sentence-linked surfaces
