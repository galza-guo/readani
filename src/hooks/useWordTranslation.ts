import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LRUCache } from "../lib/lruCache";
import { getFriendlyProviderError } from "../lib/providerErrors";
import { hasPresetTranslationContext } from "../lib/appSettings";
import type {
  TranslationSettings,
  TranslationPreset,
  TargetLanguage,
  WordTranslation,
  SelectionTranslation,
  WordLookupResult,
  BatchTranslationResult,
  SelectionTranslationResult,
  TranslationFallbackTrace,
} from "../types";

export type WordTranslationResult = {
  wordTranslation: WordTranslation | null;
  selectionTranslation: SelectionTranslation | null;
  handleTranslateText: (
    text: string,
    position: { x: number; y: number },
  ) => Promise<void>;
  handleClearWordTranslation: () => void;
  handlePdfSelectionTranslate: (
    selection: { text: string; position: { x: number; y: number } },
  ) => Promise<void>;
  handleClearSelectionTranslation: () => void;
  textTranslationCacheRef: React.MutableRefObject<LRUCache<string, string>>;
};

export function useWordTranslation(args: {
  getEffectivePreset: (settings?: TranslationSettings) => TranslationPreset | null | undefined;
  settingsRef: React.MutableRefObject<TranslationSettings>;
  currentTargetLanguageRef: React.MutableRefObject<TargetLanguage>;
  translationEnabledRef: React.MutableRefObject<boolean>;
  pdfTranslationSessionRef: React.MutableRefObject<number>;
  showFallbackSuccessToast: (trace: TranslationFallbackTrace) => void;
  showToast: (args: { message: string; tone?: "success" | "error"; durationMs?: number }) => void;
}): WordTranslationResult {
  const {
    getEffectivePreset,
    settingsRef,
    currentTargetLanguageRef,
    translationEnabledRef,
    pdfTranslationSessionRef,
    showFallbackSuccessToast,
  } = args;

  const [wordTranslation, setWordTranslation] =
    useState<WordTranslation | null>(null);
  const [selectionTranslation, setSelectionTranslation] =
    useState<SelectionTranslation | null>(null);
  const textTranslationCacheRef = useRef(
    new LRUCache<string, string>(100),
  );

  const handleTranslateText = useCallback(
    async (text: string, position: { x: number; y: number }) => {
      if (!translationEnabledRef.current) return;
      const normalizedText = text.toLowerCase().trim();
      const isSingleWord = /^[a-zA-Z]+$/.test(text.trim());

      // Check cache first
      const cached = textTranslationCacheRef.current.get(normalizedText);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setWordTranslation({ word: text, ...parsed, position });
        } catch {
          setWordTranslation({
            word: text,
            definitions: [{ pos: "", meanings: cached }],
            position,
          });
        }
        return;
      }

      // Show loading state
      setWordTranslation({
        word: text,
        definitions: [],
        position,
        isLoading: true,
      });

      try {
        const currentSettings = settingsRef.current;
        const currentPreset = getEffectivePreset(currentSettings);
        if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
          throw new Error("No active preset configured.");
        }

        if (isSingleWord) {
          // Use dictionary lookup for single words
          const result = (await invoke("openrouter_word_lookup", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            targetLanguage: currentTargetLanguageRef.current,
            word: text,
          })) as WordLookupResult;

          // Cache the result
          textTranslationCacheRef.current.set(
            normalizedText,
            JSON.stringify({
              phonetic: result.phonetic,
              definitions: result.definitions,
            }),
          );

          setWordTranslation({
            word: text,
            phonetic: result.phonetic,
            definitions: result.definitions || [],
            position,
          });
          showFallbackSuccessToast(result.fallbackTrace);
        } else {
          // Use regular translation for phrases
          const result = (await invoke("openrouter_translate", {
            presetId: currentPreset.id,
            model: currentPreset.model,
            temperature: 0,
            targetLanguage: currentTargetLanguageRef.current,
            sentences: [{ sid: "text", text }],
          })) as BatchTranslationResult;

          const translation =
            result.results[0]?.translation || "Translation failed";

          // Cache the result
          textTranslationCacheRef.current.set(normalizedText, translation);

          setWordTranslation({
            word: text,
            definitions: [{ pos: "", meanings: translation }],
            position,
          });
          showFallbackSuccessToast(result.fallbackTrace);
        }
      } catch (error) {
        const friendlyError = getFriendlyProviderError(error);
        setWordTranslation({
          word: text,
          definitions: [{ pos: "", meanings: friendlyError.message }],
          position,
        });
      }
    },
    [getEffectivePreset, showFallbackSuccessToast],
  );

  const handlePdfSelectionTranslate = useCallback(
    async (selection: { text: string; position: { x: number; y: number } }) => {
      if (!translationEnabledRef.current) {
        return;
      }

      setSelectionTranslation({
        text: selection.text,
        position: selection.position,
        isLoading: true,
      });

      const sessionId = pdfTranslationSessionRef.current;

      try {
        const currentPreset = getEffectivePreset(settingsRef.current);
        if (!currentPreset || !hasPresetTranslationContext(currentPreset)) {
          throw new Error("No active preset configured.");
        }

        const result = (await invoke("translate_selection_text", {
          presetId: currentPreset.id,
          model: currentPreset.model,
          targetLanguage: currentTargetLanguageRef.current,
          text: selection.text,
        })) as SelectionTranslationResult;

        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          translation: result.translation,
        });
        showFallbackSuccessToast(result.fallbackTrace);
      } catch (error) {
        if (sessionId !== pdfTranslationSessionRef.current) {
          return;
        }

        const friendlyError = getFriendlyProviderError(error);

        setSelectionTranslation({
          text: selection.text,
          position: selection.position,
          error: friendlyError.message,
        });
      }
    },
    [getEffectivePreset, showFallbackSuccessToast],
  );

  const handleClearWordTranslation = useCallback(() => {
    setWordTranslation(null);
  }, []);

  const handleClearSelectionTranslation = useCallback(() => {
    setSelectionTranslation(null);
  }, []);

  return {
    wordTranslation,
    selectionTranslation,
    handleTranslateText,
    handleClearWordTranslation,
    handlePdfSelectionTranslate,
    handleClearSelectionTranslation,
    textTranslationCacheRef,
  };
}
