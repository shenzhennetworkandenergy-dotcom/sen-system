import {
  parseThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/ui/theme";

export const colorSchemeQuery = "(prefers-color-scheme: dark)";
export const THEME_CHANGE_EVENT = "sen-theme-change";

export function applyTheme(mode: ThemeMode, persist: boolean) {
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

export function getThemeMode() {
  return parseThemeMode(document.documentElement.dataset.themeMode);
}

export function subscribeToThemeMode(onStoreChange: () => void) {
  const handleThemeChange = () => onStoreChange();
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
}
