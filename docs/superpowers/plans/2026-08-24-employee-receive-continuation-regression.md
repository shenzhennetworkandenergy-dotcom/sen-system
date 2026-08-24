# Employee Receive Continuation Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the authorized Employee Receive queue continuation so the physical receiving page, serial labels, and receipt action use the dedicated receive permission and employee warehouse scope.

**Architecture:** Keep the established shared Purchase receipt page and server action. Restore the last-known-working role-aware guard: Admin remains allowed through the existing permission bypass, while an Employee must hold `inventory.receive_new_stock` and match the Purchase Order destination warehouse. Keep the existing atomic receipt RPC unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Node test runner, Vercel.

**Spec:** Current user-approved urgent regression request in this Codex task; no separate repository specification file.

## Global Constraints

- Do not change inventory quantities, receiving calculations, PO/shipment status rules, SEN serial generation, or Daily Closing calculations.
- Do not weaken employee permission or warehouse scope enforcement.
- Do not add or run a database migration.
- Deploy only after focused tests, full regression, TypeScript, ESLint, production build, and production-baseline comparison pass.

---

### Task 1: Reproduce and protect the authorization regression

**Files:**
- Modify: `tests/purchase-serial-receipt-permission.test.mts`
- Test: `tests/purchase-serial-receipt-permission.test.mts`

**Interfaces:**
- Consumes: `requirePermission("inventory.receive_new_stock")`, employee primary warehouse resolution, existing Purchase receipt route.
- Produces: A regression contract that rejects the legacy two-permission guard and requires page/action warehouse enforcement.

- [x] **Step 1: Write the failing test**

Update the receipt workflow test to require the page and action to use the dedicated permission and primary-warehouse check, and to reject `requireAllPermissions(["purchasing.receive", "inventory.receive_new_stock"])`.

- [x] **Step 2: Run the focused test to verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/purchase-serial-receipt-permission.test.mts`

Expected: FAIL because the deployed continuation page and action still use the legacy two-permission guard and do not apply the employee warehouse check.

- [x] **Step 3: Implement the minimal correction**

Restore the established behavior in `app/admin/purchasing/[id]/receive/page.tsx`, `app/admin/purchasing/actions.ts`, and `lib/inventory/employee-stock-receiving.ts`:

```ts
const { profile, permissions } = await requirePermission(
  "inventory.receive_new_stock",
);

if (profile.role === "employee") {
  const warehouseId = await getEmployeePrimaryWarehouseId(profile.id);
  if (!warehouseId || warehouseId !== data.order.destination_warehouse_id) {
    redirect("/employee/inventory/receive?error=...");
  }
}
```

Use the same server-side warehouse validation in `receivePurchaseOrderAction`, preserve the existing atomic `post_received_purchase_order` RPC, and return Employees to the Employee queue after success/failure.

- [x] **Step 4: Run the focused test to verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [x] **Step 5: Commit**

Commit only the focused test, route/action/helper correction, and this directly related plan.

### Task 2: Verify and deploy the isolated fix

**Files:**
- Verify only; no additional production files unless a directly related regression is proven.

**Interfaces:**
- Consumes: corrected Employee Receive continuation and existing test/build scripts.
- Produces: verified production deployment with the same schema and business logic.

- [x] **Step 1: Run focused receive and permission tests**

Run the Purchase receipt permission, employee receiving workflow, route regression, navigation, work-count, Purchase integration, and Inventory verification tests.

- [x] **Step 2: Run full verification**

Run `npm run test:standalone`, TypeScript (`npx tsc --noEmit`), `npm run lint`, and `npm run build` with the existing production-like local environment.

- [x] **Step 3: Compare deployment baseline**

Confirm `https://sen-system.vercel.app` still points to deployment `dpl_E6NqsfQRr74WDRauH2fgUXuC22hD` / commit `c9c8fd4021bdbe88368cbb8613f8527312912c10` before promotion, and confirm the worktree contains no unrelated changes.

- [ ] **Step 4: Deploy and smoke-test**

Deploy the isolated commit to Vercel production, verify the deployment is READY, confirm the important public/auth route responses, and perform the strongest available authenticated Employee Receive verification without changing production data.
