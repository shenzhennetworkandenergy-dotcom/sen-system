# SEN Serial Label Sizes Implementation Plan

> Execute test-first. Each behavior receives a failing test before production code.

**Goal:** Add database-managed SEN label dimensions, require size selection before label rendering, and expose permission-aware print actions beside staff-facing SEN serials.

**Architecture:** A small pure domain module validates sizes and builds safe print-selection query strings. Supabase stores reusable sizes. The print Server Component has two states: size chooser and sized label preview. Admin-only Server Actions mutate the size catalogue. A reusable `SerialPrintLink` keeps operational print links consistent.

**Stack:** Next.js 16 Server Components/Actions, React 19, TypeScript, Supabase/Postgres, Node test runner, Tailwind/CSS print rules.

---

### Task 1: Define failing domain and acceptance tests

**Files:**
- Create: `tests/serial-label-sizes.test.mts`

1. Test accepted normalization of name and decimal millimetre dimensions.
2. Test rejection of blank names, non-finite values and dimensions outside 10-300 mm.
3. Test safe query generation for ids, batch and product selections.
4. Test required migration schema, default seeds and RLS.
5. Test chooser-before-preview, admin-only mutation guards and dynamic `@page` sizing.
6. Test the shared print link is used on staff serial surfaces.
7. Run the new test and confirm it fails for the missing implementation.

### Task 2: Implement the size domain and database migration

**Files:**
- Create: `lib/inventory/label-sizes.ts`
- Create: `supabase/migrations/202608010003_serial_label_sizes.sql`

1. Implement strict input normalization and width/height CSS helpers.
2. Implement selection parsing/query construction with UUID and count limits.
3. Add the constrained table, indexes, defaults, grants and RLS read policy.
4. Run focused tests until domain and migration assertions pass.

### Task 3: Implement admin-only catalogue actions

**Files:**
- Create: `app/admin/serials/print/actions.ts`

1. Add create action with an active-admin authorization check and validated insert.
2. Add delete action with an active-admin authorization check and validated UUID.
3. Revalidate the chooser and redirect with explicit success/error feedback.
4. Run focused tests.

### Task 4: Replace print presets with the required chooser

**Files:**
- Modify: `app/admin/serials/print/page.tsx`
- Modify: `app/globals.css`

1. Load saved sizes for authorized printers.
2. Render chooser and admin controls when no valid size is selected.
3. Support ids, batch and product selections.
4. Generate assets only after a size is selected.
5. Render exact millimetre dimensions and matching dynamic print page CSS.
6. Remove hard-coded preset behavior and preserve back/change-size actions.

### Task 5: Add consistent print actions to staff serial displays

**Files:**
- Create: `components/inventory/SerialPrintLink.tsx`
- Modify: `app/admin/serials/page.tsx`
- Modify: `app/admin/serials/[id]/page.tsx`
- Modify: `app/admin/serials/scan/page.tsx`
- Modify: `components/inventory/SerialSearchField.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`
- Modify: `app/admin/orders/[id]/pack/page.tsx`
- Modify: `app/admin/orders/[id]/allocate/page.tsx`
- Modify: `components/orders/SerialAllocator.tsx`
- Modify: `app/admin/orders/[id]/shipments/new/page.tsx`
- Modify: `components/orders/ShipmentBuilder.tsx`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `app/admin/shipments/[id]/page.tsx`
- Modify: `lib/orders/data.ts`
- Modify: `app/admin/products/[id]/page.tsx`

1. Create an accessible compact link that always starts at the size chooser.
2. Compute `canPrint` from admin role or `serials.print` on each staff route.
3. Add the link beside each rendered operational SEN serial with its serial-row UUID.
4. Hide the link for employees without permission.
5. Keep customer account pages unchanged.

### Task 6: Verify, release and deploy

1. Apply migrations to local Supabase and inspect the resulting rows/policies.
2. Run the focused test, all standalone tests, lint and production build.
3. Exercise chooser, add/delete and print preview locally in the browser when authentication is available.
4. Review the diff for unrelated changes and security regressions.
5. Commit and push the feature branch and main.
6. Apply the linked production migration.
7. Deploy production to Vercel.
8. Run production route/database smoke tests and inspect deployment health.
