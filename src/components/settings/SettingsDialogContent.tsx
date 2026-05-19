import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CaretDown, CheckCircle, CheckFat, Flask, Gauge, HandArrowDown, Plugs, PlugsConnected, Plus, Question, Trash, TrashSimple } from "@phosphor-icons/react";
import * as Label from "@radix-ui/react-label";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { ExpandableIconButton } from "../reader/ExpandableIconButton";
import { LanguageCombobox } from "./LanguageCombobox";
import { canListModels } from "../../lib/providerForm";
import {
  buildAppLanguagePickerSections,
  buildTranslateToLanguagePickerSections,
  detectCodingPlanKey,
  getDefaultBaseUrlForProvider,
  getDefaultModelForProvider,
  getPresetApiKeyFieldState,
  getPresetValidationState,
  getProviderOptionLabel,
  normalizeProviderReasoningMode,
  normalizeAutoTranslateNextPages,
  PRESET_PROVIDER_OPTIONS,
  providerUsesApiKey,
  providerUsesCodingPlan,
  providerUsesEditableBaseUrl,
  providerUsesReasoning,
  providerUsesThinking,
} from "../../lib/appSettings";
import {
  getLanguageLabel,
  getLanguageSelfLabel,
  SUPPORTED_LANGUAGE_COUNT,
} from "../../lib/languageOptions";
import { hasLocaleMessage, t } from "../../lib/i18n";
import { ProviderBrandIcon } from "./providerIcons";
import type {
  ProviderReasoningMode,
  PresetSaveStatus,
  PresetTestResult,
  TranslationCacheSummary,
  TranslationPreset,
  TranslationProviderKind,
  TranslationSettings,
} from "../../types";

export type SettingsDialogContentProps = {
  settings: TranslationSettings;
  liveActivePresetId: string;
  sessionFallbackPresetId?: string | null;
  editingPresetId: string | null;
  editingPreset?: TranslationPreset;
  apiKeyEditingPresetId: string | null;
  presetApiKeyDrafts: Record<string, string>;
  presetStatuses: Record<string, PresetTestResult | undefined>;
  presetSaveStatusById: Record<string, PresetSaveStatus>;
  presetTestRunningId: string | null;
  presetModelsLoadingById: Record<string, boolean>;
  testAllRunning: boolean;
  testAllDisabled?: boolean;
  presetModels: Record<string, string[]>;
  presetModelMessages: Record<string, string | undefined>;
  translationCacheSummary: TranslationCacheSummary | null;
  translationCacheLoading?: boolean;
  translationCacheActionTarget?: string | "all" | null;
  onSettingsChange: (settings: TranslationSettings) => void | Promise<void>;
  onAddPreset: (providerKind: TranslationProviderKind) => string;
  onDeletePreset: (presetId: string) => void | Promise<void>;
  onDeleteAllTranslationCache: () => void | Promise<void>;
  onDeleteCachedBook: (docId: string, title: string, languageCode: string) => void | Promise<void>;
  onEditingPresetChange: (presetId: string | null) => void | Promise<void>;
  onActivatePreset: (presetId: string) => void | Promise<void>;
  onPresetChange: (preset: TranslationPreset) => void;
  onPresetApiKeyInputChange: (presetId: string, apiKey: string) => void;
  onPresetApiKeyFocus: (presetId: string | null) => void;
  onPresetApiKeyBlur: (presetId: string) => void | Promise<void>;
  onRetryPresetSave: (presetId: string) => void | Promise<void>;
  onFetchPresetModels: (presetId: string, options?: { auto?: boolean }) => void | Promise<void>;
  onTestPreset: (presetId: string) => void | Promise<void>;
  onTestAllPresets: () => void | Promise<void>;
};

type SavedIndicatorPhase = "visible" | "fading";

const AUTO_TRANSLATE_NEXT_PAGE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
];

const DEEPSEEK_THINKING_OPTIONS: Array<{
  value: ProviderReasoningMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

const THINKING_TOGGLE_OPTIONS: Array<{
  value: ProviderReasoningMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "high", label: "On" },
];

const STANDARD_REASONING_OPTIONS: Array<{
  value: ProviderReasoningMode;
  label: string;
}> = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function getAutoTranslateNextPageLabel(value: number) {
  const option = AUTO_TRANSLATE_NEXT_PAGE_OPTIONS.find((option) => option.value === value);
  if (option?.value === 0) return t("common.off");
  return option?.label ?? String(value);
}

function getCacheLanguageLabel(languageCode: string) {
  if (languageCode.startsWith("custom:")) {
    return languageCode
      .slice("custom:".length)
      .split("-")
      .filter(Boolean)
      .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
      .join(" ");
  }

  const label = getLanguageLabel(languageCode) ?? languageCode;
  return getLanguageSelfLabel({ code: languageCode, label });
}

function ProviderIcon({
  providerKind,
  className,
}: {
  providerKind: TranslationProviderKind;
  className?: string;
}) {
  return (
    <ProviderBrandIcon
      className={className}
      providerKind={providerKind}
    />
  );
}

type ModelComboboxProps = {
  id: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  value: string;
};

function ModelCombobox({
  id,
  onChange,
  options,
  placeholder,
  value,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredOptions = useMemo(() => {
    const uniqueOptions = Array.from(new Set(options));
    const query = value.trim().toLowerCase();

    if (!query) {
      return uniqueOptions;
    }

    return uniqueOptions.filter((model) => model.toLowerCase().includes(query));
  }, [options, value]);

  useEffect(() => {
    if (!open) {
      optionRefs.current = [];
      return;
    }

    setHighlightedIndex(0);
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  const handleSelect = (model: string) => {
    onChange(model);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      if (filteredOptions.length === 0) {
        return;
      }

      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      if (filteredOptions.length === 0) {
        return;
      }

      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      handleSelect(filteredOptions[highlightedIndex]);
    }
  };

  const showPanel = open && options.length > 0;

  return (
    <div className={`model-combobox ${showPanel ? "is-open" : ""}`} ref={rootRef}>
      <input
        autoComplete="off"
        className="input model-combobox-input"
        id={id}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!rootRef.current?.contains(nextTarget)) {
            setOpen(false);
          }
        }}
        onChange={(event) => {
          onChange(event.target.value);
          if (options.length > 0) {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (options.length > 0) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="text"
        value={value}
      />

      {showPanel ? (
        <div className="model-combobox-panel" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((model, index) => {
              const isSelected = model === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={model}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  className={`model-combobox-option ${isHighlighted ? "is-highlighted" : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => handleSelect(model)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>{model}</span>
                  {isSelected ? <CheckCircle size={16} weight="fill" /> : null}
                </button>
              );
            })
          ) : (
            <div className="model-combobox-empty">{t("provider.noMatchingModels")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getPresetRowStatusCopy(
  status: PresetSaveStatus | undefined,
  savedIndicatorPhase?: SavedIndicatorPhase,
) {
  if (status?.state === "dirty" || status?.state === "saving") {
    return {
      className: "settings-preset-status is-progress",
      label: t("common.saving"),
    };
  }

  if (status?.state === "error") {
    return {
      className: "settings-preset-status is-error",
      label: t("common.saveFailed"),
    };
  }

  if (savedIndicatorPhase) {
    return {
      className: `settings-preset-status is-ok ${
        savedIndicatorPhase === "fading" ? "is-fading" : ""
      }`,
      label: t("common.saved"),
    };
  }

  return null;
}

function getModelLoadHint(preset: TranslationPreset, apiKeyInput: string) {
  if (providerUsesEditableBaseUrl(preset.providerKind) && !preset.baseUrl?.trim()) {
    return providerUsesApiKey(preset.providerKind)
      ? t("provider.addBaseUrlAndApiKeyToLoad")
      : t("provider.addBaseUrlToLoad");
  }

  if (providerUsesApiKey(preset.providerKind) && !apiKeyInput.trim() && !preset.apiKeyConfigured) {
    return t("provider.addApiKeyToLoad");
  }

  return t("provider.modelsWillLoadAutomatically");
}

function formatCacheSize(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded =
    value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${rounded} ${units[unitIndex]}`;
}

export function SettingsDialogContent({
  settings,
  liveActivePresetId,
  sessionFallbackPresetId = null,
  editingPresetId,
  editingPreset,
  apiKeyEditingPresetId,
  presetApiKeyDrafts,
  presetStatuses,
  presetSaveStatusById,
  presetTestRunningId,
  presetModelsLoadingById,
  testAllRunning,
  testAllDisabled = false,
  presetModels,
  presetModelMessages,
  translationCacheSummary,
  translationCacheLoading = false,
  translationCacheActionTarget = null,
  onSettingsChange,
  onAddPreset,
  onDeletePreset,
  onDeleteAllTranslationCache,
  onDeleteCachedBook,
  onEditingPresetChange,
  onActivatePreset,
  onPresetChange,
  onPresetApiKeyInputChange,
  onPresetApiKeyFocus,
  onPresetApiKeyBlur,
  onRetryPresetSave,
  onFetchPresetModels,
  onTestPreset,
  onTestAllPresets,
}: SettingsDialogContentProps) {
  const appLanguageSearchPlaceholder = hasLocaleMessage("languages.searchSupported")
    ? t("languages.searchSupported", {
        count: String(SUPPORTED_LANGUAGE_COUNT),
      })
    : t("languages.search");
  const translateToSearchPlaceholder = hasLocaleMessage("languages.searchOrCustom")
    ? t("languages.searchOrCustom")
    : t("languages.search");
  const [pendingDeletePresetId, setPendingDeletePresetId] = useState<string | null>(null);
  const [pendingDeleteCacheBook, setPendingDeleteCacheBook] = useState<{
    docId: string;
    title: string;
    languageCode: string;
  } | null>(null);
  const [pendingDeleteAllCache, setPendingDeleteAllCache] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [savedIndicatorPhaseById, setSavedIndicatorPhaseById] = useState<
    Record<string, SavedIndicatorPhase>
  >({});
  const [testButtonExpandedId, setTestButtonExpandedId] = useState<string | null>(null);
  const testButtonTimersRef = useRef<Record<string, { collapseTimerId?: number }>>({});
  const prevTestOkRef = useRef<Record<string, boolean>>({});
  const [fetchButtonExpandedId, setFetchButtonExpandedId] = useState<string | null>(null);
  const fetchButtonTimersRef = useRef<Record<string, { collapseTimerId?: number }>>({});
  const prevFetchModelsRef = useRef<Record<string, boolean>>({});
  const savedIndicatorTimersRef = useRef<
    Record<string, { fadeTimerId?: number; hideTimerId?: number }>
  >({});
  const previousSaveStateByIdRef = useRef<Record<string, PresetSaveStatus["state"] | undefined>>(
    {},
  );

  const pendingDeletePreset = pendingDeletePresetId
    ? settings.presets.find((preset) => preset.id === pendingDeletePresetId)
    : undefined;
  const cacheActionInProgress = translationCacheActionTarget !== null;

  const editingPresetApiKeyInput = editingPreset
    ? presetApiKeyDrafts[editingPreset.id] ?? ""
    : "";
  const editingPresetValidation = editingPreset
    ? getPresetValidationState(editingPreset, editingPresetApiKeyInput)
    : undefined;
  const editingPresetSaveStatus = editingPreset
    ? presetSaveStatusById[editingPreset.id]
    : undefined;
  const editingPresetShowsApiKeyField = editingPreset
    ? providerUsesApiKey(editingPreset.providerKind)
    : false;
  const editingPresetShowsBaseUrlField = editingPreset
    ? providerUsesEditableBaseUrl(editingPreset.providerKind)
    : false;
  const editingPresetApiKeyState = editingPreset
    && editingPresetShowsApiKeyField
    ? getPresetApiKeyFieldState({
        apiKeyConfigured: editingPreset.apiKeyConfigured,
        apiKeyInput: editingPresetApiKeyInput,
      })
    : undefined;
  const editingPresetModels = editingPreset ? presetModels[editingPreset.id] ?? [] : [];
  const editingPresetModelMessage = editingPreset
    ? presetModelMessages[editingPreset.id]
    : undefined;
  const editingPresetCanLoadModels = editingPreset
    ? canListModels({
        kind: editingPreset.providerKind,
        baseUrl: editingPreset.baseUrl,
        apiKey: editingPresetApiKeyInput,
        apiKeyConfigured: editingPreset.apiKeyConfigured,
      })
    : false;

  const clearSavedIndicatorTimers = (presetId: string) => {
    const timers = savedIndicatorTimersRef.current[presetId];
    if (!timers) {
      return;
    }

    if (timers.fadeTimerId !== undefined) {
      window.clearTimeout(timers.fadeTimerId);
    }

    if (timers.hideTimerId !== undefined) {
      window.clearTimeout(timers.hideTimerId);
    }

    delete savedIndicatorTimersRef.current[presetId];
  };

  useEffect(() => {
    const presetIds = new Set(settings.presets.map((preset) => preset.id));

    Object.keys(savedIndicatorTimersRef.current).forEach((presetId) => {
      if (!presetIds.has(presetId)) {
        clearSavedIndicatorTimers(presetId);
      }
    });

    Object.keys(previousSaveStateByIdRef.current).forEach((presetId) => {
      if (!presetIds.has(presetId)) {
        delete previousSaveStateByIdRef.current[presetId];
      }
    });

    settings.presets.forEach((preset) => {
      const presetId = preset.id;
      const currentState = (presetSaveStatusById[presetId]?.state ?? "pristine") as PresetSaveStatus["state"];
      const previousState = previousSaveStateByIdRef.current[presetId];

      if (currentState === "dirty" || currentState === "saving" || currentState === "error") {
        clearSavedIndicatorTimers(presetId);
        setSavedIndicatorPhaseById((current) => {
          if (!(presetId in current)) {
            return current;
          }

          const { [presetId]: _removed, ...rest } = current;
          return rest;
        });
      } else if (
        currentState === "saved" &&
        (previousState === "dirty" || previousState === "saving" || previousState === "error")
      ) {
        clearSavedIndicatorTimers(presetId);
        setSavedIndicatorPhaseById((current) => ({
          ...current,
          [presetId]: "visible",
        }));

        const fadeTimerId = window.setTimeout(() => {
          setSavedIndicatorPhaseById((current) => {
            if (!(presetId in current)) {
              return current;
            }

            return {
              ...current,
              [presetId]: "fading",
            };
          });
        }, 1700);

        const hideTimerId = window.setTimeout(() => {
          setSavedIndicatorPhaseById((current) => {
            if (!(presetId in current)) {
              return current;
            }

            const { [presetId]: _removed, ...rest } = current;
            return rest;
          });
          delete savedIndicatorTimersRef.current[presetId];
        }, 2000);

        savedIndicatorTimersRef.current[presetId] = {
          fadeTimerId,
          hideTimerId,
        };
      } else if (currentState === "pristine" || currentState === "invalid") {
        clearSavedIndicatorTimers(presetId);
        setSavedIndicatorPhaseById((current) => {
          if (!(presetId in current)) {
            return current;
          }

          const { [presetId]: _removed, ...rest } = current;
          return rest;
        });
      }

      previousSaveStateByIdRef.current[presetId] = currentState;
    });
  }, [presetSaveStatusById, settings.presets]);

  useEffect(() => {
    return () => {
      Object.keys(savedIndicatorTimersRef.current).forEach((presetId) => {
        clearSavedIndicatorTimers(presetId);
      });
    };
  }, []);

  useEffect(() => {
    settings.presets.forEach((preset) => {
      const testStatus = presetStatuses[preset.id];
      const isTestRunning = presetTestRunningId === preset.id;
      const wasRunning = prevTestOkRef.current[preset.id] === undefined;

      if (isTestRunning && prevTestOkRef.current[preset.id] !== undefined) {
        prevTestOkRef.current[preset.id] = undefined;
        return;
      }

      if (wasRunning && testStatus) {
        prevTestOkRef.current[preset.id] = testStatus?.ok ?? false;
        if (testStatus?.ok) {
          setTestButtonExpandedId(preset.id);
          const timer = window.setTimeout(() => {
            setTestButtonExpandedId((current) => (current === preset.id ? null : current));
            delete testButtonTimersRef.current[preset.id];
          }, 2000);
          testButtonTimersRef.current[preset.id] = { collapseTimerId: timer };
        }
        return;
      }
    });

    const presetIds = new Set(settings.presets.map((p) => p.id));
    Object.keys(testButtonTimersRef.current).forEach((presetId) => {
      if (!presetIds.has(presetId)) {
        const timers = testButtonTimersRef.current[presetId];
        if (timers.collapseTimerId) window.clearTimeout(timers.collapseTimerId);
        delete testButtonTimersRef.current[presetId];
      }
    });
  }, [presetStatuses, settings.presets, presetTestRunningId]);

  useEffect(() => {
    settings.presets.forEach((preset) => {
      const isLoading = presetModelsLoadingById[preset.id];
      const wasLoading = prevFetchModelsRef.current[preset.id];

      if (wasLoading && !isLoading && editingPreset?.id === preset.id) {
        setFetchButtonExpandedId(preset.id);
        const timer = window.setTimeout(() => {
          setFetchButtonExpandedId((current) => (current === preset.id ? null : current));
          delete fetchButtonTimersRef.current[preset.id];
        }, 2000);
        fetchButtonTimersRef.current[preset.id] = { collapseTimerId: timer };
      }

      prevFetchModelsRef.current[preset.id] = isLoading;
    });

    const presetIds = new Set(settings.presets.map((p) => p.id));
    Object.keys(fetchButtonTimersRef.current).forEach((presetId) => {
      if (!presetIds.has(presetId)) {
        const timers = fetchButtonTimersRef.current[presetId];
        if (timers.collapseTimerId) window.clearTimeout(timers.collapseTimerId);
        delete fetchButtonTimersRef.current[presetId];
      }
    });
  }, [presetModelsLoadingById, settings.presets, editingPreset]);

  const helpPopover = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={t("settings.howToSetup")}
          className="btn btn-icon-only btn-quiet-action settings-help-button"
          type="button"
        >
          <Question size={16} weight="regular" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="tooltip-content settings-toggle-tooltip"
          side="top"
          sideOffset={6}
        >
          {t("settings.howToSetupContent")}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );

  const translateAllSlowModeTooltip = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={t("settings.aboutSlowMode")}
          className="btn btn-icon-only btn-quiet-action settings-help-button"
          type="button"
        >
          <Question size={16} weight="regular" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="tooltip-content settings-toggle-tooltip"
          side="top"
          sideOffset={6}
        >
          {t("settings.slowModeTooltip")}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );

  const cacheBooks = translationCacheSummary?.books ?? [];

  return (
    <Tooltip.Provider delayDuration={250}>
      <Tabs.Root className="settings-tabs" defaultValue="general">
        <Tabs.List
          aria-label="Settings sections"
          className="panel-toggle-group settings-tabs-list"
        >
          <Tabs.Trigger
            className="panel-toggle-btn settings-tab-trigger"
            value="general"
          >
            {t("settings.tabs.general")}
          </Tabs.Trigger>
          <Tabs.Trigger
            className="panel-toggle-btn settings-tab-trigger"
            value="providers"
          >
            {t("settings.tabs.providers")}
          </Tabs.Trigger>
          <Tabs.Trigger
            className="panel-toggle-btn settings-tab-trigger"
            value="cache"
          >
            {t("settings.tabs.cache")}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content className="settings-content" forceMount value="general">
          <div className="settings-layout">
            <div className="settings-block settings-block-inline">
              <Label.Root className="settings-label type-field-label" htmlFor="app-language-select">
                {t("settings.general.appLanguage")}
              </Label.Root>
              <div className="settings-inline-control">
                <LanguageCombobox
                  allowCustom={false}
                  buildSections={buildAppLanguagePickerSections}
                  contentClassName="language-combobox-content-shortlist"
                  getOptionLabel={getLanguageSelfLabel}
                  id="app-language-select"
                  onChange={(nextLanguage) =>
                    void Promise.resolve(
                      onSettingsChange({
                        ...settings,
                        appLanguage: nextLanguage,
                      })
                    ).catch(() => {})
                  }
                  searchable={false}
                  searchPlaceholder={appLanguageSearchPlaceholder}
                  value={settings.appLanguage}
                />
              </div>
            </div>
            <div className="settings-block settings-block-inline">
              <Label.Root className="settings-label type-field-label" htmlFor="default-language-select">
                {t("settings.general.translateTo")}
              </Label.Root>
              <div className="settings-inline-control">
                <LanguageCombobox
                  buildSections={buildTranslateToLanguagePickerSections}
                  contentClassName="language-combobox-content-common-list"
                  getOptionLabel={getLanguageSelfLabel}
                  id="default-language-select"
                  onChange={(nextLanguage) =>
                    void Promise.resolve(
                      onSettingsChange({
                        ...settings,
                        defaultLanguage: nextLanguage,
                      })
                    ).catch(() => {})
                  }
                  searchPlaceholder={translateToSearchPlaceholder}
                  value={settings.defaultLanguage}
                />
              </div>
            </div>
            <div className="settings-block settings-block-inline">
              <Label.Root className="settings-label type-field-label" htmlFor="auto-translate-next-pages">
                {t("settings.general.autoTranslateAhead")}
              </Label.Root>
              <div className="settings-inline-control">
                <Select.Root
                  onValueChange={(value) => {
                    const nextValue = normalizeAutoTranslateNextPages(
                      Number.parseInt(value, 10),
                    );
                    void Promise.resolve(
                      onSettingsChange({
                        ...settings,
                        autoTranslateNextPages: nextValue,
                      })
                    ).catch(() => {});
                  }}
                  value={String(settings.autoTranslateNextPages)}
                >
                  <Select.Trigger
                    aria-label={t("settings.general.autoTranslateAhead")}
                    className="select-trigger"
                    id="auto-translate-next-pages"
                  >
                    <span>{getAutoTranslateNextPageLabel(settings.autoTranslateNextPages)}</span>
                    <Select.Icon asChild>
                      <CaretDown size={16} weight="bold" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="select-content settings-select-content" position="popper">
                      <Select.Viewport>
                        {AUTO_TRANSLATE_NEXT_PAGE_OPTIONS.map((option) => (
                          <Select.Item
                            className="select-item"
                            key={option.value}
                            value={String(option.value)}
                          >
                            <Select.ItemText>{option.value === 0 ? t("common.off") : option.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content className="settings-content" forceMount value="providers">
          <div className="settings-layout">
            <div className="settings-block settings-block-providers">
              <div className="settings-toolbar">
                <div className="settings-toolbar-heading">
                  <span className="settings-toolbar-title type-section-title">{t("settings.modelPresets")}</span>
                  {helpPopover}
                </div>
                <div className="settings-toolbar-actions">
                  {settings.presets.length > 0 ? (
                    <ExpandableIconButton
                      className="btn-quiet-action"
                      disabled={testAllRunning || testAllDisabled}
                      label={t("settings.testAll")}
                      labelDirection="left"
                      onClick={() => {
                        void Promise.resolve(onTestAllPresets()).catch(() => {});
                      }}
                    >
                      <Gauge size={16} weight="bold" />
                    </ExpandableIconButton>
                  ) : null}
                  <Popover.Root open={providerPickerOpen} onOpenChange={setProviderPickerOpen}>
                    <Popover.Trigger asChild>
                      <ExpandableIconButton
                        className="settings-icon-button"
                        aria-label={t("settings.addProvider")}
                        expanded={providerPickerOpen}
                        label={t("common.add")}
                        labelDirection="left"
                        title={t("settings.addProvider")}
                      >
                        <Plus size={16} weight="bold" />
                      </ExpandableIconButton>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="settings-help-popover settings-provider-picker"
                        side="bottom"
                        align="end"
                        sideOffset={8}
                      >
                        <div className="settings-provider-picker-list">
                          {PRESET_PROVIDER_OPTIONS.map((provider) => (
                            <Fragment key={provider.value}>
                              {provider.value === "openai-compatible" ? (
                                <div className="settings-provider-picker-divider" />
                              ) : null}
                              <button
                                className="settings-provider-option"
                                onClick={() => {
                                  const presetId = onAddPreset(provider.value);
                                  setProviderPickerOpen(false);
                                  if (presetId) {
                                    void Promise.resolve(onEditingPresetChange(presetId)).catch(() => {});
                                  }
                                }}
                                type="button"
                              >
                                <ProviderIcon
                                  className="settings-provider-option-icon"
                                  providerKind={provider.value}
                                />
                                <span className="settings-provider-option-label">{provider.label}</span>
                              </button>
                            </Fragment>
                          ))}
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>

              {settings.presets.length === 0 ? (
                <div className="settings-empty-state">
                  <button
                    className="btn btn-quiet-action settings-empty-action"
                    onClick={() => {
                      setProviderPickerOpen(true);
                    }}
                    type="button"
                  >
                    {t("settings.toEnableTranslation")}
                  </button>
                </div>
              ) : (
                <div className="settings-preset-list">
                  {settings.presets.map((preset) => {
                    const isEditing = preset.id === editingPresetId;
                    const isActive = preset.id === liveActivePresetId;
                    const isSessionActive =
                      sessionFallbackPresetId !== null &&
                      sessionFallbackPresetId === preset.id &&
                      !isActive;
                    const apiKeyInput = presetApiKeyDrafts[preset.id] ?? "";
                    const validation = getPresetValidationState(preset, apiKeyInput);
                    const testStatus = presetStatuses[preset.id];
                    const saveStatus = presetSaveStatusById[preset.id];
                    const rowStatus = getPresetRowStatusCopy(
                      saveStatus,
                      savedIndicatorPhaseById[preset.id],
                    );

                    return (
                      <div
                        key={preset.id}
                        className={`settings-preset-item settings-preset-item--expandable ${
                          isEditing ? "is-expanded" : ""
                        } ${isActive ? "is-selected" : ""}`}
                      >
                        <span className="settings-preset-active-icon">
                          <CheckFat size={16} weight="fill" />
                        </span>
                        <div className="settings-preset-row">
                          <button
                            className="settings-preset-main"
                            onClick={() => {
                              if (isActive || !validation.isValid) {
                                return;
                              }

                              void Promise.resolve(onActivatePreset(preset.id)).catch(() => {});
                            }}
                            title={
                              isActive
                                ? t("settings.currentlyInUse")
                                : validation.isValid
                                  ? t("settings.useThisProvider")
                                  : t("settings.finishSetupToUse")
                            }
                            type="button"
                          >
                            <div className="settings-preset-copy">
                              <div className="settings-preset-title-row">
                                <span className="settings-preset-label type-pane-title">{preset.label}</span>
                              </div>
                            </div>
                          </button>
                          <div className="settings-preset-controls">
                            {isSessionActive ? (
                              <span className="settings-preset-status is-session">
                                {t("settings.inUseThisSession")}
                              </span>
                            ) : null}
                            {rowStatus ? (
                              <span className={rowStatus.className}>{rowStatus.label}</span>
                            ) : null}
                            <ExpandableIconButton
                              aria-expanded={isEditing}
                              aria-label={isEditing ? t("common.collapse") : t("common.expand")}
                              className="btn-quiet-action"
                              expanded={isEditing}
                              label={isEditing ? t("common.collapse") : t("common.expand")}
                              labelDirection="left"
                              onClick={() => {
                                void Promise.resolve(
                                  onEditingPresetChange(isEditing ? null : preset.id)
                                ).catch(() => {});
                              }}
                            >
                              <CaretDown size={16} weight="bold" />
                            </ExpandableIconButton>
                          </div>
                        </div>

                        {isEditing && editingPreset?.id === preset.id ? (
                          <div className="settings-preset-editor">
                            <div className="settings-editor-inputs">
                              <div className="settings-editor-row">
                                <Label.Root
                                  className="settings-label type-field-label"
                                  htmlFor="preset-provider-kind"
                                >
                                  {t("settings.provider")}
                                </Label.Root>
                                <Select.Root
                                value={editingPreset.providerKind}
                                onValueChange={(value) =>
                                  onPresetChange({
                                    ...editingPreset,
                                    providerKind: value as TranslationProviderKind,
                                  })
                                }
                              >
                                <Select.Trigger
                                  className="select-trigger"
                                  aria-label={t("settings.provider")}
                                  id="preset-provider-kind"
                                >
                                  <span className="settings-provider-trigger-value">
                                    <ProviderIcon
                                      className="settings-provider-trigger-icon"
                                      providerKind={editingPreset.providerKind}
                                    />
                                    <span>{getProviderOptionLabel(editingPreset.providerKind)}</span>
                                  </span>
                                  <Select.Icon asChild>
                                    <CaretDown size={16} weight="bold" />
                                  </Select.Icon>
                                </Select.Trigger>
                                <Select.Portal>
                                  <Select.Content className="select-content settings-select-content" position="popper">
                                    <Select.Viewport>
                                      {PRESET_PROVIDER_OPTIONS.map((provider) => (
                                        <Select.Item
                                          key={provider.value}
                                          value={provider.value}
                                          className="select-item settings-provider-select-item"
                                        >
                                          <ProviderIcon
                                            className="settings-provider-select-item-icon"
                                            providerKind={provider.value}
                                          />
                                          <Select.ItemText>{provider.label}</Select.ItemText>
                                        </Select.Item>
                                      ))}
                                    </Select.Viewport>
                                  </Select.Content>
                                </Select.Portal>
                                </Select.Root>
                              </div>

                              {editingPresetShowsBaseUrlField ? (
                                <div className="settings-editor-row">
                                  <Label.Root className="settings-label type-field-label" htmlFor="preset-base-url">
                                    {t("settings.baseUrl")}
                                  </Label.Root>
                                  <input
                                  id="preset-base-url"
                                  className="input"
                                  placeholder={t("settings.baseUrlPlaceholder", { url: getDefaultBaseUrlForProvider(editingPreset.providerKind) ?? "https://api.example.com/v1" })}
                                  value={editingPreset.baseUrl || ""}
                                  onChange={(event) =>
                                    onPresetChange({
                                      ...editingPreset,
                                      baseUrl: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            ) : null}

                              {editingPresetShowsApiKeyField ? (
                                <div className="settings-editor-row">
                                  <Label.Root
                                    className="settings-label type-field-label"
                                    htmlFor="preset-api-key"
                                  >
                                    {t("settings.apiKey")}
                                  </Label.Root>
                                  <input
                                    id="preset-api-key"
                                    className={editingPresetApiKeyState?.showsSavedMask ? "input input-masked" : "input"}
                                      type={editingPresetApiKeyState?.showsSavedMask ? "text" : "password"}
                                      placeholder={editingPresetApiKeyState?.placeholder}
                                      value={editingPresetApiKeyState?.displayValue ?? ""}
                                      onBlur={() => {
                                        void Promise.resolve(onPresetApiKeyBlur(editingPreset.id)).catch(() => {});
                                      }}
                                      onChange={(event) => {
                                        const key = event.target.value;
                                        onPresetApiKeyInputChange(editingPreset.id, key);
                                    if (
                                      !editingPreset.codingPlan &&
                                      detectCodingPlanKey(editingPreset.providerKind, key)
                                    ) {
                                      onPresetChange({
                                        ...editingPreset,
                                        codingPlan: true,
                                      });
                                    }
                                  }}
                                  onFocus={() => onPresetApiKeyFocus(editingPreset.id)}
                                  />
                                </div>
                              ) : null}

                            {editingPreset && providerUsesCodingPlan(editingPreset.providerKind) ? (
                                <div className="settings-editor-row settings-editor-row--toggle">
                                  <div className="settings-toggle-row" style={{ borderTop: 0, borderBottom: 0 }}>
                                  <div className="settings-toggle-copy">
                                    <div className="settings-toggle-title-row">
                                      <span className="settings-toggle-title">{t("settings.codingPlan")}</span>
                                      <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                          <button
                                            aria-label={t("settings.aboutCodingPlan")}
                                            className="btn btn-icon-only btn-quiet-action settings-help-button"
                                            type="button"
                                          >
                                            <Question size={16} weight="regular" />
                                          </button>
                                        </Tooltip.Trigger>
                                        <Tooltip.Portal>
                                          <Tooltip.Content className="tooltip-content settings-toggle-tooltip" side="top" sideOffset={6}>
                                            {t("settings.codingPlanTooltip")}
                                            <Tooltip.Arrow className="tooltip-arrow" />
                                          </Tooltip.Content>
                                        </Tooltip.Portal>
                                      </Tooltip.Root>
                                    </div>
                                  </div>
                                  <button
                                    aria-checked={editingPreset.codingPlan ?? false}
                                    className={`settings-switch ${editingPreset.codingPlan ? "is-on" : ""}`}
                                    onClick={() =>
                                      onPresetChange({
                                        ...editingPreset,
                                        codingPlan: !editingPreset.codingPlan,
                                      })
                                    }
                                    role="switch"
                                    type="button"
                                  >
                                    <span className="settings-switch-thumb" />
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            <div className="settings-editor-row">
                              <Label.Root className="settings-label type-field-label" htmlFor="preset-model">
                                {t("settings.model")}
                              </Label.Root>

                              <ModelCombobox
                                id="preset-model"
                                onChange={(value) =>
                                  onPresetChange({
                                    ...editingPreset,
                                    model: value,
                                  })
                                }
                                options={editingPresetModels}
                                placeholder={t("settings.modelPlaceholder", { model: getDefaultModelForProvider(editingPreset.providerKind) })}
                                value={editingPreset.model}
                              />
                              {editingPresetModelMessage ? (
                                <div className="settings-inline-hint settings-inline-hint-error">
                                  {editingPresetModelMessage}
                                </div>
                              ) : null}
                            </div>

                            {providerUsesThinking(editingPreset.providerKind) ? (
                                <div className="settings-editor-row">
                                  <Label.Root className="settings-label type-field-label" htmlFor="preset-thinking">
                                    {t("settings.thinking")}
                                  </Label.Root>
                                  <Select.Root
                                  value={normalizeProviderReasoningMode(
                                    editingPreset.providerKind,
                                    editingPreset.thinking,
                                  )}
                                  onValueChange={(value) =>
                                    onPresetChange({
                                      ...editingPreset,
                                      thinking: value as ProviderReasoningMode,
                                      reasoning: undefined,
                                    })
                                  }
                                >
                                  <Select.Trigger
                                    className="select-trigger"
                                    aria-label={t("settings.thinking")}
                                    id="preset-thinking"
                                  >
                                    <span>
                                      {(editingPreset.providerKind === "siliconflow-cn" || editingPreset.providerKind === "siliconflow-com" || editingPreset.providerKind === "dashscope"
                                        ? THINKING_TOGGLE_OPTIONS
                                        : DEEPSEEK_THINKING_OPTIONS
                                      ).find(
                                        (option) =>
                                          option.value ===
                                          normalizeProviderReasoningMode(
                                            editingPreset.providerKind,
                                            editingPreset.thinking,
                                          ),
                                      )?.label ?? t("common.off")}
                                    </span>
                                    <Select.Icon asChild>
                                      <CaretDown size={16} weight="bold" />
                                    </Select.Icon>
                                  </Select.Trigger>
                                  <Select.Portal>
                                    <Select.Content className="select-content settings-select-content" position="popper">
                                      <Select.Viewport>
                                        {(editingPreset.providerKind === "siliconflow-cn" || editingPreset.providerKind === "siliconflow-com" || editingPreset.providerKind === "dashscope"
                                          ? THINKING_TOGGLE_OPTIONS
                                          : DEEPSEEK_THINKING_OPTIONS
                                        ).map((option) => (
                                          <Select.Item
                                            key={option.value}
                                            value={option.value}
                                            className="select-item"
                                          >
                                            <Select.ItemText>{option.value === "off" ? t("common.off") : option.value === "high" && option.label === "On" ? t("common.on") : option.label}</Select.ItemText>
                                          </Select.Item>
                                        ))}
                                      </Select.Viewport>
                                    </Select.Content>
                                  </Select.Portal>
                                </Select.Root>
                              </div>
                            ) : null}

                            {providerUsesReasoning(editingPreset.providerKind) ? (
                                <div className="settings-editor-row">
                                  <Label.Root className="settings-label type-field-label" htmlFor="preset-reasoning">
                                    {t("settings.reasoning")}
                                </Label.Root>
                                <Select.Root
                                  value={normalizeProviderReasoningMode(
                                    editingPreset.providerKind,
                                    editingPreset.reasoning,
                                  )}
                                  onValueChange={(value) =>
                                    onPresetChange({
                                      ...editingPreset,
                                      reasoning: value as ProviderReasoningMode,
                                      thinking: undefined,
                                    })
                                  }
                                >
                                  <Select.Trigger
                                    className="select-trigger"
                                    aria-label={t("settings.reasoning")}
                                    id="preset-reasoning"
                                  >
                                    <span>
                                      {STANDARD_REASONING_OPTIONS.find(
                                        (option) =>
                                          option.value ===
                                          normalizeProviderReasoningMode(
                                            editingPreset.providerKind,
                                            editingPreset.reasoning,
                                          ),
                                      )?.label ?? t("common.off")}
                                    </span>
                                    <Select.Icon asChild>
                                      <CaretDown size={16} weight="bold" />
                                    </Select.Icon>
                                  </Select.Trigger>
                                  <Select.Portal>
                                    <Select.Content className="select-content settings-select-content" position="popper">
                                      <Select.Viewport>
                                        {STANDARD_REASONING_OPTIONS.map((option) => (
                                          <Select.Item
                                            key={option.value}
                                            value={option.value}
                                            className="select-item"
                                          >
                                            <Select.ItemText>{option.value === "off" ? t("common.off") : option.label}</Select.ItemText>
                                          </Select.Item>
                                        ))}
                                      </Select.Viewport>
                                    </Select.Content>
                                  </Select.Portal>
                                </Select.Root>
                              </div>
                            ) : null}
                            </div>

                            <div className="settings-actions-row">
                              <ExpandableIconButton
                                aria-label={t("settings.fetchModels")}
                                className="settings-icon-button"
                                disabled={!editingPresetCanLoadModels || Boolean(presetModelsLoadingById[editingPreset.id])}
                                expanded={Boolean(presetModelsLoadingById[editingPreset.id]) || fetchButtonExpandedId === editingPreset.id}
                                label={presetModelsLoadingById[editingPreset.id] ? (editingPresetModels.length > 0 ? t("settings.reloadingModels") : t("settings.fetchingModels")) : (fetchButtonExpandedId === editingPreset.id ? t("settings.fetchedModels") : (editingPresetModels.length > 0 ? t("settings.reloadModels") : t("settings.fetchModels")))}
                                labelDirection="left"
                                onClick={() => {
                                  void Promise.resolve(onFetchPresetModels(editingPreset.id)).catch(() => {});
                                }}
                                title={!editingPresetCanLoadModels ? getModelLoadHint(editingPreset, editingPresetApiKeyInput) : undefined}
                              >
                                <HandArrowDown size={16} weight="bold" />
                              </ExpandableIconButton>
                              <ExpandableIconButton
                                aria-label={t("settings.testConnection")}
                                className={`settings-icon-button ${testStatus?.ok ? "settings-icon-button-connected" : ""}`}
                                disabled={presetTestRunningId === editingPreset.id || !editingPresetValidation?.isValid}
                                expanded={presetTestRunningId === editingPreset.id || testButtonExpandedId === editingPreset.id}
                                label={presetTestRunningId === editingPreset.id ? t("settings.testingConnection") : testStatus?.ok ? t("settings.connected") : t("settings.testConnection")}
                                labelDirection="left"
                                onClick={() => {
                                  void Promise.resolve(onTestPreset(editingPreset.id)).catch(() => {});
                                }}
                              >
                                {testStatus?.ok ? (
                                  <PlugsConnected size={16} weight="bold" />
                                ) : (
                                  <Plugs size={16} weight="bold" />
                                )}
                              </ExpandableIconButton>
                              <ExpandableIconButton
                                aria-label={t("settings.deletePreset")}
                                className="settings-icon-button settings-icon-button-danger"
                                label={t("settings.deletePreset")}
                                labelDirection="left"
                                onClick={() => setPendingDeletePresetId(editingPreset.id)}
                              >
                                <TrashSimple size={16} weight="bold" />
                              </ExpandableIconButton>
                            </div>

                            {presetStatuses[editingPreset.id] && !presetStatuses[editingPreset.id]?.ok ? (
                              <div className="api-key-status">
                                <span className="status-message">
                                  {presetStatuses[editingPreset.id]?.message}
                                </span>
                              </div>
                            ) : null}

                            {editingPresetSaveStatus?.state === "error" ? (
                              <div className="settings-inline-error-row" aria-live="polite">
                                <span className="status-message">
                                  {editingPresetSaveStatus.detail ?? t("settings.saveFailedRetry")}
                                </span>
                                <button
                                  className="btn btn-small btn-quiet-action"
                                  onClick={() => {
                                    void Promise.resolve(onRetryPresetSave(editingPreset.id)).catch(() => {});
                                  }}
                                  type="button"
                                >
                                  {t("settings.retrySave")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="settings-provider-toggle-group">
                <div className="settings-toggle-row">
                <div className="settings-toggle-copy">
                  <div className="settings-toggle-title-row">
                    <span className="settings-toggle-title">{t("settings.translateAllSlowMode")}</span>
                    {translateAllSlowModeTooltip}
                  </div>
                  <span className="settings-toggle-detail">
                    {t("settings.slowModeDetail")}
                  </span>
                </div>
                <button
                  aria-checked={settings.translateAllSlowMode}
                  className={`settings-switch ${settings.translateAllSlowMode ? "is-on" : ""}`}
                  onClick={() => {
                    void Promise.resolve(
                      onSettingsChange({
                        ...settings,
                        translateAllSlowMode: !settings.translateAllSlowMode,
                      })
                    ).catch(() => {});
                  }}
                  role="switch"
                  type="button"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

                <div className="settings-toggle-row">
                  <div className="settings-toggle-copy">
                    <div className="settings-toggle-title-row">
                      <span className="settings-toggle-title">{t("settings.autoFallback")}</span>
                      <span aria-hidden="true" className="settings-experimental-badge">
                        <Flask size={13} weight="regular" />
                      </span>
                    </div>
                    <span className="settings-toggle-detail">
                      {t("settings.autoFallbackDetail")}
                    </span>
                  </div>
                  <button
                    aria-checked={settings.autoFallbackEnabled}
                    className={`settings-switch ${settings.autoFallbackEnabled ? "is-on" : ""}`}
                    onClick={() => {
                      void Promise.resolve(
                        onSettingsChange({
                          ...settings,
                          autoFallbackEnabled: !settings.autoFallbackEnabled,
                        })
                      ).catch(() => {});
                    }}
                    role="switch"
                    type="button"
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content className="settings-content" forceMount value="cache">
          <div className="settings-layout settings-cache-layout">
            <div className="settings-cache-summary-row">
              <div className="settings-cache-summary-copy">
                <span className="settings-cache-summary-label type-meta">{t("cache.totalCacheSize")}</span>
                <span className="settings-cache-summary-value type-pane-title">
                  {translationCacheLoading && translationCacheSummary === null
                    ? t("common.loading")
                    : formatCacheSize(translationCacheSummary?.totalCacheSizeBytes ?? 0)}
                </span>

              </div>
              <ExpandableIconButton
                className="settings-cache-delete-all settings-icon-button-danger"
                disabled={cacheActionInProgress}
                label={
                  translationCacheActionTarget === "all"
                    ? t("cache.deleting")
                    : t("cache.deleteAll")
                }
                labelDirection="left"
                onClick={() => {
                  if (cacheActionInProgress) {
                    return;
                  }

                  setPendingDeleteAllCache(true);
                }}
                title={
                  translationCacheActionTarget === "all"
                    ? t("cache.deleting")
                    : t("cache.deleteAll")
                }
              >
                <Trash size={18} weight="regular" />
              </ExpandableIconButton>
            </div>

            {translationCacheLoading && translationCacheSummary === null ? (
              <div className="settings-cache-empty type-meta">{t("cache.loading")}</div>
            ) : cacheBooks.length === 0 ? (
              <div className="settings-cache-empty type-meta">
                {t("cache.noCachedBooks")}
              </div>
            ) : (
              <div className="settings-cache-list" role="list">
                {cacheBooks.flatMap((book) =>
                  book.languages.map((language) => {
                    const actionKey = `${book.docId}:${language.languageCode}`;
                    const isDeletingBook = translationCacheActionTarget === actionKey;

                    return (
                      <div
                        key={actionKey}
                        className="settings-cache-item"
                        role="listitem"
                      >
                        <div className="settings-cache-item-copy">
                          <span className="settings-cache-item-title type-pane-title" title={book.title}>
                            {book.title}
                          </span>
                          <span className="settings-cache-item-detail type-meta">
                            {getCacheLanguageLabel(language.languageCode)} · {" "}
                            {language.isLegacyOnly
                              ? t("cache.legacyCachedPages", { count: String(language.cachedPageCount) })
                              : t("cache.cachedPages", { count: String(language.cachedPageCount) })}
                          </span>
                        </div>
                        <ExpandableIconButton
                          aria-label={t("settings.deleteCachedPagesFor", { title: book.title })}
                          className="settings-icon-button settings-icon-button-danger"
                          disabled={cacheActionInProgress}
                          label={t("common.delete")}
                          labelDirection="left"
                          onClick={() => {
                            if (cacheActionInProgress) {
                              return;
                            }

                            setPendingDeleteCacheBook({
                              docId: book.docId,
                              title: book.title,
                              languageCode: language.languageCode,
                            });
                          }}
                          title={isDeletingBook ? t("cache.deleting") : t("settings.deleteCachedPages")}
                        >
                          <TrashSimple size={18} weight="regular" />
                        </ExpandableIconButton>
                      </div>
                    );
                  }),
                )}
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <ConfirmationDialog
        actions={[
          {
            label: t("common.delete"),
            variant: "danger",
            onSelect: () => {
              if (!pendingDeletePresetId) {
                return;
              }

              void Promise.resolve(onDeletePreset(pendingDeletePresetId)).catch(() => {});
              setPendingDeletePresetId(null);
            },
          },
        ]}
        cancelLabel={t("common.keep")}
        description={
          pendingDeletePreset
            ? t("dialog.deletePresetDescription", { label: pendingDeletePreset.label })
            : ""
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletePresetId(null);
          }
        }}
        open={Boolean(pendingDeletePreset)}
        title={t("dialog.deletePresetTitle")}
      />

      <ConfirmationDialog
        actions={[
          {
            label: t("common.delete"),
            variant: "danger",
            onSelect: () => {
              if (!pendingDeleteCacheBook) {
                return;
              }

              void Promise.resolve(
                onDeleteCachedBook(
                  pendingDeleteCacheBook.docId,
                  pendingDeleteCacheBook.title,
                  pendingDeleteCacheBook.languageCode,
                ),
              ).catch(() => {});
              setPendingDeleteCacheBook(null);
            },
          },
        ]}
        cancelLabel={t("common.keep")}
        description={
          pendingDeleteCacheBook
            ? t("cache.deleteBookCacheDescription", {
                title: `${pendingDeleteCacheBook.title} (${getCacheLanguageLabel(pendingDeleteCacheBook.languageCode)})`,
              })
            : ""
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteCacheBook(null);
          }
        }}
        open={Boolean(pendingDeleteCacheBook)}
        title={t("cache.deleteBookCacheTitle")}
      />

      <ConfirmationDialog
        actions={[
          {
            label: t("cache.deleteAll"),
            variant: "danger",
            onSelect: () => {
              void Promise.resolve(onDeleteAllTranslationCache()).catch(() => {});
              setPendingDeleteAllCache(false);
            },
          },
        ]}
        cancelLabel={t("common.keep")}
        description={t("cache.deleteAllDescription")}
        onOpenChange={setPendingDeleteAllCache}
        open={pendingDeleteAllCache}
        title={t("cache.deleteAllTitle")}
      />
    </Tooltip.Provider>
  );
}
