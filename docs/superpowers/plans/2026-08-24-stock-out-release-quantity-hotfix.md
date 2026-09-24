# Stock Out Release Quantity Regression Hotfix Plan

> **Scope:** Correct the false `max = 0` release limit while preserving all existing Stock Out authorization, warehouse, reservation, serial, concurrency, idempotency, ledger, and inventory-movement safeguards.

## Confirmed root cause

The employee form and database confirmation function both cap a release by `packed_quantity - released_quantity`. Packing is preparation-only in the approved workflow, so a valid request with `remaining_quantity = 1` and `packed_quantity = 0` becomes impossible to release. Serial selection is validated separately and is not the source of the zero limit.

## Task 1: Lock the regression with focused tests

**Files:**
- Modify: `tests/stock-out-domain.test.mts`
- Modify: `tests/stock-out-release.test.mts`

1. Add tests proving request remaining quantity—not packed quantity—controls the browser input limit.
2. Add domain tests for remaining 1 and 5, zero submission, over-release, insufficient reservation, and insufficient physical stock.
3. Add a database-migration contract test proving the obsolete packed guard is removed while the request-remaining guard remains.
4. Run the focused tests and confirm they fail against the production baseline.

## Task 2: Apply the narrow correction

**Files:**
- Modify: `components/inventory/StockOutReleaseForm.tsx`
- Modify: `lib/inventory/stock-out.ts`
- Add: `supabase/migrations/202608240001_stock_out_authoritative_release_quantity.sql`
- Modify/generated: `database/native/schema.sql`

1. Initialize and cap the release input using the request item's authoritative remaining quantity.
2. Keep packed quantity informational only; do not use it as an input or server confirmation limit.
3. Preserve exact serial-count validation after the employee chooses a positive release quantity.
4. Add a backward-compatible migration that replaces only the obsolete packed guard in `confirm_sales_stock_out`; preserve all remaining validation and transaction logic.
5. Regenerate the native/offline schema from the same migration chain.

## Task 3: Verify local behavior and safety

**Files:**
- Modify if needed: `scripts/verify-stock-out-database.mjs`

1. Verify remaining 1 accepts 1 and rejects 0/2.
2. Verify remaining 5 accepts partial/full release and rejects 6.
3. Verify serialized releases require an exact eligible serial count and preserve product, warehouse, condition, conflict, and concurrency checks.
4. Verify physical stock and reservation are consumed exactly once and the authoritative movement/ledger/request state update atomically.
5. Verify Receive, Daily Closing, Sales, Purchase, Quotations, Accounting, and HR/Attendance smoke coverage remains green.

## Task 4: Production readiness and isolated deployment

1. Run focused suites, full regression, TypeScript, ESLint, and the production build.
2. Confirm the worktree contains only this hotfix and an additive function migration; no destructive schema/data changes.
3. Recheck the current Vercel production deployment before promotion. Stop rather than overwrite newer legitimate production work.
4. Apply the backward-compatible database function migration and deploy the clean hotfix commit in safe order.
5. Perform a non-destructive production smoke test and report any authenticated-test limitation without creating or altering production data.
