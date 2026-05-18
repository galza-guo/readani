import * as Dialog from "@radix-ui/react-dialog";
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
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
