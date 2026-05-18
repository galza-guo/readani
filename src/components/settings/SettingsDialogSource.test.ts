import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSettingsDialogSource() {
  return readFileSync(resolve(import.meta.dir, "SettingsDialog.tsx"), "utf8");
}

function readAppSource() {
  return readFileSync(resolve(import.meta.dir, "..", "..", "App.tsx"), "utf8");
}

describe("settings dialog focus behavior", () => {
  test("keeps focus on the dialog container when settings opens", () => {
    const settingsDialogSource = readSettingsDialogSource();

    expect(settingsDialogSource).toContain("<Dialog.Content");
    expect(settingsDialogSource).toContain("onOpenAutoFocus={(event) => {");
    expect(settingsDialogSource).toContain("event.preventDefault();");
    expect(settingsDialogSource).toContain("const target = event.currentTarget as HTMLElement | null;");
    expect(settingsDialogSource).toContain("target?.focus();");
    expect(settingsDialogSource).toContain("tabIndex={-1}");
  });

  test("renders a fixed settings header bar with a plain close affordance", () => {
    const settingsDialogSource = readSettingsDialogSource();

    expect(settingsDialogSource).toContain('className="settings-dialog-header"');
    expect(settingsDialogSource).toContain('className="settings-dialog-title-row"');
    expect(settingsDialogSource).toContain('className="dialog-title type-title-large"');
    expect(settingsDialogSource).toContain('aria-label={t("common.close")}');
    expect(settingsDialogSource).toContain('title={closeDisabled ? t("common.closing") : t("common.close")}');
    expect(settingsDialogSource).toContain('className="settings-dialog-body"');
  });

  test("app uses the shared settings dialog instead of an inline dialog shell", () => {
    const appSource = readAppSource();

    expect(appSource).toContain('import { SettingsDialog } from "./components/settings/SettingsDialog";');
    expect(appSource).toContain("<SettingsDialog");
    expect(appSource).not.toContain('import * as Dialog from "@radix-ui/react-dialog";');
    expect(appSource).not.toContain("<Dialog.Content");
  });

  test("app warns before closing when unfinished provider drafts still exist", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("settingsCloseConfirmOpen");
    expect(appSource).toContain("collectBlockingUnsavedPresetIds");
    expect(appSource).toContain('t("dialog.discardUnsavedChangesTitle")');
    expect(appSource).not.toContain("discardAllUnsavedSettings");
    expect(appSource).not.toContain("handleSettingsDone");
  });

  test("app only persists a preset before activation when that preset actually has unsaved changes", () => {
    const appSource = readAppSource();

    expect(appSource).toContain("const currentSaveState =");
    expect(appSource).toContain("const shouldPersistDraftBeforeActivation =");
    expect(appSource).toContain('currentSaveState !== "pristine" && currentSaveState !== "saved"');
  });
});
