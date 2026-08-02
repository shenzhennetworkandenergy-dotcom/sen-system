import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("root layout bootstraps a validated appearance preference before paint", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(layout, /<html[^>]*data-theme="light"[^>]*data-theme-mode="auto"[^>]*suppressHydrationWarning/);
  assert.match(layout, /<head>[\s\S]*<script/);
  assert.match(layout, /localStorage/);
  assert.match(layout, /sen-theme-mode/);
  assert.match(layout, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(layout, /dataset\.themeMode/);
  assert.match(layout, /dataset\.theme/);
  assert.match(layout, /style\.colorScheme/);
});

test("appearance selector owns browser synchronization while surrounding headers stay server-rendered", async () => {
  const [selector, header, mobile, shell, css] = await Promise.all([
    read("components/ui/ThemeSelector.tsx"),
    read("components/layout/PublicHeader.tsx"),
    read("components/layout/MobileNavigation.tsx"),
    read("components/dashboard/Shell.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(selector, /^"use client"/);
  assert.match(selector, /useSyncExternalStore/);
  assert.match(selector, /<label/);
  assert.match(selector, /<select/);
  assert.match(selector, /Auto/);
  assert.match(selector, /Light/);
  assert.match(selector, /Dark/);
  assert.match(selector, /matchMedia/);
  assert.match(selector, /addEventListener\("change"/);
  assert.match(selector, /addEventListener\("storage"/);
  assert.match(selector, /THEME_CHANGE_EVENT/);
  assert.match(selector, /dispatchEvent\(new CustomEvent\(THEME_CHANGE_EVENT/);
  assert.match(selector, /addEventListener\(THEME_CHANGE_EVENT, handleThemeChange\)/);
  assert.match(selector, /compact/);
  assert.match(selector, /full/);
  assert.match(header, /ThemeSelector/);
  assert.match(mobile, /ThemeSelector/);
  assert.match(shell, /ThemeSelector/);
  assert.doesNotMatch(header, /^"use client"/);
  assert.doesNotMatch(shell, /^"use client"/);
  assert.match(css, /color-scheme: light/);
});

test("resolved theme selectors override the operating system without global transitions", async () => {
  const css = await read("app/globals.css");

  assert.match(css, /@custom-variant dark/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.doesNotMatch(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.doesNotMatch(css, /(?:html|body|\*)\s*\{[^}]*transition:\s*(?:all|background|color)/);
});

test("catalogue dark tokens apply when public and catalogue classes share the page root", async () => {
  const [css, listing, detail] = await Promise.all([
    read("app/globals.css"),
    read("app/products/page.tsx"),
    read("app/products/[slug]/page.tsx"),
  ]);

  for (const page of [listing, detail]) {
    assert.match(page, /className="public-experience catalogue-theme catalogue-theme-dynamic"/);
  }
  assert.match(css, /html\[data-theme="dark"\] \.public-experience\.catalogue-theme\b/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience\.catalogue-theme-dynamic\b/);
});
