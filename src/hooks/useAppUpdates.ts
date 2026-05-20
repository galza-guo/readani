import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { READANI_RELEASES_URL } from "../lib/release";
import { t } from "../lib/i18n";

export type UpdateCheckSource = "automatic" | "manual";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string }
  | { phase: "ready"; version: string }
  | { phase: "installing"; version: string }
  | { phase: "error"; message: string };

export type AppUpdatesResult = {
  updateState: UpdateState;
  showReadyUpdateAction: boolean;
  aboutUpdateStatusMessage: string | null;
  handleCheckForUpdates: (source: UpdateCheckSource) => Promise<void>;
  handleInstallUpdate: () => Promise<void>;
  handleOpenLatestRelease: () => Promise<void>;
};

function getUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function useAppUpdates(showToast: (args: { message: string; tone?: "success" | "error"; durationMs?: number }) => void): AppUpdatesResult {
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: "idle",
  });

  const autoUpdateCheckStartedRef = useRef(false);
  const pendingUpdateRef = useRef<Update | null>(null);

  const clearPendingUpdate = useCallback(() => {
    const currentUpdate = pendingUpdateRef.current;
    pendingUpdateRef.current = null;

    if (currentUpdate) {
      void currentUpdate.close().catch(() => {});
    }
  }, []);

  const storePendingUpdate = useCallback((update: Update) => {
    const previousUpdate = pendingUpdateRef.current;
    pendingUpdateRef.current = update;

    if (previousUpdate && previousUpdate !== update) {
      void previousUpdate.close().catch(() => {});
    }
  }, []);

  const handleCheckForUpdates = useCallback(
    async (source: UpdateCheckSource) => {
      if (updateState.phase === "checking") {
        return;
      }

      if (updateState.phase === "downloading") {
        if (source === "manual") {
          showToast({ message: t("update.alreadyDownloading") });
        }
        return;
      }

      if (updateState.phase === "ready") {
        if (source === "manual") {
          showToast({
            message: t("update.readyToInstall"),
            tone: "success",
          });
        }
        return;
      }

      if (updateState.phase === "installing") {
        return;
      }

      setUpdateState({ phase: "checking" });

      try {
        const update = await check();

        if (!update) {
          clearPendingUpdate();
          setUpdateState({ phase: "idle" });

          if (source === "manual") {
            showToast({
              message: t("update.latestVersion"),
              tone: "success",
            });
          }
          return;
        }

        storePendingUpdate(update);
        setUpdateState({ phase: "downloading", version: update.version });
        showToast({ message: t("update.foundUpdate") });
        await update.download();
        setUpdateState({ phase: "ready", version: update.version });
      } catch (error) {
        clearPendingUpdate();
        const message = getUpdateErrorMessage(error);
        setUpdateState({ phase: "error", message });

        if (source === "manual") {
          showToast({
            message: t("update.failedMessage", { message }),
            tone: "error",
            durationMs: 5200,
          });
        } else {
          console.error("Background updater failed:", error);
        }
      }
    },
    [clearPendingUpdate, showToast, storePendingUpdate, updateState.phase],
  );

  const handleInstallUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current;

    if (!update || updateState.phase !== "ready") {
      return;
    }

    setUpdateState({ phase: "installing", version: update.version });

    try {
      await update.install();
      await relaunch();
    } catch (error) {
      const message = getUpdateErrorMessage(error);
      setUpdateState({ phase: "ready", version: update.version });
      showToast({
        message: t("update.failedMessage", { message }),
        tone: "error",
        durationMs: 5200,
      });
    }
  }, [showToast, updateState.phase]);

  const handleOpenLatestRelease = useCallback(async () => {
    try {
      await openUrl(READANI_RELEASES_URL);
    } catch (error) {
      showToast({
        message: t("update.failedMessage", { message: getUpdateErrorMessage(error) }),
        tone: "error",
        durationMs: 5200,
      });
    }
  }, [showToast]);

  useEffect(() => {
    if (autoUpdateCheckStartedRef.current) {
      return;
    }

    autoUpdateCheckStartedRef.current = true;
    void handleCheckForUpdates("automatic");
  }, [handleCheckForUpdates]);

  useEffect(() => {
    return () => {
      clearPendingUpdate();
    };
  }, [clearPendingUpdate]);

  const showReadyUpdateAction = updateState.phase === "ready";

  const aboutUpdateStatusMessage = useMemo(() => {
    switch (updateState.phase) {
      case "checking":
        return t("update.checking");
      case "downloading":
        return t("update.downloadingVersion", { version: updateState.version });
      case "ready":
        return t("update.updateReady", { version: updateState.version });
      case "installing":
        return t("update.installingVersion", { version: updateState.version });
      case "error":
        return `Last update error: ${updateState.message}`;
      default:
        return null;
    }
  }, [updateState]);

  return {
    updateState,
    showReadyUpdateAction,
    aboutUpdateStatusMessage,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleOpenLatestRelease,
  };
}