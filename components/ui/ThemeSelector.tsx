"use client";

import { useEffect, useId, useSyncExternalStore } from "react";

import {
  parseThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/ui/theme";

type ThemeSelectorProps = {
  variant?: "compact" | "full";
  compact?: boolean;
};

const colorSchemeQuery = "(prefers-color-scheme: dark)";
const THEME_CHANGE_EVENT = "sen-theme-change";

function applyTheme(mode: ThemeMode, persist: boolean) {
  const root = document.documentElement;
  const resolved = resolveTheme(mode, window.matchMedia(colorSchemeQuery).matches);

  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Appearance selection remains usable when storage is unavailable.
    }

  }

  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
}

function getThemeMode() {
  return parseThemeMode(document.documentElement.dataset.themeMode);
}

function getServerThemeMode(): ThemeMode {
  return "auto";
}

function subscribeToThemeMode(onStoreChange: () => void) {
  const handleThemeChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(parseThemeMode(event.newValue), false);
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function ThemeSelector({ variant = "compact", compact = false }: ThemeSelectorProps) {
  const mode = useSyncExternalStore(subscribeToThemeMode, getThemeMode, getServerThemeMode);
  const id = useId();
  const resolvedVariant = compact ? "compact" : variant;

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const mediaQuery = window.matchMedia(colorSchemeQuery);
    const handleChange = () => applyTheme("auto", false);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  const selectId = `theme-selector-${id}`;
  const containerClassName = resolvedVariant === "full"
    ? "grid w-full gap-1.5"
    : "inline-flex items-center gap-1.5";

  return (
    <div className={containerClassName}>
      <label htmlFor={selectId} className="text-[0.7rem] font-extrabold uppercase tracking-[0.04em]">Appearance</label>
      <select
        id={selectId}
        value={mode}
        className="min-h-9 rounded-md border border-current bg-transparent px-2 py-1 text-inherit"
        onChange={(event) => {
          const nextMode = parseThemeMode(event.target.value);
          applyTheme(nextMode, true);
        }}
      >
        <option value="auto" className="bg-white text-slate-900">Auto</option>
        <option value="light" className="bg-white text-slate-900">Light</option>
        <option value="dark" className="bg-white text-slate-900">Dark</option>
      </select>
    </div>
  );
}
