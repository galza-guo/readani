import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import {
  SettingsDialogContent,
  type SettingsDialogContentProps,
} from "./SettingsDialogContent";
import { t } from "../../lib/i18n";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeDisabled?: boolean;
  contentProps: SettingsDialogContentProps;
};

export function SettingsDialog({
  open,
  onOpenChange,
  closeDisabled = false,
  contentProps,
}: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content-settings"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const target = event.currentTarget as HTMLElement | null;
            target?.focus();
          }}
          tabIndex={-1}
        >
          <div className="settings-dialog-header">
            <div className="settings-dialog-title-row">
              <Dialog.Title className="dialog-title type-title-large">{t("common.settings")}</Dialog.Title>
            </div>
            <button
              aria-label={t("common.close")}
              className="btn btn-ghost btn-icon-only settings-dialog-done-button"
              disabled={closeDisabled}
              onClick={() => {
                void Promise.resolve(onOpenChange(false)).catch(() => {});
              }}
              title={closeDisabled ? t("common.closing") : t("common.close")}
              type="button"
            >
              <X size={18} weight="regular" />
            </button>
          </div>
          <div className="settings-dialog-body">
            <SettingsDialogContent {...contentProps} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
