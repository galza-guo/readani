import { useEffect } from "react";
import type { AccentColor, ThemeMode } from "../types";

export function useTheme(theme: ThemeMode, accentColor: AccentColor): void {
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const resolveTheme = () => {
      const systemTheme = mediaQuery.matches ? "dark" : "light";
      const resolved =
        theme === "system" ? systemTheme : theme;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    };

    resolveTheme();

    if (theme === "system") {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", resolveTheme);
        return () => mediaQuery.removeEventListener("change", resolveTheme);
      }
      mediaQuery.addListener(resolveTheme);
      return () => mediaQuery.removeListener(resolveTheme);
    }

    return undefined;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const accent = accentColor;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "system" && systemDark);

    const palette: Record<AccentColor, { light: [string, string, string, string, string, string, string]; dark: [string, string, string, string, string, string, string] }> = {
      blue: {
        light: ["#007aff", "#0066d6", "#0055b3", "rgba(0, 122, 255, 0.1)", "rgba(0, 122, 255, 0.12)", "rgba(0, 122, 255, 0.2)", "rgba(0, 122, 255, 0.06)"],
        dark: ["#0a84ff", "#409cff", "#64b5ff", "rgba(10, 132, 255, 0.2)", "rgba(10, 132, 255, 0.15)", "rgba(10, 132, 255, 0.25)", "rgba(10, 132, 255, 0.12)"],
      },
      purple: {
        light: ["#7c3aed", "#6d28d9", "#5b21b6", "rgba(124, 58, 237, 0.1)", "rgba(124, 58, 237, 0.12)", "rgba(124, 58, 237, 0.2)", "rgba(124, 58, 237, 0.06)"],
        dark: ["#a78bfa", "#8b5cf6", "#7c3aed", "rgba(167, 139, 250, 0.2)", "rgba(167, 139, 250, 0.15)", "rgba(167, 139, 250, 0.25)", "rgba(167, 139, 250, 0.12)"],
      },
      pink: {
        light: ["#ec4899", "#db2777", "#be185d", "rgba(236, 72, 153, 0.1)", "rgba(236, 72, 153, 0.12)", "rgba(236, 72, 153, 0.2)", "rgba(236, 72, 153, 0.06)"],
        dark: ["#f472b6", "#ec4899", "#db2777", "rgba(244, 114, 182, 0.2)", "rgba(244, 114, 182, 0.15)", "rgba(244, 114, 182, 0.25)", "rgba(244, 114, 182, 0.12)"],
      },
      red: {
        light: ["#ef4444", "#dc2626", "#b91c1c", "rgba(239, 68, 68, 0.1)", "rgba(239, 68, 68, 0.12)", "rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0.06)"],
        dark: ["#f87171", "#ef4444", "#dc2626", "rgba(248, 113, 113, 0.2)", "rgba(248, 113, 113, 0.15)", "rgba(248, 113, 113, 0.25)", "rgba(248, 113, 113, 0.12)"],
      },
      orange: {
        light: ["#f97316", "#ea580c", "#c2410c", "rgba(249, 115, 22, 0.1)", "rgba(249, 115, 22, 0.12)", "rgba(249, 115, 22, 0.2)", "rgba(249, 115, 22, 0.06)"],
        dark: ["#fb923c", "#f97316", "#ea580c", "rgba(251, 146, 60, 0.2)", "rgba(251, 146, 60, 0.15)", "rgba(251, 146, 60, 0.25)", "rgba(251, 146, 60, 0.12)"],
      },
      green: {
        light: ["#22c55e", "#16a34a", "#15803d", "rgba(34, 197, 94, 0.1)", "rgba(34, 197, 94, 0.12)", "rgba(34, 197, 94, 0.2)", "rgba(34, 197, 94, 0.06)"],
        dark: ["#4ade80", "#22c55e", "#16a34a", "rgba(74, 222, 128, 0.2)", "rgba(74, 222, 128, 0.15)", "rgba(74, 222, 128, 0.25)", "rgba(74, 222, 128, 0.12)"],
      },
      teal: {
        light: ["#14b8a6", "#0d9488", "#0f766e", "rgba(20, 184, 166, 0.1)", "rgba(20, 184, 166, 0.12)", "rgba(20, 184, 166, 0.2)", "rgba(20, 184, 166, 0.06)"],
        dark: ["#2dd4bf", "#14b8a6", "#0d9488", "rgba(45, 212, 191, 0.2)", "rgba(45, 212, 191, 0.15)", "rgba(45, 212, 191, 0.25)", "rgba(45, 212, 191, 0.12)"],
      },
    };

    const v = isDark ? palette[accent].dark : palette[accent].light;
    root.style.setProperty("--accent", v[0]);
    root.style.setProperty("--accent-hover", v[1]);
    root.style.setProperty("--accent-strong", v[2]);
    root.style.setProperty("--accent-muted", v[3]);
    root.style.setProperty("--highlight", v[4]);
    root.style.setProperty("--highlight-strong", v[5]);
    root.style.setProperty("--sentence-active", v[6]);
  }, [accentColor, theme]);
}