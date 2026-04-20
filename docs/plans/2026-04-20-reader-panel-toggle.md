# Reader Panel Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the reader toolbar's four panel toggles into a compact segmented control with a pressed active state, without changing toggle behavior.

**Architecture:** Extract the toolbar toggle markup into a small `PanelToggleGroup` component so the structure can be tested without rendering the full Tauri app shell. Keep the existing panel state logic in `src/App.tsx`, and move only the rendering details plus CSS contract into the new component and stylesheet.

**Tech Stack:** React 19, TypeScript, Radix Toolbar, Bun tests, app-wide CSS in `src/App.css`

---

### Task 1: Reader Panel Toggle Component

**Files:**
- Create: `src/components/reader/PanelToggleGroup.tsx`
- Create: `src/components/reader/PanelToggleGroup.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Write the failing test**

Add a render test that checks:

- the control renders a segmented group wrapper
- all four labels are present
- active items receive the active class and `aria-pressed="true"`
- the last visible active item renders disabled

**Step 2: Run test to verify it fails**

Run: `bun test src/components/reader/PanelToggleGroup.test.tsx`

Expected: FAIL because the component does not exist yet.

**Step 3: Write minimal implementation**

- Create `PanelToggleGroup.tsx` with the current four-button toolbar rendering.
- Pass panel state and click handlers in from `src/App.tsx`.
- Swap the inline header toggle markup in `src/App.tsx` to use the new component.
- Update `src/App.css` so the group becomes a segmented shell with equal-width sections and a pressed active state.

**Step 4: Run test to verify it passes**

Run: `bun test src/components/reader/PanelToggleGroup.test.tsx`

Expected: PASS

**Step 5: Run broader verification**

Run: `bun test src/components/reader/PanelToggleGroup.test.tsx src/components/TranslationPane.test.tsx src/components/PdfViewer.test.tsx`

Expected: PASS

**Step 6: Run build verification**

Run: `bun run build`

Expected: PASS

**Step 7: Commit**

```bash
git add docs/plans/2026-04-20-reader-panel-toggle-design.md \
        docs/plans/2026-04-20-reader-panel-toggle.md \
        src/components/reader/PanelToggleGroup.tsx \
        src/components/reader/PanelToggleGroup.test.tsx \
        src/App.tsx \
        src/App.css
git commit -m "feat: restyle reader panel toggles"
```
