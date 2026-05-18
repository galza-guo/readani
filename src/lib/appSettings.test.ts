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
  normalizeAppLanguage,
  normalizeDefaultLanguage,
  normalizePresetDraft,
  normalizeSettingsFromStorage,
  providerUsesApiKey,
  providerUsesEditableBaseUrl,
  serializeProviderKindForCommand,
  normalizeProviderReasoningMode,
  detectCodingPlanKey,
  getCodingPlanBaseUrl,
  buildTranslateToLanguagePickerSections,
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

  test("normalizes the app language setting and preserves Follow system", () => {
    expect(normalizeAppLanguage(undefined)).toEqual({
      code: "system",
      label: "Follow system",
    });
    expect(normalizeAppLanguage({ code: "fr", label: "" })).toEqual({
      code: "fr",
      label: "French",
    });
  });

  test("falls back to Follow system when the saved app language is no longer in the UI shortlist", () => {
    expect(normalizeAppLanguage({ code: "de", label: "German" })).toEqual({
      code: "system",
      label: "Follow system",
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
      autoTranslateNextPages: 1,
      appLanguage: {
        code: "system",
        label: "Follow system",
      },
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
      autoTranslateNextPages: 1,
      appLanguage: {
        code: "system",
        label: "Follow system",
      },
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

  test("normalizes provider reasoning controls from storage", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      autoFallbackEnabled: false,
      autoTranslateNextPages: 1,
      appLanguage: {
        code: "system",
        label: "Follow system",
      },
      translateAllSlowMode: false,
      defaultLanguage: {
        code: "zh-CN",
        label: "Chinese (Simplified)",
      },
      theme: "system",
      presets: [
        {
          id: "preset-1",
          label: "DeepSeek · deepseek-chat",
          providerKind: "deepseek",
          model: "deepseek-chat",
          thinking: "max",
        },
        {
          id: "preset-2",
          label: "OpenRouter · model",
          providerKind: "openrouter",
          model: "model",
          reasoning: "medium",
        },
        {
          id: "preset-3",
          label: "Custom · model",
          providerKind: "openai-compatible",
          model: "model",
          reasoning: "high",
        } as any,
      ],
    });

    expect(normalized.presets[0]?.thinking).toBe("max");
    expect(normalized.presets[1]?.reasoning).toBe("medium");
    expect(normalized.presets[2]?.reasoning).toBeUndefined();
  });

  test("keeps provider-specific reasoning values in their documented ranges", () => {
    expect(normalizeProviderReasoningMode("deepseek", "low")).toBe("off");
    expect(normalizeProviderReasoningMode("deepseek", "high")).toBe("high");
    expect(normalizeProviderReasoningMode("deepseek", "max")).toBe("max");
    expect(normalizeProviderReasoningMode("openrouter", "max")).toBe("off");
    expect(normalizeProviderReasoningMode("openrouter", "low")).toBe("low");
    expect(normalizeProviderReasoningMode("ollama", "medium")).toBe("medium");
    expect(normalizeProviderReasoningMode("openai-compatible", "high")).toBe("off");
  });

  test("defaults automatic fallback to false when older saved settings do not include it", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      appLanguage: {
        code: "system",
        label: "Follow system",
      },
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

  test("defaults following-page auto-translation to one page for older saved settings", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      autoFallbackEnabled: false,
      appLanguage: {
        code: "system",
        label: "Follow system",
      },
      translateAllSlowMode: false,
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

    expect(normalized.autoTranslateNextPages).toBe(1);
  });

  test("offers app language as a translate-to choice", () => {
    const sections = buildTranslateToLanguagePickerSections("");
    const codes = sections.flatMap((section) => section.items.map((item) => item.code));

    expect(codes).toContain("app-language");
  });

  test("preserves translate-to app language in saved settings", () => {
    const normalized = normalizeSettingsFromStorage(
      {
        activePresetId: "preset-1",
        autoFallbackEnabled: false,
        autoTranslateNextPages: 1,
        appLanguage: { code: "fr", label: "French" },
        defaultLanguage: { code: "app-language", label: "App language" },
        theme: "system",
        translateAllSlowMode: false,
        presets: [],
      } as TranslationSettings,
      "en-US",
    );

    expect(normalized.defaultLanguage).toEqual({
      code: "app-language",
      label: "App language",
    });
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
        autoTranslateNextPages: 1,
        appLanguage: {
          code: "system",
          label: "Follow system",
        },
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
        autoTranslateNextPages: 1,
        appLanguage: {
          code: "system",
          label: "Follow system",
        },
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
        codingPlan: false,
        reasoning: "off",
      },
    ]);
  });

  test("drops a new unsaved preset when edit mode is exited without saving", () => {
    const reverted = discardUnsavedPresetEdits({
      settings: {
        activePresetId: "preset-2",
        autoFallbackEnabled: false,
        autoTranslateNextPages: 1,
        appLanguage: {
          code: "system",
          label: "Follow system",
        },
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
        autoTranslateNextPages: 1,
        appLanguage: {
          code: "system",
          label: "Follow system",
        },
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

  test("uses MiniMax-M2.7 as default model for minimax providers", () => {
    expect(getDefaultModelForProvider("minimax-io")).toBe("MiniMax-M2.7");
    expect(getDefaultModelForProvider("minimaxi")).toBe("MiniMax-M2.7");
  });

  test("uses glm-5.1 as default model for zai and bigmodel", () => {
    expect(getDefaultModelForProvider("zai")).toBe("glm-5.1");
    expect(getDefaultModelForProvider("bigmodel")).toBe("glm-5.1");
  });

  test("resolves default base URLs for new providers", () => {
    expect(getDefaultBaseUrlForProvider("minimax-io")).toBe("https://api.minimax.io/v1");
    expect(getDefaultBaseUrlForProvider("minimaxi")).toBe("https://api.minimaxi.com/v1");
    expect(getDefaultBaseUrlForProvider("zai")).toBe("https://api.z.ai/api/paas/v4");
    expect(getDefaultBaseUrlForProvider("bigmodel")).toBe("https://open.bigmodel.cn/api/paas/v4");
  });

  test("new providers use standard reasoning", () => {
    expect(normalizeProviderReasoningMode("minimax-io", "low")).toBe("low");
    expect(normalizeProviderReasoningMode("minimax-io", "medium")).toBe("medium");
    expect(normalizeProviderReasoningMode("minimax-io", "high")).toBe("high");
    expect(normalizeProviderReasoningMode("minimaxi", "off")).toBe("off");
    expect(normalizeProviderReasoningMode("zai", "low")).toBe("low");
    expect(normalizeProviderReasoningMode("bigmodel", "high")).toBe("high");
    expect(normalizeProviderReasoningMode("bigmodel", "max")).toBe("off");
  });

  test("all new providers require API keys", () => {
    expect(providerUsesApiKey("minimax-io")).toBe(true);
    expect(providerUsesApiKey("minimaxi")).toBe(true);
    expect(providerUsesApiKey("zai")).toBe(true);
    expect(providerUsesApiKey("bigmodel")).toBe(true);
  });

  test("new providers do not use editable base URLs", () => {
    expect(providerUsesEditableBaseUrl("minimax-io")).toBe(false);
    expect(providerUsesEditableBaseUrl("zai")).toBe(false);
    expect(providerUsesEditableBaseUrl("bigmodel")).toBe(false);
  });

  test("detects MiniMax coding plan API key by sk-cp- prefix", () => {
    expect(detectCodingPlanKey("minimax-io", "sk-cp-abc123")).toBe(true);
    expect(detectCodingPlanKey("minimax-io", "sk-cp-  ")).toBe(true);
    expect(detectCodingPlanKey("minimaxi", "sk-cp-test-key")).toBe(true);
    expect(detectCodingPlanKey("minimax-io", "eyJhbGciOiJIUzI1NiJ9")).toBe(false);
    expect(detectCodingPlanKey("minimax-io", "")).toBe(false);
  });

  test("detectCodingPlanKey returns false for providers without known prefix", () => {
    expect(detectCodingPlanKey("zai", "sk-cp-abc")).toBe(false);
    expect(detectCodingPlanKey("bigmodel", "sk-cp-abc")).toBe(false);
    expect(detectCodingPlanKey("openrouter", "sk-cp-abc")).toBe(false);
  });

  test("resolves coding plan base URLs for zai and bigmodel", () => {
    expect(getCodingPlanBaseUrl("zai")).toBe("https://api.z.ai/api/coding/paas/v4");
    expect(getCodingPlanBaseUrl("bigmodel")).toBe("https://open.bigmodel.cn/api/coding/paas/v4");
    expect(getCodingPlanBaseUrl("minimax-io")).toBeUndefined();
  });

  test("normalizes coding plan field from storage", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      autoFallbackEnabled: false,
      autoTranslateNextPages: 1,
      appLanguage: { code: "system", label: "Follow system" },
      translateAllSlowMode: false,
      defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
      theme: "system",
      presets: [
        {
          id: "preset-1",
          label: "Z.ai · glm-5.1",
          providerKind: "zai",
          model: "glm-5.1",
          codingPlan: true as any,
        },
        {
          id: "preset-2",
          label: "MiniMax · MiniMax-M2.7",
          providerKind: "minimax-io",
          model: "MiniMax-M2.7",
          codingPlan: undefined as any,
        },
      ],
    });

    expect(normalized.presets[0]?.codingPlan).toBe(true);
    expect(normalized.presets[1]?.codingPlan).toBe(false);
  });

  test("normalizes reasoning from storage for new providers", () => {
    const normalized = normalizeSettingsFromStorage({
      activePresetId: "preset-1",
      autoFallbackEnabled: false,
      autoTranslateNextPages: 1,
      appLanguage: { code: "system", label: "Follow system" },
      translateAllSlowMode: false,
      defaultLanguage: { code: "zh-CN", label: "Chinese (Simplified)" },
      theme: "system",
      presets: [
        {
          id: "preset-1",
          label: "MiniMax · model",
          providerKind: "minimax-io",
          model: "model",
          reasoning: "medium",
        },
        {
          id: "preset-2",
          label: "Z.ai · model",
          providerKind: "zai",
          model: "model",
          reasoning: "high",
        },
      ],
    });

    expect(normalized.presets[0]?.reasoning).toBe("medium");
    expect(normalized.presets[1]?.reasoning).toBe("high");
  });

  test("starts a new minimax preset with the correct defaults", () => {
    const preset = createPresetDraft("minimax-io", []);

    expect(preset.providerKind).toBe("minimax-io");
    expect(preset.model).toBe("");
    expect(preset.baseUrl).toBe("https://api.minimax.io/v1");
    expect(preset.codingPlan).toBe(false);
  });

  test("starts a new zai preset with general api base URL", () => {
    const preset = createPresetDraft("zai", []);

    expect(preset.providerKind).toBe("zai");
    expect(preset.baseUrl).toBe("https://api.z.ai/api/paas/v4");
    expect(preset.codingPlan).toBe(false);
  });
});
