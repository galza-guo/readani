import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import type { ThemeMode } from "../types";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";
import { t } from "../lib/i18n";

type ThemeToggleButtonProps = {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
  showHoverLabel?: boolean;
  labelDirection?: "left" | "right";
  hoverLabel?: string;
};

export function ThemeToggleButton({
  theme,
  onToggle,
  className,
  showHoverLabel = false,
  labelDirection = "left",
  hoverLabel = void 0,
}: ThemeToggleButtonProps) {
  const icon =
    theme === "light" ? <Sun size={18} weight="regular" /> : theme === "dark" ? <Moon size={18} weight="regular" /> : <Desktop size={18} weight="regular" />;
  const resolvedHoverLabel = hoverLabel ?? t("theme.switch");
  const label =
    theme === "light" ? t("theme.light") : theme === "dark" ? t("theme.dark") : t("theme.system");

  if (showHoverLabel) {
    return (
      <ExpandableIconButton
        className={className}
        onClick={onToggle}
        aria-label={label}
        label={resolvedHoverLabel}
        labelDirection={labelDirection}
      >
        {icon}
      </ExpandableIconButton>
    );
  }

  return (
    <button
      className={className}
      onClick={onToggle}
      aria-label={label}
      type="button"
    >
      {icon}
    </button>
  );
}
