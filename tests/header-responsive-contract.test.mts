import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("dashboard header keeps compact account actions and a flexible search at narrow widths", async () => {
  const [shell, selector, css] = await Promise.all([
    read("components/dashboard/Shell.tsx"),
    read("components/ui/ThemeSelector.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(shell, /sen-dashboard-header-bar/);
  assert.match(shell, /sen-dashboard-header-search/);
  assert.match(shell, /sen-dashboard-header-actions/);
  assert.match(shell, /sen-dashboard-action-label[^\n]*hidden[^\n]*xl:inline/);
  assert.match(shell, /aria-label="Public website"/);
  assert.match(shell, /aria-label="My Profile"/);
  assert.match(shell, /aria-label="Logout"/);

  assert.match(selector, /sen-theme-selector-compact/);
  assert.match(selector, /sen-theme-select/);
  assert.match(selector, /resolvedVariant === "compact"[\s\S]*?"sr-only"/);
  assert.match(css, /\.sen-theme-selector-compact \.sen-theme-select\s*\{[^}]*width:/);
  assert.match(css, /\.sen-dashboard-header-search\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.sen-dashboard-header-actions\s*\{[^}]*flex-shrink:\s*0/);
});

test("public desktop header contracts its search and controls across intermediate xl widths", async () => {
  const [header, mobile, css] = await Promise.all([
    read("components/layout/PublicHeader.tsx"),
    read("components/layout/MobileNavigation.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(header, /sen-header-search-desktop hidden xl:block/);
  assert.match(header, /sen-header-actions hidden items-center gap-2 xl:flex/);
  assert.match(mobile, /sen-mobile-nav relative z-\[120\] xl:hidden/);
  assert.match(css, /@media \(min-width:\s*1280px\) and \(max-width:\s*1439px\)/);
  assert.match(css, /\.sen-header-search-desktop\s*\{[^}]*min-width:\s*14rem/);
  assert.match(css, /@media \(min-width:\s*1280px\) and \(max-width:\s*1439px\)[\s\S]*?\.sen-menu-box\s*\{/);
});
