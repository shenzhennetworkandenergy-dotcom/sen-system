# Fast Colorful Dashboard, Profile Hover, and Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic mouse-hover profile disclosure, a colorful lightweight module system, and a persistent Auto/Light/Dark theme with readable text across public and dashboard surfaces.

**Architecture:** Keep async headers and pages server-rendered. Add only two small Client Components: a native-details hover enhancer and a native appearance selector. Drive dashboard colors through semantic tone helpers and `data-*` attributes, then use scoped CSS variables and compatibility rules for theme/contrast. A pre-paint inline script resolves the saved theme before hydration.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS 4, native CSS, Node test runner.

## Global Constraints

- Do not change routes, permissions, authentication, database queries, work counts, module availability, or print data.
- Read the relevant installed Next.js 16 documentation before changing client boundaries or the root layout.
- Use tests before implementation in every task and observe each focused test fail for the intended reason.
- Do not add packages, remote assets, animation libraries, or a React theme provider.
- Keep `components/layout/PublicHeader.tsx`, `components/dashboard/Shell.tsx`, and all dashboard pages as Server Components.
- Preserve native disclosure behavior for keyboard, touch, pen, and pre-hydration use.
- Keep printable sheets explicitly light.

---

## Task 1: Add the persistent theme domain, bootstrap, and controls

**Files:**

- Create: `tests/theme-preference.test.mts`
- Create: `tests/theme-integration.test.mts`
- Create: `lib/ui/theme.ts`
- Create: `components/ui/ThemeSelector.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/layout/PublicHeader.tsx`
- Modify: `components/layout/MobileNavigation.tsx`
- Modify: `components/dashboard/Shell.tsx`
- Modify: `scripts/verify-public-header.mjs`

- [ ] **Step 1: Write theme-domain tests**

  Cover the exact domain contract:

  - `parseThemeMode("auto" | "light" | "dark")` returns the same mode;
  - invalid, missing, and mixed-case values return `"auto"`;
  - `resolveTheme("light", true)` is `"light"`;
  - `resolveTheme("dark", false)` is `"dark"`;
  - `resolveTheme("auto", true)` is `"dark"` and `resolveTheme("auto", false)` is `"light"`;
  - the storage key is exactly `sen-theme-mode`.

- [ ] **Step 2: Write integration-source tests**

  Read `layout.tsx`, `ThemeSelector.tsx`, `PublicHeader.tsx`, `MobileNavigation.tsx`, `Shell.tsx`, and `globals.css`, then require:

  - `<html data-theme="light" data-theme-mode="auto" suppressHydrationWarning>`;
  - a synchronous head bootstrap that validates `localStorage`, uses `matchMedia`, updates both data attributes, and sets `style.colorScheme`;
  - a `"use client"` selector with Auto, Light, Dark, media-query change handling, and storage-event synchronization;
  - theme controls in desktop public, mobile public, and dashboard headers;
  - `PublicHeader.tsx` and `Shell.tsx` do not gain `"use client"`.

- [ ] **Step 3: Run the new tests and confirm RED**

  Run:

  `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/theme-preference.test.mts tests/theme-integration.test.mts`

  Expected failure: missing theme module, selector, bootstrap, or integration tokens.

- [ ] **Step 4: Implement `lib/ui/theme.ts`**

  Export:

  ```ts
  export type ThemeMode = "auto" | "light" | "dark";
  export type ResolvedTheme = "light" | "dark";
  export const THEME_STORAGE_KEY = "sen-theme-mode";
  export function parseThemeMode(value: unknown): ThemeMode;
  export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme;
  ```

  Keep these helpers pure and browser-independent.

- [ ] **Step 5: Add the pre-paint bootstrap**

  In `app/layout.tsx`:

  - render the default theme attributes on `<html>`;
  - move `suppressHydrationWarning` from `<body>` to `<html>`;
  - add an inline `<head>` script that validates the stored mode, resolves Auto from `(prefers-color-scheme: dark)`, updates the attributes, and sets native `colorScheme` before paint;
  - keep RootLayout server-rendered.

- [ ] **Step 6: Implement and integrate `ThemeSelector`**

  The selector must:

  - render a visible label and native three-choice `<select>`;
  - initialize from the root attributes without producing a hydration mismatch;
  - update attributes, `colorScheme`, and localStorage immediately;
  - subscribe to operating-system changes only when mode is Auto;
  - synchronize other tabs with the `storage` event;
  - support a compact variant for headers and a full-width variant for menus.

  Place the compact control in the public desktop action row for guests, the full-width control in the authenticated profile panel, and controls in the mobile menu and dashboard header without changing existing routes or account controls.

- [ ] **Step 7: Update the public-header verifier and reach GREEN**

  Extend the existing verifier for theme-control integration and the server/client boundary. Re-run the two new tests and `npm run test:public-header`.

- [ ] **Step 8: Commit Task 1**

  Commit message: `feat: add persistent appearance controls`

---

## Task 2: Add automatic, accessible profile hover behavior

**Files:**

- Create: `tests/profile-menu-behavior.test.mts`
- Create: `lib/ui/profile-menu.ts`
- Create: `components/layout/ProfileMenuDisclosure.tsx`
- Modify: `components/layout/PublicHeader.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/verify-public-header.mjs`

- [ ] **Step 1: Write the pointer-policy test**

  Define cases requiring hover enhancement only for a fine mouse pointer. Touch, pen, coarse pointers, and non-hover-capable mice must return false.

- [ ] **Step 2: Extend the source contract**

  Require that:

  - `ProfileMenuDisclosure` is a Client Component rendering native `<details className="sen-profile-menu">` around `children`;
  - `PublicHeader` renders that wrapper and remains a Server Component;
  - pointer enter and leave update the native `.open` property;
  - hover-origin state, `:focus-within`, mouse gating, click pinning, and native toggle cleanup are present;
  - `.sen-profile-menu-panel::before` bridges the `.7rem` pointer gap.

- [ ] **Step 3: Run focused tests and confirm RED**

  Run:

  `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/profile-menu-behavior.test.mts`

  and `npm run test:public-header`.

- [ ] **Step 4: Implement the pure pointer helper**

  Export a browser-independent function that accepts pointer type plus hover/fine capability and returns whether hover should enhance the disclosure.

- [ ] **Step 5: Implement the client wrapper**

  Use a `details` ref and `openedByHover` ref, not controlled React open state. Preserve native click/keyboard behavior. Pin a hover-opened menu on its first real pointer click, close only hover-origin opens on pointer leave outside focus, and ignore touch/pen.

- [ ] **Step 6: Integrate and reach GREEN**

  Replace only the profile `<details>` boundary in `PublicHeader`. Keep the existing summary, avatar, links, dashboard highlight, and full-width ThemeSelector child unchanged. Authenticated desktop users use that panel selector instead of a redundant compact selector outside the disclosure; guests retain the compact header selector. Add the transparent CSS bridge. Run both focused checks.

- [ ] **Step 7: Commit Task 2**

  Commit message: `feat: open profile menu on accessible hover`

---

## Task 3: Add the colorful module palette and finite motion

**Files:**

- Create: `tests/dashboard-module-visuals.test.mts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `components/dashboard/DashboardNavigation.tsx`
- Modify: `components/dashboard/Shell.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/employee/page.tsx`
- Modify: `app/account/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write tone-domain and integration tests**

  Require:

  - a six-value `DashboardModuleTone` union;
  - stable group mappings and at least five distinct group tones;
  - canonical alias handling for `receive-new-stock`, `work-locations`, and `tracking-statuses`;
  - deterministic index cycling for account cards;
  - `data-dashboard-role` on the shared shell;
  - tone attributes on sidebar entries and admin, employee, and account overview cards;
  - no whole-card `opacity-70` on unavailable employee modules;
  - module CSS custom properties, dark overrides, finite accent animation, and reduced-motion coverage.

- [ ] **Step 2: Run the focused test and confirm RED**

  Run:

  `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/dashboard-module-visuals.test.mts`

- [ ] **Step 3: Implement tone helpers**

  Export `DashboardModuleTone`, `dashboardToneForGroup`, `dashboardToneForModule`, and `dashboardToneForIndex`. Normalize `moduleKey ?? key` and return blue for unknown keys.

- [ ] **Step 4: Add semantic navigation attributes**

  Add tone data to each navigation group, module link, and planned non-link item. Wrap icons with a tone-aware mark. Retain `aria-current`, `aria-disabled`, active gradient, red work-count badge, and route matching exactly.

- [ ] **Step 5: Apply module-card semantics**

  - Give the shared shell its real profile role.
  - Change admin arrays to include canonical keys and tone operational/planned items.
  - Style employee HR and permitted cards through the same system, with explicit available/unavailable state.
  - Add canonical keys to customer-account modules and cycle tones deterministically.

- [ ] **Step 6: Add lightweight CSS**

  Define explicit tone tokens and narrowly scoped module selectors after existing broad dashboard rules. Use tinted surfaces, a contrasting accent rail, icon treatment, short one-shot accent reveal, hover/focus lift, and `nth-child` stagger. Do not add infinite animations or animate card layout properties.

- [ ] **Step 7: Reach GREEN and run existing navigation checks**

  Run the focused test plus:

  `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/employee-permission-navigation.test.mts tests/purchase-receiving-work-count.test.mts`

- [ ] **Step 8: Commit Task 3**

  Commit message: `feat: color-code dashboard modules`

---

## Task 4: Complete dark-mode contrast and preserve print output

**Files:**

- Create: `tests/theme-contrast.test.mts`
- Modify: `tests/theme-integration.test.mts`
- Modify: `app/globals.css`
- Modify: `scripts/verify-public-header.mjs`

- [ ] **Step 1: Write contrast and CSS-contract tests**

  Implement a WCAG relative-luminance helper and assert a minimum 4.5:1 ratio for light/dark foreground, muted, action, error, success, warning, and information pairs.

  Source-contract assertions must require:

  - explicit `html[data-theme="dark"]` core, dashboard, public, catalogue, rich-content, and chat rules;
  - scoped neutral/status compatibility mappings for dashboard and public experiences;
  - no remaining theme `@media (prefers-color-scheme: dark)` blocks;
  - `@custom-variant dark` bound to `data-theme`;
  - explicit light `color-scheme` and white backgrounds for `.cashbook-print-sheet`, `.quotation-page`, `.document-page`, and `.serial-label`.

- [ ] **Step 2: Run theme tests and confirm RED**

  Run:

  `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/theme-preference.test.mts tests/theme-integration.test.mts tests/theme-contrast.test.mts`

- [ ] **Step 3: Convert OS-only rules to explicit theme selectors**

  Replace the root and dashboard dark media blocks with `html[data-theme="dark"]` selectors. Keep reduced-motion media rules unchanged. Add the Tailwind 4 custom dark variant for future use.

- [ ] **Step 4: Add scoped contrast compatibility**

  Add explicit dark tokens and narrowly scoped mappings for:

  - neutral text/surfaces/borders and native form controls;
  - blue information, emerald success, amber warning, and red error states;
  - public feature/product/catalogue cards, category surfaces, rich product content, and floating chat;
  - dashboard cards, tables, forms, status messages, and module tones.

  Preserve intentionally dark header, hero, CTA, and footer surfaces.

- [ ] **Step 5: Preserve paper artifacts**

  Give every named printable artifact a light color scheme, white surface, dark foreground, and isolation from dashboard/public compatibility selectors. Ensure existing print-media rules continue to control dimensions and pagination.

- [ ] **Step 6: Reach GREEN**

  Re-run all theme tests and `npm run test:public-header`.

- [ ] **Step 7: Commit Task 4**

  Commit message: `fix: keep text readable across themes`

---

## Task 5: Verify, review, and release

- [ ] **Step 1: Run all local quality gates from a clean state**

  Run:

  - `npm run test:public-header`
  - all new focused tests;
  - `npm run test:standalone`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`
  - `git diff --check`

- [ ] **Step 2: Browser-test the local production build**

  Check desktop and mobile widths for:

  - automatic profile hover, pointer-gap stability, click pinning, keyboard focus, and touch click fallback;
  - Auto/Light/Dark selection, OS changes in Auto, persistence after reload and navigation;
  - public home/product pages and chat readability;
  - admin, employee, and customer dashboard cards, forms, tables, menus, badges, alerts, and unavailable states;
  - reduced-motion behavior;
  - white print preview for at least one printable artifact.

- [ ] **Step 3: Request a whole-change code review**

  Fix every correctness, accessibility, contrast, performance, or scope issue and repeat affected checks.

- [ ] **Step 4: Push and deploy**

  Push `codex/product-home-chat-improvements`, deploy the verified commit to Vercel production, and confirm the production alias points to that deployment.

- [ ] **Step 5: Repeat production smoke checks**

  Verify the public home/product header, appearance controls, authenticated dashboard, module colors, profile hover, and representative light/dark text contrast before reporting completion.
