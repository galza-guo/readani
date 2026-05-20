import type { PageDoc, PageTranslationState, TranslationPreset } from "../types";
import type { TranslationFallbackTrace } from "../types";
import {
  getFriendlyProviderError,
  getProviderErrorDetail,
} from "./providerErrors";
import type { PresetTestResult } from "../types";

export function getPresetById(
  presets: TranslationPreset[],
  presetId?: string | null,
) {
  if (!presetId) {
    return null;
  }

  return presets.find((preset) => preset.id === presetId) ?? null;
}

export function getFallbackAttemptSummary(trace?: TranslationFallbackTrace) {
  if (!trace || trace.attemptCount <= 1) {
    return undefined;
  }

  return `Tried ${trace.attemptCount} presets.`;
}

export function getFriendlyFallbackError(
  trace?: TranslationFallbackTrace,
  error?: unknown,
) {
  return getFriendlyProviderError(trace?.lastError ?? error);
}

export function getFallbackFailureStatusMessage(
  trace?: TranslationFallbackTrace,
  error?: unknown,
) {
  const summary = getFallbackAttemptSummary(trace);
  const friendlyError = getFriendlyFallbackError(trace, error);

  return summary
    ? `${summary} ${friendlyError.message}`
    : friendlyError.message;
}

export function getFriendlyPresetTestResult(
  result: PresetTestResult,
): PresetTestResult {
  if (result.ok) {
    return result;
  }

  const rawError = result.detail ?? result.message;
  const friendlyError = getFriendlyProviderError(rawError);

  return {
    ...result,
    message: friendlyError.message,
    detail: getProviderErrorDetail(rawError),
  };
}

export function invokeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

export function hasLoadedPdfTranslation(
  translation?: PageTranslationState,
) {
  return Boolean(
    translation?.status === "done" && translation.translatedText?.trim(),
  );
}

export function sanitizePdfTranslationsForPresetChange(
  translations: Record<number, PageTranslationState>,
) {
  return Object.fromEntries(
    Object.entries(translations).map(([page, translation]) => {
      if (translation.status === "unavailable") {
        return [page, translation];
      }

      if (hasLoadedPdfTranslation(translation)) {
        return [
          page,
          {
            ...translation,
            status: "done" as const,
            activityMessage: undefined,
            error: undefined,
          },
        ];
      }

      return [
        page,
        {
          ...translation,
          status: "idle" as const,
          activityMessage: undefined,
          error: undefined,
        },
      ];
    }),
  ) as Record<number, PageTranslationState>;
}

export function sanitizeEpubPagesForPresetChange(pages: PageDoc[]) {
  return pages.map((page) => ({
    ...page,
    paragraphs: page.paragraphs.map((paragraph) => {
      if (paragraph.status !== "loading") {
        return paragraph;
      }

      return {
        ...paragraph,
        status: paragraph.translation?.trim()
          ? ("done" as const)
          : ("idle" as const),
      };
    }),
  }));
}

export function clearPageTranslationsForTargetLanguageChange(
  pages: PageDoc[],
) {
  return pages.map((page) => ({
    ...page,
    paragraphs: page.paragraphs.map((paragraph) => ({
      ...paragraph,
      translation: undefined,
      status: "idle" as const,
    })),
  }));
}
