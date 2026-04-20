# Settings Presets Design

Status: Approved on 2026-04-20

## Goal

Simplify settings so users manage one default language, a fast theme toggle, and a list of saved translation presets where each preset bundles provider connection details together with its model.

## Product Decision

The settings dialog should stop separating `Translation`, `Appearance`, and `Provider` into tabs.

Instead, the app should present one scrollable settings page with:

- `Default language` at the top
- a preset switcher and preset list below it
- preset editing fields for the selected preset
- preset actions for `Add preset`, `Save`, `Test`, and `Test all`

The theme control should move out of the dialog entirely and become an icon-only control beside the existing settings button.

## User Experience

### Settings Dialog

The dialog becomes a single settings surface instead of tabs.

Section order:

1. `Default language`
2. `Active preset`
3. preset list
4. selected preset editor and actions

This keeps the only true app-wide reading preference at the top and puts provider-specific details in one place.

### Default Language

The current editable `Target language` plus `Language label` pair should be simplified to one `Default language` field.

The app still stores both the user-facing language name and the machine-readable code internally, but the label is no longer directly editable by the user.

In plain terms:

- the app still needs a readable name to show in the UI
- the backend still needs the language code to translate correctly
- the user only chooses the language once from known options

### Theme Toggle

The old `Appearance` tab should be removed.

Beside the settings button, add an icon-only theme control that cycles through:

- `system`
- `light`
- `dark`

Suggested icon behavior:

- computer icon for `system`
- sun icon for `light`
- moon icon for `dark`

This control should be available both on the home view and in the reader toolbar, and it should remember the selected value across restarts.

### Preset List

Users can keep multiple named saved presets and switch between them quickly.

Examples:

- `OpenRouter · openai/gpt-4o-mini`
- `OpenRouter · anthropic/claude-3.5-sonnet`
- `DeepSeek · deepseek-chat`
- `Custom · llama-3.1-70b`

Switching presets should immediately switch the active provider and model together, because the model belongs to the preset.

### Preset Editor

Each preset represents one usable translation configuration. It should include:

- provider kind
- base URL when required
- API key
- model
- generated display name

The user should not need to type the preset name manually in the common case. The app should generate it automatically from provider + model and refresh it whenever those fields change.

If two presets would receive the same generated name, the app should append a small suffix to keep them distinct.

### Provider Types

The initial provider choices should support:

- `OpenRouter`
- `DeepSeek`
- `OpenAI-compatible`

Behavior:

- `OpenRouter` uses the known OpenRouter API endpoints
- `DeepSeek` uses known DeepSeek-compatible endpoints
- `OpenAI-compatible` allows a user-supplied base URL

The UI should leave room for adding more provider kinds later without reshaping the entire settings model again.

### Preset Actions

The selected preset should support:

- `Save`: persist the current preset fields
- `Test`: validate the current preset by making a lightweight provider call
- `Test all`: validate every saved preset and report which ones work

Testing should help users quickly see whether a key, base URL, or model is misconfigured before they start translating a document.

## Architecture

### Single Source of Truth

Remembered settings should move into one backend-managed settings document instead of splitting app preferences across frontend-only state and provider-specific backend files.

That backend-backed settings model should hold:

- theme
- default language
- active preset ID
- preset list

The frontend should load this document on startup and write updates back through narrow Tauri commands.

### Active Translation State

The current frontend translation settings object should stop treating `providerId` and `model` as independently remembered top-level fields.

Instead:

- `defaultLanguage` remains app-wide
- the active preset determines the provider and model
- translation requests resolve their provider/model pair from the active preset

This keeps preset switching predictable and removes a common source of mismatch.

### Persistence and Migration

On upgrade, the app should migrate existing saved provider configuration into the new preset list.

Migration rules:

- existing active provider becomes the initial active preset
- existing saved model, if present, becomes that preset's model
- existing provider-specific connection details are carried forward
- existing theme and language should be carried forward if present
- missing or partial older data should fall back to sensible defaults

The goal is that users do not lose working credentials or their preferred language/theme when the new settings UI ships.

## Backend Responsibilities

The Rust backend should continue to own credential persistence and provider communication.

It should additionally own:

- loading and saving the unified app settings document
- migrating the old provider file into the new format
- testing one preset
- testing all presets

Sensitive values such as API keys must remain backend-managed and must not be moved into a frontend-only storage layer.

## Frontend Responsibilities

The React app should:

- render the one-page settings dialog
- render the new icon-only theme toggle near settings
- show the active preset and editable preset fields
- keep the model selector/field inside the preset editor
- reflect provider-specific requirements such as base URL visibility

The visual style should stay consistent with the app's current restrained Radix-based settings surfaces.

## Testing Expectations

Automated coverage should verify:

- settings load/save behavior for theme, language, active preset, and presets
- migration from the old provider storage shape
- preset switching updates the active provider/model pair together
- generated preset labels stay stable and unique
- provider validation rules for fixed-endpoint providers vs custom base URLs

Manual verification should cover:

- theme cycling on home and reader views
- theme persistence across relaunch
- default language persistence across relaunch
- creating multiple presets for the same provider with different models
- switching presets and confirming translations use the selected preset's model
- testing one preset and testing all presets
