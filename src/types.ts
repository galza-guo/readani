export type Rect = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Paragraph = {
  pid: string;
  page: number;
  source: string;
  translation?: string;
  status: "idle" | "loading" | "done" | "error";
  rects: Rect[];
  epubHref?: string;
  sectionTitle?: string;
};

export type PageDoc = {
  page: number;
  paragraphs: Paragraph[];
  watermarks?: string[];
  title?: string; // Optional title for the page (e.g., chapter name for EPUB)
  isExtracted?: boolean;
};

export type TargetLanguage = {
  label: string;
  code: string;
};

export type ThemeMode = "system" | "light" | "dark";

export type TranslationProviderKind =
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "openai-compatible";

export type TranslationPreset = {
  id: string;
  label: string;
  providerKind: TranslationProviderKind;
  baseUrl?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  model: string;
};

export type TranslationProvider = TranslationPreset;

export type TranslationProvidersState = {
  activeProviderId: string;
  providers: TranslationPreset[];
};

export type TranslationSettings = {
  activePresetId: string;
  autoFallbackEnabled: boolean;
  translateAllSlowMode: boolean;
  defaultLanguage: TargetLanguage;
  theme: ThemeMode;
  presets: TranslationPreset[];
};

export type TranslationCacheBookSummary = {
  docId: string;
  title: string;
  cachedPageCount: number;
};

export type TranslationCacheSummary = {
  totalCacheSizeBytes: number;
  books: TranslationCacheBookSummary[];
};

export type TranslationFallbackTrace = {
  requestedPresetId: string;
  finalPresetId: string;
  usedFallback: boolean;
  attemptedPresetIds: string[];
  attemptCount: number;
  lastError?: string;
};

export type PresetTestResult = {
  presetId: string;
  label: string;
  ok: boolean;
  message: string;
  detail?: string;
};

export type PresetSaveState =
  | "pristine"
  | "dirty"
  | "saving"
  | "saved"
  | "invalid"
  | "error";

export type PresetSaveStatus = {
  state: PresetSaveState;
  detail?: string;
};

export type PageTranslationState = {
  page: number;
  displayText: string;
  previousContext: string;
  nextContext: string;
  translatedText?: string;
  status:
    | "idle"
    | "queued"
    | "loading"
    | "done"
    | "error"
    | "unavailable"
    | "setup-required";
  isCached?: boolean;
  activityMessage?: string;
  error?: string;
  errorChecks?: string[];
  fallbackTrace?: TranslationFallbackTrace;
};

export type PageTranslationResult = {
  page: number;
  translatedText: string;
  isCached: boolean;
  fallbackTrace: TranslationFallbackTrace;
};

export type BatchTranslationResult = {
  results: Array<{
    sid: string;
    translation: string;
  }>;
  fallbackTrace: TranslationFallbackTrace;
};

export type SelectionTranslationResult = {
  translation: string;
  fallbackTrace: TranslationFallbackTrace;
};

export type WordLookupResult = {
  phonetic?: string;
  definitions: WordDefinition[];
  fallbackTrace: TranslationFallbackTrace;
};

export type SelectionTranslation = {
  text: string;
  translation?: string;
  position: { x: number; y: number };
  isLoading?: boolean;
  error?: string;
};

export type WordDefinition = {
  pos: string; // part of speech: n., v., adj., etc.
  meanings: string;
};

export type WordTranslation = {
  word: string;
  phonetic?: string;
  definitions: WordDefinition[];
  position: { x: number; y: number };
  isLoading?: boolean;
  isLiked?: boolean;
};

export type VocabularyEntry = {
  word: string;
  phonetic?: string;
  definitions: WordDefinition[];
  added_at: string;
};

// Book/Library types
export type FileType = "pdf" | "epub";

export type RecentBook = {
  id: string;
  filePath: string;
  fileName: string;
  fileType: FileType;
  title: string;
  author?: string;
  coverImage?: string;
  totalPages: number;
  lastPage: number;
  progress: number;
  lastOpenedAt: string;
};

// Chat types
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};
