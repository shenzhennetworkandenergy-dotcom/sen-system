# Responsive header and order contrast implementation plan

**Goal:** Deliver a responsive public header/profile menu and repair the unreadable active order-status controls without changing unrelated behavior.

**Architecture:** Keep `PublicHeader` as the server data boundary and use native `<details>` elements for both account and compact navigation disclosures. Use semantic CSS state classes for order progress so dashboard surface styles cannot override state contrast.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Node test scripts.

### Task 1: Lock the responsive header contract

**Files:**
- Modify: `scripts/verify-public-header.mjs`

1. Assert the `xl` desktop breakpoint, profile disclosure, highlighted dashboard entry, compact search, customer quote link, and viewport-bounded menu.
2. Run the verifier and confirm it fails against the old header.

### Task 2: Implement the responsive header

**Files:**
- Modify: `components/layout/PublicHeader.tsx`
- Modify: `components/layout/MobileNavigation.tsx`
- Modify: `app/globals.css`

1. Rebalance the desktop row and move dashboard/profile/logout into the profile disclosure.
2. Move compact search inside the three-bar menu and include all applicable navigation actions.
3. Add anchored, scrollable, accessible responsive-menu styling.
4. Run the focused header verifier.

### Task 3: Lock and repair order-progress contrast

**Files:**
- Create: `tests/order-progress-contrast.test.mts`
- Modify: `components/orders/OrderProgress.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`

1. Add a failing regression test for semantic active-state classes and WCAG AA contrast.
2. Add the semantic classes to the active tile and current action.
3. Add scoped CSS after the shared dashboard surface rules.
4. Run the focused regression test.

### Task 4: Verify and release

1. Run the public-header verifier, order-progress regression, lint, TypeScript, standalone suite, and production build.
2. Browser-check desktop and compact header behavior plus authenticated order-progress computed colors.
3. Commit, push, deploy to Vercel production, and repeat production browser checks.

