import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [header, mobile, search, css, packageJson] = await Promise.all([
  read("components/layout/PublicHeader.tsx"),
  read("components/layout/MobileNavigation.tsx"),
  read("components/catalog/ProductSearch.tsx"),
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
  "sen-header-search",
  "Enterprise technology · Energy · Medical · Global sourcing",
  "China → Bangladesh → Worldwide",
];
const requiredMobileTokens = [
  "sen-mobile-menu-trigger",
  "sen-mobile-menu-panel",
  "sen-mobile-menu-link",
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
  "@media (prefers-reduced-motion: reduce)",
];

for (const token of requiredHeaderTokens) {
  assert.ok(header.includes(token), `PublicHeader is missing ${token}`);
}
for (const token of requiredMobileTokens) {
  assert.ok(mobile.includes(token), `MobileNavigation is missing ${token}`);
}
for (const token of requiredSearchTokens) {
  assert.ok(search.includes(token), `ProductSearch is missing ${token}`);
}
for (const token of requiredCssTokens) {
  assert.ok(css.includes(token), `globals.css is missing ${token}`);
}

assert.ok(header.includes('aria-label="Public navigation"'));
assert.ok(search.includes('role="search"'));
assert.ok(mobile.includes("<summary"));
assert.ok(css.includes("prefers-reduced-motion"));

const parsedPackage = JSON.parse(packageJson);
assert.equal(parsedPackage.dependencies?.["framer-motion"], undefined);
assert.equal(parsedPackage.dependencies?.gsap, undefined);

console.log("Public header verification passed.");
