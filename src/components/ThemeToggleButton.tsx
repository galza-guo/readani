import type { ThemeMode } from "../types";
import { ExpandableIconButton } from "./reader/ExpandableIconButton";

type ThemeToggleButtonProps = {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
  showHoverLabel?: boolean;
  labelDirection?: "left" | "right";
  hoverLabel?: string;
};

function SystemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="M4.9 4.9 6.7 6.7" />
      <path d="M17.3 17.3 19.1 19.1" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="M4.9 19.1 6.7 17.3" />
      <path d="M17.3 6.7 19.1 4.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z" />
    </svg>
  );
}

export function ThemeToggleButton({
  theme,
  onToggle,
  className,
  showHoverLabel = false,
  labelDirection = "left",
  hoverLabel = "Theme",
}: ThemeToggleButtonProps) {
  const icon =
    theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <SystemIcon />;
  const label =
    theme === "light" ? "Theme: Light" : theme === "dark" ? "Theme: Dark" : "Theme: System";

  if (showHoverLabel) {
    return (
      <ExpandableIconButton
        className={className}
        onClick={onToggle}
        aria-label={label}
        label={hoverLabel}
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
