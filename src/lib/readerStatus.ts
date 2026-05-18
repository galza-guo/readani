import { t } from "./i18n";

export type ReaderStatusKind =
  | "ready"
  | "loading-document"
  | "extracting-text"
  | "translating-page"
  | "redoing-page"
  | "translating-section"
  | "redoing-section"
  | "translation-failed";

export type ReaderStatusOptions = {
  page?: number;
};

export function getReaderStatusLabel(
  kind: ReaderStatusKind,
  options: ReaderStatusOptions = {}
): string {
  if (kind === "loading-document") {
    return t("readerStatus.loadingDocument");
  }

  if (kind === "extracting-text") {
    return t("readerStatus.extractingText");
  }

  if (kind === "translating-page") {
    return options.page
      ? t("readerStatus.translatingPage", { page: String(options.page) })
      : t("readerStatus.translatingPage", { page: "?" });
  }

  if (kind === "redoing-page") {
    return options.page
      ? t("readerStatus.redoingPage", { page: String(options.page) })
      : t("readerStatus.redoingPage", { page: "?" });
  }

  if (kind === "translating-section") {
    return t("readerStatus.translatingSection");
  }

  if (kind === "redoing-section") {
    return t("readerStatus.redoingSection");
  }

  if (kind === "translation-failed") {
    return t("readerStatus.translationFailed");
  }

  return t("readerStatus.ready");
}
