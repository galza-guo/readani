import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import settingsDialogSource from "./SettingsDialogContent.tsx?raw";
import { ToastProvider } from "../toast/ToastProvider";
import { SettingsDialogContent, type SettingsDialogContentProps } from "./SettingsDialogContent";

function renderSettings(overrides: Partial<SettingsDialogContentProps> = {}) {
  return renderToStaticMarkup(
    <ToastProvider>
      <SettingsDialogContent {...buildProps(overrides)} />
    </ToastProvider>
  );
}

const settingsStylesSource = readFileSync(
  resolve(import.meta.dir, "..", "..", "App.css"),
  "utf8"
);

function buildProps(
  overrides: Partial<SettingsDialogContentProps> = {}
): SettingsDialogContentProps {
  const settings = overrides.settings ?? {
    theme: "system",
    accentColor: "blue" as const,
    activePresetId: "preset-1",
    autoFallbackEnabled: false,
    autoTranslateNextPages: 1,
    appLanguage: { code: "system", label: "Follow system" },
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
          languages: [
            {
              languageCode: "en",
              cachedPageCount: 12,
            },
            {
              languageCode: "zh-CN",
              cachedPageCount: 5,
            },
          ],
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
    const html = renderSettings();

    expect(html).toContain(">General<");
    expect(html).toContain(">Providers<");
    expect(html).toContain(">Cache<");
    expect(settingsDialogSource).toContain("settings-tabs-list");
  });

  test("renders app language and translate-to labels without helper copy", () => {
    const html = renderSettings();

    expect(html.match(/App language/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(html.match(/Translate to/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("New translations use this language by default.");
  });

  test("uses distinct search placeholders for app language and translate-to", () => {
    expect(settingsDialogSource).toContain('searchPlaceholder={appLanguageSearchPlaceholder}');
    expect(settingsDialogSource).toContain('searchPlaceholder={translateToSearchPlaceholder}');
    expect(
      settingsDialogSource.match(/getOptionLabel=\{getLanguageSelfLabel\}/g)?.length ?? 0
    ).toBe(2);
    expect(settingsDialogSource).toContain("searchable={false}");
    expect(settingsDialogSource).toContain('contentClassName="language-combobox-content-shortlist"');
    expect(settingsDialogSource).toContain('contentClassName="language-combobox-content-common-list"');
    expect(settingsDialogSource).toContain('t("languages.searchSupported"');
    expect(settingsDialogSource).toContain('t("languages.searchOrCustom")');
  });

  test("renders a general setting for following-page auto-translation", () => {
    const html = renderSettings();

    expect(html).toContain("Pages to translate ahead");
    expect(html).toContain('id="auto-translate-next-pages"');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('type="number"');
    ["Off", "1", "3", "5", "10", "20"].forEach((label) => {
      expect(settingsDialogSource).toContain(`label: "${label}"`);
    });
    expect(settingsDialogSource).not.toContain("0 turns it off.");
  });

  test("renders the automatic fallback switch with the experimental flask badge", () => {
    const html = renderSettings();

    expect(html).toContain("Automatic fallback");
    expect(html).toContain("settings-experimental-badge");
    expect(html).not.toContain(">Experimental<");
    expect(html).toContain("Retry another usable preset after a failure or timeout.");
    expect(settingsDialogSource).toContain("settings-toggle-row");
    expect(settingsDialogSource).toContain("<Flask size={13} weight=\"regular\" />");
  });

  test("renders a provider picker and removes the old explicit save action", () => {
    const html = renderSettings();

    expect(html).toContain("Add provider");
    expect(html).toContain("settings-provider-trigger-icon");
    expect(settingsDialogSource).not.toContain("settings-save-action");
    expect(settingsDialogSource).toContain("settings-provider-picker");
    expect(settingsDialogSource).not.toContain("function PencilIcon()");
    expect(settingsDialogSource).toContain("ProviderBrandIcon");
    expect(settingsDialogSource).toContain("settings-provider-option-icon");
  });

  test("renders cache rows grouped by book language instead of one combined row", () => {
    expect(settingsStylesSource).toContain(".settings-cache-item-title");
    expect(settingsDialogSource).toContain("settings-cache-list");
  });

  test("uses a single subtle empty-state action when no providers are configured", () => {
    const html = renderSettings({
          settings: {
            theme: "system",
            accentColor: "blue" as const,
            activePresetId: "",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            appLanguage: { code: "system", label: "Follow system" },
            translateAllSlowMode: false,
            defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
            presets: [],
          },
          editingPresetId: null,
          editingPreset: undefined,
          presetSaveStatusById: {},
        });

    expect(html).toContain("To enable translation, add a provider.");
    expect(html).not.toContain("Add your first provider");
    expect(html).not.toContain("To turn on translation, connect a provider and finish its setup.");
    expect(settingsDialogSource).toContain("settings-empty-action");
    expect(settingsStylesSource).toContain(".settings-empty-action");
  });

  test("uses the preset title for activation and keeps save text lightweight", () => {
    expect(settingsDialogSource).toContain("onActivatePreset(preset.id)");
    expect(settingsDialogSource).toContain("settings-preset-controls");
    expect(settingsStylesSource).toContain(".settings-preset-status");
    expect(settingsDialogSource).toContain("onRetryPresetSave");
    expect(settingsDialogSource).toContain("showToast");
  });

  test("keeps save failures inline with a retry affordance instead of a save panel", () => {
    expect(settingsDialogSource).toContain("showToast");
    expect(settingsDialogSource).toContain("toast.presetSaveFailed");
    expect(settingsDialogSource).toContain("onRetryPresetSave");
    expect(settingsDialogSource).not.toContain("settings-save-state-panel");
  });

  test("keeps the api key field in a masked saved-key state until the user edits it", () => {
    expect(settingsDialogSource).toContain("getPresetApiKeyFieldState");
    expect(settingsDialogSource).toContain("editingPresetApiKeyState?.displayValue");
    expect(settingsDialogSource).toContain("onPresetApiKeyFocus(editingPreset.id)");
    expect(settingsDialogSource).toContain("onPresetApiKeyBlur(editingPreset.id)");
  });

  test("shows a warning affordance for failed preset tests and keeps detail for hover", () => {
    expect(settingsDialogSource).toContain("api-key-status");
    expect(settingsDialogSource).toContain("presetStatuses[editingPreset.id]?.message");
  });

  test("keeps saved status hidden by default and fades it after a successful save transition", () => {
    expect(settingsDialogSource).toContain("toast.presetSaved");
    expect(settingsDialogSource).toContain("showToast");
    expect(settingsStylesSource).toContain(".settings-preset-status");
  });

  test("shows inline model-load guidance instead of a mysteriously disabled button", () => {
    expect(settingsDialogSource).toContain("getModelLoadHint");
    expect(settingsDialogSource).toContain("showToast");
  });

  test("shows a base url field and hides the api key field for ollama", () => {
    const html = renderSettings({
          settings: {
            theme: "system",
            accentColor: "blue" as const,
            activePresetId: "preset-1",
            autoFallbackEnabled: false,
            autoTranslateNextPages: 1,
            appLanguage: { code: "system", label: "Follow system" },
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
        });

    expect(html).toContain('id="preset-base-url"');
    expect(html).not.toContain('id="preset-api-key"');
    expect(settingsDialogSource).toContain("providerUsesApiKey");
    expect(settingsDialogSource).toContain("providerUsesEditableBaseUrl");
  });

  test("keeps delete in the expanded editor rather than the collapsed row action cluster", () => {
    expect(settingsDialogSource).not.toContain('aria-label="Edit preset"');
    expect(settingsDialogSource).toContain("settings-icon-button-danger");
  });

  test("shows the session override label when a fallback preset is active for this session", () => {
    const html = renderSettings({
          liveActivePresetId: "preset-1",
          sessionFallbackPresetId: "preset-2",
          settings: {
            theme: "system",
            accentColor: "blue" as const,
            activePresetId: "preset-1",
            autoFallbackEnabled: true,
            autoTranslateNextPages: 1,
            appLanguage: { code: "system", label: "Follow system" },
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
        });

    expect(html).toContain("In use this session");
  });
});
