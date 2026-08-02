"use client";

import { useId, useSyncExternalStore } from "react";

import {
  applyTheme,
  getThemeMode,
  subscribeToThemeMode,
} from "@/components/ui/theme-store";
import { parseThemeMode, type ThemeMode } from "@/lib/ui/theme";

type ThemeSelectorProps = {
  variant?: "compact" | "full";
  compact?: boolean;
};

function getServerThemeMode(): ThemeMode {
  return "auto";
}

export function ThemeSelector({ variant = "compact", compact = false }: ThemeSelectorProps) {
  const mode = useSyncExternalStore(subscribeToThemeMode, getThemeMode, getServerThemeMode);
  const id = useId();
  const resolvedVariant = compact ? "compact" : variant;

  const selectId = `theme-selector-${id}`;
  const containerClassName = resolvedVariant === "full"
    ? "sen-theme-selector sen-theme-selector-full grid w-full gap-1.5"
    : "sen-theme-selector sen-theme-selector-compact inline-flex items-center";

  return (
    <div className={containerClassName}>
      <label
        htmlFor={selectId}
        className={resolvedVariant === "compact"
          ? "sr-only"
          : "text-[0.7rem] font-extrabold uppercase tracking-[0.04em]"}
      >
        Appearance
      </label>
      <select
        id={selectId}
        value={mode}
        className="sen-theme-select min-h-9 rounded-md border border-current bg-transparent px-2 py-1 text-inherit"
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
