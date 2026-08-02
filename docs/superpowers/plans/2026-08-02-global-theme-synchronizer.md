# Global Theme Synchronizer Implementation Plan

> **For agentic workers:** Execute inline in the current shared worktree. Do not dispatch subagents, stage files, or commit.

**Goal:** Keep the resolved Light/Dark/Auto theme synchronized on every route, including login, registration, and forgot-password pages that do not render a visible appearance selector.

**Architecture:** Preserve the existing inline root bootstrap as the only pre-paint initializer. Add one headless Client Component to the root layout for long-lived `storage` and operating-system color-scheme listeners, and share the existing browser theme-store functions with visible `ThemeSelector` instances so the global listener and selectors update the same DOM attributes and custom event.

**Tech Stack:** Next.js 16.2 App Router, React 19 Client Components, TypeScript, Node test runner.

## Global Constraints

- Root layout and surrounding headers remain Server Components.
- Existing visible appearance selectors and their Auto/Light/Dark controls remain unchanged.
- Existing no-flash inline bootstrap remains before hydration.
- Cross-tab updates parse unsupported or removed storage values as Auto.
- Operating-system changes update the resolved theme only while mode is Auto.
- No new dependencies, staging, or commit.

---

### Task 1: Pin the route-independent synchronization contract

**Files:**
- Modify: `tests/theme-integration.test.mts`

**Interfaces:**
- Consumes: root layout source, auth page source, visible selector source.
- Produces: failing contracts for a root-mounted `ThemeSynchronizer`, global storage/media listener ownership, cleanup, the Auto guard, and preserved selector/bootstrap behavior.

- [x] **Step 1: Write failing source-contract tests**

Add assertions that `app/layout.tsx` imports and renders `<ThemeSynchronizer />`; login/register/forgot-password do not need their own selector; `components/ui/ThemeSynchronizer.tsx` is a Client Component that listens to `storage` and `matchMedia(...).change`, removes both listeners, parses `event.newValue`, and guards OS changes with `getThemeMode() === "auto"`; `ThemeSelector` still renders the visible options and uses the shared theme store.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test tests/theme-preference.test.mts tests/theme-integration.test.mts tests/theme-contrast.test.mts
```

Expected: the new root/global synchronization contracts fail because the headless component and shared store do not exist.

### Task 2: Add the global synchronization owner

**Files:**
- Create: `components/ui/theme-store.ts`
- Create: `components/ui/ThemeSynchronizer.tsx`
- Modify: `components/ui/ThemeSelector.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- `applyTheme(mode: ThemeMode, persist: boolean): void` applies `data-theme-mode`, resolved `data-theme`, `colorScheme`, optional storage, and dispatches the existing custom event.
- `getThemeMode(): ThemeMode` reads and validates the root mode.
- `subscribeToThemeMode(onStoreChange: () => void): () => void` subscribes visible selectors to the custom same-document event.
- `colorSchemeQuery` and `THEME_CHANGE_EVENT` remain stable shared constants.
- `ThemeSynchronizer(): null` owns cross-tab and operating-system listeners for the lifetime of the root layout.

- [x] **Step 1: Extract the existing browser store without changing selector behavior**

Move the DOM mutation, persistence, custom-event dispatch, root snapshot, and custom-event subscription from `ThemeSelector.tsx` into `theme-store.ts`. Keep `ThemeSelector`'s existing label, select, options, variants, and persisted change handler.

- [x] **Step 2: Implement the headless synchronizer**

Use one `useEffect` to register `window.storage` and media-query `change` listeners. On matching storage keys, call `applyTheme(parseThemeMode(event.newValue), false)`. On media changes, call `applyTheme("auto", false)` only when `getThemeMode() === "auto"`. Remove both listeners in cleanup and render `null`.

- [x] **Step 3: Mount it from the root Server Component**

Import and render `<ThemeSynchronizer />` in the root `<body>` without wrapping server-rendered children and without changing `themeBootstrap` or the `<head>` script.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all focused preference/integration/contrast tests pass.

### Task 3: Verify and report

**Files:**
- Modify: `.superpowers/sdd/2026-08-02-fast-colorful-dashboard-profile-hover-and-theme/task-4-report.md`

- [x] **Step 1: Run regression gates**

Run `npm run test:public-header`, `npm run test:standalone`, `npx tsc --noEmit`, and `npm run lint`.

- [x] **Step 2: Audit the diff**

Run `git diff --check`, inspect the scoped diff, and confirm no auth route, attachment behavior, dependency, or bootstrap change slipped in.

- [x] **Step 3: Record TDD and verification evidence**

Append the RED/GREEN results, files, and all verification counts to the Task 4 report. Do not stage or commit.
