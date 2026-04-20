# Reader Panel Toggle Design

**Date:** 2026-04-20

**Goal:** Restyle the four reader panel toggles in the top toolbar into a compact segmented control that matches the current desktop-reader visual language while making the active state feel physically pressed.

## Context

The reader header currently renders four independent toggle buttons for `navigation`, `original`, `translation`, and `chat`. Functionally they already behave correctly: each panel can be toggled independently, and the last visible panel remains protected from being turned off. The requested change is purely presentational.

## Approved Direction

Use the existing four controls and keep their text labels unchanged. Replace the current pill-like group styling with a segmented control:

- one shared outer shell with a single border
- four equal-width button segments
- thin dividers between adjacent segments
- a restrained inactive state that blends with the existing header
- a pressed active state using a slightly deeper fill plus inset shadow cues

## Interaction Notes

- Keep the current toggle behavior and accessibility attributes.
- Preserve the disabled state for the last visible panel.
- Keep hover feedback subtle so the active state remains the strongest cue.
- Do not introduce icons or new functionality.

## Implementation Shape

- Extract the reader panel toggle markup from `src/App.tsx` into a focused component under `src/components/reader/`.
- Add a small render test for the segmented-control structure and active-state class contract.
- Update `src/App.css` to provide the shared shell, segment dividers, equal-width layout, and pressed active treatment in both light and dark themes.

## Verification

- Run the new focused test for the segmented toggle component.
- Run the production build to catch any TypeScript or CSS regressions.
