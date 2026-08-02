# Animated Appearance and Compact Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a finite animation to the persistent Auto/Light/Dark control and redesign the shared profile page as a compact, attractive, responsive accordion layout.

**Architecture:** Keep the native select, native details elements, server actions, database reads, upload component, and pre-paint theme bootstrap. Add one pure preference-to-glyph helper, narrow semantic CSS hooks, and profile-scoped CSS so animation and layout changes do not leak into other routes.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind utilities, shared CSS, Node test runner.

## Global Constraints

- Do not change authentication, permissions, profile queries, profile field names, upload behavior, validation, routes, or database writes.
- Add no dependencies, image requests, font requests, providers, or migrations.
- Animate only opacity and transform, finitely, with `prefers-reduced-motion` cancellation.
- Keep the native Auto/Light/Dark select and native details/summary accessibility.
- Preserve readable light and dark text, inputs, help copy, focus rings, and buttons.
- Keep the compact dashboard header free of horizontal overflow at 320px.

---

### Task 1: Animated appearance control

**Files:**
- Modify: `lib/ui/theme.ts`
- Modify: `components/ui/ThemeSelector.tsx`
- Modify: `app/globals.css`
- Test: `tests/theme-preference.test.mts`
- Test: `tests/theme-integration.test.mts`

**Interfaces:**
- Produces: `themeModeGlyph(mode: ThemeMode): string`, returning `◐`, `☀`, or `☾` for Auto, Light, or Dark.
- Produces: `.sen-theme-mode-icon` and `data-theme-mode` UI hooks.
- Preserves: `applyTheme(mode, true)` and the existing native select options.

- [ ] **Step 1: Write failing appearance-animation tests**

Add assertions that call `themeModeGlyph` for every supported mode and source-contract assertions that require:

```ts
assert.match(selector, /themeModeGlyph\(mode\)/);
assert.match(selector, /key=\{mode\}/);
assert.match(selector, /data-theme-mode=\{mode\}/);
assert.match(selector, /sen-theme-mode-icon/);
assert.match(css, /@keyframes sen-theme-mode-pop/);
assert.match(css, /\.sen-theme-mode-icon\s*\{[^}]*animation:\s*sen-theme-mode-pop[^;]*\b1\b/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*sen-theme-mode-icon[^}]*animation:\s*none/);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/theme-preference.test.mts tests/theme-integration.test.mts
```

Expected: failures because the glyph helper and animation hooks do not exist.

- [ ] **Step 3: Implement the minimal animated control**

Add the glyph helper to `lib/ui/theme.ts`. Render one decorative keyed glyph in `ThemeSelector`, set `data-theme-mode={mode}`, and keep the native labelled select unchanged. Add selector-scoped mode colors, a 240ms pop/rotate animation, compact width/padding, full-variant positioning, and reduced-motion cancellation.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all theme preference and integration tests pass.

- [ ] **Step 5: Commit the appearance task**

```powershell
git add lib/ui/theme.ts components/ui/ThemeSelector.tsx app/globals.css tests/theme-preference.test.mts tests/theme-integration.test.mts
git commit -m "feat: animate appearance preference"
```

### Task 2: Compact profile page

**Files:**
- Modify: `app/profile/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/profile-page-visuals.test.mts`

**Interfaces:**
- `Section` adds `tone: "blue" | "cyan" | "emerald" | "violet" | "rose" | "amber"` and `defaultOpen?: boolean`.
- Produces: `.sen-profile-page`, `.sen-profile-hero`, `.sen-profile-media-card`, `.sen-profile-section`, `.sen-profile-field`, and `.sen-profile-save-button` hooks.
- Preserves: all six `updateProfileSectionAction.bind(...)` calls and both `updateProfileMediaAction.bind(...)` calls.

- [ ] **Step 1: Write the failing profile visual contract**

Create a test that reads the profile source and CSS and asserts:

```ts
assert.match(profile, /sen-profile-page/);
assert.match(profile, /sen-profile-hero/);
assert.match(profile, /sen-profile-media-card/);
assert.match(profile, /data-profile-tone=\{tone\}/);
assert.match(profile, /defaultOpen/);
assert.match(profile, /title="About"[\s\S]*defaultOpen/);
assert.match(profile, /title="Contact"[\s\S]*defaultOpen/);
assert.doesNotMatch(profile, /title="Location"[^>]*defaultOpen/);
for (const tone of ["blue", "cyan", "emerald", "violet", "rose", "amber"]) {
  assert.match(profile, new RegExp(`tone="${tone}"`));
}
assert.match(css, /html\[data-theme="dark"\] \.sen-profile-page/);
assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*sen-profile/);
```

Also assert the existing media actions, section actions, and representative field names remain present.

- [ ] **Step 2: Run the profile test and verify RED**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/profile-page-visuals.test.mts
```

Expected: failure because the compact profile hooks, tones, and default-open policy do not exist.

- [ ] **Step 3: Implement the compact server-rendered profile markup**

Wrap the route content in `.sen-profile-page`. Reduce cover/avatar utility sizes, add compact identity/media hooks, and keep every existing form action. Update `Section` to render a toned details card with a chevron and compact form hooks. Pass `defaultOpen` only to About and Contact. Assign blue, cyan, emerald, violet, rose, and amber tones in page order.

- [ ] **Step 4: Add profile-scoped light/dark/responsive CSS**

Define tone variables, compact spacing, fields, media controls, checked emoji treatment, details chevron rotation, finite accent reveal, dark-mode surfaces/foregrounds, phone layout adjustments, and reduced-motion cancellation. Do not add unscoped input or details rules.

- [ ] **Step 5: Run the profile and theme tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/profile-page-visuals.test.mts tests/profile-validation.test.mts tests/theme-preference.test.mts tests/theme-integration.test.mts tests/theme-contrast.test.mts
```

Expected: all tests pass.

- [ ] **Step 6: Commit the profile task**

```powershell
git add app/profile/page.tsx app/globals.css tests/profile-page-visuals.test.mts
git commit -m "feat: compact the shared profile page"
```

### Task 3: Release verification

**Files:**
- Verify only; no production edits unless a failing gate identifies a regression.

**Interfaces:**
- Consumes: the completed appearance and profile tasks.
- Produces: a clean reviewed commit ready for the existing branch, pull request, and Vercel project.

- [ ] **Step 1: Run automated release gates**

Run:

```powershell
npm run test:standalone
npm run test:public-header
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 2: Run local production-mode browser checks**

Verify `/profile` at 320, 375, 768, and 1440px in Light and Dark. Confirm no horizontal overflow, About/Contact open by default, other sections collapsed, media forms remain usable, selector animation is finite, compact dashboard header fits, and theme persistence survives reload.

- [ ] **Step 3: Review the complete diff**

Compare the branch against the previous production commit. Confirm no Critical or Important issues and no business logic, permissions, queries, actions, or field names changed.

- [ ] **Step 4: Push, deploy, and smoke-test production**

Push `codex/product-home-chat-improvements`, deploy the linked Vercel project to production, and run:

```powershell
$env:SMOKE_BASE_URL='https://sen-system.vercel.app'; node scripts/production-smoke-routes.mjs
```

Then repeat the profile/theme responsive browser checks on `https://sen-system.vercel.app`.
