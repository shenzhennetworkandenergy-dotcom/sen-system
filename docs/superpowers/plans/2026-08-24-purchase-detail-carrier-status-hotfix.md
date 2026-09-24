# Purchase Detail Carrier Status Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `/admin/purchasing/[id]` by making its active-carrier lookup match the deployed `purchase_carriers.status` schema.

**Architecture:** Keep the existing purchase calculations, lifecycle, permissions, receipt relationships, and inventory effects unchanged. Add one read-only integration regression test around the real `getPurchaseOrder` data loader, replace the stale `is_active = true` carrier filter with the established `status = 'active'` filter, and restore only the managed-carrier and authorized tracking-correction purchase-detail files that the deployed release branch omitted while their additive migrations remained active in production.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node test runner, Supabase/PostgREST, Vercel.

**Spec:** Current Codex task request dated 2026-08-24 (no separate repository specification).

## Global Constraints

- Fix only the Purchase Order detail-page regression.
- Preserve all purchase, shipment, receipt, inventory, audit, permission, Sales, Quotation, Accounting, HR, and public-site behavior.
- Do not delete, rewrite, or backfill production data.
- Deploy only the clean hotfix commit based on deployed commit `4e50f41d1cd0276a5039dee8a247184ac7020091`.
- No database migration execution is required because production already has `purchase_carriers.status` and migrations `202608190001` and `202608230002`.

---

### Task 1: Reproduce the schema mismatch through the real detail loader

**Files:**
- Create: `tests/purchase-detail-data.test.mts`

**Interfaces:**
- Consumes: `getPurchaseOrder(id: string)` from `lib/purchasing/data.ts` and the local Supabase schema.
- Produces: A read-only regression test that returns `null` for a missing order instead of failing while loading carriers.

- [ ] **Step 1: Write the failing test**

```ts
test("purchase detail loader uses the status-based carrier schema", { skip: !hasLocalDatabase }, async () => {
  const { getPurchaseOrder } = await import("../lib/purchasing/data.ts");
  const result = await getPurchaseOrder("00000000-0000-4000-8000-000000000000");
  assert.equal(result, null);
});
```

The test registers a Node resolver for the existing `@/` alias and `server-only` marker so it executes the real server data module without changing production code.

- [ ] **Step 2: Run the focused test against local Supabase and verify RED**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/purchase-detail-data.test.mts
```

Expected: FAIL because PostgREST reports `column purchase_carriers.is_active does not exist`, which `getPurchaseOrder` surfaces as `Unable to load purchase order.`

### Task 2: Correct the active-carrier filter

**Files:**
- Modify: `lib/purchasing/data.ts:87`
- Test: `tests/purchase-detail-data.test.mts`

**Interfaces:**
- Consumes: The existing `purchase_carriers.status` values `active` and `inactive`.
- Produces: The unchanged carrier list shape `{ id, name }[]` for the purchase detail page.

- [ ] **Step 1: Apply the minimal implementation**

```ts
db.from("purchase_carriers").select("id,name").eq("status", "active").order("name")
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run the focused Node test with local Supabase environment values.

Expected: PASS and `getPurchaseOrder` returns `null` for the missing fixture order after every detail-specific relation query succeeds.

- [ ] **Step 3: Run purchasing integration tests**

Run `npm run test:purchasing` against local Supabase.

Expected: PASS for purchase creation, approval, inbound shipment, receipt, stock posting, close, and cleanup.

- [ ] **Step 4: Commit the hotfix**

```powershell
git add lib/purchasing/data.ts tests/purchase-detail-data.test.mts docs/superpowers/plans/2026-08-24-purchase-detail-carrier-status-hotfix.md
git commit -m "fix: restore purchase order detail loading"
```

### Task 3: Restore approved purchase-detail carrier and tracking controls omitted by the release branch

**Files:**
- Restore from approved commit `f897b37845711662f8d58846ddaac06ea7dac874`: `app/admin/purchasing/[id]/page.tsx`, `app/admin/purchasing/actions.ts`, `components/purchasing/PurchaseCarrierManager.tsx`, `lib/purchasing/carriers.ts`, `lib/purchasing/data.ts`, `supabase/migrations/202608190001_purchase_carrier_management.sql`, `tests/purchase-carrier-management.test.mts`
- Create from the already-applied tracking-correction release: `lib/purchasing/shipment-tracking-correction.ts`, `supabase/migrations/202608230002_supplier_shipment_tracking_correction.sql`, `scripts/verify-purchase-shipment-tracking-correction.mjs`, `tests/purchase-shipment-tracking-correction.test.mts`
- Modify: `app/admin/purchasing/[id]/page.tsx`, `app/admin/purchasing/actions.ts`

**Interfaces:**
- Consumes: Existing permissions `purchasing.edit` and `shipments.create`; existing RPCs `transition_purchase_inbound_shipment_with_carrier` and `correct_purchase_inbound_shipment_tracking`.
- Produces: The previously approved managed-carrier modal and permission-gated `Edit Carrier / Tracking` form, without changing shipment or purchase statuses.

- [ ] **Step 1: Restore the approved managed-carrier commit**

Cherry-pick `f897b37845711662f8d58846ddaac06ea7dac874`, resolving only the already-corrected active-carrier line if necessary.

- [ ] **Step 2: Add the tracking-correction regression tests and verify RED**

Run the pure tracking-correction test before restoring its helper/action/UI wiring.

Expected: FAIL because the omitted tracking-correction module is not present in the deployed release branch.

- [ ] **Step 3: Restore only tracking-correction helper, action, UI, verifier, and migration source**

Do not copy the unrelated employee receive, serial display removal, inventory, or other dirty workspace changes.

- [ ] **Step 4: Verify carrier and tracking behavior**

Run the carrier-management test, tracking-correction test, local rollback-only database verifier, focused detail-loader test, and full purchasing integration test.

Expected: PASS, with the database verifier reporting a clean rollback and no purchase status, receipt, or inventory mutation outside its rolled-back fixture.

### Task 4: Verify and release only the hotfix

**Files:**
- No additional source changes.

**Interfaces:**
- Consumes: The clean hotfix commit from Task 2.
- Produces: A Vercel production deployment and read-only production verification evidence.

- [ ] **Step 1: Run static and regression checks**

Run TypeScript, ESLint, focused purchase tests, the standalone suite, and the Next.js production build.

- [ ] **Step 2: Verify the hotfix diff and schema safety**

Confirm the commit differs from deployed `4e50f41` only by the plan, regression test, and one carrier-filter line. Confirm remote migration state remains unchanged and no data-changing migration is pending for this hotfix.

- [ ] **Step 3: Deploy the clean worktree to Vercel production**

Run the production deployment from this isolated worktree only.

- [ ] **Step 4: Perform production smoke verification**

Open the purchasing list and multiple detail routes representing Draft, Received, and Stock Received orders. Confirm supplier shipment, carrier/tracking, receipts, status history, permission-gated controls, and Receive Into Stock rendering without executing any mutating action.

- [ ] **Step 5: Inspect post-deployment logs**

Confirm the tested purchase detail requests have no `42703`, `is_active`, or route-level server errors.
