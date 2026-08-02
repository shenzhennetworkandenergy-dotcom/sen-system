import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [header, mobile, search, selector, synchronizer, themeStore, layout, shell, profileDisclosure, css, packageJson] = await Promise.all([
  read("components/layout/PublicHeader.tsx"),
  read("components/layout/MobileNavigation.tsx"),
  read("components/catalog/ProductSearch.tsx"),
  read("components/ui/ThemeSelector.tsx"),
  read("components/ui/ThemeSynchronizer.tsx"),
  read("components/ui/theme-store.ts"),
  read("app/layout.tsx"),
  read("components/dashboard/Shell.tsx"),
  read("components/layout/ProfileMenuDisclosure.tsx"),
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
  '@custom-variant dark (&:where(html[data-theme="dark"], html[data-theme="dark"] *));',
  'html[data-theme="dark"] .public-experience',
  'html[data-theme="dark"] .public-experience .sen-catalogue-card',
  'html[data-theme="dark"] .public-experience .product-rich-content',
  'html[data-theme="dark"] .public-experience .sen-chat-panel',
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
assert.ok(
  !css.includes("@media (prefers-color-scheme: dark)"),
  "globals.css must resolve dark presentation from data-theme, not the operating system",
);

assert.ok(header.includes('aria-label="Public navigation"'));
assert.ok(search.includes('role="search"'));
assert.ok(mobile.includes("<summary"));
assert.ok(header.includes("ProfileMenuDisclosure"), "Authenticated desktop navigation must use a profile disclosure");
assert.ok(header.includes("<ProfileMenuDisclosure>"), "The profile disclosure must retain its server-rendered children");
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
assert.ok(selector.includes('from "@/components/ui/theme-store"'), "Appearance selector must use the shared theme store");
assert.ok(synchronizer.startsWith('"use client"'), "Global theme synchronizer must be a client component");
assert.ok(synchronizer.includes('addEventListener("storage"'), "Global theme synchronizer must synchronize saved preferences");
assert.ok(synchronizer.includes('addEventListener("change"'), "Global theme synchronizer must follow the system in Auto mode");
assert.ok(synchronizer.includes('getThemeMode() !== "auto"'), "System changes must only resolve Auto mode");
assert.ok(themeStore.includes("THEME_CHANGE_EVENT"), "Visible selectors and the global synchronizer must share one event store");
assert.ok(layout.includes("<ThemeSynchronizer/>"), "Root layout must synchronize routes without an appearance selector");
assert.ok(!layout.startsWith('"use client"'), "Root layout must remain server-rendered");
assert.ok(shell.includes("ThemeSelector"), "Dashboard header must expose an appearance control");
assert.ok(!header.startsWith('"use client"'), "Public header must remain server-rendered");
assert.ok(profileDisclosure.startsWith('"use client"'), "Profile disclosure must be a client component");
assert.match(profileDisclosure, /<details[\s\S]*?ref=\{detailsRef\}[\s\S]*?className="sen-profile-menu"/, "Profile disclosure must render the native details element");
assert.ok(profileDisclosure.includes("onPointerEnter"), "Profile disclosure must open on eligible pointer entry");
assert.ok(profileDisclosure.includes("onPointerLeave"), "Profile disclosure must close hover-origin opens on pointer leave");
assert.ok(profileDisclosure.includes("onToggle"), "Profile disclosure must clean up hover state after native toggles");
assert.ok(profileDisclosure.includes("openedByHover"), "Profile disclosure must track hover-origin opens separately");
assert.ok(profileDisclosure.includes(":focus-within"), "Profile disclosure must preserve focus-driven access");
assert.ok(profileDisclosure.includes("pointerType"), "Profile disclosure must gate enhancements to mouse pointers");
assert.ok(profileDisclosure.includes("preventDefault"), "Profile disclosure must pin a hover-opened menu on pointer click");
assert.ok(header.includes("!user ? <ThemeSelector compact /> : null"), "Only guests must receive the compact header appearance selector");
assert.ok(!shell.startsWith('"use client"'), "Dashboard shell must remain server-rendered");
assert.ok(css.includes("prefers-reduced-motion"));
assert.ok(css.includes(".sen-profile-menu-panel::before"), "Profile menu panel must bridge the pointer gap");
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
