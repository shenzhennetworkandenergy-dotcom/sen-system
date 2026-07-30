# Premium Glass-Neon Public Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a responsive premium glass-tech public header with restrained neon interaction effects and no additional runtime dependency.

**Architecture:** Keep `PublicHeader` as the server-rendered data and composition boundary, preserve the existing `ProductSearch` client behavior, and keep the mobile menu as the only navigation client component. Add semantic presentation classes to the three existing components and implement all new effects in `app/globals.css` using pseudo-elements, transforms, opacity, and reduced-motion overrides.

**Tech Stack:** Next.js 16.2.12 App Router, React 19.2.4, TypeScript, Tailwind CSS 4 utilities, project-global CSS, Node verification scripts

## Global Constraints

- Use CSS only for new motion and visual effects.
- Add no new runtime dependency.
- Do not add large assets or additional network requests.
- Prefer transforms and opacity to layout-changing animation.
- Keep blur areas limited to the header and mobile panel.
- Preserve server rendering for the public header and the existing small client boundary for search and mobile navigation.
- Preserve the existing product-search endpoint and suggestion behavior.
- Preserve the official SEN logo asset without alteration.
- Respect `prefers-reduced-motion: reduce`.
- Do not redesign the admin dashboard header, homepage hero, chatbot, product database, or authentication workflows.

---

## File map

- `components/layout/PublicHeader.tsx`: semantic desktop/laptop header composition, brand, navigation, authenticated/guest action groups, and responsive search placement.
- `components/layout/MobileNavigation.tsx`: mobile trigger and animated boxed menu panel.
- `components/catalog/ProductSearch.tsx`: header-specific class hooks for the unified search capsule without changing data behavior.
- `app/globals.css`: all glass surfaces, neon interactions, entrance/hover motion, responsive compression, and reduced-motion rules.
- `scripts/verify-public-header.mjs`: dependency-free structural regression check for required classes, semantics, motion safeguards, and scope boundaries.
- `package.json`: exposes the focused verification command as `npm run test:public-header`.

### Task 1: Establish the header regression contract

**Files:**
- Create: `scripts/verify-public-header.mjs`
- Modify: `package.json`
- Test: `scripts/verify-public-header.mjs`

**Interfaces:**
- Consumes: UTF-8 source from `PublicHeader.tsx`, `MobileNavigation.tsx`, `ProductSearch.tsx`, `globals.css`, and `package.json`.
- Produces: `npm run test:public-header`, a zero-dependency verification command that exits nonzero when a required header contract is missing.

- [ ] **Step 1: Write the failing structural verifier**

Create `scripts/verify-public-header.mjs` with:

```js
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
];
const requiredMobileTokens = [
  "sen-mobile-menu-trigger",
  "sen-mobile-menu-panel",
  "sen-mobile-menu-link",
];
const requiredSearchTokens = [
  "sen-header-search",
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
```

Add this script to `package.json`:

```json
"test:public-header": "node scripts/verify-public-header.mjs"
```

- [ ] **Step 2: Run the verifier to prove it fails before implementation**

Run:

```powershell
npm run test:public-header
```

Expected: FAIL with `PublicHeader is missing sen-header-shell`.

- [ ] **Step 3: Commit the failing regression contract**

```powershell
git add package.json scripts/verify-public-header.mjs
git commit -m "test: define public header design contract"
```

### Task 2: Restructure the desktop header into glass navigation groups

**Files:**
- Modify: `components/layout/PublicHeader.tsx`
- Test: `scripts/verify-public-header.mjs`

**Interfaces:**
- Consumes: current user/profile/cart/conversation data already loaded by `PublicHeader`.
- Produces: `sen-header-shell`, `sen-header-main`, `sen-header-nav`, `sen-header-actions`, `sen-menu-box`, and `sen-profile-box` DOM hooks used by the CSS task.

- [ ] **Step 1: Add a focused temporary assertion for text integrity**

Extend `requiredHeaderTokens` in `scripts/verify-public-header.mjs` with:

```js
"Enterprise technology · Energy · Medical · Global sourcing",
"China → Bangladesh → Worldwide",
```

Run:

```powershell
npm run test:public-header
```

Expected: FAIL because the current source contains corrupted separator/arrow text.

- [ ] **Step 2: Implement the semantic desktop shell and boxed actions**

In `components/layout/PublicHeader.tsx`:

- Wrap the two header rows in a `sen-header-shell`.
- Apply `sen-header-main` to the main `Container`.
- Apply `sen-header-nav` to the primary navigation list.
- Apply `sen-menu-box` to Products, About, Contact, Request a Quote, Dashboard, Login, and Logout.
- Keep the Cart link behavior and add `sen-menu-box sen-cart-link`.
- Apply `sen-menu-box sen-profile-box` to My Profile while retaining `ProfileAvatar`.
- Apply `sen-header-actions` to the desktop account/guest action group.
- Apply `sen-header-search` to the desktop and mobile search instances.
- Replace the corrupted announcement text with literal UTF-8 middle dots and arrows.
- Keep all current destinations and role conditions unchanged.

Use these exact structural class assignments:

```tsx
<header className="sen-header sticky top-0 z-40">
<div className="sen-header-shell">
<Container className="sen-header-main flex min-h-20 items-center justify-between gap-3 py-2">
<ul className="sen-header-nav flex items-center gap-2 text-sm font-semibold">
<ProductSearch compact className="sen-header-search hidden w-full max-w-xs xl:block" />
<div className="sen-header-actions hidden items-center gap-2 lg:flex">
<ProductSearch compact className="sen-header-search" />
```

- [ ] **Step 3: Run the focused verifier**

Run:

```powershell
npm run test:public-header
```

Expected: FAIL at the first missing `MobileNavigation` or CSS token, while all `PublicHeader` assertions pass.

- [ ] **Step 4: Run lint for the changed component**

Run:

```powershell
npx eslint components/layout/PublicHeader.tsx scripts/verify-public-header.mjs
```

Expected: PASS with zero errors.

- [ ] **Step 5: Commit the desktop structure**

```powershell
git add components/layout/PublicHeader.tsx scripts/verify-public-header.mjs
git commit -m "feat: structure premium public header navigation"
```

### Task 3: Style the existing product search as a unified header capsule

**Files:**
- Modify: `components/catalog/ProductSearch.tsx`
- Modify: `app/globals.css`
- Test: `scripts/verify-public-header.mjs`

**Interfaces:**
- Consumes: existing `ProductSearch` props and `/api/products/search` behavior.
- Produces: `sen-search-form`, `sen-search-input`, and `sen-search-button` hooks, with no API or state-machine changes.

- [ ] **Step 1: Confirm the search presentation assertions fail**

Run:

```powershell
npm run test:public-header
```

Expected: FAIL with `ProductSearch is missing sen-search-form`.

- [ ] **Step 2: Add presentation hooks without altering behavior**

In `components/catalog/ProductSearch.tsx`:

- Add `sen-search-form` to the existing search form.
- Add `sen-search-input` to the existing input.
- Add `sen-search-button` to the existing submit button.
- Keep debounce timing, request cancellation, suggestion rendering, input roles, and endpoint unchanged.
- Replace corrupted visible ellipsis and middle-dot characters with valid UTF-8 characters.

Use these class combinations:

```tsx
<form action="/products" role="search" className="sen-search-form flex gap-2">
```

```tsx
className={`sen-search-input min-w-0 flex-1 rounded-xl border border-slate-300 bg-white text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${
  compact ? "h-9 px-3 text-xs" : "h-12 px-4"
}`}
```

```tsx
className={`sen-search-button rounded-xl bg-cyan-600 font-bold text-white transition hover:bg-cyan-500 ${
  compact ? "h-9 px-3 text-xs" : "h-12 px-5"
}`}
```

- [ ] **Step 3: Add the unified capsule CSS**

In `app/globals.css`, add rules that:

- visually join the input and button in one rounded glass search capsule;
- use `min-width: 0` so the field compresses without overflow;
- maintain a white input surface and dark readable input text;
- show a neon focus ring with `:focus-within`;
- use only transform, opacity, border-color, background, and box-shadow transitions.

The essential contract is:

```css
.sen-header-search { min-width: 0; }
.sen-search-form {
  overflow: visible;
  border: 1px solid rgb(125 211 252 / .24);
  border-radius: 1rem;
  background: rgb(255 255 255 / .08);
  box-shadow: inset 0 1px rgb(255 255 255 / .08);
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}
.sen-search-form:focus-within {
  border-color: rgb(103 232 249 / .7);
  box-shadow: 0 0 0 3px rgb(34 211 238 / .12), 0 10px 30px rgb(2 8 23 / .2);
}
.sen-search-input { border: 0 !important; box-shadow: none !important; }
.sen-search-button { margin: .2rem; border-radius: .78rem; }
```

- [ ] **Step 4: Verify search behavior contract and lint**

Run:

```powershell
npm run test:public-header
npx eslint components/catalog/ProductSearch.tsx
```

Expected: the header verifier now advances past all ProductSearch assertions; ESLint reports zero errors.

- [ ] **Step 5: Commit the search presentation**

```powershell
git add components/catalog/ProductSearch.tsx app/globals.css
git commit -m "feat: style unified glass product search"
```

### Task 4: Build the animated mobile glass menu

**Files:**
- Modify: `components/layout/MobileNavigation.tsx`
- Modify: `app/globals.css`
- Test: `scripts/verify-public-header.mjs`

**Interfaces:**
- Consumes: the current authentication state, dashboard destination/label, profile destination, and cart count.
- Produces: `sen-mobile-menu-trigger`, `sen-mobile-menu-panel`, and `sen-mobile-menu-link` hooks plus a usable details/summary menu at widths below `lg`.

- [ ] **Step 1: Confirm the mobile assertions fail**

Run:

```powershell
npm run test:public-header
```

Expected: FAIL with `MobileNavigation is missing sen-mobile-menu-trigger`.

- [ ] **Step 2: Add semantic mobile presentation hooks**

In `components/layout/MobileNavigation.tsx`:

- Keep native `details` and `summary` behavior.
- Give the summary `sen-mobile-menu-trigger`.
- Add a three-line icon built from three empty spans with `aria-hidden="true"`.
- Keep a visible `Menu` label for clarity.
- Give the popup `sen-mobile-menu-panel`.
- Give every menu destination `sen-mobile-menu-link`.
- Keep the cart out-of-stock/count styling and all existing destinations unchanged.
- Add Products, About, and Contact to the mobile panel so primary navigation is available on mobile.

The trigger must remain keyboard operable:

```tsx
<summary className="sen-mobile-menu-trigger">
  <span className="sen-mobile-menu-icon" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
  <span>Menu</span>
</summary>
```

- [ ] **Step 3: Add mobile panel motion and boxed links**

In `app/globals.css`:

- style the trigger as a compact glass box;
- animate the icon into a close state using the parent `[open]` attribute;
- animate the panel with opacity and translateY;
- make every link a full-width glass box with hover/focus neon treatment;
- constrain panel width to `min(20rem, calc(100vw - 2rem))`;
- avoid horizontal overflow.

Add:

```css
.sen-mobile-menu-panel {
  width: min(20rem, calc(100vw - 2rem));
  animation: sen-mobile-menu-in .2s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes sen-mobile-menu-in {
  from { opacity: 0; transform: translateY(-.5rem) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

- [ ] **Step 4: Verify the mobile contract and lint**

Run:

```powershell
npm run test:public-header
npx eslint components/layout/MobileNavigation.tsx
```

Expected: the verifier advances past all component assertions; ESLint reports zero errors.

- [ ] **Step 5: Commit the mobile menu**

```powershell
git add components/layout/MobileNavigation.tsx app/globals.css
git commit -m "feat: add animated mobile glass navigation"
```

### Task 5: Complete glass-neon styling, responsive compression, and motion safety

**Files:**
- Modify: `app/globals.css`
- Modify: `scripts/verify-public-header.mjs`
- Test: `scripts/verify-public-header.mjs`

**Interfaces:**
- Consumes: semantic class hooks from Tasks 2–4.
- Produces: finished glass/neon desktop styling, responsive layout, scoped animations, and reduced-motion fallbacks.

- [ ] **Step 1: Add stricter failing CSS assertions**

Append these tokens to `requiredCssTokens`:

```js
".sen-header-actions",
".sen-menu-box:hover",
".sen-menu-box:focus-visible",
".sen-profile-box",
"@media (max-width: 1279px)",
"animation: none",
```

Add:

```js
assert.ok(
  css.match(/prefers-reduced-motion:[\s\S]*?\.sen-menu-box[\s\S]*?animation:\s*none/),
  "Reduced-motion rules must disable header animation",
);
```

Run:

```powershell
npm run test:public-header
```

Expected: FAIL on the first missing final CSS token or reduced-motion assertion.

- [ ] **Step 2: Consolidate duplicated legacy header CSS**

In `app/globals.css`:

- remove the duplicated old `.sen-header`, `.sen-nav-link`, and `.sen-nav-link::after` blocks;
- keep a single scoped header section;
- retain unrelated hero, chatbot, admin, invoice, and category styles;
- do not rename classes used outside the shared public header unless the selectors are explicitly scoped under `.sen-header`.

- [ ] **Step 3: Implement the premium glass-neon desktop system**

Add:

```css
.sen-header-shell {
  position: relative;
  border-bottom: 1px solid rgb(103 232 249 / .18);
  background:
    linear-gradient(115deg, rgb(4 10 34 / .96), rgb(23 31 78 / .95) 58%, rgb(5 69 96 / .94));
  box-shadow: 0 14px 38px rgb(2 8 23 / .24);
  backdrop-filter: blur(16px) saturate(135%);
  animation: sen-header-enter .45s cubic-bezier(.2,.8,.2,1) both;
}
.sen-menu-box {
  position: relative;
  display: inline-flex;
  min-height: 2.45rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / .13);
  border-radius: .8rem;
  padding: .55rem .72rem;
  color: #dbeafe;
  background: linear-gradient(145deg, rgb(255 255 255 / .1), rgb(255 255 255 / .035));
  box-shadow: inset 0 1px rgb(255 255 255 / .1), 0 8px 20px rgb(2 8 23 / .12);
  transition: transform .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, background .2s ease;
}
.sen-menu-box::before {
  position: absolute;
  inset: -1px auto -1px -55%;
  width: 38%;
  content: "";
  opacity: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / .35), transparent);
  transform: skewX(-18deg);
  transition: left .4s ease, opacity .2s ease;
}
.sen-menu-box:hover,
.sen-menu-box:focus-visible {
  border-color: rgb(103 232 249 / .55);
  color: white;
  background: linear-gradient(145deg, rgb(34 211 238 / .16), rgb(99 102 241 / .12));
  box-shadow: 0 10px 24px rgb(8 145 178 / .18), 0 0 18px rgb(129 140 248 / .12);
  transform: translateY(-2px);
}
.sen-menu-box:hover::before,
.sen-menu-box:focus-visible::before {
  left: 120%;
  opacity: 1;
}
@keyframes sen-header-enter {
  from { opacity: 0; transform: translateY(-.4rem); }
  to { opacity: 1; transform: translateY(0); }
}
```

Also:

- constrain navigation/action gaps;
- keep labels on one line;
- style profile and cart variants without losing the shared box appearance;
- use a subtle announcement highlight;
- ensure focus-visible outlines are obvious.

- [ ] **Step 4: Implement laptop compression and reduced motion**

Add a `@media (max-width: 1279px)` rule that:

- reduces `sen-header-main`, navigation, and action gaps;
- reduces box horizontal padding;
- keeps search in the second row where the existing `xl` breakpoint hides it;
- avoids label overlap and horizontal scrolling.

Extend the existing reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  .sen-header-shell,
  .sen-menu-box,
  .sen-menu-box::before,
  .sen-mobile-menu-panel,
  .sen-mobile-menu-icon span {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 5: Run the full focused verification**

Run:

```powershell
npm run test:public-header
npx eslint components/layout/PublicHeader.tsx components/layout/MobileNavigation.tsx components/catalog/ProductSearch.tsx scripts/verify-public-header.mjs
```

Expected: `Public header verification passed.` and ESLint exits with zero errors.

- [ ] **Step 6: Commit the finished styling**

```powershell
git add app/globals.css scripts/verify-public-header.mjs
git commit -m "feat: finish responsive glass neon header"
```

### Task 6: Perform full build and visual verification

**Files:**
- Modify only if verification reveals a defect: `components/layout/PublicHeader.tsx`, `components/layout/MobileNavigation.tsx`, `components/catalog/ProductSearch.tsx`, `app/globals.css`, `scripts/verify-public-header.mjs`
- Test: focused verifier, ESLint, production build, browser inspection

**Interfaces:**
- Consumes: completed header implementation.
- Produces: verified production-ready header with documented evidence at desktop, laptop, tablet, and mobile sizes.

- [ ] **Step 1: Run all automated checks from a clean command**

Run:

```powershell
npm run test:public-header
npm run lint
npm run build
```

Expected: all three commands exit zero; the production build completes without TypeScript or route errors.

- [ ] **Step 2: Start the production server**

Run:

```powershell
npm run start
```

Expected: Next.js serves the production build locally.

- [ ] **Step 3: Verify desktop and laptop views**

Inspect `/` at:

- 1920 × 1080
- 1440 × 900
- 1280 × 800

Confirm:

- no horizontal overflow;
- all displayed navigation items use distinct glass boxes;
- search suggestions open above page content and remain readable;
- hover and keyboard focus treatments are visible;
- avatar, dashboard label, cart, and logout do not collide;
- sticky header remains readable over the hero.

- [ ] **Step 4: Verify tablet and mobile views**

Inspect `/` at:

- 768 × 1024
- 390 × 844

Confirm:

- brand, menu trigger, and search fit without overflow;
- the menu panel opens, animates, and stays inside the viewport;
- every destination is a full-width boxed target;
- menu links, profile, cart count, and search remain keyboard/touch usable.

- [ ] **Step 5: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce` and confirm:

- header entrance is disabled;
- menu sweep/lift transitions are disabled;
- mobile panel appears without animation;
- navigation remains fully functional.

- [ ] **Step 6: Commit any verification-only corrections**

If Step 3–5 required corrections:

```powershell
git add components/layout/PublicHeader.tsx components/layout/MobileNavigation.tsx components/catalog/ProductSearch.tsx app/globals.css scripts/verify-public-header.mjs
git commit -m "fix: polish public header responsive behavior"
```

If no corrections were required, do not create an empty commit.

### Task 7: Integrate and verify the Vercel production deployment

**Files:**
- No source changes expected.
- Deployment target: repository production branch tracked by Vercel.

**Interfaces:**
- Consumes: verified feature commits.
- Produces: production deployment containing the exact verified commit.

- [ ] **Step 1: Confirm repository state and production branch**

Run:

```powershell
git status --short
git branch --show-current
git fetch origin
git log --oneline --decorate -5
```

Expected: the feature worktree is clean and the production branch state is known.

- [ ] **Step 2: Push the feature branch**

Run:

```powershell
git push origin HEAD
```

Expected: the remote feature branch advances to the verified commit.

- [ ] **Step 3: Integrate the verified commits into the production branch**

Use a clean production worktree or fast-forward/merge workflow that preserves any newer `origin/main` work. Merge the verified feature branch into `main` without force-pushing.

Expected: `origin/main` contains the exact verified header commits plus any previously existing production commits.

- [ ] **Step 4: Wait for the Vercel check**

Inspect the GitHub/Vercel deployment status for the new production commit until it reaches a terminal state.

Expected: the Vercel production check reports success for that commit.

- [ ] **Step 5: Verify the public production URL**

Open:

```text
https://sen-system.vercel.app/
```

Confirm:

- the new glass-neon header is present;
- the deployed source matches the verified production commit;
- desktop and mobile menus work;
- product search returns suggestions;
- no obvious console or layout error appears.

- [ ] **Step 6: Report the deployed commit and URL**

Report:

- feature branch and commit;
- production commit;
- successful automated checks;
- successful Vercel status;
- public production URL.
