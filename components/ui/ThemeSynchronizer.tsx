"use client";

import { useEffect } from "react";

import {
  applyTheme,
  colorSchemeQuery,
  getThemeMode,
} from "@/components/ui/theme-store";
import { parseThemeMode, THEME_STORAGE_KEY } from "@/lib/ui/theme";

export function ThemeSynchronizer() {
  useEffect(() => {
    const mediaQuery = window.matchMedia(colorSchemeQuery);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        applyTheme(parseThemeMode(event.newValue), false);
      }
    };
    const handleSystemThemeChange = () => {
      if (getThemeMode() !== "auto") {
        return;
      }
      applyTheme("auto", false);
    };

    window.addEventListener("storage", handleStorage);
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  return null;
}
