import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import settingsDialogSource from "./SettingsDialogContent.tsx?raw";
import { SettingsDialogContent, type SettingsDialogContentProps } from "./SettingsDialogContent";

const settingsStylesSource = readFileSync(
  resolve(import.meta.dir, "..", "..", "App.css"),
  "utf8"
);

function buildProps(
  overrides: Partial<SettingsDialogContentProps> = {}
): SettingsDialogContentProps {
  const settings = overrides.settings ?? {
    theme: "system",
    activePresetId: "preset-1",
    autoFallbackEnabled: false,
    autoTranslateNextPages: 1,
    translateAllSlowMode: false,
    defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
    presets: [
      {
        id: "preset-1",
        label: "OpenRouter · openai/gpt-4o-mini",
        providerKind: "openrouter" as const,
        model: "openai/gpt-4o-mini",
        apiKeyConfigured: true,
      },
    ],
  };

  return {
    settings,
    liveActivePresetId: settings.activePresetId,
    editingPresetId: settings.presets[0]?.id ?? null,
    editingPreset: settings.presets[0],
    apiKeyEditingPresetId: null,
    presetApiKeyDrafts: {},
    presetStatuses: {},
    presetSaveStatusById: {
      [settings.presets[0]?.id ?? "preset-1"]: { state: "saved" },
    },
    presetTestRunningId: null,
    presetModelsLoadingById: {},
    testAllRunning: false,
    testAllDisabled: false,
    presetModels: {},
    presetModelMessages: {},
    translationCacheSummary: {
      totalCacheSizeBytes: 24576,
      books: [
        {
          docId: "doc-1",
          title: "A Very Long Book Title for Testing Cache Rows",
          cachedPageCount: 12,
        },
      ],
    },
    translationCacheLoading: false,
    translationCacheActionTarget: null,
    onSettingsChange: () => {},
    onAddPreset: () => "preset-2",
    onDeletePreset: () => {},
    onDeleteAllTranslationCache: () => {},
    onDeleteCachedBook: () => {},
    onEditingPresetChange: () => {},
    onActivatePreset: () => {},
    onPresetChange: () => {},
    onPresetApiKeyInputChange: () => {},
    onPresetApiKeyFocus: () => {},
    onPresetApiKeyBlur: () => {},
    onRetryPresetSave: () => {},
    onFetchPresetModels: () => {},
    onTestPreset: () => {},
    onTestAllPresets: () => {},
    ...overrides,
  };
}

describe("SettingsDialogContent", () => {
  test("renders tabs for general, providers, and cache", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).toContain(">General<");
    expect(html).toContain(">Providers<");
    expect(html).toContain(">Cache<");
    expect(settingsDialogSource).toContain("settings-tabs-list");
  });

  test("renders one default language label and no helper note", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html.match(/Default language/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("New translations use this language by default.");
  });

  test("renders a general setting for following-page auto-translation", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).toContain("Auto-translate ahead");
    expect(html).toContain('id="auto-translate-next-pages"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('type="number"');
    ["Off", "1", "3", "5", "10", "20"].forEach((label) => {
      expect(settingsDialogSource).toContain(`label: "${label}"`);
    });
    expect(settingsDialogSource).not.toContain("0 turns it off.");
  });

  test("renders the automatic fallback switch with experimental copy", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).toContain("Automatic fallback");
    expect(html).toContain("Experimental");
    expect(html).toContain("Retry another usable preset after a failure or timeout.");
    expect(settingsDialogSource).toContain("settings-toggle-row");
  });

  test("renders a provider picker and removes the old explicit save action", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).toContain("Add provider");
    expect(settingsDialogSource).not.toContain("settings-save-action");
    expect(settingsDialogSource).toContain("settings-provider-picker");
    expect(settingsDialogSource).not.toContain("function PencilIcon()");
  });

  test("renders a simple cache summary with a delete-all action and book rows", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).toContain("Total cache size");
    expect(html).toContain("24.0 KB");
    expect(html).toContain("Delete All");
    expect(html).toContain("12 cached pages");
    expect(settingsDialogSource).toContain("settings-cache-list");
    expect(settingsStylesSource).toContain(".settings-cache-item-title");
  });

  test("uses a single subtle empty-state action when no providers are configured", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          settings: {
            theme: "system",
            activePresetId: "",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [],
          },
          editingPresetId: null,
          editingPreset: undefined,
          presetSaveStatusById: {},
        })}
      />
    );

    expect(html).toContain("To enable translation, add a provider.");
    expect(html).not.toContain("Add your first provider");
    expect(html).not.toContain("To turn on translation, connect a provider and finish its setup.");
    expect(settingsDialogSource).toContain("settings-empty-action");
    expect(settingsStylesSource).toContain(".settings-empty-action");
  });

  test("uses the preset title for activation and keeps save text lightweight", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          liveActivePresetId: "preset-live",
          settings: {
            theme: "system",
            activePresetId: "preset-live",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [
              {
                id: "preset-live",
                label: "OpenRouter · openai/gpt-4o-mini",
                providerKind: "openrouter",
                model: "openai/gpt-4o-mini",
                apiKeyConfigured: true,
              },
              {
                id: "preset-2",
                label: "DeepSeek · deepseek-chat",
                providerKind: "deepseek",
                model: "deepseek-chat",
                apiKeyConfigured: true,
              },
            ],
          },
          editingPresetId: "preset-2",
          editingPreset: {
            id: "preset-2",
            label: "DeepSeek · deepseek-chat",
            providerKind: "deepseek",
            model: "deepseek-chat",
            apiKeyConfigured: true,
          },
          presetSaveStatusById: {
            "preset-live": { state: "saved" },
            "preset-2": { state: "dirty" },
          },
        })}
      />
    );

    expect(html).not.toContain("In use");
    expect(html).not.toContain(">Use<");
    expect(html).toContain("Saving...");
    expect(settingsDialogSource).toContain("onActivatePreset(preset.id)");
    expect(settingsDialogSource).toContain("settings-preset-controls");
    expect(settingsStylesSource).toContain(".settings-preset-status");
  });

  test("keeps save failures inline with a retry affordance instead of a save panel", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          presetSaveStatusById: {
            "preset-1": {
              state: "error",
              detail: "Save failed: network issue",
            },
          },
        })}
      />
    );

    expect(html).toContain("Save failed");
    expect(html).toContain("Retry save");
    expect(settingsDialogSource).toContain('aria-live="polite"');
    expect(settingsDialogSource).toContain("settings-inline-error-row");
    expect(settingsDialogSource).not.toContain("settings-save-state-panel");
  });

  test("keeps the api key field in a masked saved-key state until the user edits it", () => {
    expect(settingsDialogSource).toContain("getPresetApiKeyFieldState");
    expect(settingsDialogSource).toContain('value={editingPresetApiKeyState?.displayValue ?? ""}');
    expect(settingsDialogSource).toContain("onPresetApiKeyFocus(editingPreset.id)");
    expect(settingsDialogSource).toContain("onPresetApiKeyBlur(editingPreset.id)");
  });

  test("shows a warning affordance for failed preset tests and keeps detail for hover", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          presetStatuses: {
            "preset-1": {
              presetId: "preset-1",
              label: "OpenRouter · openai/gpt-4o-mini",
              ok: false,
              message: "This API key was not accepted. Check it and try again.",
              detail: "OpenRouter error: 401 Unauthorized Invalid API Key",
            },
          },
        })}
      />
    );

    expect(html).toContain("settings-preset-warning");
    expect(html).toContain("This API key was not accepted. Check it and try again.");
    expect(settingsDialogSource).toContain("settings-preset-test-tooltip");
    expect(settingsDialogSource).toContain("testStatus.detail ?? testStatus.message");
  });

  test("keeps saved status hidden by default and fades it after a successful save transition", () => {
    const html = renderToStaticMarkup(<SettingsDialogContent {...buildProps()} />);

    expect(html).not.toContain("settings-preset-status");
    expect(settingsDialogSource).toContain("savedIndicatorPhaseById");
    expect(settingsDialogSource).toContain("setSavedIndicatorPhaseById");
    expect(settingsDialogSource).toContain("window.setTimeout(() => {");
    expect(settingsStylesSource).toContain(".settings-preset-status.is-fading");
  });

  test("shows inline model-load guidance instead of a mysteriously disabled button", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          settings: {
            theme: "system",
            activePresetId: "preset-1",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [
              {
                id: "preset-1",
                label: "Custom",
                providerKind: "openai-compatible",
                model: "",
                baseUrl: "",
              },
            ],
          },
          editingPreset: {
            id: "preset-1",
            label: "Custom",
            providerKind: "openai-compatible",
            model: "",
            baseUrl: "",
          },
          presetSaveStatusById: {
            "preset-1": { state: "invalid", detail: "Add Base URL" },
          },
        })}
      />
    );

    expect(html).toContain("Add Base URL and API key to load models.");
    expect(settingsDialogSource).toContain("getModelLoadHint");
  });

  test("shows a base url field and hides the api key field for ollama", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          settings: {
            theme: "system",
            activePresetId: "preset-1",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [
              {
                id: "preset-1",
                label: "Ollama · llama3.2",
                providerKind: "ollama",
                model: "llama3.2",
                baseUrl: "http://localhost:11434/v1",
              },
            ],
          },
          editingPreset: {
            id: "preset-1",
            label: "Ollama · llama3.2",
            providerKind: "ollama",
            model: "llama3.2",
            baseUrl: "http://localhost:11434/v1",
          },
        })}
      />
    );

    expect(html).toContain('id="preset-base-url"');
    expect(html).not.toContain('id="preset-api-key"');
    expect(settingsDialogSource).toContain("providerUsesApiKey");
    expect(settingsDialogSource).toContain("providerUsesEditableBaseUrl");
  });

  test("keeps delete in the expanded editor rather than the collapsed row action cluster", () => {
    expect(settingsDialogSource).not.toContain('aria-label="Edit preset"');
    expect(settingsDialogSource).toContain("btn-danger-quiet");
    expect(settingsStylesSource).toContain(".settings-preset-chevron");
  });

  test("shows the session override label when a fallback preset is active for this session", () => {
    const html = renderToStaticMarkup(
      <SettingsDialogContent
        {...buildProps({
          liveActivePresetId: "preset-1",
          sessionFallbackPresetId: "preset-2",
          settings: {
            theme: "system",
            activePresetId: "preset-1",
            autoFallbackEnabled: true,
            autoTranslateNextPages: 1,
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [
              {
                id: "preset-1",
                label: "OpenRouter · openrouter/free",
                providerKind: "openrouter",
                model: "openrouter/free",
                apiKeyConfigured: true,
              },
              {
                id: "preset-2",
                label: "DeepSeek · deepseek-chat",
                providerKind: "deepseek",
                model: "deepseek-chat",
                apiKeyConfigured: true,
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("In use this session");
  });
});
