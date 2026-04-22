import { describe, expect, test } from "bun:test";
import type { TranslationSettings } from "../types";
import {
  buildPresetLabel,
  canPersistPresetDraft,
  createPresetDraft,
  createDefaultSettings,
  dedupePresetLabel,
  discardUnsavedPresetEdits,
  getPresetApiKeyFieldState,
  getPresetMissingRequirement,
  getPresetSaveStatus,
  getPresetValidationState,
  getNextThemeMode,
  getActivePreset,
  getDefaultBaseUrlForProvider,
  getDefaultModelForProvider,
  hasPresetTranslationContext,
  hasUsableLiveTranslationSetup,
  isPresetUnchangedFromSavedState,
  normalizeProviderKind,
  normalizeDefaultLanguage,
  normalizePresetDraft,
  normalizeSettingsFromStorage,
  providerUsesApiKey,
  providerUsesEditableBaseUrl,
  serializeProviderKindForCommand,
} from "./appSettings";

describe("app settings helpers", () => {
  test("builds a preset label from provider and model", () => {
    expect(buildPresetLabel("openrouter", "openai/gpt-4o-mini")).toBe(
      "OpenRouter · openai/gpt-4o-mini"
    );
    expect(buildPresetLabel("deepseek", "deepseek-chat")).toBe(
      "DeepSeek · deepseek-chat"
    );
    expect(buildPresetLabel("ollama", "llama3.2")).toBe("Ollama · llama3.2");
  });

  test("adds a suffix when the generated preset label already exists", () => {
    expect(
      dedupePresetLabel("OpenRouter · openai/gpt-4o-mini", [
        "OpenRouter · openai/gpt-4o-mini",
        "OpenRouter · openai/gpt-4o-mini (2)",
      ])
    ).toBe("OpenRouter · openai/gpt-4o-mini (3)");
  });

  test("returns the active preset when the id exists", () => {
    const settings = {
      activePresetId: "preset-b",
      presets: [
        { id: "preset-a", label: "Preset A", model: "m1" },
        { id: "preset-b", label: "Preset B", model: "m2" },
      ],
    };

    expect(getActivePreset(settings)?.id).toBe("preset-b");
  });

  test("falls back to the first preset when the saved active preset is missing", () => {
    const settings = {
      activePresetId: "missing",
      presets: [
        { id: "preset-a", label: "Preset A", model: "m1" },
        { id: "preset-b", label: "Preset B", model: "m2" },
      ],
    };

    expect(getActivePreset(settings)?.id).toBe("preset-a");
  });

  test("normalizes the default language when the saved value is incomplete", () => {
    expect(normalizeDefaultLanguage(undefined)).toEqual({
      code: "zh-CN",
      label: "Chinese (Simplified)",
    });
    expect(normalizeDefaultLanguage({ code: "ja", label: "" })).toEqual({
      code: "ja",
      label: "Japanese",
    });
  });

  test("cycles themes in system, light, dark order", () => {
    expect(getNextThemeMode("system")).toBe("light");
    expect(getNextThemeMode("light")).toBe("dark");
    expect(getNextThemeMode("dark")).toBe("system");
  });

  test("starts with no presets for a brand-new user", () => {
    expect(createDefaultSettings()).toEqual({
      activePresetId: "",
      autoFallbackEnabled: false,
      translateAllSlowMode: false,
      defaultLanguage: {
        code: "zh-CN",
        label: "Chinese (Simplified)",
      },
      theme: "system",
      presets: [],
    });
  });

  test("starts a new preset as openai-compatible with empty required fields", () => {
    const preset = createPresetDraft("openai-compatible", []);

    expect(preset.providerKind).toBe("openai-compatible");
    expect(preset.model).toBe("");
    expect(preset.baseUrl).toBeUndefined();
    expect(preset.label).toBe("Custom");
  });

  test("starts a new ollama preset with the local default base url", () => {
    const preset = createPresetDraft("ollama", []);

    expect(preset.providerKind).toBe("ollama");
    expect(preset.model).toBe("");
    expect(preset.baseUrl).toBe("http://localhost:11434/v1");
    expect(preset.label).toBe("Ollama");
  });

  test("uses openrouter/free as the OpenRouter default model", () => {
    expect(getDefaultModelForProvider("openrouter")).toBe("openrouter/free");
  });

  test("uses llama3.2 as the Ollama model placeholder and local base url default", () => {
    expect(getDefaultModelForProvider("ollama")).toBe("llama3.2");
    expect(getDefaultBaseUrlForProvider("ollama")).toBe("http://localhost:11434/v1");
  });

  test("normalizes legacy provider variants from storage", () => {
    expect(normalizeProviderKind("open-router")).toBe("openrouter");
    expect(normalizeProviderKind("deep-seek")).toBe("deepseek");
    expect(normalizeProviderKind("ollama")).toBe("ollama");
    expect(normalizeProviderKind("open-ai-compatible")).toBe("openai-compatible");
  });

  test("serializes canonical provider kinds back to the backend command variants", () => {
    expect(serializeProviderKindForCommand("openrouter")).toBe("open-router");
    expect(serializeProviderKindForCommand("deepseek")).toBe("deep-seek");
    expect(serializeProviderKindForCommand("ollama")).toBe("ollama");
    expect(serializeProviderKindForCommand("openai-compatible")).toBe(
      "open-ai-compatible"
    );
  });

  test("canonicalizes saved presets that still use legacy provider values", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      autoFallbackEnabled: false,
      translateAllSlowMode: false,
      defaultLanguage: {
        code: "zh-CN",
        label: "Chinese (Simplified)",
      },
      theme: "system",
      presets: [
        {
          id: "preset-1",
          label: "OpenRouter · openai/gpt-4o-mini",
          providerKind: "open-router" as any,
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        {
          id: "preset-2",
          label: "Custom · model-a",
          providerKind: "open-ai-compatible" as any,
          model: "model-a",
          baseUrl: "https://example.com/v1",
        },
      ],
    });

    expect(normalized.presets.map((preset) => preset.providerKind)).toEqual([
      "openrouter",
      "openai-compatible",
    ]);
  });

  test("defaults automatic fallback to false when older saved settings do not include it", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      defaultLanguage: {
        code: "zh-CN",
        label: "Chinese (Simplified)",
      },
      theme: "system",
      presets: [
        {
          id: "preset-1",
          label: "OpenRouter",
          providerKind: "openrouter",
          model: "openrouter/free",
          apiKeyConfigured: true,
        },
      ],
    } as TranslationSettings);

    expect(normalized.autoFallbackEnabled).toBe(false);
  });

  test("keeps model empty while editing instead of backfilling a default model", () => {
    const preset = normalizePresetDraft(
      {
        id: "preset-1",
        label: "",
        providerKind: "openrouter",
        model: "   ",
      },
      []
    );

    expect(preset.model).toBe("");
    expect(preset.label).toBe("OpenRouter");
  });

  test("treats provider, model, and api key as required and base url as required for openai-compatible", () => {
    expect(
      getPresetValidationState(
        {
          id: "preset-1",
          label: "Custom",
          providerKind: "openai-compatible",
          model: "",
        },
        ""
      )
    ).toEqual({
      apiKey: false,
      baseUrl: false,
      isValid: false,
      model: false,
      provider: true,
    });

    expect(
      getPresetValidationState(
        {
          id: "preset-2",
          label: "OpenRouter",
          providerKind: "openrouter",
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        ""
      )
    ).toEqual({
      apiKey: true,
      baseUrl: true,
      isValid: true,
      model: true,
      provider: true,
    });

    expect(
      getPresetValidationState(
        {
          id: "preset-3",
          label: "Ollama",
          providerKind: "ollama",
          model: "llama3.2",
          baseUrl: "http://localhost:11434/v1",
          apiKeyConfigured: false,
        },
        ""
      )
    ).toEqual({
      apiKey: true,
      baseUrl: true,
      isValid: true,
      model: true,
      provider: true,
    });
  });

  test("can persist provider credentials before a model is chosen", () => {
    expect(
      canPersistPresetDraft(
        {
          id: "preset-1",
          label: "OpenRouter",
          providerKind: "openrouter",
          model: "",
          apiKeyConfigured: true,
        },
        ""
      )
    ).toBe(true);

    expect(
      canPersistPresetDraft(
        {
          id: "preset-2",
          label: "Custom",
          providerKind: "openai-compatible",
          model: "",
          baseUrl: "https://example.com/v1",
        },
        "sk-test"
      )
    ).toBe(true);

    expect(
      canPersistPresetDraft(
        {
          id: "preset-3",
          label: "Ollama",
          providerKind: "ollama",
          model: "",
          baseUrl: "http://localhost:11434/v1",
        },
        ""
      )
    ).toBe(true);
  });

  test("knows Ollama uses an editable base url but not an api key", () => {
    expect(providerUsesEditableBaseUrl("ollama")).toBe(true);
    expect(providerUsesApiKey("ollama")).toBe(false);
    expect(providerUsesApiKey("openrouter")).toBe(true);
  });

  test("surfaces the first missing setup requirement and save badge state", () => {
    expect(
      getPresetMissingRequirement(
        {
          id: "preset-1",
          label: "Custom",
          providerKind: "openai-compatible",
          model: "",
        },
        ""
      )
    ).toBe("Add API key");

    expect(
      getPresetSaveStatus(
        {
          id: "preset-2",
          label: "OpenRouter",
          providerKind: "openrouter",
          model: "",
          apiKeyConfigured: true,
        },
        ""
      )
    ).toEqual({
      state: "invalid",
      detail: "Add model",
    });
  });

  test("distinguishes cache context from full live translation setup", () => {
    expect(
      hasPresetTranslationContext({
        id: "preset-1",
        label: "OpenRouter · openrouter/free",
        providerKind: "openrouter",
        model: "openrouter/free",
      })
    ).toBe(true);

    expect(
      hasUsableLiveTranslationSetup({
        id: "preset-1",
        label: "OpenRouter · openrouter/free",
        providerKind: "openrouter",
        model: "openrouter/free",
      })
    ).toBe(false);

    expect(
      hasUsableLiveTranslationSetup({
        id: "preset-1",
        label: "OpenRouter · openrouter/free",
        providerKind: "openrouter",
        model: "openrouter/free",
        apiKeyConfigured: true,
      })
    ).toBe(true);
  });

  test("shows a masked saved-key state until the field is actively edited", () => {
    expect(
      getPresetApiKeyFieldState({
        apiKeyConfigured: true,
        apiKeyInput: "",
        isEditing: false,
      })
    ).toEqual({
      displayValue: "",
      placeholder: "**************",
      showsSavedMask: true,
    });

    expect(
      getPresetApiKeyFieldState({
        apiKeyConfigured: true,
        apiKeyInput: "",
        isEditing: true,
      })
    ).toEqual({
      displayValue: "",
      placeholder: "e.g. sk-...",
      showsSavedMask: false,
    });
  });

  test("treats a preset as saved only when it matches persisted values and has no api key draft", () => {
    expect(
      isPresetUnchangedFromSavedState({
        preset: {
          id: "preset-1",
          label: "OpenRouter · openai/gpt-4o-mini",
          providerKind: "openrouter",
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        savedPreset: {
          id: "preset-1",
          label: "OpenRouter · openai/gpt-4o-mini",
          providerKind: "open-router" as any,
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        apiKeyInput: "",
      })
    ).toBe(true);

    expect(
      isPresetUnchangedFromSavedState({
        preset: {
          id: "preset-1",
          label: "OpenRouter · openai/gpt-4o-mini",
          providerKind: "openrouter",
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        savedPreset: {
          id: "preset-1",
          label: "OpenRouter · openai/gpt-4o-mini",
          providerKind: "openrouter",
          model: "openai/gpt-4o-mini",
          apiKeyConfigured: true,
        },
        apiKeyInput: "sk-new",
      })
    ).toBe(false);
  });

  test("restores a saved preset when edit mode is exited without saving", () => {
    const reverted = discardUnsavedPresetEdits({
      settings: {
        activePresetId: "preset-1",
        autoFallbackEnabled: false,
        translateAllSlowMode: false,
        defaultLanguage: {
          code: "zh-CN",
          label: "Chinese (Simplified)",
        },
        theme: "system",
        presets: [
          {
            id: "preset-1",
            label: "Custom · model-b",
            providerKind: "openai-compatible",
            baseUrl: "https://example.com/v1",
            model: "model-b",
            apiKeyConfigured: true,
          },
        ],
      },
      savedSettings: {
        activePresetId: "preset-1",
        autoFallbackEnabled: false,
        translateAllSlowMode: false,
        defaultLanguage: {
          code: "zh-CN",
          label: "Chinese (Simplified)",
        },
        theme: "system",
        presets: [
          {
            id: "preset-1",
            label: "OpenRouter · openai/gpt-4o-mini",
            providerKind: "open-router" as any,
            model: "openai/gpt-4o-mini",
            apiKeyConfigured: true,
          },
        ],
      },
      presetId: "preset-1",
    });

    expect(reverted.presets).toEqual([
      {
        id: "preset-1",
        label: "OpenRouter · openai/gpt-4o-mini",
        providerKind: "openrouter",
        model: "openai/gpt-4o-mini",
        apiKeyConfigured: true,
      },
    ]);
  });

  test("drops a new unsaved preset when edit mode is exited without saving", () => {
    const reverted = discardUnsavedPresetEdits({
      settings: {
        activePresetId: "preset-2",
        autoFallbackEnabled: false,
        translateAllSlowMode: false,
        defaultLanguage: {
          code: "zh-CN",
          label: "Chinese (Simplified)",
        },
        theme: "system",
        presets: [
          {
            id: "preset-1",
            label: "OpenRouter · openai/gpt-4o-mini",
            providerKind: "openrouter",
            model: "openai/gpt-4o-mini",
            apiKeyConfigured: true,
          },
          {
            id: "preset-2",
            label: "Custom",
            providerKind: "openai-compatible",
            model: "",
          },
        ],
      },
      savedSettings: {
        activePresetId: "preset-1",
        autoFallbackEnabled: false,
        translateAllSlowMode: false,
        defaultLanguage: {
          code: "zh-CN",
          label: "Chinese (Simplified)",
        },
        theme: "system",
        presets: [
          {
            id: "preset-1",
            label: "OpenRouter · openai/gpt-4o-mini",
            providerKind: "openrouter",
            model: "openai/gpt-4o-mini",
            apiKeyConfigured: true,
          },
        ],
      },
      presetId: "preset-2",
    });

    expect(reverted.activePresetId).toBe("preset-1");
    expect(reverted.presets).toEqual([
      {
        id: "preset-1",
        label: "OpenRouter · openai/gpt-4o-mini",
        providerKind: "openrouter",
        model: "openai/gpt-4o-mini",
        apiKeyConfigured: true,
      },
    ]);
  });
});
