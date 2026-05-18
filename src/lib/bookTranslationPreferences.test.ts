import { describe, expect, test } from "bun:test";
import type { BookTranslationPreference, TargetLanguage } from "../types";
import {
  migrateBookTranslationPreferences,
  resolveBookTranslationPreference,
} from "./bookTranslationPreferences";

const ENGLISH: TargetLanguage = {
  code: "en",
  label: "English",
};

const FRENCH: TargetLanguage = {
  code: "fr",
  label: "French",
};

const APP_LANGUAGE: TargetLanguage = {
  code: "app-language",
  label: "App language",
};

describe("book translation preferences", () => {
  test("creates a concrete preference for a new document from the current default language", () => {
    const result = resolveBookTranslationPreference({
      docId: "doc-1",
      preferences: {},
      defaultLanguage: ENGLISH,
    });

    expect(result.preference).toEqual({
      enabled: true,
      targetLanguage: ENGLISH,
    });
    expect(result.shouldPersist).toBe(true);
  });

  test("keeps an existing document preference even when the app default is different", () => {
    const preferences: Record<string, BookTranslationPreference> = {
      "doc-1": {
        enabled: true,
        targetLanguage: FRENCH,
      },
    };

    const result = resolveBookTranslationPreference({
      docId: "doc-1",
      preferences,
      defaultLanguage: ENGLISH,
    });

    expect(result.preference).toEqual(preferences["doc-1"]);
    expect(result.shouldPersist).toBe(false);
  });

  test("keeps app language as a live per-book preference", () => {
    const result = resolveBookTranslationPreference({
      docId: "doc-1",
      preferences: {
        "doc-1": {
          enabled: true,
          targetLanguage: APP_LANGUAGE,
        },
      },
      defaultLanguage: ENGLISH,
    });

    expect(result.preference).toEqual({
      enabled: true,
      targetLanguage: APP_LANGUAGE,
    });
    expect(result.shouldPersist).toBe(false);
  });

  test("migrates invalid system-scoped document languages into the current fallback language", () => {
    const migrated = migrateBookTranslationPreferences(
      {
        "doc-1": {
          enabled: true,
          targetLanguage: {
            code: "system",
            label: "Follow system",
          },
        },
      },
      FRENCH,
    );

    expect(migrated).toEqual({
      "doc-1": {
        enabled: true,
        targetLanguage: FRENCH,
      },
    });
  });

  test("repairs an invalid saved document preference by reusing the current default language", () => {
    const result = resolveBookTranslationPreference({
      docId: "doc-1",
      preferences: {
        "doc-1": {
          enabled: false,
          targetLanguage: {
            code: "system",
            label: "Follow system",
          },
        },
      },
      defaultLanguage: APP_LANGUAGE,
    });

    expect(result.preference).toEqual({
      enabled: false,
      targetLanguage: APP_LANGUAGE,
    });
    expect(result.shouldPersist).toBe(true);
  });
});
