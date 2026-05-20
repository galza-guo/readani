import * as Dialog from "@radix-ui/react-dialog";
import { t } from "../lib/i18n";

type ConfirmationDialogAction = {
  label: string;
  onSelect: () => void;
  variant?: "default" | "primary" | "danger";
};

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel?: string;
  actions: ConfirmationDialogAction[];
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = t("common.cancel"),
  actions,
}: ConfirmationDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay app-scrim" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title type-title-large">{title}</Dialog.Title>
          <Dialog.Description className="dialog-description type-meta">
            {description}
          </Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="btn">{cancelLabel}</button>
            </Dialog.Close>
            {actions.map((action) => (
              <button
                key={action.label}
                className={`btn ${
                  action.variant === "primary"
                    ? "btn-primary"
                    : action.variant === "danger"
                      ? "btn-danger"
                      : ""
                }`}
                onClick={action.onSelect}
              >
                {action.label}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
