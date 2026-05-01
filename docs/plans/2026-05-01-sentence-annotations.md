# Sentence-Level Annotations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add stable per-sentence highlights and notes with inline annotation actions, a persistent annotation mode, a document-scoped annotations overlay panel, and a safe `needs-review` fallback when extraction changes.

**Architecture:** Store annotations as one record per sentence in a new Tauri-backed `annotations.json` file and keep grouping strictly display-only in the React layer. Extend the existing translation-pane sentence cards so they can create, render, edit, and delete per-sentence annotations, while expanding the PDF overlay logic so temporary hover highlights and persistent saved highlights can coexist. Resolve saved annotations against live page sentences using exact ids first, then source/position fallbacks, and surface unresolved items in both the page rail and the document-wide overlay panel.

**Tech Stack:** React 19, TypeScript, Bun tests, Tauri, Rust, Radix UI, pdf.js

---

> Design doc: `docs/plans/2026-05-01-sentence-annotations-design.md`
>
> Work in the main worktree for this repo. Do not create a separate worktree for this feature.

### Task 1: Add shared annotation types and pure helper functions

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/annotations.ts`
- Create: `src/lib/annotations.test.ts`

Add the core frontend types:

- `SentenceAnnotation`
- `SentenceAnnotationStatus`
- `AnnotationDisplayGroup`
- any small UI helper types needed for active group state or editor state

In `src/lib/annotations.ts`, add pure helpers for:

- sorting annotations by page and sentence index
- grouping adjacent sentence annotations for display
- filtering document annotations to the current page
- computing counts such as note count and `hasNeedsReview`

Recommended APIs:

```ts
export function sortSentenceAnnotations(
  annotations: SentenceAnnotation[],
): SentenceAnnotation[];

export function groupSentenceAnnotations(
  annotations: SentenceAnnotation[],
): AnnotationDisplayGroup[];

export function getPageSentenceAnnotations(
  annotations: SentenceAnnotation[],
  page: number,
): SentenceAnnotation[];
```

Tests should cover:

- grouping adjacent sentences on the same page
- breaking groups when pages change
- breaking groups when sentence indexes are not adjacent
- carrying `needs-review` through to the group summary
- keeping note counts accurate

---

### Task 2: Add annotation persistence in the Tauri backend

**Files:**
- Modify: `src-tauri/src/lib.rs`

Add a new `annotations.json` store under the app config directory.

Backend work:

- add `annotations_file_path(...)`
- add `SentenceAnnotationRecord`
- add `AnnotationsData`
- add load/save helpers
- register Tauri commands for:
  - `get_annotations`
  - `upsert_annotation`
  - `delete_annotation`

Recommended Rust shape:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SentenceAnnotationRecord {
    id: String,
    doc_id: String,
    page: u32,
    pid: String,
    sentence_index: usize,
    source_snapshot: String,
    source_hash: String,
    rects_snapshot: Vec<RectRecord>,
    note: Option<String>,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
```

Keep the commands document-scoped:

- `get_annotations(handle, doc_id)`
- `upsert_annotation(handle, annotation)`
- `delete_annotation(handle, doc_id, annotation_id)`

Make `upsert_annotation` idempotent for edits: same `id` replaces the older record.

Do not reuse vocabulary storage or commands.

---

### Task 3: Add live annotation state and backend wiring in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Add React state and refs for:

- current document annotations
- annotation mode on/off
- current active annotation id or active grouped sentence ids
- current sentence being edited for note text

Recommended additions:

```ts
const [annotations, setAnnotations] = useState<SentenceAnnotation[]>([]);
const [annotationModeEnabled, setAnnotationModeEnabled] = useState(false);
const [activeAnnotationIds, setActiveAnnotationIds] = useState<string[]>([]);
const [noteEditingAnnotationId, setNoteEditingAnnotationId] =
  useState<string | null>(null);
```

Add document lifecycle behavior:

- load annotations whenever `docId` changes
- clear annotation UI state when the reader switches documents
- keep annotation mode persistent across page changes
- do not clear annotations when translation is redone

Add callback helpers for:

- `toggleSentenceHighlight(pid)`
- `highlightSelectedSentences(pids)`
- `deleteSentenceAnnotation(annotationId)`
- `saveSentenceNote(annotationId, note)`

These callbacks should be the single source of truth for persistence and local state updates.

---

### Task 4: Add a pure rematching helper before rendering live annotations

**Files:**
- Create: `src/lib/annotationMatching.ts`
- Create: `src/lib/annotationMatching.test.ts`
- Modify: `src/App.tsx`

Create a pure helper that resolves stored annotations against the current live page sentences.

Inputs:

- stored annotations for a document
- live `PageDoc[]`

Outputs:

- attached annotations with live sentence references
- unresolved annotations marked `needs-review`

Recommended approach:

1. exact `page + pid`
2. exact `page + sourceHash`
3. exact `page + sourceSnapshot`
4. nearest candidate by sentence index plus rect similarity
5. unresolved

Suggested return shape:

```ts
type ResolvedSentenceAnnotation = SentenceAnnotation & {
  livePid?: string;
  liveSentenceIndex?: number;
  livePage?: number;
  status: "attached" | "needs-review";
};
```

Tests should cover:

- exact pid match
- fallback to source hash
- duplicate text on one page resolved with sentence index
- parser drift producing `needs-review`
- unresolved items remaining present instead of disappearing

Use this helper in `App.tsx` so all UI surfaces consume the same resolved annotation state.

---

### Task 5: Extend PDF overlay rendering for persistent saved highlights

**Files:**
- Modify: `src/components/PdfViewer.tsx`
- Modify: `src/components/PdfPage.tsx`
- Modify: `src/components/PdfViewer.test.tsx`

Today `PdfPage` only renders temporary hover/active highlight markers via one `highlightPid`.

Extend it so it can render both:

- temporary linked hover/active highlights
- persistent saved sentence highlights for the current page

Recommended prop additions:

```ts
savedHighlightPids?: string[];
activeHighlightPids?: string[];
```

Rendering rules:

- persistent highlights use the new annotation color token
- hover/active highlight state remains visible and should still feel responsive
- overlapping saved and active highlights should not duplicate into broken visuals

Do not remove the current hover behavior. Build on top of it.

Tests should verify:

- saved highlights render even when nothing is hovered
- hover/active highlighting still works
- multiple saved sentence highlights on the same page render together

---

### Task 6: Add inline annotation actions and annotation mode to the PDF translation pane

**Files:**
- Modify: `src/components/TranslationPane.tsx`
- Modify: `src/components/TranslationPane.test.tsx`
- Modify: `src/App.tsx`

Extend `PdfSegmentCard` so hover actions now include:

- copy translation
- copy original
- annotate

Add a sentence-level highlight visual state to the card.

Add a small hover clip for highlighted sentences with:

- `Comment`
- `Delete`

Add a translation-pane header annotation button to the left of `Redo page`.

Behavior:

- when one or more sentence cards are selected: clicking the button highlights them
- when no sentence is selected: clicking the button toggles persistent annotation mode
- in annotation mode, clicking a sentence card highlights it with one click
- clicking a sentence already highlighted in annotation mode must not create duplicates

Tests should cover:

- annotate button visibility on hover
- bulk highlight via selected sentence cards
- annotation mode toggling
- one-click highlight in annotation mode
- highlighted sentence clip showing comment/delete controls

---

### Task 7: Add inline note rendering and editing under translation

**Files:**
- Modify: `src/components/TranslationPane.tsx`
- Modify: `src/components/TranslationPane.test.tsx`
- Modify: `src/App.tsx`

Render note content inside the sentence block below translation and original text.

Behavior:

- notes are always visible once present
- notes use a distinct visual style
- `Comment` on a highlighted sentence opens note creation or edit
- `Delete` removes both highlight and note

Keep the editor simple for MVP:

- open an inline note editor in the sentence card or a compact anchored popover
- save writes through the single `saveSentenceNote(...)` callback in `App.tsx`

Tests should cover:

- rendering a sentence with translation, original, and note
- creating a note on an already highlighted sentence
- editing an existing note
- deleting a highlighted sentence removes its note UI

---

### Task 8: Build the overlay annotations panel and wire it to the reader header

**Files:**
- Create: `src/components/AnnotationsPanel.tsx`
- Create: `src/components/AnnotationsPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

Add a new reader-header button beside Theme and Settings that toggles an overlay annotations panel.

Panel requirements:

- current-document annotations only
- grouped display based on adjacent sentence annotations
- page number
- excerpt
- note count
- `Needs review` badge when present

Interaction:

- clicking a group jumps to that page
- activates that sentence run in the translation pane
- highlights the linked PDF region when available
- expanding a group reveals the individual sentence entries if needed

Tests should cover:

- panel open and close
- grouping adjacent sentences into one row
- showing note counts
- clicking a row calls the page-navigation handler

---

### Task 9: Add page-level `Needs review` warnings and review actions

**Files:**
- Modify: `src/components/TranslationPane.tsx`
- Modify: `src/components/AnnotationsPanel.tsx`
- Modify: `src/components/TranslationPane.test.tsx`
- Modify: `src/components/AnnotationsPanel.test.tsx`
- Modify: `src/App.tsx`

When the current page contains unresolved annotations:

- show a subtle warning banner inside the translation pane
- surface unresolved items in the overlay panel

For MVP, the review actions can be:

- `Reattach` when the matching helper exposed a strong candidate
- `Reselect on this page`
- `Delete`

If candidate confidence is not available yet, ship:

- `Reselect on this page`
- `Delete`

The key rule is that unresolved annotations remain visible and actionable. They must never disappear silently.

Tests should cover:

- warning banner rendering on a page with unresolved items
- unresolved groups showing a badge in the overlay
- unresolved item actions calling the right handlers

---

### Task 10: Add annotation color tokens and finish the styling layer

**Files:**
- Modify: `src/App.css`

Add dedicated annotation design tokens instead of hardcoded colors.

Recommended token direction:

```css
--annotation-highlight: rgba(255, 214, 10, 0.32);
--annotation-highlight-strong: rgba(255, 214, 10, 0.48);
--annotation-note-bg: ...;
--annotation-note-border: ...;
```

Use these tokens for:

- sentence card highlighted state
- PDF overlay highlight fill
- hover clip styling
- inline note styling
- annotations panel badges and states

Do not add settings UI for color customization yet. Keep the token boundary clean so that later settings work is straightforward.

---

### Task 11: Verify the whole flow and document the manual test pass

**Files:**
- Modify if needed: `docs/TODO.md`

Run focused tests for:

- `src/lib/annotations.test.ts`
- `src/lib/annotationMatching.test.ts`
- `src/components/TranslationPane.test.tsx`
- `src/components/PdfViewer.test.tsx`
- `src/components/AnnotationsPanel.test.tsx`

Then do a manual reader check covering:

1. highlight one sentence with the inline annotate button
2. highlight multiple selected sentences with the header annotation button
3. turn annotation mode on and mark several sentences across pages
4. add, edit, and delete a note
5. reopen the document and verify annotations reload
6. verify the overlay panel groups adjacent highlighted sentences
7. verify PDF overlays stay linked with inline sentence highlights
8. verify unresolved annotations show a warning instead of disappearing

Capture any follow-up polish in `docs/TODO.md` only if it is a genuine post-MVP issue. Do not widen scope during implementation.
