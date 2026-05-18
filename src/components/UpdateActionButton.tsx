import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import { t } from "../lib/i18n";

type UpdateActionButtonProps = {
  onClick: () => void;
  labelDirection?: "left" | "right";
  className?: string;
};

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}

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
        <DownloadIcon />
      </span>
    </ExpandableIconButton>
  );
}
