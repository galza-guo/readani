import { ArrowClockwise, Check, Copy, CrosshairSimple, DotsThree, Highlighter, Minus, Plus, Translate, Warning } from "@phosphor-icons/react";
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
  getLanguageSelfLabel,
} from "../lib/languageOptions";
import {
  getPdfAlignmentState,
  getTranslatablePdfParagraphs,
} from "../lib/pdfSegments";
import { getFriendlyProviderError } from "../lib/providerErrors";
import type { PageProgressStatus } from "../lib/pageTranslationScheduler";
import { t } from "../lib/i18n";
import { useToast } from "./toast/ToastProvider";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import { LanguageCombobox } from "./settings/LanguageCombobox";
import type {
  PageDoc,
  PageTranslationState,
  Paragraph,
  SelectionTranslation,
  TargetLanguage,
  TranslationPreset,
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

type TranslationPresetControlProps = {
  presets: TranslationPreset[];
  activePresetId?: string | null;
  onActivatePreset?: (presetId: string) => void | Promise<void>;
};

type PdfTranslationPaneProps = {
  mode: "pdf";
  translationEnabled: boolean;
  targetLanguage: TargetLanguage;
  onTranslationPreferenceChange: TranslationLanguageControlProps["onChange"];
  providerPresets?: TranslationPreset[];
  activeProviderPresetId?: string | null;
  onActiveProviderPresetChange?: (presetId: string) => void | Promise<void>;
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
  providerPresets?: TranslationPreset[];
  activeProviderPresetId?: string | null;
  onActiveProviderPresetChange?: (presetId: string) => void | Promise<void>;
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

const TRANSLATION_TEXT_SIZE_LEVELS = [0.9, 1, 1.1, 1.2, 1.35] as const;

function getFallbackAttemptSummary(pageTranslation?: PageTranslationState) {
  const attemptCount = pageTranslation?.fallbackTrace?.attemptCount ?? 0;

  if (attemptCount <= 1) {
    return undefined;
  }

  return t("translation.triedPresets", { count: String(attemptCount) });
}

function TranslateIcon() {
  return <Translate size={16} weight="regular" />;
}

function LocateIcon() {
  return <CrosshairSimple size={16} weight="regular" />;
}

function RetryIcon() {
  return <ArrowClockwise size={16} weight="regular" />;
}

function CopyIcon() {
  return <Copy size={16} weight="regular" />;
}

function AnnotateIcon() {
  return <Highlighter size={16} weight="regular" />;
}

function CheckSmallIcon() {
  return <Check size={12} weight="bold" />;
}

function MoreIcon() {
  return <DotsThree size={16} weight="bold" />;
}

function MinusSmallIcon() {
  return <Minus size={14} weight="bold" aria-hidden="true" />;
}

function PlusSmallIcon() {
  return <Plus size={14} weight="bold" aria-hidden="true" />;
}

function getPresetSummary(preset: TranslationPreset) {
  const model = preset.model.trim();

  return model ? `${preset.label} · ${model}` : preset.label;
}

function TranslationLanguageControl({
  enabled,
  targetLanguage,
  onChange,
}: TranslationLanguageControlProps) {
  const label = enabled ? getLanguageSelfLabel(targetLanguage) : t("translation.off");

  return (
    <LanguageCombobox
      contentAlign="end"
      contentClassName="translation-language-content"
      contentSideOffset={8}
      getOptionLabel={getLanguageSelfLabel}
      getTriggerLabel={() => label}
      hideTriggerChevron={true}
      id="translation-language-select"
      leadingContent={({ close }) => (
        <>
          <button
            className={`language-combobox-option translation-language-off-option ${
              !enabled ? "is-selected" : ""
            }`}
            onClick={() => {
              onChange({ enabled: false, targetLanguage });
              close();
            }}
            type="button"
          >
            <span>{t("translation.off")}</span>
            {!enabled ? <CheckSmallIcon /> : null}
          </button>
          <div className="translation-language-divider" />
        </>
      )}
      onChange={(language) => {
        onChange({ enabled: true, targetLanguage: language });
      }}
      selectedValue={enabled ? targetLanguage : null}
      triggerAriaLabel={t("translation.changeLanguage")}
      triggerClassName="translation-language-trigger"
      triggerTitle={t("translation.changeLanguage")}
      value={targetLanguage}
    />
  );
}

function TranslationPresetControl({
  presets,
  activePresetId,
  onActivatePreset,
}: TranslationPresetControlProps) {
  const [open, setOpen] = useState(false);
  const activePreset =
    presets.find((preset) => preset.id === activePresetId) ?? presets[0];
  const canSwitch = Boolean(onActivatePreset && presets.length > 1);

  if (!activePreset) {
    return null;
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="translation-pane-menu-item translation-pane-preset-trigger"
          type="button"
          disabled={!canSwitch}
          aria-label="Switch provider or model"
          aria-expanded={open}
          title={
            canSwitch
              ? "Switch provider or model"
              : "Only one provider/model is configured"
          }
        >
          <span className="translation-pane-menu-item-text">
            {getPresetSummary(activePreset)}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="translation-pane-submenu-content"
          sideOffset={8}
        >
          {presets.map((preset) => {
            const isSelected = preset.id === activePreset.id;

            return (
              <button
                key={preset.id}
                className={`language-combobox-option ${
                  isSelected ? "is-selected" : ""
                }`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isSelected) {
                    void onActivatePreset?.(preset.id);
                  }
                }}
              >
                <span>{getPresetSummary(preset)}</span>
                {isSelected ? <CheckSmallIcon /> : null}
              </button>
            );
          })}
          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TranslationPaneHeaderMenu({
  translationEnabled,
  targetLanguage,
  onTranslationPreferenceChange,
  providerPresets = [],
  activeProviderPresetId,
  onActiveProviderPresetChange,
  textSizeIndex,
  onTextSizeIndexChange,
  onRedoPage,
  redoPageDisabled,
}: {
  translationEnabled: boolean;
  targetLanguage: TargetLanguage;
  onTranslationPreferenceChange: TranslationLanguageControlProps["onChange"];
  providerPresets?: TranslationPreset[];
  activeProviderPresetId?: string | null;
  onActiveProviderPresetChange?: (presetId: string) => void | Promise<void>;
  textSizeIndex: number;
  onTextSizeIndexChange: (index: number) => void;
  onRedoPage?: () => void;
  redoPageDisabled?: boolean;
}) {
  const textSizePercent = Math.round(
    TRANSLATION_TEXT_SIZE_LEVELS[textSizeIndex] * 100,
  );
  const canShrink = textSizeIndex > 0;
  const canEnlarge = textSizeIndex < TRANSLATION_TEXT_SIZE_LEVELS.length - 1;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild>
        <ExpandableIconButton
          className="translation-pane-menu-trigger"
          aria-label={t("translation.options")}
          label={t("translation.options")}
          labelDirection="left"
          title={t("translation.options")}
          expanded={menuOpen}
        >
          <MoreIcon />
        </ExpandableIconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="settings-help-popover translation-pane-menu-content"
          sideOffset={8}
        >
          <div className="translation-pane-menu-row is-end-aligned">
            <span className="translation-pane-menu-label">
              {t("settings.general.translateTo")}
            </span>
            <TranslationLanguageControl
              enabled={translationEnabled}
              targetLanguage={targetLanguage}
              onChange={onTranslationPreferenceChange}
            />
          </div>
          <div className="translation-pane-menu-row is-end-aligned">
            <div
              className="translation-text-size-control"
              aria-label={t("translation.textSize")}
            >
              <span className="translation-text-size-readout">
                {textSizePercent}%
              </span>
              <button
                className="translation-text-size-btn"
                type="button"
                onClick={() => onTextSizeIndexChange(textSizeIndex - 1)}
                disabled={!canShrink}
                aria-label={t("translation.shrinkText")}
                title={t("translation.shrinkText")}
              >
                <MinusSmallIcon />
              </button>
              <button
                className="translation-text-size-btn"
                type="button"
                onClick={() => onTextSizeIndexChange(textSizeIndex + 1)}
                disabled={!canEnlarge}
                aria-label={t("translation.enlargeText")}
                title={t("translation.enlargeText")}
              >
                <PlusSmallIcon />
              </button>
            </div>
          </div>
          <TranslationPresetControl
            presets={providerPresets}
            activePresetId={activeProviderPresetId}
            onActivatePreset={onActiveProviderPresetChange}
          />
          {onRedoPage ? (
            <button
              className="translation-pane-menu-item translation-pane-menu-item-end-aligned"
              type="button"
              onClick={onRedoPage}
              disabled={redoPageDisabled}
            >
              <span className="translation-pane-menu-item-text">{t("translation.redoPage")}</span>
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function WarningIcon() {
  return <Warning size={14} weight="fill" />;
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

  throw new Error(t("translation.clipboardUnavailable"));
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
      <p className="translation-setup-title">{t("translation.translationNotSetUp")}</p>
      <button
        className="btn btn-quiet-action"
        onClick={onOpenSettings}
        type="button"
      >
        {t("translation.openSettingsToAddProvider")}
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
          {hasNote ? annotation.note : t("translation.comment")}
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
        placeholder={t("translation.comment")}
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
          title={t("translation.saveComment")}
          aria-label={t("translation.saveComment")}
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
  const annotateLabel = isAnnotated ? t("translation.removeHighlight") : t("translation.highlightSentence");

  let translationText = para.translation?.trim() ?? "";
  if (translationEnabled) {
    if (para.status === "loading") {
      translationText = t("translation.translating");
    } else if (para.status === "error") {
      translationText = t("translation.translationFailedForPage");
    } else if (!translationText) {
      translationText = t("translation.translationsWillAppear");
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
                title={t("translation.copyTranslation")}
                aria-label={t("translation.copyTranslation")}
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
                  title={t("translation.copyOriginalText")}
                  aria-label={t("translation.copyOriginalText")}
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
  const annotateLabel = isAnnotated ? t("translation.removeHighlight") : t("translation.highlightSentence");
  const translationText =
    para.status === "loading"
      ? t("translation.translating")
      : para.status === "error"
        ? t("translation.translationFailed")
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
            title={t("translation.copyOriginalText")}
            aria-label={t("translation.copyOriginalText")}
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
            title={t("translation.locateInDocument")}
            aria-label={t("translation.locateInDocument")}
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
              title={t("translation.translateParagraph")}
              aria-label={t("translation.translateParagraph")}
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
            <span>{t("translation.translationFailed")}</span>
            <button
              className="retry-btn"
              onClick={(event) => {
                event.stopPropagation();
                onTranslatePid(para.pid);
              }}
              title={t("common.retry")}
            >
              <RetryIcon />
              <span>{t("common.retry")}</span>
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
              title={t("translation.copyTranslation")}
              aria-label={t("translation.copyTranslation")}
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
  const pageTitle = page.title || t("annotations.page", { page: String(page.page) });
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
            {t("translation.annotationNeedsReview", {
              count: String(needsReviewAnnotations.length),
              plural: needsReviewAnnotations.length > 1 ? "s" : "",
            })}
          </span>
          <div className="annotation-review-banner-actions">
            {needsReviewAnnotations.map((ann) => (
              <button
                key={ann.id}
                className="annotation-review-action"
                type="button"
                onClick={() => onDeleteAnnotation?.(ann.id)}
              >
                {t("translation.annotationDelete")}
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
  providerPresets,
  activeProviderPresetId,
  onActiveProviderPresetChange,
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
  const [textSizeIndex, setTextSizeIndex] = useState(1);
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const paneStyle = {
    "--translation-text-scale": TRANSLATION_TEXT_SIZE_LEVELS[textSizeIndex],
  } as CSSProperties;
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
            message: t("toast.copied", { label }),
            tone: "success",
            durationMs: 1800,
          });
        })
        .catch(() => {
          showToast({
            message: t("toast.couldNotCopy", { label: label.toLowerCase() }),
            detail: t("toast.clipboardUnavailable"),
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
              ? t("translation.selectionNotReady")
              : mode === "original"
                ? t("translation.noOriginalText")
                : t("translation.nothingReadyToCopy"),
          tone: "neutral",
          durationMs: 2200,
        });
        return;
      }

      const label =
        mode === "translation"
          ? t("translation.selectedTranslation")
          : mode === "original"
            ? t("translation.selectedOriginalText")
            : t("translation.selectedText");

      handleCopyText(text, label);
    },
    [handleCopyText, selectedParagraphs, showToast],
  );

  return (
    <div className="translation-pane page-translation-pane" style={paneStyle}>
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">{t("reader.panelTranslate")}</span>
            {pageTranslation?.isCached ? (
              <span
                className="page-translation-cached-indicator"
                aria-label={t("translation.cached")}
                title={t("translation.cached")}
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
            aria-label={t("translation.copySelectedPassages")}
          >
            <span className="pdf-selection-toolbar-label">{t("translation.copySelected")}</span>
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
          <ExpandableIconButton
            className={`annotation-mode-btn ${annotationModeEnabled ? "is-active" : ""}`}
            onClick={() => {
              if (selectedPids.length > 0) {
                onHighlightSelected?.(selectedPids);
              } else {
                onToggleAnnotationMode?.();
              }
            }}
            title={
              selectedPids.length > 0 ? "Highlight selected" : t("translation.annotationMode")
            }
            aria-label={
              selectedPids.length > 0 ? "Highlight selected" : t("translation.annotationMode")
            }
            label={
              selectedPids.length > 0 ? "Highlight selected" : t("translation.annotationMode")
            }
            labelDirection="left"
            expanded={annotationModeEnabled || selectedPids.length > 0}
          >
            <AnnotateIcon />
          </ExpandableIconButton>
          <TranslationPaneHeaderMenu
            translationEnabled={translationEnabled}
            targetLanguage={targetLanguage}
            onTranslationPreferenceChange={onTranslationPreferenceChange}
            providerPresets={providerPresets}
            activeProviderPresetId={activeProviderPresetId}
            onActiveProviderPresetChange={onActiveProviderPresetChange}
            textSizeIndex={textSizeIndex}
            onTextSizeIndexChange={setTextSizeIndex}
            onRedoPage={() => onRetryPage(currentPage)}
            redoPageDisabled={!canRetryPage}
          />
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
                {t("translation.noUsableText")}
              </div>
            )
          ) : pageTranslation?.status === "setup-required" || setupRequired ? (
            <TranslationSetupPrompt onOpenSettings={onOpenSettings} />
          ) : pageTranslation?.status === "error" ? (
            <div className="page-translation-error">
              {fallbackAttemptSummary ? <p>{fallbackAttemptSummary}</p> : null}
              <p>
                {resolvedErrorMessage || t("translation.translationFailedForPage")}
              </p>
              {pageTranslation.errorChecks?.length ? (
                <div className="page-translation-error-checks-wrap">
                  <div className="page-translation-error-checks-label">
                    {t("translation.possibleChecks")}
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
                {t("translation.retryPage")}
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
                      {t("translation.annotationNeedsReview", {
                        count: String(needsReviewAnnotations.length),
                        plural: needsReviewAnnotations.length > 1 ? "s" : "",
                      })}
                    </span>
                    <div className="annotation-review-banner-actions">
                      {needsReviewAnnotations.map((ann) => (
                        <button
                          key={ann.id}
                          className="annotation-review-action"
                          type="button"
                          onClick={() => onDeleteAnnotation?.(ann.id)}
                        >
                          {t("translation.annotationDelete")}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              {alignmentState === "coarse" ? (
                <div className="pdf-segment-alignment-note">
                  {t("translation.highlightsMayBeApproximate")}
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
              {t("translation.translationsWillAppear")}
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
                <div className="selection-popover-loading">{t("translation.translating")}</div>
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
  providerPresets,
  activeProviderPresetId,
  onActiveProviderPresetChange,
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
  const [textSizeIndex, setTextSizeIndex] = useState(1);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const lastHandledScrollPageRef = useRef<number | null>(null);
  const isServerRender = typeof window === "undefined";
  const paneStyle = {
    "--translation-text-scale": TRANSLATION_TEXT_SIZE_LEVELS[textSizeIndex],
  } as CSSProperties;

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        return;
      }

      void copyTextToClipboard(trimmedText)
        .then(() => {
          showToast({
            message: t("toast.copied", { label }),
            tone: "success",
            durationMs: 1800,
          });
        })
        .catch(() => {
          showToast({
            message: t("toast.couldNotCopy", { label: label.toLowerCase() }),
            detail: t("toast.clipboardUnavailable"),
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
    <div className="translation-pane" style={paneStyle}>
      <div className="translation-pane-header rail-pane-header">
        <div className="rail-pane-header-copy">
          <div className="rail-pane-title-row">
            <span className="rail-pane-title">{t("reader.panelTranslate")}</span>
          </div>
        </div>
        <div className="page-translation-actions rail-pane-header-actions">
          <ExpandableIconButton
            className={`annotation-mode-btn ${annotationModeEnabled ? "is-active" : ""}`}
            onClick={() => onToggleAnnotationMode?.()}
            title={t("translation.annotationMode")}
            aria-label={t("translation.annotationMode")}
            label={t("translation.annotationMode")}
            labelDirection="left"
            expanded={annotationModeEnabled}
          >
            <AnnotateIcon />
          </ExpandableIconButton>
          <TranslationPaneHeaderMenu
            translationEnabled={translationEnabled}
            targetLanguage={targetLanguage}
            onTranslationPreferenceChange={onTranslationPreferenceChange}
            providerPresets={providerPresets}
            activeProviderPresetId={activeProviderPresetId}
            onActiveProviderPresetChange={onActiveProviderPresetChange}
            textSizeIndex={textSizeIndex}
            onTextSizeIndexChange={setTextSizeIndex}
          />
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
                  <span className="phonetic-label">{t("translation.phoneticUK")}</span>
                  <span className="phonetic-text">
                    {wordTranslation.phonetic}
                  </span>
                </div>
              ) : null}
              {wordTranslation.isLoading ? (
                <div className="word-popover-loading">{t("translation.lookingUp")}</div>
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
