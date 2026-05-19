import { DownloadSimple } from "@phosphor-icons/react";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import { t } from "../lib/i18n";

type UpdateActionButtonProps = {
  onClick: () => void;
  labelDirection?: "left" | "right";
  className?: string;
};

export function UpdateActionButton({
  onClick,
  labelDirection = "left",
  className,
}: UpdateActionButtonProps) {
  return (
    <ExpandableIconButton
      aria-label={t("update.readyToInstall")}
      className={["update-action-button", className].filter(Boolean).join(" ")}
      label={t("common.update")}
      labelDirection={labelDirection}
      onClick={onClick}
    >
      <span className="update-action-button__badge" aria-hidden="true">
        <DownloadSimple size={18} weight="regular" />
      </span>
    </ExpandableIconButton>
  );
}
