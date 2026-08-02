export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sen-theme-mode";

const themeModeGlyphs: Record<ThemeMode, string> = {
  auto: "◐",
  light: "☀",
  dark: "☾",
};

export function themeModeGlyph(mode: ThemeMode) {
  return themeModeGlyphs[mode];
}

export function parseThemeMode(value: unknown): ThemeMode {
  return value === "auto" || value === "light" || value === "dark"
    ? value
    : "auto";
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "auto") {
    return prefersDark ? "dark" : "light";
  }

  return mode;
}
