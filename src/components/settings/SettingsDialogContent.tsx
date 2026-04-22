import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Label from "@radix-ui/react-label";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { LanguageCombobox } from "./LanguageCombobox";
import { canListModels } from "../../lib/providerForm";
import {
  getDefaultBaseUrlForProvider,
  getDefaultModelForProvider,
  getPresetApiKeyFieldState,
  getPresetValidationState,
  getProviderOptionLabel,
  PRESET_PROVIDER_OPTIONS,
  providerUsesApiKey,
  providerUsesEditableBaseUrl,
} from "../../lib/appSettings";
import type {
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
  onDeleteCachedBook: (docId: string, title: string) => void | Promise<void>;
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5L15.5 10" />
    </svg>
  );
}

function WarningCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.8.7-1.7 1.2-1.7 2.7" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
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
                  {isSelected ? <CheckCircleIcon /> : null}
                </button>
              );
            })
          ) : (
            <div className="model-combobox-empty">No matching models.</div>
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
      label: "Saving...",
    };
  }

  if (status?.state === "error") {
    return {
      className: "settings-preset-status is-error",
      label: "Save failed",
    };
  }

  if (savedIndicatorPhase) {
    return {
      className: `settings-preset-status is-ok ${
        savedIndicatorPhase === "fading" ? "is-fading" : ""
      }`,
      label: "Saved",
    };
  }

  return null;
}

function getModelLoadHint(preset: TranslationPreset, apiKeyInput: string) {
  if (providerUsesEditableBaseUrl(preset.providerKind) && !preset.baseUrl?.trim()) {
    return providerUsesApiKey(preset.providerKind)
      ? "Add Base URL and API key to load models."
      : "Add Base URL to load models.";
  }

  if (providerUsesApiKey(preset.providerKind) && !apiKeyInput.trim() && !preset.apiKeyConfigured) {
    return "Add API key to load models automatically.";
  }

  return "The model list will load automatically when this provider is ready.";
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
  const [pendingDeletePresetId, setPendingDeletePresetId] = useState<string | null>(null);
  const [pendingDeleteCacheBookId, setPendingDeleteCacheBookId] = useState<
    string | null
  >(null);
  const [pendingDeleteAllCache, setPendingDeleteAllCache] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [savedIndicatorPhaseById, setSavedIndicatorPhaseById] = useState<
    Record<string, SavedIndicatorPhase>
  >({});
  const savedIndicatorTimersRef = useRef<
    Record<string, { fadeTimerId?: number; hideTimerId?: number }>
  >({});
  const previousSaveStateByIdRef = useRef<Record<string, PresetSaveStatus["state"] | undefined>>(
    {},
  );

  const pendingDeletePreset = pendingDeletePresetId
    ? settings.presets.find((preset) => preset.id === pendingDeletePresetId)
    : undefined;
  const pendingDeleteCacheBook = pendingDeleteCacheBookId
    ? translationCacheSummary?.books.find(
        (book) => book.docId === pendingDeleteCacheBookId,
      )
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
        isEditing: apiKeyEditingPresetId === editingPreset.id,
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

  const helpPopover = (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="How to set this up"
          className="btn btn-icon-only btn-quiet-action settings-help-button"
          type="button"
        >
          <HelpIcon />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="settings-help-popover" side="bottom" align="start" sideOffset={8}>
          <div className="settings-help-title">How to set this up</div>
          <ol className="settings-help-list">
            <li>Add a provider.</li>
            <li>Add any required connection details.</li>
            <li>Pick a model.</li>
            <li>Use Test connection to confirm.</li>
          </ol>
          <Popover.Arrow className="popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  const translateAllSlowModeTooltip = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label="About Translate All slow mode"
          className="btn btn-icon-only btn-quiet-action settings-help-button"
          type="button"
        >
          <HelpIcon />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="tooltip-content settings-toggle-tooltip"
          side="top"
          sideOffset={6}
        >
          Useful for rate-limited providers and free models. During Translate All,
          readani pauses between small batches and retries automatically after
          rate-limit errors. Other errors still stop the run.
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
            General
          </Tabs.Trigger>
          <Tabs.Trigger
            className="panel-toggle-btn settings-tab-trigger"
            value="providers"
          >
            Providers
          </Tabs.Trigger>
          <Tabs.Trigger
            className="panel-toggle-btn settings-tab-trigger"
            value="cache"
          >
            Cache
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content className="settings-content" forceMount value="general">
          <div className="settings-layout">
            <div className="settings-block settings-block-inline">
              <Label.Root className="settings-label type-field-label" htmlFor="default-language-select">
                Default language
              </Label.Root>
              <div className="settings-inline-control">
                <LanguageCombobox
                  id="default-language-select"
                  onChange={(nextLanguage) =>
                    void Promise.resolve(
                      onSettingsChange({
                        ...settings,
                        defaultLanguage: nextLanguage,
                      })
                    ).catch(() => {})
                  }
                  value={settings.defaultLanguage}
                />
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content className="settings-content" forceMount value="providers">
          <div className="settings-layout">
            <div className="settings-block settings-block-providers">
              <div className="settings-toolbar">
                <div className="settings-toolbar-heading">
                  <span className="settings-toolbar-title type-section-title">Model Presets</span>
                  {helpPopover}
                </div>
                <div className="settings-toolbar-actions">
                  {settings.presets.length > 0 ? (
                    <button
                      className="btn btn-small btn-quiet-action"
                      disabled={testAllRunning || testAllDisabled}
                      onClick={() => {
                        void Promise.resolve(onTestAllPresets()).catch(() => {});
                      }}
                      type="button"
                    >
                      {testAllRunning ? "Testing..." : "Test all"}
                    </button>
                  ) : null}
                  <Popover.Root open={providerPickerOpen} onOpenChange={setProviderPickerOpen}>
                    <Popover.Trigger asChild>
                      <button
                        className="btn btn-icon-only btn-quiet-action settings-icon-button"
                        aria-label="Add provider"
                        title="Add provider"
                        type="button"
                      >
                        <PlusIcon />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="settings-help-popover settings-provider-picker"
                        side="bottom"
                        align="end"
                        sideOffset={8}
                      >
                        <div className="settings-help-title">Add provider</div>
                        <div className="settings-provider-picker-list">
                          {PRESET_PROVIDER_OPTIONS.map((provider) => (
                            <button
                              key={provider.value}
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
                              <span>{provider.label}</span>
                            </button>
                          ))}
                        </div>
                        <Popover.Arrow className="popover-arrow" />
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
                    To enable translation, add a provider.
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
                                ? "Currently in use"
                                : validation.isValid
                                  ? "Use this provider"
                                  : "Finish setup to use this provider"
                            }
                            type="button"
                          >
                            <div className="settings-preset-copy">
                              <div className="settings-preset-title-row">
                                <span className="settings-preset-label type-pane-title">{preset.label}</span>
                                {testStatus?.ok ? (
                                  <span
                                    aria-label="Preset test passed"
                                    className="settings-preset-success"
                                    title="Preset test passed"
                                  >
                                    <CheckCircleIcon />
                                  </span>
                                ) : testStatus ? (
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <span
                                        aria-label="Preset test failed"
                                        className="settings-preset-warning"
                                        title={testStatus.detail ?? testStatus.message}
                                      >
                                        <WarningCircleIcon />
                                      </span>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="tooltip-content settings-preset-test-tooltip"
                                        side="top"
                                        sideOffset={6}
                                      >
                                        <div className="settings-preset-test-tooltip__summary">
                                          {testStatus.message}
                                        </div>
                                        {testStatus.detail ? (
                                          <div className="settings-preset-test-tooltip__detail">
                                            {testStatus.detail}
                                          </div>
                                        ) : null}
                                        <Tooltip.Arrow className="tooltip-arrow" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                ) : null}
                              </div>
                            </div>
                          </button>
                          <div className="settings-preset-controls">
                            {isSessionActive ? (
                              <span className="settings-preset-status is-session">
                                In use this session
                              </span>
                            ) : null}
                            {rowStatus ? (
                              <span className={rowStatus.className}>{rowStatus.label}</span>
                            ) : null}
                            <button
                              aria-expanded={isEditing}
                              aria-label={isEditing ? "Collapse provider settings" : "Expand provider settings"}
                              className="btn btn-icon-only btn-quiet-action settings-preset-chevron-button"
                              onClick={() => {
                                void Promise.resolve(
                                  onEditingPresetChange(isEditing ? null : preset.id)
                                ).catch(() => {});
                              }}
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className={`settings-preset-chevron ${isEditing ? "is-open" : ""}`}
                              >
                                <ChevronDownIcon />
                              </span>
                            </button>
                          </div>
                        </div>

                        {isEditing && editingPreset?.id === preset.id ? (
                          <div className="settings-preset-editor">
                            <div className="settings-item">
                              <Label.Root
                                className="settings-label type-field-label"
                                htmlFor="preset-provider-kind"
                              >
                                Provider
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
                                  aria-label="Provider"
                                  id="preset-provider-kind"
                                >
                                  <span>{getProviderOptionLabel(editingPreset.providerKind)}</span>
                                  <Select.Icon asChild>
                                    <ChevronDownIcon />
                                  </Select.Icon>
                                </Select.Trigger>
                                <Select.Portal>
                                  <Select.Content className="select-content settings-select-content" position="popper">
                                    <Select.Viewport>
                                      {PRESET_PROVIDER_OPTIONS.map((provider) => (
                                        <Select.Item
                                          key={provider.value}
                                          value={provider.value}
                                          className="select-item"
                                        >
                                          <Select.ItemText>{provider.label}</Select.ItemText>
                                        </Select.Item>
                                      ))}
                                    </Select.Viewport>
                                  </Select.Content>
                                </Select.Portal>
                              </Select.Root>
                            </div>

                            {editingPresetShowsBaseUrlField ? (
                              <div className="settings-item">
                                <Label.Root className="settings-label type-field-label" htmlFor="preset-base-url">
                                  Base URL
                                </Label.Root>
                                <input
                                  id="preset-base-url"
                                  className="input"
                                  placeholder={`e.g. ${getDefaultBaseUrlForProvider(editingPreset.providerKind) ?? "https://api.example.com/v1"}`}
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
                              <div className="settings-item">
                                <div className="settings-inline-row">
                                  <Label.Root className="settings-label type-field-label" htmlFor="preset-api-key">
                                    API key
                                  </Label.Root>
                                  {editingPreset.apiKeyConfigured && !editingPresetApiKeyInput.trim() ? (
                                    <span className="settings-field-status status-ok">Saved</span>
                                  ) : null}
                                </div>
                                <input
                                  id="preset-api-key"
                                  className={editingPresetApiKeyState?.showsSavedMask ? "input input-masked" : "input"}
                                  type={editingPresetApiKeyState?.showsSavedMask ? "text" : "password"}
                                  placeholder={editingPresetApiKeyState?.placeholder}
                                  value={editingPresetApiKeyState?.displayValue ?? ""}
                                  onBlur={() => {
                                    void Promise.resolve(onPresetApiKeyBlur(editingPreset.id)).catch(() => {});
                                  }}
                                  onChange={(event) =>
                                    onPresetApiKeyInputChange(editingPreset.id, event.target.value)
                                  }
                                  onFocus={() => onPresetApiKeyFocus(editingPreset.id)}
                                />
                              </div>
                            ) : null}

                            <div className="settings-item">
                              <div className="settings-inline-row">
                                <Label.Root className="settings-label type-field-label" htmlFor="preset-model">
                                  Model
                                </Label.Root>
                                {editingPresetCanLoadModels ? (
                                  <button
                                    className="btn btn-ghost btn-small"
                                    disabled={presetModelsLoadingById[editingPreset.id]}
                                    onClick={() => {
                                      void Promise.resolve(onFetchPresetModels(editingPreset.id)).catch(() => {});
                                    }}
                                    type="button"
                                  >
                                    {presetModelsLoadingById[editingPreset.id] ? "Loading..." : editingPresetModels.length > 0 ? "Reload" : "Load models"}
                                  </button>
                                ) : (
                                  <span className="settings-inline-hint">{getModelLoadHint(editingPreset, editingPresetApiKeyInput)}</span>
                                )}
                              </div>

                              <ModelCombobox
                                id="preset-model"
                                onChange={(value) =>
                                  onPresetChange({
                                    ...editingPreset,
                                    model: value,
                                  })
                                }
                                options={editingPresetModels}
                                placeholder={`e.g. ${getDefaultModelForProvider(editingPreset.providerKind)}`}
                                value={editingPreset.model}
                              />
                              {editingPresetModelMessage ? (
                                <div className="settings-inline-hint settings-inline-hint-error">
                                  {editingPresetModelMessage}
                                </div>
                              ) : null}
                            </div>

                            <div className="settings-actions-row">
                              <button
                                className="btn btn-quiet-action"
                                disabled={presetTestRunningId === editingPreset.id || !editingPresetValidation?.isValid}
                                onClick={() => {
                                  void Promise.resolve(onTestPreset(editingPreset.id)).catch(() => {});
                                }}
                                type="button"
                              >
                                {presetTestRunningId === editingPreset.id ? "Testing..." : "Test connection"}
                              </button>
                              <button
                                className="btn btn-quiet-action btn-danger-quiet"
                                onClick={() => setPendingDeletePresetId(editingPreset.id)}
                                type="button"
                              >
                                <TrashIcon />
                                Delete
                              </button>
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
                                  {editingPresetSaveStatus.detail ?? "Save failed."}
                                </span>
                                <button
                                  className="btn btn-small btn-quiet-action"
                                  onClick={() => {
                                    void Promise.resolve(onRetryPresetSave(editingPreset.id)).catch(() => {});
                                  }}
                                  type="button"
                                >
                                  Retry save
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
                <div className="settings-toggle-row settings-toggle-row-first">
                <div className="settings-toggle-copy">
                  <div className="settings-toggle-title-row">
                    <span className="settings-toggle-title">Translate All slow mode</span>
                    {translateAllSlowModeTooltip}
                  </div>
                  <span className="settings-toggle-detail">
                    Pause during Translate All and retry automatically after rate-limit errors.
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

                <div className="settings-toggle-row settings-toggle-row-bottom">
                  <div className="settings-toggle-copy">
                    <div className="settings-toggle-title-row">
                      <span className="settings-toggle-title">Automatic fallback</span>
                      <span className="settings-experimental-badge">Experimental</span>
                    </div>
                    <span className="settings-toggle-detail">
                      Retry another usable preset after a failure or timeout.
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
                <span className="settings-cache-summary-label type-meta">Total cache size</span>
                <span className="settings-cache-summary-value type-pane-title">
                  {translationCacheLoading && translationCacheSummary === null
                    ? "Loading..."
                    : formatCacheSize(translationCacheSummary?.totalCacheSizeBytes ?? 0)}
                </span>
              </div>
              <button
                className="btn btn-quiet-action btn-danger-quiet settings-cache-delete-all"
                disabled={cacheActionInProgress}
                onClick={() => {
                  if (cacheActionInProgress) {
                    return;
                  }

                  setPendingDeleteAllCache(true);
                }}
                type="button"
              >
                <TrashIcon />
                {translationCacheActionTarget === "all" ? "Deleting..." : "Delete All"}
              </button>
            </div>

            {translationCacheLoading && translationCacheSummary === null ? (
              <div className="settings-cache-empty type-meta">Loading cache...</div>
            ) : cacheBooks.length === 0 ? (
              <div className="settings-cache-empty type-meta">
                No cached books yet.
              </div>
            ) : (
              <div className="settings-cache-list" role="list">
                {cacheBooks.map((book) => {
                  const isDeletingBook = translationCacheActionTarget === book.docId;
                  return (
                    <div
                      key={book.docId}
                      className="settings-cache-item"
                      role="listitem"
                    >
                      <div className="settings-cache-item-copy">
                        <span className="settings-cache-item-title type-pane-title" title={book.title}>
                          {book.title}
                        </span>
                        <span className="settings-cache-item-detail type-meta">
                          {book.cachedPageCount} cached page{book.cachedPageCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button
                        aria-label={`Delete cached pages for ${book.title}`}
                        className="btn btn-icon-only btn-quiet-action settings-icon-button settings-icon-button-danger"
                        disabled={cacheActionInProgress}
                        onClick={() => {
                          if (cacheActionInProgress) {
                            return;
                          }

                          setPendingDeleteCacheBookId(book.docId);
                        }}
                        title={isDeletingBook ? "Deleting..." : "Delete cached pages"}
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <ConfirmationDialog
        actions={[
          {
            label: "Delete",
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
        cancelLabel="Keep"
        description={
          pendingDeletePreset
            ? `Remove ${pendingDeletePreset.label}? You can add it again later.`
            : ""
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletePresetId(null);
          }
        }}
        open={Boolean(pendingDeletePreset)}
        title="Delete preset"
      />

      <ConfirmationDialog
        actions={[
          {
            label: "Delete",
            variant: "danger",
            onSelect: () => {
              if (!pendingDeleteCacheBook) {
                return;
              }

              void Promise.resolve(
                onDeleteCachedBook(
                  pendingDeleteCacheBook.docId,
                  pendingDeleteCacheBook.title,
                ),
              ).catch(() => {});
              setPendingDeleteCacheBookId(null);
            },
          },
        ]}
        cancelLabel="Keep"
        description={
          pendingDeleteCacheBook
            ? `Delete cached pages for ${pendingDeleteCacheBook.title}? This can't be undone.`
            : ""
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteCacheBookId(null);
          }
        }}
        open={Boolean(pendingDeleteCacheBook)}
        title="Delete book cache"
      />

      <ConfirmationDialog
        actions={[
          {
            label: "Delete all",
            variant: "danger",
            onSelect: () => {
              void Promise.resolve(onDeleteAllTranslationCache()).catch(() => {});
              setPendingDeleteAllCache(false);
            },
          },
        ]}
        cancelLabel="Keep"
        description="Delete all cached translations? This also removes older cache data and can't be undone."
        onOpenChange={setPendingDeleteAllCache}
        open={pendingDeleteAllCache}
        title="Delete all cache"
      />
    </Tooltip.Provider>
  );
}
