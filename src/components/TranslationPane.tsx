import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import * as Popover from "@radix-ui/react-popover";
import {
  buildLanguagePickerSections,
  getCustomLanguageOption,
} from "../lib/languageOptions";
import {
  getPdfAlignmentState,
  getTranslatablePdfParagraphs,
} from "../lib/pdfSegments";
import { getFriendlyProviderError } from "../lib/providerErrors";
import type { PageProgressStatus } from "../lib/pageTranslationScheduler";
import { useToast } from "./toast/ToastProvider";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import type {
  PageDoc,
  PageTranslationState,
  Paragraph,
  SelectionTranslation,
  TargetLanguage,
  WordTranslation,
} from "../types";
import type { ResolvedSentenceAnnotation } from "../lib/annotationMatching";

type TranslationPaneChromeProps = {
  translationEnabled: boolean;
  extractionProgress?: {
    completedCount: number;
    totalCount: number;
    progressLabel: string;
  } | null;
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | "waiting" | "paused" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: () => void;
  statusMap?: PageProgressStatus[];
  currentPage?: number;
  onSeekPage?: (page: number) => void;
};

type TranslationLanguageControlProps = {
  enabled: boolean;
  targetLanguage: TargetLanguage;
  onChange: (preference: {
    enabled: boolean;
    targetLanguage: TargetLanguage;
  }) => void;
};

type PdfTranslationPaneProps = {
  mode: "pdf";
  translationEnabled: boolean;
  targetLanguage: TargetLanguage;
  onTranslationPreferenceChange: TranslationLanguageControlProps["onChange"];
  currentPage: number;
  page?: PageDoc;
  pageTranslation?: PageTranslationState;
  loadingMessage?: string | null;
  setupRequired?: boolean;
  extractionProgress?: TranslationPaneChromeProps["extractionProgress"];
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | "waiting" | "paused" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: () => void;
  onOpenSettings: () => void;
  onRetryPage: (page: number) => void;
  canRetryPage: boolean;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onLocatePid: (pid: string, page: number) => void;
  selectionTranslation: SelectionTranslation | null;
  onClearSelectionTranslation: () => void;
  statusMap?: PageProgressStatus[];
  onSeekPage?: (page: number) => void;
  // Annotation props
  annotations?: ResolvedSentenceAnnotation[];
  annotationModeEnabled?: boolean;
  onToggleAnnotationMode?: () => void;
  onAnnotateSentence?: (para: Paragraph, sentenceIndex: number) => void;
  onToggleSentenceAnnotation?: (para: Paragraph, sentenceIndex: number) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  onSaveNote?: (annotationId: string, note: string) => void;
  noteEditingAnnotationId?: string | null;
  onNoteEditingChange?: (annotationId: string | null) => void;
  onHighlightSelected?: (pids: string[]) => void;
};

type EpubTranslationPaneProps = {
  mode: "epub";
  translationEnabled: boolean;
  targetLanguage: TargetLanguage;
  onTranslationPreferenceChange: TranslationLanguageControlProps["onChange"];
  pages: PageDoc[];
  currentPage: number;
  setupRequired?: boolean;
  extractionProgress?: TranslationPaneChromeProps["extractionProgress"];
  progressLabel?: string | null;
  progressDetailLabel?: string | null;
  progressDetailState?: "running" | "stopping" | "waiting" | "paused" | null;
  bulkActionLabel: string;
  onBulkAction: () => void;
  bulkActionDisabled: boolean;
  bulkActionRunning: boolean;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: () => void;
  onOpenSettings: () => void;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
  wordTranslation: WordTranslation | null;
  onClearWordTranslation: () => void;
  scrollToPage?: number | null;
  statusMap?: PageProgressStatus[];
  onSeekPage?: (page: number) => void;
  annotations?: ResolvedSentenceAnnotation[];
  annotationModeEnabled?: boolean;
  onToggleAnnotationMode?: () => void;
  onAnnotateSentence?: (para: Paragraph, sentenceIndex: number) => void;
  onToggleSentenceAnnotation?: (para: Paragraph, sentenceIndex: number) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  onSaveNote?: (annotationId: string, note: string) => void;
  noteEditingAnnotationId?: string | null;
  onNoteEditingChange?: (annotationId: string | null) => void;
  onHighlightSelected?: (pids: string[]) => void;
};

type TranslationPaneProps = PdfTranslationPaneProps | EpubTranslationPaneProps;

function getFallbackAttemptSummary(pageTranslation?: PageTranslationState) {
  const attemptCount = pageTranslation?.fallbackTrace?.attemptCount ?? 0;

  if (attemptCount <= 1) {
    return undefined;
  }

  return `Tried ${attemptCount} presets.`;
}

function TranslateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l6 6" />
      <path d="M4 14l6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="M22 22l-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function AnnotateIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function TranslationLanguageControl({
  enabled,
  targetLanguage,
  onChange,
}: TranslationLanguageControlProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sections = useMemo(() => buildLanguagePickerSections(query), [query]);
  const customOption = useMemo(
    () => getCustomLanguageOption(query, targetLanguage),
    [query, targetLanguage],
  );
  const flattenedOptions = useMemo(() => {
    const builtIn = sections.flatMap((section) =>
      section.items.map((language) => ({
        key: language.code,
        language,
      })),
    );

    return customOption
      ? [...builtIn, { key: customOption.code, language: customOption }]
      : builtIn;
  }, [customOption, sections]);

  useEffect(() => {
    if (!open) {
      optionRefs.current = [];
      return;
    }

    setQuery("");
    setHighlightedIndex(0);

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const selectLanguage = (language: TargetLanguage) => {
    onChange({ enabled: true, targetLanguage: language });
    setOpen(false);
    setQuery("");
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        flattenedOptions.length === 0
          ? 0
          : Math.min(current + 1, flattenedOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        flattenedOptions.length === 0 ? 0 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Enter" && flattenedOptions[highlightedIndex]) {
      event.preventDefault();
      selectLanguage(flattenedOptions[highlightedIndex].language);
    }
  };

  let optionIndex = -1;
  const label = enabled ? targetLanguage.label : "Off";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="translation-language-trigger"
          type="button"
          aria-label="Change translation language"
          aria-expanded={open}
          title="Change translation language"
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="language-combobox-content translation-language-content"
          sideOffset={8}
        >
          <button
            className={`language-combobox-option translation-language-off-option ${
              !enabled ? "is-selected" : ""
            }`}
            onClick={() => {
              onChange({ enabled: false, targetLanguage });
              setOpen(false);
              setQuery("");
            }}
            type="button"
          >
            <span>Off</span>
            {!enabled ? <CheckSmallIcon /> : null}
          </button>
          <div className="translation-language-divider" />
          <input
            ref={inputRef}
            aria-label="Search languages"
            className="language-combobox-input"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search languages"
            type="text"
            value={query}
          />
          <div className="language-combobox-list" role="listbox">
            {sections.map((section) => (
              <div key={section.id} className="language-combobox-section">
                {section.title ? (
                  <div className="language-combobox-section-title">
                    {section.title}
                  </div>
                ) : null}
                {section.items.map((language) => {
                  optionIndex += 1;
                  const currentIndex = optionIndex;
                  const isSelected = enabled && language.code === targetLanguage.code;
                  const isHighlighted = currentIndex === highlightedIndex;

                  return (
                    <button
                      key={language.code}
                      ref={(element) => {
                        optionRefs.current[currentIndex] = element;
                      }}
                      className={`language-combobox-option ${
                        isHighlighted ? "is-highlighted" : ""
                      } ${isSelected ? "is-selected" : ""}`}
                      onClick={() => selectLanguage(language)}
                      onMouseEnter={() => setHighlightedIndex(currentIndex)}
                      role="option"
                      type="button"
                    >
                      <span>{language.label}</span>
                      {isSelected ? <CheckSmallIcon /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
            {customOption ? (
              <button
                ref={(element) => {
                  optionRefs.current[flattenedOptions.length - 1] = element;
                }}
                className={`language-combobox-option language-combobox-option-custom ${
                  highlightedIndex === flattenedOptions.length - 1
                    ? "is-highlighted"
                    : ""
                }`}
                onClick={() => selectLanguage(customOption)}
                onMouseEnter={() =>
                  setHighlightedIndex(flattenedOptions.length - 1)
                }
                role="option"
                type="button"
              >
                Use custom language: {customOption.label}
              </button>
            ) : null}
            {flattenedOptions.length === 0 ? (
              <div className="language-combobox-empty">No languages found.</div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

async function copyTextToClipboard(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (copied) {
      return;
    }
  }

  throw new Error("Clipboard access is unavailable.");
}

type SelectedCopyMode = "translation" | "original" | "both";

function getCopyableTranslation(para: Paragraph) {
  if (para.status !== "done") {
    return "";
  }

  return para.translation?.trim() ?? "";
}

function buildSelectedCopyText(
  paragraphs: Paragraph[],
  mode: SelectedCopyMode,
) {
  const blocks = paragraphs
    .map((para) => {
      const translation = getCopyableTranslation(para);
      const original = para.source.trim();

      if (mode === "translation") {
        return translation;
      }

      if (mode === "original") {
        return original;
      }

      return [translation, original].filter(Boolean).join("\n");
    })
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.join("\n\n").trim();
}

function TranslationSetupPrompt({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div className="translation-setup-prompt">
      <p className="translation-setup-title">Translation is not set up yet.</p>
      <button
        className="btn btn-quiet-action"
        onClick={onOpenSettings}
        type="button"
      >
        Open Settings to add a provider.
      </button>
    </div>
  );
}

function AnnotationCommentRow({
  annotation,
  isEditing,
  onSave,
  onEditingChange,
}: {
  annotation: ResolvedSentenceAnnotation;
  isEditing: boolean;
  onSave: (note: string) => void;
  onEditingChange: (annotationId: string | null) => void;
}) {
  const [draft, setDraft] = useState(annotation.note ?? "");
  const hasNote = Boolean(annotation.note?.trim());

  useEffect(() => {
    setDraft(annotation.note ?? "");
  }, [annotation.id, annotation.note, isEditing]);

  const handleSave = useCallback(() => {
    onSave(draft);
    onEditingChange(null);
  }, [draft, onEditingChange, onSave]);

  if (!isEditing) {
    return (
      <div className="pdf-segment-note-shell">
        <button
          className={`pdf-segment-note ${hasNote ? "" : "is-placeholder"}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEditingChange(annotation.id);
          }}
        >
          {hasNote ? annotation.note : "Comment"}
        </button>
        <span className="pdf-segment-note-spacer" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className="pdf-segment-note-shell pdf-segment-note-editor"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className="pdf-segment-note-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Comment"
        autoFocus
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSave();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onEditingChange(null);
          }
        }}
      />
      <div className="pdf-segment-note-actions">
        <button
          className="pdf-segment-note-save"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleSave();
          }}
          title="Save comment"
          aria-label="Save comment"
        >
          <CheckSmallIcon />
        </button>
      </div>
    </div>
  );
}

const PdfSegmentCard = memo(function PdfSegmentCard({
  para,
  sentenceIndex,
  translationEnabled,
  isActive,
  isSelected,
  onHoverPid,
  onSelect,
  onCopyText,
  annotation,
  annotationModeEnabled,
  onAnnotateSentence,
  onToggleSentenceAnnotation,
  onSaveNote,
  noteEditingAnnotationId,
  onNoteEditingChange,
}: {
  para: Paragraph;
  sentenceIndex?: number;
  translationEnabled: boolean;
  isActive: boolean;
  isSelected: boolean;
  onHoverPid: (pid: string | null) => void;
  onSelect: (pid: string, event: React.MouseEvent<HTMLElement>) => void;
  onCopyText: (text: string, label: string) => void;
  annotation?: ResolvedSentenceAnnotation;
  annotationModeEnabled?: boolean;
  onAnnotateSentence?: (para: Paragraph, sentenceIndex: number) => void;
  onToggleSentenceAnnotation?: (para: Paragraph, sentenceIndex: number) => void;
  onSaveNote?: (annotationId: string, note: string) => void;
  noteEditingAnnotationId?: string | null;
  onNoteEditingChange?: (annotationId: string | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<
    "translation" | "source" | null
  >(null);
  const isAnnotated = Boolean(annotation);
  const showInlineActions =
    isHovered || isActive || isSelected || hasFocusWithin;
  const sourceVisible = !translationEnabled || showInlineActions;
  const showTranslationCopy = hoveredSection === "translation";
  const showSourceCopy = hoveredSection === "source";
  const canCopyTranslation =
    para.status === "done" && Boolean(para.translation?.trim());
  const canCopySource = Boolean(para.source.trim());
  const annotateLabel = isAnnotated ? "Remove highlight" : "Highlight sentence";

  let translationText = para.translation?.trim() ?? "";
  if (translationEnabled) {
    if (para.status === "loading") {
      translationText = "Translating this passage...";
    } else if (para.status === "error") {
      translationText = "Translation failed for this passage.";
    } else if (!translationText) {
      translationText =
        "Translation will appear here when this passage is ready.";
    }
  }

  return (
    <article
      className={`pdf-segment-card ${
        isActive && !isHovered ? "is-linked-active" : ""
      } ${isSelected ? "is-selected" : ""} ${
        isAnnotated ? "is-annotated" : ""
      } ${!translationEnabled ? "is-original-primary" : ""}`}
      onMouseEnter={() => {
        setIsHovered(true);
        onHoverPid(para.pid);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredSection(null);
        onHoverPid(null);
      }}
      onFocusCapture={() => {
        setHasFocusWithin(true);
        onHoverPid(para.pid);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;

        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setHasFocusWithin(false);
          setHoveredSection(null);
          onHoverPid(null);
        }
      }}
      onClick={(event) => {
        if (annotationModeEnabled) {
          event.preventDefault();
          onAnnotateSentence?.(para, sentenceIndex ?? 0);
          return;
        }

        onSelect(para.pid, event);
      }}
    >
      <div className="pdf-segment-surface">
        {translationEnabled ? (
          <div
            className={`pdf-segment-row pdf-segment-row--translation ${
              showTranslationCopy ? "is-copy-hovered" : ""
            }`}
            onMouseEnter={() => setHoveredSection("translation")}
            onMouseLeave={() =>
              setHoveredSection((current) =>
                current === "translation" ? null : current,
              )
            }
          >
            <div className="pdf-segment-translation">{translationText}</div>
            <div className="pdf-segment-row-actions">
              <button
                className="pdf-segment-annotate-btn"
                type="button"
                tabIndex={showInlineActions ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSentenceAnnotation?.(para, sentenceIndex ?? 0);
                }}
                title={annotateLabel}
                aria-label={annotateLabel}
              >
                <AnnotateIcon />
              </button>
              <button
                className="pdf-segment-copy-btn"
                type="button"
                disabled={!canCopyTranslation}
                tabIndex={showTranslationCopy ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyText(para.translation?.trim() ?? "", "Translation");
                }}
                title="Copy translation"
                aria-label="Copy translation"
              >
                <CopyIcon />
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={`pdf-segment-source-reveal ${
            sourceVisible ? "is-visible" : ""
          }`}
          aria-hidden={!sourceVisible}
        >
          <div className="pdf-segment-source-reveal-inner">
            <div
              className={`pdf-segment-row pdf-segment-row--source ${
                showSourceCopy ? "is-copy-hovered" : ""
              }`}
              onMouseEnter={() => setHoveredSection("source")}
              onMouseLeave={() =>
                setHoveredSection((current) =>
                  current === "source" ? null : current,
                )
              }
            >
              <div className="pdf-segment-source">{para.source}</div>
              <div className="pdf-segment-row-actions">
                {!translationEnabled ? (
                  <button
                    className="pdf-segment-annotate-btn"
                    type="button"
                    tabIndex={showInlineActions ? 0 : -1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSentenceAnnotation?.(para, sentenceIndex ?? 0);
                    }}
                    title={annotateLabel}
                    aria-label={annotateLabel}
                  >
                    <AnnotateIcon />
                  </button>
                ) : null}
                <button
                  className="pdf-segment-copy-btn"
                  type="button"
                  disabled={!canCopySource || !sourceVisible}
                  tabIndex={showSourceCopy ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyText(para.source, "Original text");
                  }}
                  title="Copy original text"
                  aria-label="Copy original text"
                >
                  <CopyIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
        {annotation ? (
          <AnnotationCommentRow
            annotation={annotation}
            isEditing={noteEditingAnnotationId === annotation.id}
            onSave={(note) => onSaveNote?.(annotation.id, note)}
            onEditingChange={(annotationId) => {
              onNoteEditingChange?.(annotationId);
            }}
          />
        ) : null}
      </div>
    </article>
  );
});

const ParagraphBlock = memo(function ParagraphBlock({
  para,
  sentenceIndex,
  pageNum,
  translationEnabled,
  isActive,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
  onCopyText,
  annotation,
  annotationModeEnabled,
  onAnnotateSentence,
  onToggleSentenceAnnotation,
  onSaveNote,
  noteEditingAnnotationId,
  onNoteEditingChange,
}: {
  para: Paragraph;
  sentenceIndex: number;
  pageNum: number;
  translationEnabled: boolean;
  isActive: boolean;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
  onCopyText: (text: string, label: string) => void;
  annotation?: ResolvedSentenceAnnotation;
  annotationModeEnabled?: boolean;
  onAnnotateSentence?: (para: Paragraph, sentenceIndex: number) => void;
  onToggleSentenceAnnotation?: (para: Paragraph, sentenceIndex: number) => void;
  onSaveNote?: (annotationId: string, note: string) => void;
  noteEditingAnnotationId?: string | null;
  onNoteEditingChange?: (annotationId: string | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<
    "translation" | "source" | null
  >(null);
  const handleMouseUp = useCallback(
    (event: React.MouseEvent) => {
      if (annotationModeEnabled) {
        return;
      }

      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (
        selectedText &&
        selectedText.length > 0 &&
        selectedText.length < 200
      ) {
        event.stopPropagation();
        onTranslateText(selectedText, { x: event.clientX, y: event.clientY });
      }
    },
    [annotationModeEnabled, onTranslateText],
  );

  const isAnnotated = Boolean(annotation);
  const showInlineActions =
    isHovered || isActive || hasFocusWithin || annotationModeEnabled;
  const showTranslationCopy = hoveredSection === "translation";
  const showSourceCopy = hoveredSection === "source";
  const canCopyTranslation =
    para.status === "done" && Boolean(para.translation?.trim());
  const canCopySource = Boolean(para.source.trim());
  const annotateLabel = isAnnotated ? "Remove highlight" : "Highlight sentence";
  const translationText =
    para.status === "loading"
      ? "Translating..."
      : para.status === "error"
        ? "Translation failed."
        : para.translation || "";

  return (
    <div
      className={`paragraph-block ${isActive ? "is-active" : ""} ${
        isAnnotated ? "is-annotated" : ""
      } ${annotationModeEnabled ? "annotation-mode" : ""}`}
      onMouseEnter={() => {
        setIsHovered(true);
        onHoverPid(para.pid);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredSection(null);
        onHoverPid(null);
      }}
      onFocusCapture={() => {
        setHasFocusWithin(true);
        onHoverPid(para.pid);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;

        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setHasFocusWithin(false);
          setHoveredSection(null);
          onHoverPid(null);
        }
      }}
      onClick={() => {
        if (annotationModeEnabled) {
          onAnnotateSentence?.(para, sentenceIndex);
        }
      }}
    >
      <div
        className={`pdf-segment-row pdf-segment-row--source ${
          showSourceCopy ? "is-copy-hovered" : ""
        }`}
        onMouseEnter={() => setHoveredSection("source")}
        onMouseLeave={() =>
          setHoveredSection((current) => (current === "source" ? null : current))
        }
      >
        <div className="paragraph-source" onMouseUp={handleMouseUp}>
          {para.source}
        </div>
        <div className="pdf-segment-row-actions">
          <button
            className="pdf-segment-annotate-btn"
            type="button"
            tabIndex={showInlineActions ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSentenceAnnotation?.(para, sentenceIndex);
            }}
            title={annotateLabel}
            aria-label={annotateLabel}
          >
            <AnnotateIcon />
          </button>
          <button
            className="pdf-segment-copy-btn"
            type="button"
            disabled={!canCopySource}
            tabIndex={showSourceCopy ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onCopyText(para.source, "Original text");
            }}
            title="Copy original text"
            aria-label="Copy original text"
          >
            <CopyIcon />
          </button>
          <button
            className="action-btn locate-btn"
            type="button"
            tabIndex={showInlineActions ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onLocatePid(para.pid, pageNum);
            }}
            title="Locate in document"
            aria-label="Locate in document"
          >
            <LocateIcon />
          </button>
          {translationEnabled ? (
            <button
              className="action-btn translate-btn"
              type="button"
              tabIndex={showInlineActions ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onTranslatePid(para.pid);
              }}
              title="Translate paragraph"
              aria-label="Translate paragraph"
            >
              <TranslateIcon />
            </button>
          ) : null}
        </div>
      </div>
      {translationEnabled && para.status === "error" ? (
        <div
          className={`pdf-segment-row pdf-segment-row--translation ${
            showTranslationCopy ? "is-copy-hovered" : ""
          }`}
          onMouseEnter={() => setHoveredSection("translation")}
          onMouseLeave={() =>
            setHoveredSection((current) =>
              current === "translation" ? null : current,
            )
          }
        >
          <div className="paragraph-translation paragraph-error">
            <span>Translation failed.</span>
            <button
              className="retry-btn"
              onClick={(event) => {
                event.stopPropagation();
                onTranslatePid(para.pid);
              }}
              title="Retry translation"
            >
              <RetryIcon />
              <span>Retry</span>
            </button>
          </div>
          <div className="pdf-segment-row-actions">
            <button
              className="pdf-segment-annotate-btn"
              type="button"
              tabIndex={showInlineActions ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSentenceAnnotation?.(para, sentenceIndex);
              }}
              title={annotateLabel}
              aria-label={annotateLabel}
            >
              <AnnotateIcon />
            </button>
          </div>
        </div>
      ) : translationEnabled && translationText ? (
        <div
          className={`pdf-segment-row pdf-segment-row--translation ${
            showTranslationCopy ? "is-copy-hovered" : ""
          }`}
          onMouseEnter={() => setHoveredSection("translation")}
          onMouseLeave={() =>
            setHoveredSection((current) =>
              current === "translation" ? null : current,
            )
          }
        >
          <div className="paragraph-translation">{translationText}</div>
          <div className="pdf-segment-row-actions">
            <button
              className="pdf-segment-annotate-btn"
              type="button"
              tabIndex={showInlineActions ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSentenceAnnotation?.(para, sentenceIndex);
              }}
              title={annotateLabel}
              aria-label={annotateLabel}
            >
              <AnnotateIcon />
            </button>
            <button
              className="pdf-segment-copy-btn"
              type="button"
              disabled={!canCopyTranslation}
              tabIndex={showTranslationCopy ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                onCopyText(para.translation?.trim() ?? "", "Translation");
              }}
              title="Copy translation"
              aria-label="Copy translation"
            >
              <CopyIcon />
            </button>
          </div>
        </div>
      ) : null}
      {annotation ? (
        <AnnotationCommentRow
          annotation={annotation}
          isEditing={noteEditingAnnotationId === annotation.id}
          onSave={(note) => onSaveNote?.(annotation.id, note)}
          onEditingChange={(annotationId) => {
            onNoteEditingChange?.(annotationId);
          }}
        />
      ) : null}
    </div>
  );
});

const EpubPageTranslation = memo(function EpubPageTranslation({
  page,
  translationEnabled,
  activePid,
  hoverPid,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
  onCopyText,
  annotations,
  annotationModeEnabled,
  onAnnotateSentence,
  onToggleSentenceAnnotation,
  onDeleteAnnotation,
  onSaveNote,
  noteEditingAnnotationId,
  onNoteEditingChange,
}: {
  page: PageDoc;
  translationEnabled: boolean;
  activePid?: string | null;
  hoverPid?: string | null;
  onHoverPid: (pid: string | null) => void;
  onTranslatePid: (pid: string) => void;
  onLocatePid: (pid: string, page: number) => void;
  onTranslateText: (text: string, position: { x: number; y: number }) => void;
  onCopyText: (text: string, label: string) => void;
  annotations?: ResolvedSentenceAnnotation[];
  annotationModeEnabled?: boolean;
  onAnnotateSentence?: (para: Paragraph, sentenceIndex: number) => void;
  onToggleSentenceAnnotation?: (para: Paragraph, sentenceIndex: number) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  onSaveNote?: (annotationId: string, note: string) => void;
  noteEditingAnnotationId?: string | null;
  onNoteEditingChange?: (annotationId: string | null) => void;
}) {
  const pageTitle = page.title || `Page ${page.page}`;
  const annotationByPid = useMemo(() => {
    const map = new Map<string, ResolvedSentenceAnnotation>();
    if (annotations) {
      for (const ann of annotations) {
        if (ann.resolvedStatus === "attached" && ann.livePid) {
          map.set(ann.livePid, ann);
        }
      }
    }
    return map;
  }, [annotations]);
  const needsReviewAnnotations = useMemo(
    () =>
      (annotations ?? []).filter(
        (ann) => ann.page === page.page && ann.resolvedStatus === "needs-review",
      ),
    [annotations, page.page],
  );

  return (
    <div className="translation-page">
      <div className="translation-page-title">{pageTitle}</div>
      {needsReviewAnnotations.length > 0 ? (
        <div className="annotation-review-banner">
          <WarningIcon />
          <span>
            {needsReviewAnnotations.length} annotation
            {needsReviewAnnotations.length > 1 ? "s" : ""} need review on this
            page.
          </span>
          <div className="annotation-review-banner-actions">
            {needsReviewAnnotations.map((ann) => (
              <button
                key={ann.id}
                className="annotation-review-action"
                type="button"
                onClick={() => onDeleteAnnotation?.(ann.id)}
              >
                Delete
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {page.paragraphs.map((para, index) => (
        <ParagraphBlock
          key={para.pid}
          para={para}
          sentenceIndex={index}
          pageNum={page.page}
          translationEnabled={translationEnabled}
          isActive={para.pid === activePid || para.pid === hoverPid}
          onHoverPid={onHoverPid}
          onTranslatePid={onTranslatePid}
          onLocatePid={onLocatePid}
          onTranslateText={onTranslateText}
          onCopyText={onCopyText}
          annotation={annotationByPid.get(para.pid)}
          annotationModeEnabled={annotationModeEnabled}
          onAnnotateSentence={onAnnotateSentence}
          onToggleSentenceAnnotation={onToggleSentenceAnnotation}
          onSaveNote={onSaveNote}
          noteEditingAnnotationId={noteEditingAnnotationId}
          onNoteEditingChange={onNoteEditingChange}
        />
      ))}
    </div>
  );
});

type TranslationProgressBarProps = {
  statusMap: PageProgressStatus[];
  currentPage: number;
  progressLabel: string;
  isNeutral?: boolean;
  onSeekPage: (page: number) => void;
};

type ExtractionProgressBarProps = {
  completedCount: number;
  totalCount: number;
  progressLabel: string;
};

const TranslationProgressBar = memo(function TranslationProgressBar({
  statusMap,
  currentPage,
  progressLabel,
  isNeutral = false,
  onSeekPage,
}: TranslationProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [hoverPage, setHoverPage] = useState<number | null>(null);

  const pageFromOffset = useCallback(
    (clientX: number) => {
      const barWidth = barRef.current?.clientWidth ?? 1;
      const rect = barRef.current?.getBoundingClientRect();
      const offsetX = rect ? clientX - rect.left : 0;
      const raw = Math.round((offsetX / barWidth) * statusMap.length);
      return Math.max(1, Math.min(raw, statusMap.length));
    },
    [statusMap.length],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setDragPage(pageFromOffset(event.clientX));
    },
    [pageFromOffset],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        setDragPage(pageFromOffset(event.clientX));
      } else {
        setHoverPage(pageFromOffset(event.clientX));
      }
    },
    [isDragging, pageFromOffset],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const page = pageFromOffset(event.clientX);
      setIsDragging(false);
      setDragPage(null);
      onSeekPage(page);
    },
    [isDragging, pageFromOffset, onSeekPage],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsDragging(false);
      setDragPage(null);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let nextPage: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          nextPage = Math.max(1, currentPage - 1);
          break;
        case "ArrowRight":
        case "ArrowUp":
          nextPage = Math.min(statusMap.length, currentPage + 1);
          break;
        case "Home":
          nextPage = 1;
          break;
        case "End":
          nextPage = statusMap.length;
          break;
      }
      if (nextPage !== null) {
        event.preventDefault();
        onSeekPage(nextPage);
      }
    },
    [currentPage, statusMap.length, onSeekPage],
  );

  const tooltipContent = isDragging
    ? `Page ${dragPage}`
    : `${progressLabel} · Page ${hoverPage} of ${statusMap.length}`;

  const markerLeft = ((currentPage - 1) / statusMap.length) * 100;

  return (
    <div
      className={`translation-progress-bar ${isNeutral ? "is-neutral" : ""}`}
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={(event) => {
        setIsHovered(true);
        setHoverPage(pageFromOffset(event.clientX));
      }}
      onMouseLeave={() => {
        if (!isDragging) {
          setIsHovered(false);
          setHoverPage(null);
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-valuemin={1}
      aria-valuemax={statusMap.length}
      aria-valuenow={currentPage}
      aria-label={`Page navigation, page ${currentPage} of ${statusMap.length}`}
    >
      {statusMap.map((status, index) => (
        <span
          key={index}
          data-status={isNeutral ? "neutral" : status}
          className="translation-progress-segment"
          style={{ "--segment-index": index } as CSSProperties}
        />
      ))}
      <span
        className="translation-progress-marker"
        style={{ left: `${markerLeft}%` }}
      />
      {(isHovered || isDragging) && (
        <span className="translation-progress-tooltip">{tooltipContent}</span>
      )}
    </div>
  );
});

const ExtractionProgressBar = memo(function ExtractionProgressBar({
  completedCount,
  totalCount,
  progressLabel,
}: ExtractionProgressBarProps) {
  const clampedCompletedCount = Math.max(
    0,
    Math.min(completedCount, totalCount),
  );
  const fillPercent =
    totalCount > 0 ? (clampedCompletedCount / totalCount) * 100 : 0;

  return (
    <div
      className="translation-progress-bar is-extraction"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={totalCount}
      aria-valuenow={clampedCompletedCount}
      aria-label={progressLabel}
      title={progressLabel}
    >
      <span
        className="translation-progress-fill"
        style={{ width: `${fillPercent}%` }}
      />
    </div>
  );
});

function TranslationPaneFooter({
  translationEnabled,
  extractionProgress,
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning: _bulkActionRunning,
  secondaryActionLabel,
  onSecondaryAction,
  statusMap,
  currentPage,
  onSeekPage,
}: TranslationPaneChromeProps) {
  const showEllipsis =
    progressDetailState === "running" || progressDetailState === "stopping";

  return (
    <div className="translation-pane-footer">
      <div className="translation-pane-footer-progress">
        {extractionProgress ? (
          <ExtractionProgressBar
            completedCount={extractionProgress.completedCount}
            totalCount={extractionProgress.totalCount}
            progressLabel={extractionProgress.progressLabel}
          />
        ) : statusMap &&
        statusMap.length > 0 &&
        onSeekPage &&
        currentPage ? (
          <TranslationProgressBar
            statusMap={statusMap}
            currentPage={currentPage}
            progressLabel={progressLabel ?? "Page navigation"}
            isNeutral={!translationEnabled}
            onSeekPage={onSeekPage}
          />
        ) : progressLabel ? (
          <span className="translation-pane-progress-text">
            {progressLabel}
          </span>
        ) : null}
        {progressDetailLabel ? (
          <span
            className={`translation-pane-progress-detail ${
              progressDetailState ? `is-${progressDetailState}` : ""
            }`}
            aria-live="polite"
          >
            <span>{progressDetailLabel}</span>
            {showEllipsis ? (
              <span
                className="translation-pane-progress-ellipsis"
                aria-hidden="true"
              />
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="translation-pane-footer-actions">
        {secondaryActionLabel && onSecondaryAction ? (
          <button
            className="btn btn-small btn-quiet-action translation-pane-secondary-action"
            type="button"
            onClick={onSecondaryAction}
          >
            {secondaryActionLabel}
          </button>
        ) : null}
        <button
          className="btn btn-small btn-quiet-action"
          type="button"
          onClick={onBulkAction}
          disabled={bulkActionDisabled}
        >
          {bulkActionLabel}
        </button>
      </div>
    </div>
  );
}

function PdfTranslationPane({
  translationEnabled,
  targetLanguage,
  onTranslationPreferenceChange,
  currentPage,
  page,
  pageTranslation,
  loadingMessage,
  setupRequired = false,
  extractionProgress,
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning,
  secondaryActionLabel,
  onSecondaryAction,
  onOpenSettings,
  onRetryPage,
  canRetryPage,
  activePid,
  hoverPid,
  onHoverPid,
  onLocatePid: _onLocatePid,
  selectionTranslation,
  onClearSelectionTranslation,
  statusMap,
  onSeekPage,
  annotations,
  annotationModeEnabled,
  onToggleAnnotationMode,
  onAnnotateSentence,
  onToggleSentenceAnnotation,
  onDeleteAnnotation,
  onSaveNote,
  noteEditingAnnotationId,
  onNoteEditingChange,
  onHighlightSelected,
}: Omit<PdfTranslationPaneProps, "mode">) {
  const { showToast } = useToast();
  const [selectedPids, setSelectedPids] = useState<string[]>([]);
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const annotationByPid = useMemo(() => {
    const map = new Map<string, ResolvedSentenceAnnotation>();
    if (annotations) {
      for (const ann of annotations) {
        if (ann.livePid) {
          map.set(ann.livePid, ann);
        }
      }
    }
    return map;
  }, [annotations]);
  const resolvedLoadingMessage =
    loadingMessage ??
    pageTranslation?.activityMessage ??
    (pageTranslation?.status === "queued"
      ? "Queued for translation..."
      : pageTranslation?.status === "loading"
        ? "Translating this page..."
        : null);
  const translatableParagraphs = getTranslatablePdfParagraphs(page);
  const alignmentState = getPdfAlignmentState(page);
  const showSegmentCards =
    pageTranslation?.status === "done" && translatableParagraphs.length > 0;
  const fallbackAttemptSummary = getFallbackAttemptSummary(pageTranslation);
  const resolvedErrorMessage = pageTranslation?.fallbackTrace?.lastError
    ? getFriendlyProviderError(pageTranslation.fallbackTrace.lastError).message
    : pageTranslation?.error;
  const paragraphSelectionKey = translatableParagraphs
    .map((para) => para.pid)
    .join("|");
  const selectedPidSet = new Set(selectedPids);
  const selectedParagraphs = translatableParagraphs.filter((para) =>
    selectedPidSet.has(para.pid),
  );

  useEffect(() => {
    setSelectedPids([]);
    selectionAnchorIndexRef.current = null;
  }, [currentPage, paragraphSelectionKey]);

  useEffect(() => {
    if (selectedPids.length === 0) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".pdf-segment-card") ||
        target.closest(".translation-pane-selection-overlay")
      ) {
        return;
      }

      setSelectedPids([]);
      selectionAnchorIndexRef.current = null;
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectedPids.length]);

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return;
      }

      void copyTextToClipboard(trimmedText)
        .then(() => {
          showToast({
            message: `${label} copied.`,
            tone: "success",
            durationMs: 1800,
          });
        })
        .catch(() => {
          showToast({
            message: `Couldn't copy ${label.toLowerCase()}.`,
            detail: "Clipboard access is unavailable right now.",
            tone: "error",
          });
        });
    },
    [showToast],
  );
  const handleSelectPid = useCallback(
    (pid: string, event: React.MouseEvent<HTMLElement>) => {
      const clickedIndex = translatableParagraphs.findIndex(
        (para) => para.pid === pid,
      );

      if (clickedIndex < 0) {
        return;
      }

      const isToggle = event.metaKey || event.ctrlKey;
      const isRange = event.shiftKey;
      const anchorIndex = selectionAnchorIndexRef.current ?? clickedIndex;
      let nextSelected: string[];

      if (isRange) {
        const next = new Set<string>(isToggle ? selectedPids : []);
        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);

        if (!isToggle) {
          next.clear();
        }

        for (let index = start; index <= end; index += 1) {
          next.add(translatableParagraphs[index].pid);
        }

        nextSelected = translatableParagraphs
          .map((para) => para.pid)
          .filter((currentPid) => next.has(currentPid));
      } else if (isToggle) {
        const next = new Set<string>(selectedPids);

        selectionAnchorIndexRef.current = clickedIndex;

        if (next.has(pid)) {
          next.delete(pid);
        } else {
          next.add(pid);
        }

        nextSelected = translatableParagraphs
          .map((para) => para.pid)
          .filter((currentPid) => next.has(currentPid));
      } else {
        selectionAnchorIndexRef.current = clickedIndex;
        nextSelected = [pid];
      }

      if (isRange && selectionAnchorIndexRef.current === null) {
        selectionAnchorIndexRef.current = clickedIndex;
      }

      setSelectedPids(nextSelected);
    },
    [selectedPids, translatableParagraphs],
  );
  const handleCopySelected = useCallback(
    (mode: SelectedCopyMode) => {
      const text = buildSelectedCopyText(selectedParagraphs, mode);

      if (!text) {
        showToast({
          message:
            mode === "translation"
              ? "The selected translation is not ready yet."
              : mode === "original"
                ? "There is no original text to copy."
                : "There is nothing ready to copy in this selection.",
          tone: "neutral",
          durationMs: 2200,
        });
        return;
      }

      const label =
        mode === "translation"
          ? "Selected translation"
          : mode === "original"
            ? "Selected original text"
            : "Selected text";

      handleCopyText(text, label);
    },
    [handleCopyText, selectedParagraphs, showToast],
  );

  return (
    <div className="translation-pane page-translation-pane">
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">Translation</span>
            {pageTranslation?.isCached ? (
              <span
                className="page-translation-cached-indicator"
                aria-label="Cached"
                title="Cached"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
            ) : null}
          </div>
        </div>
        {selectedParagraphs.length > 1 ? (
          <div
            className="translation-pane-selection-overlay"
            role="toolbar"
            aria-label="Copy selected passages"
          >
            <span className="pdf-selection-toolbar-label">Copy selected</span>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("translation")}
            >
              translation
            </button>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("original")}
            >
              original
            </button>
            <button
              className="pdf-selection-toolbar-btn"
              type="button"
              onClick={() => handleCopySelected("both")}
            >
              both
            </button>
          </div>
        ) : null}
        <div className="page-translation-actions rail-pane-header-actions">
          <TranslationLanguageControl
            enabled={translationEnabled}
            targetLanguage={targetLanguage}
            onChange={onTranslationPreferenceChange}
          />
          <button
            className={`annotation-mode-btn ${annotationModeEnabled ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              if (selectedPids.length > 0) {
                onHighlightSelected?.(selectedPids);
              } else {
                onToggleAnnotationMode?.();
              }
            }}
            title={
              selectedPids.length > 0 ? "Highlight selected" : "Annotation mode"
            }
            aria-label={
              selectedPids.length > 0 ? "Highlight selected" : "Annotation mode"
            }
          >
            <AnnotateIcon />
          </button>
          <ExpandableIconButton
            type="button"
            onClick={() => onRetryPage(currentPage)}
            disabled={!canRetryPage}
            aria-label="Redo page"
            label="Redo page"
            labelDirection="left"
          >
            <RetryIcon />
          </ExpandableIconButton>
        </div>
      </div>
      <div className="page-translation-scroll">
        <div className="page-translation-shell">
          {pageTranslation?.status === "unavailable" ? (
            <div className="page-translation-empty">
              This page does not contain any usable text yet. Please OCR it
              first, then reopen it in{" "}
              <span className="page-translation-empty-brand">readani</span>.
            </div>
          ) : !translationEnabled ? (
            translatableParagraphs.length > 0 ? (
              <div
                className={`pdf-segment-list ${annotationModeEnabled ? "annotation-mode" : ""}`}
              >
                {translatableParagraphs.map((para, index) => (
                  <PdfSegmentCard
                    key={para.pid}
                    para={para}
                    sentenceIndex={index}
                    translationEnabled={false}
                    isActive={para.pid === activePid || para.pid === hoverPid}
                    isSelected={selectedPidSet.has(para.pid)}
                    onHoverPid={onHoverPid}
                    onSelect={handleSelectPid}
                    onCopyText={handleCopyText}
                    annotation={annotationByPid.get(para.pid)}
                    annotationModeEnabled={annotationModeEnabled}
                    onAnnotateSentence={onAnnotateSentence}
                    onToggleSentenceAnnotation={onToggleSentenceAnnotation}
                    onSaveNote={onSaveNote}
                    noteEditingAnnotationId={noteEditingAnnotationId}
                    onNoteEditingChange={onNoteEditingChange}
                  />
                ))}
              </div>
            ) : (
              <div className="page-translation-empty">
                This page does not contain any usable text yet.
              </div>
            )
          ) : pageTranslation?.status === "setup-required" || setupRequired ? (
            <TranslationSetupPrompt onOpenSettings={onOpenSettings} />
          ) : pageTranslation?.status === "error" ? (
            <div className="page-translation-error">
              {fallbackAttemptSummary ? <p>{fallbackAttemptSummary}</p> : null}
              <p>
                {resolvedErrorMessage || "Translation failed for this page."}
              </p>
              {pageTranslation.errorChecks?.length ? (
                <div className="page-translation-error-checks-wrap">
                  <div className="page-translation-error-checks-label">
                    Possible checks
                  </div>
                  <ul className="page-translation-error-checks">
                    {pageTranslation.errorChecks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                className="btn btn-primary"
                onClick={() => onRetryPage(currentPage)}
              >
                Retry page
              </button>
            </div>
          ) : showSegmentCards ? (
            <div
              className={`pdf-segment-list ${annotationModeEnabled ? "annotation-mode" : ""}`}
            >
              {(() => {
                const needsReviewAnnotations = (annotations ?? []).filter(
                  (a) =>
                    a.page === currentPage &&
                    a.resolvedStatus === "needs-review",
                );
                return needsReviewAnnotations.length > 0 ? (
                  <div className="annotation-review-banner">
                    <WarningIcon />
                    <span>
                      {needsReviewAnnotations.length} annotation
                      {needsReviewAnnotations.length > 1 ? "s" : ""} need review
                      on this page.
                    </span>
                    <div className="annotation-review-banner-actions">
                      {needsReviewAnnotations.map((ann) => (
                        <button
                          key={ann.id}
                          className="annotation-review-action"
                          type="button"
                          onClick={() => onDeleteAnnotation?.(ann.id)}
                        >
                          Delete
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              {alignmentState === "coarse" ? (
                <div className="pdf-segment-alignment-note">
                  Highlights may be approximate on this page.
                </div>
              ) : null}
              {translatableParagraphs.map((para, index) => (
                <PdfSegmentCard
                  key={para.pid}
                  para={para}
                  sentenceIndex={index}
                  translationEnabled={translationEnabled}
                  isActive={para.pid === activePid || para.pid === hoverPid}
                  isSelected={selectedPidSet.has(para.pid)}
                  onHoverPid={onHoverPid}
                  onSelect={handleSelectPid}
                  onCopyText={handleCopyText}
                  annotation={annotationByPid.get(para.pid)}
                  annotationModeEnabled={annotationModeEnabled}
                  onAnnotateSentence={onAnnotateSentence}
                  onToggleSentenceAnnotation={onToggleSentenceAnnotation}
                  onSaveNote={onSaveNote}
                  noteEditingAnnotationId={noteEditingAnnotationId}
                  onNoteEditingChange={onNoteEditingChange}
                />
              ))}
            </div>
          ) : resolvedLoadingMessage ? (
            <div className="page-translation-loading-state">
              <div className="page-translation-spinner" />
              <p className="page-translation-loading-text">
                {resolvedLoadingMessage}
              </p>
            </div>
          ) : (
            <div className="page-translation-empty">
              Translation will appear here when this page is ready.
            </div>
          )}
        </div>
      </div>
      <TranslationPaneFooter
        translationEnabled={translationEnabled}
        extractionProgress={extractionProgress}
        progressLabel={progressLabel}
        progressDetailLabel={progressDetailLabel}
        progressDetailState={progressDetailState}
        bulkActionLabel={bulkActionLabel}
        onBulkAction={onBulkAction}
        bulkActionDisabled={bulkActionDisabled}
        bulkActionRunning={bulkActionRunning}
        secondaryActionLabel={secondaryActionLabel}
        onSecondaryAction={onSecondaryAction}
        statusMap={statusMap}
        currentPage={currentPage}
        onSeekPage={onSeekPage}
      />

      {selectionTranslation ? (
        <Popover.Root
          open={true}
          onOpenChange={(open) => !open && onClearSelectionTranslation()}
        >
          <Popover.Anchor
            style={{
              position: "fixed",
              left: selectionTranslation.position.x,
              top: selectionTranslation.position.y,
            }}
          />
          <Popover.Portal>
            <Popover.Content
              className="selection-popover"
              sideOffset={8}
              onPointerDownOutside={onClearSelectionTranslation}
              onEscapeKeyDown={onClearSelectionTranslation}
            >
              <div className="selection-popover-source">
                {selectionTranslation.text}
              </div>
              <div className="selection-popover-divider" />
              {selectionTranslation.isLoading ? (
                <div className="selection-popover-loading">Translating...</div>
              ) : selectionTranslation.error ? (
                <div className="selection-popover-error">
                  {selectionTranslation.error}
                </div>
              ) : (
                <div className="selection-popover-translation">
                  {selectionTranslation.translation}
                </div>
              )}
              <Popover.Arrow className="word-popover-arrow" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}

function EpubTranslationPane({
  translationEnabled,
  targetLanguage,
  onTranslationPreferenceChange,
  pages,
  currentPage,
  setupRequired = false,
  extractionProgress,
  progressLabel,
  progressDetailLabel,
  progressDetailState,
  bulkActionLabel,
  onBulkAction,
  bulkActionDisabled,
  bulkActionRunning,
  secondaryActionLabel,
  onSecondaryAction,
  onOpenSettings,
  activePid,
  hoverPid,
  onHoverPid,
  onTranslatePid,
  onLocatePid,
  onTranslateText,
  wordTranslation,
  onClearWordTranslation,
  scrollToPage,
  statusMap,
  onSeekPage,
  annotations,
  annotationModeEnabled,
  onToggleAnnotationMode,
  onAnnotateSentence,
  onToggleSentenceAnnotation,
  onDeleteAnnotation,
  onSaveNote,
  noteEditingAnnotationId,
  onNoteEditingChange,
}: Omit<EpubTranslationPaneProps, "mode">) {
  const { showToast } = useToast();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const lastHandledScrollPageRef = useRef<number | null>(null);
  const isServerRender = typeof window === "undefined";

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return;
      }

      void copyTextToClipboard(trimmedText)
        .then(() => {
          showToast({
            message: `${label} copied.`,
            tone: "success",
            durationMs: 1800,
          });
        })
        .catch(() => {
          showToast({
            message: `Couldn't copy ${label.toLowerCase()}.`,
            detail: "Clipboard access is unavailable right now.",
            tone: "error",
          });
        });
    },
    [showToast],
  );

  useEffect(() => {
    if (!scrollToPage) {
      lastHandledScrollPageRef.current = null;
      return;
    }
    if (lastHandledScrollPageRef.current === scrollToPage || pages.length === 0)
      return;
    const index = pages.findIndex((page) => page.page === scrollToPage);
    if (index >= 0) {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: "start",
        behavior: "smooth",
      });
      lastHandledScrollPageRef.current = scrollToPage;
    }
  }, [pages, scrollToPage]);

  const renderPage = useCallback(
    (page: PageDoc) => (
      <EpubPageTranslation
        page={page}
        translationEnabled={translationEnabled}
        activePid={activePid}
        hoverPid={hoverPid}
        onHoverPid={onHoverPid}
        onTranslatePid={onTranslatePid}
        onLocatePid={onLocatePid}
        onTranslateText={onTranslateText}
        onCopyText={handleCopyText}
        annotations={annotations?.filter(
          (annotation) => annotation.page === page.page,
        )}
        annotationModeEnabled={annotationModeEnabled}
        onAnnotateSentence={onAnnotateSentence}
        onToggleSentenceAnnotation={onToggleSentenceAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
        onSaveNote={onSaveNote}
        noteEditingAnnotationId={noteEditingAnnotationId}
        onNoteEditingChange={onNoteEditingChange}
      />
    ),
    [
      activePid,
      annotationModeEnabled,
      annotations,
      handleCopyText,
      hoverPid,
      noteEditingAnnotationId,
      onAnnotateSentence,
      onToggleSentenceAnnotation,
      onDeleteAnnotation,
      onHoverPid,
      onLocatePid,
      onNoteEditingChange,
      onSaveNote,
      onTranslatePid,
      onTranslateText,
      translationEnabled,
    ],
  );

  return (
    <div className="translation-pane">
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">Translation</span>
          </div>
        </div>
        <div className="page-translation-actions rail-pane-header-actions">
          <TranslationLanguageControl
            enabled={translationEnabled}
            targetLanguage={targetLanguage}
            onChange={onTranslationPreferenceChange}
          />
          <button
            className={`annotation-mode-btn ${annotationModeEnabled ? "is-active" : ""}`}
            type="button"
            onClick={() => onToggleAnnotationMode?.()}
            title="Annotation mode"
            aria-label="Annotation mode"
          >
            <AnnotateIcon />
          </button>
        </div>
      </div>
      {setupRequired && translationEnabled ? (
        <TranslationSetupPrompt onOpenSettings={onOpenSettings} />
      ) : null}
      {isServerRender ? (
        <div className="translation-pane-epub-list">
          {pages.map((page) => (
            <div key={page.page}>{renderPage(page)}</div>
          ))}
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          style={{ flex: 1, minHeight: 0 }}
          totalCount={pages.length}
          itemContent={(index) => renderPage(pages[index])}
        />
      )}
      <TranslationPaneFooter
        translationEnabled={translationEnabled}
        extractionProgress={extractionProgress}
        progressLabel={progressLabel}
        progressDetailLabel={progressDetailLabel}
        progressDetailState={progressDetailState}
        bulkActionLabel={bulkActionLabel}
        onBulkAction={onBulkAction}
        bulkActionDisabled={bulkActionDisabled}
        bulkActionRunning={bulkActionRunning}
        secondaryActionLabel={secondaryActionLabel}
        onSecondaryAction={onSecondaryAction}
        statusMap={statusMap}
        currentPage={currentPage}
        onSeekPage={onSeekPage}
      />
      {wordTranslation ? (
        <Popover.Root
          open={true}
          onOpenChange={(open) => !open && onClearWordTranslation()}
        >
          <Popover.Anchor
            style={{
              position: "fixed",
              left: wordTranslation.position.x,
              top: wordTranslation.position.y,
            }}
          />
          <Popover.Portal>
            <Popover.Content
              className="word-popover"
              sideOffset={8}
              onPointerDownOutside={() => onClearWordTranslation()}
              onEscapeKeyDown={() => onClearWordTranslation()}
            >
              <div className="word-popover-header">
                <div className="word-popover-word">{wordTranslation.word}</div>
              </div>
              {wordTranslation.phonetic ? (
                <div className="word-popover-phonetic">
                  <span className="phonetic-label">UK</span>
                  <span className="phonetic-text">
                    {wordTranslation.phonetic}
                  </span>
                </div>
              ) : null}
              {wordTranslation.isLoading ? (
                <div className="word-popover-loading">Looking up...</div>
              ) : (
                <div className="word-popover-definitions">
                  {wordTranslation.definitions.map((definition, index) => (
                    <div key={index} className="word-definition">
                      {definition.pos ? (
                        <span className="word-pos">{definition.pos}</span>
                      ) : null}
                      <span className="word-meanings">
                        {definition.meanings}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Popover.Arrow className="word-popover-arrow" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
    </div>
  );
}

export function TranslationPane(props: TranslationPaneProps) {
  if (props.mode === "pdf") {
    return (
      <PdfTranslationPane
        translationEnabled={props.translationEnabled}
        targetLanguage={props.targetLanguage}
        onTranslationPreferenceChange={props.onTranslationPreferenceChange}
        currentPage={props.currentPage}
        page={props.page}
        pageTranslation={props.pageTranslation}
        loadingMessage={props.loadingMessage}
        setupRequired={props.setupRequired}
        extractionProgress={props.extractionProgress}
        progressLabel={props.progressLabel}
        progressDetailLabel={props.progressDetailLabel}
        progressDetailState={props.progressDetailState}
        bulkActionLabel={props.bulkActionLabel}
        onBulkAction={props.onBulkAction}
        bulkActionDisabled={props.bulkActionDisabled}
        bulkActionRunning={props.bulkActionRunning}
        secondaryActionLabel={props.secondaryActionLabel}
        onSecondaryAction={props.onSecondaryAction}
        onOpenSettings={props.onOpenSettings}
        onRetryPage={props.onRetryPage}
        canRetryPage={props.canRetryPage}
        activePid={props.activePid}
        hoverPid={props.hoverPid}
        onHoverPid={props.onHoverPid}
        onLocatePid={props.onLocatePid}
        selectionTranslation={props.selectionTranslation}
        onClearSelectionTranslation={props.onClearSelectionTranslation}
        statusMap={props.statusMap}
        onSeekPage={props.onSeekPage}
        annotations={props.annotations}
        annotationModeEnabled={props.annotationModeEnabled}
        onToggleAnnotationMode={props.onToggleAnnotationMode}
        onAnnotateSentence={props.onAnnotateSentence}
        onToggleSentenceAnnotation={props.onToggleSentenceAnnotation}
        onDeleteAnnotation={props.onDeleteAnnotation}
        onSaveNote={props.onSaveNote}
        noteEditingAnnotationId={props.noteEditingAnnotationId}
        onNoteEditingChange={props.onNoteEditingChange}
        onHighlightSelected={props.onHighlightSelected}
      />
    );
  }

  return (
    <EpubTranslationPane
      translationEnabled={props.translationEnabled}
      targetLanguage={props.targetLanguage}
      onTranslationPreferenceChange={props.onTranslationPreferenceChange}
      pages={props.pages}
      currentPage={props.currentPage}
      setupRequired={props.setupRequired}
      extractionProgress={props.extractionProgress}
      progressLabel={props.progressLabel}
      progressDetailLabel={props.progressDetailLabel}
      progressDetailState={props.progressDetailState}
      bulkActionLabel={props.bulkActionLabel}
      onBulkAction={props.onBulkAction}
      bulkActionDisabled={props.bulkActionDisabled}
      bulkActionRunning={props.bulkActionRunning}
      secondaryActionLabel={props.secondaryActionLabel}
      onSecondaryAction={props.onSecondaryAction}
      onOpenSettings={props.onOpenSettings}
      activePid={props.activePid}
      hoverPid={props.hoverPid}
      onHoverPid={props.onHoverPid}
      onTranslatePid={props.onTranslatePid}
      onLocatePid={props.onLocatePid}
      onTranslateText={props.onTranslateText}
      wordTranslation={props.wordTranslation}
      onClearWordTranslation={props.onClearWordTranslation}
      scrollToPage={props.scrollToPage}
      statusMap={props.statusMap}
      onSeekPage={props.onSeekPage}
      annotations={props.annotations}
      annotationModeEnabled={props.annotationModeEnabled}
      onToggleAnnotationMode={props.onToggleAnnotationMode}
      onAnnotateSentence={props.onAnnotateSentence}
      onToggleSentenceAnnotation={props.onToggleSentenceAnnotation}
      onDeleteAnnotation={props.onDeleteAnnotation}
      onSaveNote={props.onSaveNote}
      noteEditingAnnotationId={props.noteEditingAnnotationId}
      onNoteEditingChange={props.onNoteEditingChange}
    />
  );
}
