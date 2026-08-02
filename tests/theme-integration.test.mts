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
  assert.match(selector, /<label/);
  assert.match(selector, /<select/);
  assert.match(selector, /Auto/);
  assert.match(selector, /Light/);
  assert.match(selector, /Dark/);
  assert.match(selector, /matchMedia/);
  assert.match(selector, /addEventListener\("change"/);
  assert.match(selector, /addEventListener\("storage"/);
  assert.match(selector, /compact/);
  assert.match(selector, /full/);
  assert.match(header, /ThemeSelector/);
  assert.match(mobile, /ThemeSelector/);
  assert.match(shell, /ThemeSelector/);
  assert.doesNotMatch(header, /^"use client"/);
  assert.doesNotMatch(shell, /^"use client"/);
  assert.match(css, /color-scheme: light/);
});
