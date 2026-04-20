# Settings Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the tabbed settings UI with a single settings page, move theme switching beside the settings button, and introduce saved translation presets where each preset bundles provider details together with its model.

**Architecture:** Add one backend-managed app settings model that stores theme, default language, active preset, and presets; migrate old provider data into that model; then refactor the React settings flow so translation requests resolve provider/model from the active preset instead of independent top-level fields.

**Tech Stack:** React 19, TypeScript, Bun tests, Tauri, Rust, Radix UI

---

### Task 1: Add frontend settings-state helpers and tests

**Files:**
- Create: `src/lib/appSettings.ts`
- Create: `src/lib/appSettings.test.ts`
- Modify if needed: `src/types.ts`

**Step 1: Write the failing test**

Add tests for:

- generating preset labels from provider + model
- appending a suffix when two generated labels would collide
- resolving the active preset from saved settings
- normalizing a default language value

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/appSettings.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Add a small pure helper module for:

- preset label generation
- uniqueness handling
- active preset lookup
- small normalization helpers shared by the UI

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/appSettings.test.ts`

Expected: PASS

### Task 2: Add backend app-settings model, migration, and tests

**Files:**
- Modify: `src-tauri/src/providers.rs`
- Modify: `src-tauri/src/lib.rs`
- Create if needed: `src-tauri/src/app_settings.rs`

**Step 1: Write the failing test**

Add Rust tests for:

- loading default app settings when no new settings file exists
- migrating the current provider storage shape into one preset
- carrying forward an existing active provider/model into the active preset
- preserving configured API keys and default language/theme during normalization

**Step 2: Run test to verify it fails**

Run: `cargo test app_settings`

Expected: FAIL because the unified settings model and migration helpers do not exist yet.

**Step 3: Write minimal implementation**

Add backend structs and helpers for:

- theme
- default language
- active preset ID
- preset list
- migration from the existing provider storage
- loading and saving the new settings file

Expose narrow Tauri commands for:

- `get_app_settings`
- `save_app_settings`
- `test_translation_preset`
- `test_all_translation_presets`

**Step 4: Run test to verify it passes**

Run: `cargo test app_settings`

Expected: PASS

### Task 3: Refactor shared TypeScript types to use presets

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify if needed: `src/components/settings/SettingsDialogContent.tsx`
- Modify if needed: `src/views/HomeView.tsx`

**Step 1: Write the failing test**

Extend `src/lib/appSettings.test.ts` or add focused tests for:

- resolving the active provider/model pair from the active preset
- preserving the app-wide default language while switching presets

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/appSettings.test.ts`

Expected: FAIL because the current types still treat provider/model as independent top-level settings.

**Step 3: Write minimal implementation**

Update the shared types so the frontend represents:

- `theme`
- `defaultLanguage`
- `activePresetId`
- `presets`

Refactor `src/App.tsx` state so translation requests derive provider/model from the selected preset instead of separate remembered fields.

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/appSettings.test.ts`

Expected: PASS

### Task 4: Replace the tabbed settings dialog with one settings page

**Files:**
- Modify: `src/components/settings/SettingsDialogContent.tsx`
- Modify: `src/App.css`
- Modify if needed: `src/views/HomeView.tsx`
- Modify if needed: `src/App.tsx`

**Step 1: Add the failing behavior target**

Define the UI behavior for:

- one scrollable settings page with no tabs
- `Default language` at the top
- preset selector and preset list
- preset editing fields for provider, base URL, API key, and model
- preset actions for `Add preset`, `Save`, `Test`, and `Test all`

**Step 2: Write minimal implementation**

Remove the tab UI and replace it with one structured settings surface that:

- shows the selected default language
- lets the user switch among saved presets
- exposes provider-specific fields only when needed
- keeps the model inside the preset editor instead of global settings

**Step 3: Verify behavior**

Run: `bun run build`

Expected: PASS

### Task 5: Add the icon-only theme cycle control and tests

**Files:**
- Create if helpful: `src/components/ThemeToggleButton.tsx`
- Modify: `src/App.tsx`
- Modify: `src/views/HomeView.tsx`
- Modify: `src/App.css`
- Create if needed: `src/components/ThemeToggleButton.test.tsx`

**Step 1: Write the failing test**

Add tests for:

- cycling `system -> light -> dark -> system`
- showing the correct icon for each state
- calling back with the remembered theme value

**Step 2: Run test to verify it fails**

Run: `bun test src/components/ThemeToggleButton.test.tsx`

Expected: FAIL because the dedicated theme cycle control does not exist yet.

**Step 3: Write minimal implementation**

Add an icon-only theme control and place it beside the settings button in both the home header and the reader toolbar.

Make it update the backend-managed app settings so the chosen theme persists across relaunch.

**Step 4: Run test to verify it passes**

Run: `bun test src/components/ThemeToggleButton.test.tsx`

Expected: PASS

### Task 6: Add preset testing flows

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/settings/SettingsDialogContent.tsx`
- Modify: `src/App.css`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add the failing behavior target**

Define and cover behavior for:

- testing the selected preset
- testing all saved presets
- surfacing success or failure per preset in the dialog

**Step 2: Write minimal implementation**

Wire the dialog actions to the new backend commands, then show lightweight per-preset results so users can tell what is working.

Keep the first version simple and utility-focused rather than adding new decorative UI.

**Step 3: Verify behavior**

Run: `bun run build`

Expected: PASS

### Task 7: Run focused verification and fix any regressions

**Files:**
- Modify only if needed after verification: `src/App.tsx`, `src/App.css`, `src/types.ts`, `src/lib/appSettings.ts`, `src/components/settings/SettingsDialogContent.tsx`, `src/components/ThemeToggleButton.tsx`, `src/views/HomeView.tsx`, `src-tauri/src/lib.rs`, `src-tauri/src/app_settings.rs`, `src-tauri/src/providers.rs`

**Step 1: Run automated verification**

Run:

- `bun test src/lib/appSettings.test.ts`
- `bun test src/components/ThemeToggleButton.test.tsx`
- `cargo test app_settings`
- `bun run build`

**Step 2: Fix any real regressions**

Adjust only the code required by failing output.

**Step 3: Re-run verification**

Run the same commands again and confirm they pass.
