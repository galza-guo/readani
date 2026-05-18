import type { BookTranslationPreference, TargetLanguage } from "../types";

type ResolveBookTranslationPreferenceOptions = {
  docId?: string | null;
  preferences: Record<string, BookTranslationPreference>;
  defaultLanguage: TargetLanguage;
};

function isUsableStoredTranslationLanguage(language?: TargetLanguage) {
  const code = language?.code?.trim();
  return Boolean(code && code !== "system");
}

export function migrateBookTranslationPreferences(
  preferences: Record<string, BookTranslationPreference>,
  fallbackLanguage: TargetLanguage,
) {
  return Object.fromEntries(
    Object.entries(preferences).map(([docId, preference]) => [
      docId,
      {
        enabled: preference.enabled,
        targetLanguage: isUsableStoredTranslationLanguage(preference.targetLanguage)
          ? preference.targetLanguage
          : fallbackLanguage,
      },
    ]),
  );
}

export function resolveBookTranslationPreference({
  docId,
  preferences,
  defaultLanguage,
}: ResolveBookTranslationPreferenceOptions) {
  const existingPreference =
    docId && preferences[docId]
      ? preferences[docId]
      : undefined;

  if (existingPreference && isUsableStoredTranslationLanguage(existingPreference.targetLanguage)) {
    return {
      preference: existingPreference,
      shouldPersist: false,
    };
  }

  return {
    preference: {
      enabled: existingPreference?.enabled ?? true,
      targetLanguage: defaultLanguage,
    },
    shouldPersist: Boolean(docId),
  };
}
