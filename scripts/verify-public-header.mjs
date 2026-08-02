import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [header, mobile, search, selector, shell, css, packageJson] = await Promise.all([
  read("components/layout/PublicHeader.tsx"),
  read("components/layout/MobileNavigation.tsx"),
  read("components/catalog/ProductSearch.tsx"),
  read("components/ui/ThemeSelector.tsx"),
  read("components/dashboard/Shell.tsx"),
  read("app/globals.css"),
  read("package.json"),
]);

const requiredHeaderTokens = [
  "sen-header-shell",
  "sen-header-main",
  "sen-header-nav",
  "sen-header-actions",
  "sen-menu-box",
  "sen-profile-box",
  "sen-profile-menu",
  "sen-profile-menu-panel",
  "sen-profile-menu-dashboard",
  "sen-header-search-desktop",
  "max-w-[92rem]",
  "sen-header-search",
  "z-[80]",
  "ThemeSelector",
  "Enterprise technology · Energy · Medical · Global sourcing",
  "China → Bangladesh → Worldwide",
];
const requiredMobileTokens = [
  "sen-mobile-menu-trigger",
  "sen-mobile-menu-panel",
  "sen-mobile-menu-link",
  "sen-mobile-menu-search",
  "is-dashboard",
  "showRequestQuote",
  "ProductSearch",
  "ThemeSelector",
  "xl:hidden",
];
const requiredSearchTokens = [
  "sen-search-form",
  "sen-search-input",
  "sen-search-button",
];
const requiredCssTokens = [
  "@keyframes sen-header-enter",
  ".sen-menu-box::before",
  ".sen-mobile-menu-panel",
  ".sen-header-actions",
  ".sen-menu-box:hover",
  ".sen-menu-box:focus-visible",
  ".sen-profile-box",
  ".sen-profile-menu-panel",
  ".sen-profile-menu-dashboard",
  ".sen-mobile-menu-search",
  "max-height: calc(100dvh",
  "overflow-y: auto",
  "@media (max-width: 1279px)",
  "@media (prefers-reduced-motion: reduce)",
  "animation: none",
];

for (const token of requiredHeaderTokens) {
  assert.ok(header.includes(token), `PublicHeader is missing ${token}`);
}
for (const token of requiredSearchTokens) {
  assert.ok(search.includes(token), `ProductSearch is missing ${token}`);
}
for (const token of requiredMobileTokens) {
  assert.ok(mobile.includes(token), `MobileNavigation is missing ${token}`);
}
for (const token of requiredCssTokens) {
  assert.ok(css.includes(token), `globals.css is missing ${token}`);
}

assert.ok(header.includes('aria-label="Public navigation"'));
assert.ok(search.includes('role="search"'));
assert.ok(mobile.includes("<summary"));
assert.ok(
  header.includes('<details className="sen-profile-menu">'),
  "Authenticated desktop navigation must use a profile disclosure",
);
assert.ok(
  header.includes('className="sen-menu-box sen-profile-menu-dashboard"'),
  "The role dashboard must be highlighted inside the profile menu",
);
assert.ok(
  !header.includes('<Container className="pb-3 xl:hidden">'),
  "Compact search must live inside the three-bar menu, not a permanent second row",
);
assert.ok(
  mobile.includes("showRequestQuote ?"),
  "Authenticated customers must retain Request a Quote in the compact menu",
);
assert.ok(selector.startsWith('"use client"'), "Appearance selector must be a client component");
assert.ok(selector.includes('addEventListener("storage"'), "Appearance selector must synchronize saved preferences");
assert.ok(selector.includes('addEventListener("change"'), "Appearance selector must follow the system in Auto mode");
assert.ok(shell.includes("ThemeSelector"), "Dashboard header must expose an appearance control");
assert.ok(!header.startsWith('"use client"'), "Public header must remain server-rendered");
assert.ok(!shell.startsWith('"use client"'), "Dashboard shell must remain server-rendered");
assert.ok(css.includes("prefers-reduced-motion"));
assert.ok(
  css.match(
    /prefers-reduced-motion:[\s\S]*?\.sen-menu-box[\s\S]*?animation:\s*none/,
  ),
  "Reduced-motion rules must disable header animation",
);

const parsedPackage = JSON.parse(packageJson);
assert.equal(parsedPackage.dependencies?.["framer-motion"], undefined);
assert.equal(parsedPackage.dependencies?.gsap, undefined);

console.log("Public header verification passed.");
