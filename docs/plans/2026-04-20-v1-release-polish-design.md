# v1.0.0 Release Polish Design

## Summary

This release pass prepares `readani` for a public `v1.0.0` launch by adding a discoverable About surface on the home screen, formalizing release metadata, refreshing the GitHub-facing README, and tightening small presentation inconsistencies that would feel unfinished at release time.

## Goals

- Add an About entry point on the app home screen ("index") that feels native to the existing UI.
- Show release-facing product metadata in the About dialog:
  - app icon
  - product name
  - version number
  - build timestamp
  - copyright line
  - acknowledgement thanking upstream PDF Read
  - author contact for Gallant GUO (`glt@gallantguo.com`)
- Standardize the app version to `v1.0.0` across package and Tauri metadata.
- Replace the current README with a more polished GitHub presentation suited for first-time visitors.
- Run a full release audit for naming, stale copy, and other small finish details inside the MVP scope.

## Non-Goals

- No new reader features beyond the About experience and release metadata.
- No architecture changes to translation, PDF rendering, or storage.
- No marketing website work outside the repository README.

## Approach

### About surface

The About entry should live in the home view header beside the existing theme and settings actions. This matches the user's request for an icon on the index/home screen while keeping the change tightly scoped to the release shell. The control should reuse the existing expanding icon-button language so it visually belongs with the current header actions.

The modal should use the existing Radix Dialog pattern already used by Settings. That gives consistent keyboard behavior, focus handling, and visual framing with low implementation risk. The content should read like a compact release card rather than a settings form.

### Release metadata

The version should be promoted to `1.0.0` in the frontend package metadata and Tauri metadata so app bundle versioning stays aligned. The build timestamp should be injected from the build environment through Vite so the UI can show a real build-time value without hard-coding it in source. A simple fallback string should be provided for local development if the timestamp is absent.

### README

The README should shift from a rough feature list into a release-ready repository front page:

- strong opening summary
- screenshot-led introduction
- why it exists
- key features
- installation and local development
- how the app works
- project structure
- release note callout for `v1.0.0`

The tone should stay clear and practical rather than overly promotional.

### Audit and polish

The audit should focus on visible release quality:

- version consistency
- stale `0.x` references
- copy that still sounds temporary
- obvious metadata gaps
- unfinished docs wording

Any fixes should stay small and targeted.

## Testing Strategy

- Add or update lightweight tests around the home view source/CSS expectations for the About trigger.
- Add branding/release metadata assertions where they help prevent version drift.
- Run the relevant Bun test files for touched areas.
- Run the production build to confirm the metadata wiring and documentation changes do not break the app build.
