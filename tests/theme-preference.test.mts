import assert from "node:assert/strict";
import test from "node:test";

import {
  parseThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeModeGlyph,
} from "../lib/ui/theme.ts";

test("preserves supported appearance preferences", () => {
  assert.equal(parseThemeMode("auto"), "auto");
  assert.equal(parseThemeMode("light"), "light");
  assert.equal(parseThemeMode("dark"), "dark");
});

test("falls back to Auto for missing or unsupported appearance preferences", () => {
  assert.equal(parseThemeMode(undefined), "auto");
  assert.equal(parseThemeMode("system"), "auto");
  assert.equal(parseThemeMode("Dark"), "auto");
});

test("resolves explicit and automatic appearance preferences", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
});

test("uses the stable appearance preference storage key", () => {
  assert.equal(THEME_STORAGE_KEY, "sen-theme-mode");
});

test("gives every appearance preference a compact recognizable glyph", () => {
  assert.equal(themeModeGlyph("auto"), "◐");
  assert.equal(themeModeGlyph("light"), "☀");
  assert.equal(themeModeGlyph("dark"), "☾");
});
