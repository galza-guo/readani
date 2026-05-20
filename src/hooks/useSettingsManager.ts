import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  canPersistPresetDraft,
  createDefaultSettings,
  createPresetDraft,
  getActivePreset,
  getNextThemeMode,
  getPresetMissingRequirement,
  getPresetSaveStatus,
  getPresetValidationState,
  hasPresetTranslationContext,
  hasUsableLiveTranslationSetup,
  isPresetUnchangedFromSavedState,
  normalizePresetDraft,
  normalizeSettingsFromStorage,
  providerUsesApiKey,
  serializePresetForCommand,
  serializeSettingsForCommand,
  resolveTargetLanguage,
} from "../lib/appSettings";
import { canListModels } from "../lib/providerForm";
import {
  getFriendlyPresetTestResult,
  getPresetById,
} from "../lib/translationHelpers";
import {
  getFriendlyProviderError,
  getProviderErrorDetail,
  TRANSLATION_SETUP_REQUIRED_MESSAGE,
} from "../lib/providerErrors";
import { t, setLocale } from "../lib/i18n";
import type {
  PresetSaveStatus,
  PresetTestResult,
  TranslationCacheSummary,
  TranslationPreset,
  TranslationProviderKind,
  TranslationSettings,
} from "../types";
import { getSystemLocalePreference } from "./useSettingsManager.utils";

export type ShowToastFn = (args: {
  message: string;
  tone?: "success" | "error";
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}) => void;

const PRESET_AUTOSAVE_DELAY_MS = 700;

export interface UseSettingsManagerParams {
  showToast: ShowToastFn;
}

export function useSettingsManager({ showToast }: UseSettingsManagerParams) {
  const [settings, setSettings] =
    useState<TranslationSettings>(createDefaultSettings());
  const [systemLocale, setSystemLocale] = useState(() =>
    getSystemLocalePreference(),
  );
  const [settingsDraft, setSettingsDraft] =
    useState<TranslationSettings | null>(null);
  const [, forceLocaleRender] = useState(0);
  const [sessionFallbackPresetId, setSessionFallbackPresetId] = useState<
    string | null
  >(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCloseConfirmOpen, setSettingsCloseConfirmOpen] =
    useState(false);
  const [settingsClosePending, setSettingsClosePending] = useState(false);
  const [translationCacheSummary, setTranslationCacheSummary] =
    useState<TranslationCacheSummary | null>(null);
  const [translationCacheLoading, setTranslationCacheLoading] = useState(false);
  const [translationCacheActionTarget, setTranslationCacheActionTarget] =
    useState<string | "all" | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [apiKeyEditingPresetId, setApiKeyEditingPresetId] = useState<
    string | null
  >(null);
  const [presetApiKeyDrafts, setPresetApiKeyDrafts] = useState<
    Record<string, string>
  >({});
  const [presetStatuses, setPresetStatuses] = useState<
    Record<string, PresetTestResult | undefined>
  >({});
  const [presetSaveStatusById, setPresetSaveStatusById] = useState<
    Record<string, PresetSaveStatus>
  >({});
  const [presetTestRunningId, setPresetTestRunningId] = useState<string | null>(
    null,
  );
  const [presetModelsLoadingById, setPresetModelsLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [presetModels, setPresetModels] = useState<Record<string, string[]>>(
    {},
  );
  const [presetModelMessages, setPresetModelMessages] = useState<
    Record<string, string | undefined>
  >({});
  const [presetModelAutoLoadAttempts, setPresetModelAutoLoadAttempts] =
    useState<Record<string, boolean>>({});
  const [testAllPresetsRunning, setTestAllPresetsRunning] =
    useState<boolean>(false);

  // Refs
  const settingsRef = useRef(settings);
  const settingsDraftRef = useRef<TranslationSettings | null>(settingsDraft);
  const sessionFallbackPresetIdRef = useRef<string | null>(
    sessionFallbackPresetId,
  );
  const presetApiKeyDraftsRef =
    useRef<Record<string, string>>(presetApiKeyDrafts);
  const presetSaveStatusByIdRef =
    useRef<Record<string, PresetSaveStatus>>(presetSaveStatusById);
  const presetAutosaveTimerRef = useRef<number | null>(null);
  const presetAutosavePresetIdRef = useRef<string | null>(null);
  const presetSavePromisesRef = useRef<Record<string, Promise<void>>>({});
  const settingsPersistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  useEffect(() => {
    sessionFallbackPresetIdRef.current = sessionFallbackPresetId;
  }, [sessionFallbackPresetId]);

  useEffect(() => {
    presetApiKeyDraftsRef.current = presetApiKeyDrafts;
  }, [presetApiKeyDrafts]);

  useEffect(() => {
    presetSaveStatusByIdRef.current = presetSaveStatusById;
  }, [presetSaveStatusById]);

  // Locale change listener
  useEffect(() => {
    const handleLanguageChange = () => {
      setSystemLocale(getSystemLocalePreference());
    };

    window.addEventListener("languagechange", handleLanguageChange);
    return () => {
      window.removeEventListener("languagechange", handleLanguageChange);
    };
  }, []);

  // Load settings on mount
  useEffect(() => {
    invoke<TranslationSettings>("get_app_settings")
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettingsFromStorage(
          loadedSettings,
          getSystemLocalePreference(),
        );
        setSettings(normalizedSettings);
        setSettingsLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
        setSettingsLoaded(true);
      });
  }, []);

  // Effective app language for locale sync
  const effectiveAppLanguage =
    settingsDraft?.appLanguage ?? settings.appLanguage;

  useLayoutEffect(() => {
    const appCode = effectiveAppLanguage.code;
    if (appCode === "system" || appCode === "app-language") {
      setLocale(systemLocale || "en");
    } else {
      setLocale(appCode);
    }

    forceLocaleRender((version) => version + 1);
  }, [effectiveAppLanguage.code, systemLocale]);

  // Session fallback cleanup
  useEffect(() => {
    if (
      sessionFallbackPresetId &&
      !getPresetById(settings.presets, sessionFallbackPresetId)
    ) {
      setSessionFallbackPresetId(null);
    }
  }, [sessionFallbackPresetId, settings.presets]);

  // Derived values
  const savedActivePreset = useMemo(
    () => getActivePreset(settings),
    [settings],
  );
  const effectivePreset = useMemo(
    () =>
      getPresetById(settings.presets, sessionFallbackPresetId) ??
      savedActivePreset,
    [savedActivePreset, sessionFallbackPresetId, settings.presets],
  );
  const activePresetHasTranslationContext = useMemo(
    () => hasPresetTranslationContext(effectivePreset),
    [effectivePreset],
  );
  const activePresetHasLiveSetup = useMemo(
    () => hasUsableLiveTranslationSetup(effectivePreset),
    [effectivePreset],
  );

  // getEffectivePreset — uses refs, used widely
  const getEffectivePreset = useCallback(
    (sourceSettings: TranslationSettings = settingsRef.current) =>
      getPresetById(
        sourceSettings.presets,
        sessionFallbackPresetIdRef.current,
      ) ?? getActivePreset(sourceSettings),
    [],
  );

  // buildPersistableSettings
  const buildPersistableSettings = useCallback(
    (nextSettings: TranslationSettings) =>
      serializeSettingsForCommand({
        ...nextSettings,
        presets: nextSettings.presets.map((preset) => {
          const draftApiKey = presetApiKeyDraftsRef.current[preset.id]?.trim();
          return draftApiKey && providerUsesApiKey(preset.providerKind)
            ? { ...preset, apiKey: draftApiKey }
            : preset;
        }),
      }),
    [],
  );

  // persistSettings
  const persistSettings = useCallback(
    async (nextSettings: TranslationSettings) => {
      const runPersist = async () => {
        const saved = (await invoke("save_app_settings", {
          settings: buildPersistableSettings(nextSettings),
        })) as TranslationSettings;
        const normalizedSettings = normalizeSettingsFromStorage(
          saved,
          systemLocale,
        );
        setSettings(normalizedSettings);
        return normalizedSettings;
      };

      const queuedPersist = settingsPersistQueueRef.current.then(
        runPersist,
        runPersist,
      );
      settingsPersistQueueRef.current = queuedPersist.then(
        () => undefined,
        () => undefined,
      );

      return queuedPersist;
    },
    [buildPersistableSettings, systemLocale],
  );

  // getPresetDraft
  const getPresetDraft = useCallback((preset: TranslationPreset) => {
    const draftApiKey = presetApiKeyDraftsRef.current[preset.id]?.trim();
    return serializePresetForCommand(
      draftApiKey && providerUsesApiKey(preset.providerKind)
        ? { ...preset, apiKey: draftApiKey }
        : preset,
    );
  }, []);

  // handleThemeToggle
  const handleThemeToggle = useCallback(() => {
    const nextSettings = {
      ...settings,
      theme: getNextThemeMode(settings.theme),
    };
    setSettings(nextSettings);
    void persistSettings(nextSettings);
  }, [persistSettings, settings]);

  // Internal helpers for settings dialog
  const updateSettingsDraftState = useCallback(
    (nextSettings: TranslationSettings | null) => {
      settingsDraftRef.current = nextSettings;
      setSettingsDraft(nextSettings);
    },
    [],
  );

  const updatePresetSaveStatus = useCallback(
    (presetId: string, status: PresetSaveStatus) => {
      setPresetSaveStatusById((prev) => {
        const next = {
          ...prev,
          [presetId]: status,
        };
        presetSaveStatusByIdRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearPresetSaveStatus = useCallback((presetId: string) => {
    setPresetSaveStatusById((prev) => {
      const { [presetId]: _removed, ...rest } = prev;
      presetSaveStatusByIdRef.current = rest;
      return rest;
    });
  }, []);

  const buildInitialPresetSaveStatuses = useCallback(
    (sourceSettings: TranslationSettings) => {
      return Object.fromEntries(
        sourceSettings.presets.map((preset) => [
          preset.id,
          getPresetSaveStatus(preset, ""),
        ]),
      );
    },
    [],
  );

  const clearPendingPresetAutosave = useCallback(() => {
    if (presetAutosaveTimerRef.current !== null) {
      window.clearTimeout(presetAutosaveTimerRef.current);
      presetAutosaveTimerRef.current = null;
    }
    presetAutosavePresetIdRef.current = null;
  }, []);

  const resetSettingsDialogState = useCallback(() => {
    clearPendingPresetAutosave();
    updateSettingsDraftState(null);
    setTranslationCacheSummary(null);
    setTranslationCacheLoading(false);
    setTranslationCacheActionTarget(null);
    setEditingPresetId(null);
    setApiKeyEditingPresetId(null);
    setPresetApiKeyDrafts({});
    setPresetStatuses({});
    setPresetTestRunningId(null);
    setPresetSaveStatusById({});
    presetSaveStatusByIdRef.current = {};
    setPresetModelsLoadingById({});
    setPresetModels({});
    setPresetModelMessages({});
    setPresetModelAutoLoadAttempts({});
    setSettingsClosePending(false);
    setSettingsCloseConfirmOpen(false);
  }, [clearPendingPresetAutosave, updateSettingsDraftState]);

  // refreshTranslationCacheSummary
  const refreshTranslationCacheSummary = useCallback(async () => {
    setTranslationCacheLoading(true);

    try {
      const summary = (await invoke(
        "get_translation_cache_summary",
        {},
      )) as TranslationCacheSummary;
      setTranslationCacheSummary(summary);
    } catch (error) {
      console.error("Failed to load translation cache summary:", error);
      showToast({
        message: t("toast.couldNotLoadTranslationCache"),
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setTranslationCacheLoading(false);
    }
  }, [showToast]);

  // handleOpenSettings
  const handleOpenSettings = useCallback(() => {
    clearPendingPresetAutosave();
    updateSettingsDraftState(settings);
    setEditingPresetId(null);
    setApiKeyEditingPresetId(null);
    setPresetApiKeyDrafts({});
    setPresetStatuses({});
    setPresetTestRunningId(null);
    const nextSaveStatuses = buildInitialPresetSaveStatuses(settings);
    presetSaveStatusByIdRef.current = nextSaveStatuses;
    setPresetSaveStatusById(nextSaveStatuses);
    setPresetModelsLoadingById({});
    setPresetModels({});
    setPresetModelMessages({});
    setPresetModelAutoLoadAttempts({});
    setSettingsClosePending(false);
    setSettingsCloseConfirmOpen(false);
    setSettingsOpen(true);
  }, [
    buildInitialPresetSaveStatuses,
    clearPendingPresetAutosave,
    settings,
    updateSettingsDraftState,
  ]);

  // Auto-refresh cache summary when settings open
  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    void refreshTranslationCacheSummary();
  }, [refreshTranslationCacheSummary, settingsOpen]);

  // showTranslationSetupToast
  const showTranslationSetupToast = useCallback(() => {
    showToast({
      message: TRANSLATION_SETUP_REQUIRED_MESSAGE,
      actionLabel: t("toast.openSettings"),
      onAction: handleOpenSettings,
      durationMs: 4200,
    });
  }, [handleOpenSettings, showToast]);

  // getDraftPresetById
  const getDraftPresetById = useCallback((presetId: string) => {
    const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
    return sourceSettings.presets.find((preset) => preset.id === presetId);
  }, []);

  // syncSavedPresetIntoDraft
  const syncSavedPresetIntoDraft = useCallback(
    (savedSettings: TranslationSettings, presetId: string) => {
      updateSettingsDraftState(
        (() => {
          const currentDraft = settingsDraftRef.current;
          if (!currentDraft) {
            return currentDraft;
          }

          const savedPreset = savedSettings.presets.find(
            (preset) => preset.id === presetId,
          );
          const nextPresets = savedPreset
            ? currentDraft.presets.some((preset) => preset.id === presetId)
              ? currentDraft.presets.map((preset) =>
                  preset.id === presetId ? savedPreset : preset,
                )
              : [...currentDraft.presets, savedPreset]
            : currentDraft.presets.filter((preset) => preset.id !== presetId);

          return {
            ...currentDraft,
            presets: nextPresets,
          };
        })(),
      );
    },
    [updateSettingsDraftState],
  );

  // clearPresetLocalArtifacts
  const clearPresetLocalArtifacts = useCallback(
    (presetId: string) => {
      if (presetAutosavePresetIdRef.current === presetId) {
        clearPendingPresetAutosave();
      }

      setPresetStatuses((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetApiKeyDrafts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModels((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelsLoadingById((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelMessages((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      setPresetModelAutoLoadAttempts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });
      clearPresetSaveStatus(presetId);
    },
    [clearPendingPresetAutosave, clearPresetSaveStatus],
  );

  // handleFetchPresetModels
  const handleFetchPresetModels = useCallback(
    async (presetId: string, options?: { auto?: boolean }) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      if (options?.auto) {
        setPresetModelAutoLoadAttempts((prev) => ({
          ...prev,
          [presetId]: true,
        }));
      }

      setPresetModelsLoadingById((prev) => ({
        ...prev,
        [presetId]: true,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));

      try {
        const models = (await invoke("list_preset_models", {
          preset: getPresetDraft(draftPreset),
        })) as string[];

        setPresetModels((prev) => ({
          ...prev,
          [presetId]: models,
        }));
      } catch (error) {
        console.error("Failed to fetch preset models:", error);
        const friendlyError = getFriendlyProviderError(error);
        setPresetModelMessages((prev) => ({
          ...prev,
          [presetId]:
            friendlyError.kind === "unknown"
              ? "Could not load models. You can still type one manually."
              : friendlyError.message,
        }));
      } finally {
        setPresetModelsLoadingById((prev) => ({
          ...prev,
          [presetId]: false,
        }));
      }
    },
    [getDraftPresetById, getPresetDraft],
  );

  // persistPresetDraft
  const persistPresetDraft = useCallback(
    async (presetId: string, options?: { clearApiKeyAfterSave?: boolean }) => {
      const existingPromise = presetSavePromisesRef.current[presetId];
      if (existingPromise) {
        return existingPromise;
      }

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const apiKeyInput = presetApiKeyDraftsRef.current[presetId] ?? "";
      if (!canPersistPresetDraft(draftPreset, apiKeyInput)) {
        updatePresetSaveStatus(presetId, {
          state: "invalid",
          detail: getPresetMissingRequirement(draftPreset, apiKeyInput),
        });
        return;
      }

      const savePromise = (async () => {
        updatePresetSaveStatus(presetId, { state: "saving" });

        try {
          const nextSettings = (() => {
            const liveSettings = settingsRef.current;
            const nextPresets = liveSettings.presets.some(
              (preset) => preset.id === presetId,
            )
              ? liveSettings.presets.map((preset) =>
                  preset.id === presetId ? draftPreset : preset,
                )
              : [...liveSettings.presets, draftPreset];

            return {
              ...liveSettings,
              presets: nextPresets,
            };
          })();

          const savedSettings = await persistSettings(nextSettings);
          const savedPreset =
            savedSettings.presets.find((preset) => preset.id === presetId) ??
            draftPreset;

          syncSavedPresetIntoDraft(savedSettings, presetId);

          const shouldMaskApiKey = Boolean(
            options?.clearApiKeyAfterSave &&
            presetApiKeyDraftsRef.current[presetId]?.trim(),
          );

          if (shouldMaskApiKey) {
            setPresetApiKeyDrafts((prev) => {
              const { [presetId]: _removed, ...rest } = prev;
              return rest;
            });
          }

          updatePresetSaveStatus(
            presetId,
            getPresetSaveStatus(
              savedPreset,
              shouldMaskApiKey
                ? ""
                : (presetApiKeyDraftsRef.current[presetId] ?? ""),
            ),
          );

          const canLoad = canListModels({
            kind: savedPreset.providerKind,
            baseUrl: savedPreset.baseUrl,
            apiKey: shouldMaskApiKey
              ? ""
              : (presetApiKeyDraftsRef.current[presetId] ?? ""),
            apiKeyConfigured: savedPreset.apiKeyConfigured,
          });

          if (
            canLoad &&
            !savedPreset.model.trim() &&
            !presetModels[presetId]?.length &&
            !presetModelsLoadingById[presetId] &&
            !presetModelAutoLoadAttempts[presetId]
          ) {
            void handleFetchPresetModels(presetId, { auto: true });
          }
        } catch (error) {
          console.error("Failed to save preset:", error);
          updatePresetSaveStatus(presetId, {
            state: "error",
            detail: `Save failed: ${getFriendlyProviderError(error).message}`,
          });
        } finally {
          delete presetSavePromisesRef.current[presetId];
        }
      })();

      presetSavePromisesRef.current[presetId] = savePromise;
      return savePromise;
    },
    [
      getDraftPresetById,
      handleFetchPresetModels,
      persistSettings,
      presetModelAutoLoadAttempts,
      presetModels,
      presetModelsLoadingById,
      syncSavedPresetIntoDraft,
      updatePresetSaveStatus,
    ],
  );

  // flushPresetAutosave
  const flushPresetAutosave = useCallback(
    async (presetId: string, options?: { clearApiKeyAfterSave?: boolean }) => {
      if (presetAutosavePresetIdRef.current === presetId) {
        clearPendingPresetAutosave();
      }

      const inFlight = presetSavePromisesRef.current[presetId];
      if (inFlight) {
        await inFlight;
        return;
      }

      await persistPresetDraft(presetId, options);
    },
    [clearPendingPresetAutosave, persistPresetDraft],
  );

  // flushDirtyPresetSaves
  const flushDirtyPresetSaves = useCallback(
    async (options?: { clearBlurredApiKeyPresetId?: string }) => {
      const sourceSettings = settingsDraftRef.current;
      if (!sourceSettings) {
        return;
      }

      if (presetAutosavePresetIdRef.current) {
        await flushPresetAutosave(presetAutosavePresetIdRef.current, {
          clearApiKeyAfterSave:
            options?.clearBlurredApiKeyPresetId ===
            presetAutosavePresetIdRef.current,
        });
      }

      const dirtyPresetIds = sourceSettings.presets
        .map((preset) => preset.id)
        .filter(
          (presetId) =>
            presetSaveStatusByIdRef.current[presetId]?.state === "dirty",
        );

      for (const presetId of dirtyPresetIds) {
        await persistPresetDraft(presetId, {
          clearApiKeyAfterSave:
            options?.clearBlurredApiKeyPresetId === presetId,
        });
      }
    },
    [flushPresetAutosave, persistPresetDraft],
  );

  // collectBlockingUnsavedPresetIds
  const collectBlockingUnsavedPresetIds = useCallback(() => {
    const currentDraft = settingsDraftRef.current;
    if (!currentDraft) {
      return [];
    }

    return currentDraft.presets
      .filter((preset) => {
        const saveStatus = presetSaveStatusByIdRef.current[preset.id];
        const savedPreset = settingsRef.current.presets.find(
          (candidate) => candidate.id === preset.id,
        );
        const unchanged = isPresetUnchangedFromSavedState({
          preset,
          savedPreset,
          apiKeyInput: presetApiKeyDraftsRef.current[preset.id] ?? "",
        });

        return (
          !unchanged &&
          (saveStatus?.state === "invalid" || saveStatus?.state === "error")
        );
      })
      .map((preset) => preset.id);
  }, []);

  // handleEditingPresetChange
  const handleEditingPresetChange = useCallback(
    async (presetId: string | null) => {
      const previousEditingPresetId = editingPresetId;
      if (previousEditingPresetId && previousEditingPresetId !== presetId) {
        await flushPresetAutosave(previousEditingPresetId, {
          clearApiKeyAfterSave:
            apiKeyEditingPresetId === previousEditingPresetId,
        });
      }

      setEditingPresetId(presetId);
    },
    [apiKeyEditingPresetId, editingPresetId, flushPresetAutosave],
  );

  // handleActivatePreset
  const handleActivatePreset = useCallback(
    async (presetId: string) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const currentSaveState =
        presetSaveStatusByIdRef.current[presetId]?.state ?? "pristine";
      const shouldPersistDraftBeforeActivation =
        currentSaveState !== "pristine" && currentSaveState !== "saved";

      if (shouldPersistDraftBeforeActivation) {
        await flushPresetAutosave(presetId, {
          clearApiKeyAfterSave: apiKeyEditingPresetId === presetId,
        });
      }

      const refreshedPreset = getDraftPresetById(presetId);
      if (!refreshedPreset) {
        return;
      }

      if (
        !getPresetValidationState(
          refreshedPreset,
          presetApiKeyDraftsRef.current[presetId] ?? "",
        ).isValid
      ) {
        return;
      }

      try {
        const savedSettings = await persistSettings({
          ...settingsRef.current,
          activePresetId: presetId,
        });
        setSessionFallbackPresetId(null);

        updateSettingsDraftState(
          settingsDraftRef.current
            ? {
                ...settingsDraftRef.current,
                activePresetId: savedSettings.activePresetId,
              }
            : settingsDraftRef.current,
        );
      } catch (error) {
        console.error("Failed to activate preset:", error);
        showToast({
          message: t("toast.couldNotSwitchActiveProvider"),
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [
      apiKeyEditingPresetId,
      flushPresetAutosave,
      getDraftPresetById,
      persistSettings,
      showToast,
      updateSettingsDraftState,
    ],
  );

  // handleAddPreset
  const handleAddPreset = useCallback(
    (providerKind: TranslationProviderKind) => {
      const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
      const nextPreset = normalizePresetDraft(
        createPresetDraft(providerKind, sourceSettings.presets),
        sourceSettings.presets,
      );
      const nextSettings = {
        ...sourceSettings,
        presets: [...sourceSettings.presets, nextPreset],
      };

      updateSettingsDraftState(nextSettings);
      updatePresetSaveStatus(
        nextPreset.id,
        getPresetSaveStatus(nextPreset, ""),
      );
      setPresetStatuses((prev) => ({
        ...prev,
        [nextPreset.id]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [nextPreset.id]: undefined,
      }));
      setEditingPresetId(nextPreset.id);

      return nextPreset.id;
    },
    [updatePresetSaveStatus, updateSettingsDraftState],
  );

  // handleDeletePreset
  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      const liveSettings = settingsRef.current;
      const currentDraft = settingsDraftRef.current ?? liveSettings;
      const livePresetExists = liveSettings.presets.some(
        (preset) => preset.id === presetId,
      );

      if (!livePresetExists) {
        const nextDraft = {
          ...currentDraft,
          presets: currentDraft.presets.filter(
            (preset) => preset.id !== presetId,
          ),
        };
        updateSettingsDraftState(nextDraft);
        clearPresetLocalArtifacts(presetId);
        if (editingPresetId === presetId) {
          setEditingPresetId(null);
        }
        return;
      }

      const nextLivePresets = liveSettings.presets.filter(
        (preset) => preset.id !== presetId,
      );
      const nextActivePresetId =
        liveSettings.activePresetId === presetId
          ? (nextLivePresets[0]?.id ?? "")
          : liveSettings.activePresetId;

      try {
        const savedSettings = await persistSettings({
          ...liveSettings,
          activePresetId: nextActivePresetId,
          presets: nextLivePresets,
        });

        updateSettingsDraftState({
          ...currentDraft,
          activePresetId: savedSettings.activePresetId,
          presets: currentDraft.presets.filter(
            (preset) => preset.id !== presetId,
          ),
        });
        clearPresetLocalArtifacts(presetId);
        if (editingPresetId === presetId) {
          setEditingPresetId(null);
        }
      } catch (error) {
        console.error("Failed to delete preset:", error);
        showToast({
          message: t("toast.couldNotDeleteProvider"),
          tone: "error",
          durationMs: 4200,
        });
      }
    },
    [
      clearPresetLocalArtifacts,
      editingPresetId,
      persistSettings,
      showToast,
      updateSettingsDraftState,
    ],
  );

  // schedulePresetAutosave
  const schedulePresetAutosave = useCallback(
    (presetId: string) => {
      clearPendingPresetAutosave();

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const apiKeyInput = presetApiKeyDraftsRef.current[presetId] ?? "";
      if (!canPersistPresetDraft(draftPreset, apiKeyInput)) {
        updatePresetSaveStatus(presetId, {
          state: "invalid",
          detail: getPresetMissingRequirement(draftPreset, apiKeyInput),
        });
        return;
      }

      updatePresetSaveStatus(presetId, { state: "dirty" });
      presetAutosavePresetIdRef.current = presetId;
      presetAutosaveTimerRef.current = window.setTimeout(() => {
        presetAutosaveTimerRef.current = null;
        presetAutosavePresetIdRef.current = null;
        void persistPresetDraft(presetId);
      }, PRESET_AUTOSAVE_DELAY_MS);
    },
    [
      clearPendingPresetAutosave,
      getDraftPresetById,
      persistPresetDraft,
      updatePresetSaveStatus,
    ],
  );

  // handlePresetChange
  const handlePresetChange = useCallback(
    (nextPreset: TranslationPreset) => {
      const sourceSettings = settingsDraftRef.current ?? settingsRef.current;
      const currentPreset = sourceSettings.presets.find(
        (preset) => preset.id === nextPreset.id,
      );
      const providerChanged =
        currentPreset?.providerKind !== undefined &&
        currentPreset.providerKind !== nextPreset.providerKind;
      const modelChanged =
        currentPreset !== undefined &&
        (currentPreset.model ?? "").trim() !== nextPreset.model.trim();
      const shouldClearCustomLabel = providerChanged || modelChanged;
      const baseUrlChanged =
        (currentPreset?.baseUrl ?? "") !== (nextPreset.baseUrl ?? "");

      const candidate = providerChanged
        ? {
            ...nextPreset,
            model: "",
            customLabel: undefined,
            baseUrl:
              nextPreset.providerKind === "openai-compatible"
                ? nextPreset.baseUrl
                : undefined,
          }
        : shouldClearCustomLabel
          ? { ...nextPreset, customLabel: undefined }
          : nextPreset;

      const normalizedPreset = normalizePresetDraft(
        candidate,
        sourceSettings.presets,
      );
      const nextSettings = {
        ...sourceSettings,
        presets: sourceSettings.presets.map((preset) =>
          preset.id === normalizedPreset.id ? normalizedPreset : preset,
        ),
      };

      updateSettingsDraftState(nextSettings);
      setPresetStatuses((prev) => ({
        ...prev,
        [normalizedPreset.id]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [normalizedPreset.id]: undefined,
      }));

      if (providerChanged || baseUrlChanged) {
        setPresetModels((prev) => {
          const { [normalizedPreset.id]: _removed, ...rest } = prev;
          return rest;
        });
        setPresetModelAutoLoadAttempts((prev) => {
          const { [normalizedPreset.id]: _removed, ...rest } = prev;
          return rest;
        });
      }

      schedulePresetAutosave(normalizedPreset.id);
    },
    [schedulePresetAutosave, updateSettingsDraftState],
  );

  // handlePresetApiKeyInputChange
  const handlePresetApiKeyInputChange = useCallback(
    (presetId: string, apiKey: string) => {
      setPresetApiKeyDrafts((prev) => ({
        ...prev,
        [presetId]: apiKey,
      }));
      setPresetStatuses((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));
      setPresetModelMessages((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));
      setPresetModelAutoLoadAttempts((prev) => {
        const { [presetId]: _removed, ...rest } = prev;
        return rest;
      });

      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }

      const nextStatus = canPersistPresetDraft(draftPreset, apiKey)
        ? { state: "dirty" as const }
        : {
            state: "invalid" as const,
            detail: getPresetMissingRequirement(draftPreset, apiKey),
          };
      updatePresetSaveStatus(presetId, nextStatus);

      clearPendingPresetAutosave();
      if (nextStatus.state === "dirty") {
        presetAutosavePresetIdRef.current = presetId;
        presetAutosaveTimerRef.current = window.setTimeout(() => {
          presetAutosaveTimerRef.current = null;
          presetAutosavePresetIdRef.current = null;
          void persistPresetDraft(presetId);
        }, PRESET_AUTOSAVE_DELAY_MS);
      }
    },
    [
      clearPendingPresetAutosave,
      getDraftPresetById,
      persistPresetDraft,
      updatePresetSaveStatus,
    ],
  );

  // handlePresetApiKeyBlur
  const handlePresetApiKeyBlur = useCallback(
    async (presetId: string) => {
      setApiKeyEditingPresetId((current) =>
        current === presetId ? null : current,
      );
      await flushDirtyPresetSaves({
        clearBlurredApiKeyPresetId: presetId,
      });
    },
    [flushDirtyPresetSaves],
  );

  // handleTestPreset
  const handleTestPreset = useCallback(
    async (presetId: string) => {
      const draftPreset = getDraftPresetById(presetId);
      if (!draftPreset) {
        return;
      }
      const sourceSettings = settingsDraftRef.current ?? settingsRef.current;

      setPresetTestRunningId(presetId);
      setPresetStatuses((prev) => ({
        ...prev,
        [presetId]: undefined,
      }));

      try {
        const result = (await invoke("test_translation_preset", {
          preset: getPresetDraft(draftPreset),
          targetLanguage: resolveTargetLanguage(
            sourceSettings.defaultLanguage,
            sourceSettings.appLanguage,
            systemLocale,
          ),
        })) as PresetTestResult;
        const friendlyResult = getFriendlyPresetTestResult(result);
        setPresetStatuses((prev) => ({
          ...prev,
          [friendlyResult.presetId]: friendlyResult,
        }));
        if (!friendlyResult.ok) {
          showToast({
            message: friendlyResult.message,
            detail: friendlyResult.detail,
            tone: "error",
            durationMs: 5200,
          });
        }
      } catch (error) {
        console.error("Failed to test preset:", error);
        const friendlyError = getFriendlyProviderError(error);
        const detail = getProviderErrorDetail(error);
        setPresetStatuses((prev) => ({
          ...prev,
          [presetId]: {
            presetId,
            label: draftPreset.label,
            ok: false,
            message: friendlyError.message,
            detail,
          },
        }));
        showToast({
          message: friendlyError.message,
          detail,
          tone: "error",
          durationMs: 5200,
        });
      } finally {
        setPresetTestRunningId((current) =>
          current === presetId ? null : current,
        );
      }
    },
    [getPresetDraft, getDraftPresetById, showToast],
  );

  // handleTestAllPresets
  const handleTestAllPresets = useCallback(async () => {
    const sourceSettings = settingsDraftRef.current ?? settingsRef.current;

    setTestAllPresetsRunning(true);

    try {
      const results = (await invoke("test_all_translation_presets", {
        presets: sourceSettings.presets.map((preset) => getPresetDraft(preset)),
        targetLanguage: resolveTargetLanguage(
          sourceSettings.defaultLanguage,
          sourceSettings.appLanguage,
          systemLocale,
        ),
      })) as PresetTestResult[];
      const friendlyResults = results.map(getFriendlyPresetTestResult);

      setPresetStatuses((prev) => ({
        ...prev,
        ...Object.fromEntries(
          friendlyResults.map((result) => [result.presetId, result]),
        ),
      }));
      const failedResults = friendlyResults.filter((result) => !result.ok);
      if (failedResults.length === 1) {
        showToast({
          message: failedResults[0].message,
          detail: failedResults[0].detail,
          tone: "error",
          durationMs: 5200,
        });
      } else if (failedResults.length > 1) {
        showToast({
          message: t("toast.presetTestsFailed", { count: String(failedResults.length) }),
          detail: t("toast.hoverWarningForDetails"),
          tone: "error",
          durationMs: 5600,
        });
      }
    } catch (error) {
      console.error("Failed to test all presets:", error);
      showToast({
        message: t("toast.couldNotTestAllPresets"),
        detail: getProviderErrorDetail(error),
        tone: "error",
        durationMs: 5200,
      });
    } finally {
      setTestAllPresetsRunning(false);
    }
  }, [getPresetDraft, showToast]);

  // discardUnsavedSettingsAndClose
  const discardUnsavedSettingsAndClose = useCallback(() => {
    setSettingsOpen(false);
    resetSettingsDialogState();
  }, [resetSettingsDialogState]);

  // handleSettingsOpenChange
  const handleSettingsOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        if (!settingsOpen) {
          handleOpenSettings();
        }
        return;
      }

      setSettingsClosePending(true);
      try {
        await flushDirtyPresetSaves({
          clearBlurredApiKeyPresetId: apiKeyEditingPresetId ?? undefined,
        });

        if (collectBlockingUnsavedPresetIds().length > 0) {
          setSettingsCloseConfirmOpen(true);
          return;
        }

        discardUnsavedSettingsAndClose();
      } finally {
        setSettingsClosePending(false);
      }
    },
    [
      apiKeyEditingPresetId,
      collectBlockingUnsavedPresetIds,
      discardUnsavedSettingsAndClose,
      flushDirtyPresetSaves,
      handleOpenSettings,
      settingsOpen,
    ],
  );

  // handleClearAllTranslationCache
  const handleClearAllTranslationCache = useCallback(async () => {
    setTranslationCacheActionTarget("all");

    try {
      await invoke("clear_all_translation_cache");
      await refreshTranslationCacheSummary();
      showToast({
        message: t("toast.cacheCleared"),
        durationMs: 3200,
      });
    } catch (error) {
      console.error("Failed to clear all translation cache:", error);
      showToast({
        message: t("toast.couldNotClearCache"),
        tone: "error",
        durationMs: 4200,
      });
    } finally {
      setTranslationCacheActionTarget((current) =>
        current === "all" ? null : current,
      );
    }
  }, [refreshTranslationCacheSummary, showToast]);

  // handleClearCachedBookTranslations
  const handleClearCachedBookTranslations = useCallback(
    async (docId: string, title: string, languageCode: string) => {
      const actionTarget = `${docId}:${languageCode}`;
      setTranslationCacheActionTarget(actionTarget);

      try {
        await invoke("clear_cached_book_language_translations", {
          docId,
          languageCode,
        });
        await refreshTranslationCacheSummary();
        showToast({
          message: t("toast.deletedCachedPagesFor", { title }),
          durationMs: 3200,
        });
      } catch (error) {
        console.error("Failed to clear cached book translations:", error);
        showToast({
          message: t("toast.couldNotDeleteCachedPages"),
          tone: "error",
          durationMs: 4200,
        });
      } finally {
        setTranslationCacheActionTarget((current) =>
          current === actionTarget ? null : current,
        );
      }
    },
    [refreshTranslationCacheSummary, showToast],
  );

  return {
    settings,
    setSettings,
    settingsDraft,
    settingsLoaded,
    settingsOpen,
    settingsCloseConfirmOpen,
    setSettingsCloseConfirmOpen,
    settingsClosePending,
    sessionFallbackPresetId,
    setSessionFallbackPresetId,
    systemLocale,
    translationCacheSummary,
    translationCacheLoading,
    translationCacheActionTarget,
    editingPresetId,
    apiKeyEditingPresetId,
    setApiKeyEditingPresetId,
    presetApiKeyDrafts,
    presetStatuses,
    presetSaveStatusById,
    presetTestRunningId,
    presetModelsLoadingById,
    presetModels,
    presetModelMessages,
    presetModelAutoLoadAttempts,
    testAllPresetsRunning,
    effectiveAppLanguage,
    effectivePreset,
    savedActivePreset,
    activePresetHasTranslationContext,
    activePresetHasLiveSetup,

    settingsRef,
    settingsDraftRef,
    sessionFallbackPresetIdRef,

    getEffectivePreset,
    buildPersistableSettings,
    persistSettings,
    updateSettingsDraftState,
    handleThemeToggle,
    handleOpenSettings,
    handleSettingsOpenChange,
    handleEditingPresetChange,
    handleActivatePreset,
    handleAddPreset,
    handleDeletePreset,
    handlePresetChange,
    handlePresetApiKeyInputChange,
    handlePresetApiKeyBlur,
    flushPresetAutosave,
    handleTestPreset,
    handleTestAllPresets,
    handleFetchPresetModels,
    handleClearAllTranslationCache,
    handleClearCachedBookTranslations,
    resetSettingsDialogState,
    discardUnsavedSettingsAndClose,
    collectBlockingUnsavedPresetIds,
    showTranslationSetupToast,
  };
}
