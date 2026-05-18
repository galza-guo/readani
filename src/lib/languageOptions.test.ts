import { describe, expect, test } from "bun:test";
import { addLocale, getLocale, setLocale } from "./i18n";
import {
  APP_LANGUAGE_TARGET,
  APP_UI_LANGUAGE_PRESETS,
  COMMON_LANGUAGE_PRESETS,
  FOLLOW_SYSTEM_LANGUAGE,
  LANGUAGE_PRESETS,
  buildAppLanguagePickerSections,
  buildCustomLanguage,
  buildLanguagePickerSections,
  buildTranslateToLanguagePickerSections,
  getCustomLanguageOption,
  getLanguageDisplayLabel,
  getLanguageSelfLabel,
  resolveLanguageFromLocale,
} from "./languageOptions";

describe("language options", () => {
  test("includes a broad built-in language list with common variants", () => {
    expect(LANGUAGE_PRESETS.length).toBeGreaterThan(60);
    expect(LANGUAGE_PRESETS).toContainEqual({
      label: "Portuguese",
      code: "pt",
    });
    expect(LANGUAGE_PRESETS).toContainEqual({
      label: "Portuguese (Brazil)",
      code: "pt-BR",
    });
    expect(LANGUAGE_PRESETS).toContainEqual({
      label: "Serbian (Latin)",
      code: "sr-Latn",
    });
  });

  test("keeps a short quick-pick subset at the top of the picker", () => {
    expect(COMMON_LANGUAGE_PRESETS).toEqual([
      { label: "Chinese (Simplified)", code: "zh-CN" },
      { label: "Chinese (Traditional)", code: "zh-TW" },
      { label: "English", code: "en" },
      { label: "Japanese", code: "ja" },
      { label: "Korean", code: "ko" },
      { label: "Spanish", code: "es" },
      { label: "French", code: "fr" },
    ]);
  });

  test("creates a stable custom language from free text", () => {
    expect(buildCustomLanguage("Hong Kong Traditional Chinese")).toEqual({
      label: "Hong Kong Traditional Chinese",
      code: "custom:hong-kong-traditional-chinese",
    });
  });

  test("offers a custom language option only when no exact match exists", () => {
    expect(getCustomLanguageOption("Portuguese")).toBeUndefined();
    expect(getCustomLanguageOption("Hong Kong Traditional Chinese")).toEqual({
      label: "Hong Kong Traditional Chinese",
      code: "custom:hong-kong-traditional-chinese",
    });
  });

  test("keeps quick picks unlabelled and then repeats the full list under All languages", () => {
    const sections = buildLanguagePickerSections("");

    expect(sections[0]?.title).toBeUndefined();
    expect(sections[0]?.items).toEqual(COMMON_LANGUAGE_PRESETS);
    expect(sections[1]?.title).toBe("All languages");
    expect(sections[1]?.items[0]).toEqual({
      label: "Afrikaans",
      code: "af",
    });
    expect(sections[1]?.items).toContainEqual({
      label: "French",
      code: "fr",
    });
    expect(sections[1]?.items).toContainEqual({
      label: "Portuguese",
      code: "pt",
    });
    expect(
      sections.some((section) => section.title === "Common languages")
    ).toBe(false);
  });

  test("shows one unlabelled flat result list while searching", () => {
    const sections = buildLanguagePickerSections("port");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeUndefined();
    expect(sections[0]?.items).toContainEqual({
      label: "Portuguese",
      code: "pt",
    });
  });

  test("limits the app language picker to Follow system plus the supported UI shortlist", () => {
    const sections = buildAppLanguagePickerSections("");

    expect(sections[0]?.items[0]).toEqual(FOLLOW_SYSTEM_LANGUAGE);
    expect(sections[1]?.items).toEqual(APP_UI_LANGUAGE_PRESETS);
  });

  test("adds App language to the translate-to picker", () => {
    const sections = buildTranslateToLanguagePickerSections("");

    expect(sections[0]?.items[0]).toEqual(APP_LANGUAGE_TARGET);
    expect(sections[1]?.items).toEqual(COMMON_LANGUAGE_PRESETS);
  });

  test("localizes sentinel display labels at render time", () => {
    addLocale("test-locale", {
      "languages.app": "Sprache der App",
      "languages.followSystem": "Systemsprache folgen",
    });
    const previousLocale = getLocale();

    try {
      setLocale("test-locale");

      expect(getLanguageDisplayLabel(APP_LANGUAGE_TARGET)).toBe("Sprache der App");
      expect(getLanguageDisplayLabel(FOLLOW_SYSTEM_LANGUAGE)).toBe(
        "Systemsprache folgen",
      );
    } finally {
      setLocale(previousLocale);
    }
  });

  test("returns the language self-name for app-language display", () => {
    expect(getLanguageSelfLabel({ code: "de", label: "German" })).toBe("Deutsch");
    expect(getLanguageSelfLabel({ code: "zh-CN", label: "Chinese (Simplified)" })).toBe(
      "简体中文",
    );
    expect(getLanguageSelfLabel({ code: "zh-TW", label: "Chinese (Traditional)" })).toBe(
      "繁體中文",
    );
    expect(getLanguageSelfLabel({ code: "sr-Latn", label: "Serbian (Latin)" })).toBe(
      "srpski (latinica)",
    );
    expect(getLanguageSelfLabel(FOLLOW_SYSTEM_LANGUAGE)).toBe("Follow system");
  });

  test("matches app-language search against native self-names and English labels within the UI shortlist", () => {
    const nativeSections = buildAppLanguagePickerSections("deutsch");
    const englishSections = buildAppLanguagePickerSections("german");

    expect(nativeSections).toEqual([]);
    expect(englishSections).toEqual([]);
  });

  test("keeps search results for app language inside the shortlist and includes Follow system when relevant", () => {
    const sections = buildAppLanguagePickerSections("chinese");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeUndefined();
    expect(sections[0]?.items).toEqual([
      { label: "Chinese (Simplified)", code: "zh-CN" },
      { label: "Chinese (Traditional)", code: "zh-TW" },
    ]);
  });

  test("finds the system option by English search terms in the app language picker", () => {
    const sections = buildAppLanguagePickerSections("system");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.items[0]).toEqual(FOLLOW_SYSTEM_LANGUAGE);
  });

  test("keeps search results free of quick-pick duplicates and section labels", () => {
    const sections = buildTranslateToLanguagePickerSections("chinese");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeUndefined();
    expect(sections[0]?.items).toEqual([
      { label: "Chinese (Simplified)", code: "zh-CN" },
      { label: "Chinese (Traditional)", code: "zh-TW" },
    ]);
  });

  test("maps system locales onto the nearest built-in language option", () => {
    expect(resolveLanguageFromLocale("en-US")).toEqual({
      label: "English",
      code: "en",
    });
    expect(resolveLanguageFromLocale("pt-BR")).toEqual({
      label: "Portuguese (Brazil)",
      code: "pt-BR",
    });
    expect(resolveLanguageFromLocale("zh-Hant-HK")).toEqual({
      label: "Chinese (Traditional)",
      code: "zh-TW",
    });
  });
});
