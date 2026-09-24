# Employee Stock Out / Product Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Employee Receive New Products while adding invoice-triggered, warehouse-scoped, serial-safe Stock Out requests, dynamic badges, single-point physical deduction, shipment separation, and the minimum RMA physical-return receipt.

**Architecture:** Add one backward-compatible PostgreSQL migration containing the dedicated request, immutable revision/release/return ledgers and atomic RPCs. Keep data loading and authorization server-side, use focused pure helpers for validation/view models, and add small Client Components only for badge polling and Stock Out form interaction. The existing inventory movement ledger remains authoritative for Daily Closing.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript 5, PostgreSQL 17/PLpgSQL, Supabase/PostgREST compatibility clients, Node test runner, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-22-stock-out-product-release-design.md`

## Global Constraints

- Do not deploy to Vercel or production.
- Use only additive, backward-compatible database changes; do not delete, truncate, rename, or destructively rewrite existing business data or history.
- Keep Employee Receive New Products behavior unchanged except for its authorized pending-request badge.
- `inventory.release_sales_stock` is sensitive, independent, and denied by default.
- Finalize Invoice and Confirm Stock Out are separate atomic transactions with operation idempotency and database locking.
- Shipment dispatch never mutates physical stock or reservations.
- Daily Closing reads confirmed inventory movements only.
- Work in the existing checkout because required prior Receive/Daily Closing/offline changes are uncommitted there; stage only files belonging to each task.
- Every production behavior begins with a failing test and follows red-green-refactor.

---

### Task 1: Stock Out domain contracts

**Files:**
- Create: `lib/inventory/stock-out.ts`
- Create: `tests/stock-out-domain.test.mts`

**Interfaces:**
- Produces: `stockOutRemaining(required, released): number`
- Produces: `deriveStockOutStatus(items): "pending_release" | "partially_released" | "fully_released"`
- Produces: `validateReleaseQuantity({remaining, packedRemaining, reserved, onHand, quantity}): string | null`
- Produces: `isEligibleStockOutSerial(serial, expected): boolean`
- Produces: `isRevisionQuantityValid(required, released): boolean`

- [x] **Step 1: Write the failing domain tests**

```ts
test("derives pending partial and full request status from required and released quantities", () => {
  assert.equal(deriveStockOutStatus([{ required: 5, released: 0 }]), "pending_release");
  assert.equal(deriveStockOutStatus([{ required: 5, released: 2 }]), "partially_released");
  assert.equal(deriveStockOutStatus([{ required: 5, released: 5 }]), "fully_released");
});

test("rejects a revision below physically released quantity", () => {
  assert.equal(isRevisionQuantityValid(5, 6), false);
  assert.equal(isRevisionQuantityValid(6, 6), true);
});

test("accepts only an eligible exact-product warehouse serial", () => {
  const expected = { productId: "p1", variationId: null, warehouseId: "w1" };
  assert.equal(isEligibleStockOutSerial({ productId: "p1", variationId: null, warehouseId: "w1", status: "packed", condition: "new", conflicting: false }, expected), true);
  assert.equal(isEligibleStockOutSerial({ productId: "p1", variationId: null, warehouseId: "w1", status: "damaged", condition: "damaged", conflicting: false }, expected), false);
});
```

- [x] **Step 2: Run the domain test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/stock-out-domain.test.mts`

Expected: FAIL because `lib/inventory/stock-out.ts` does not exist.

- [x] **Step 3: Implement the pure contracts**

```ts
export type StockOutRequestStatus = "pending_release" | "partially_released" | "fully_released" | "cancelled";

export function stockOutRemaining(required: number, released: number) {
  return Math.max(0, Number(required) - Number(released));
}

export function deriveStockOutStatus(items: Array<{ required: number; released: number }>) {
  const required = items.reduce((sum, item) => sum + Number(item.required), 0);
  const released = items.reduce((sum, item) => sum + Number(item.released), 0);
  return released <= 0 ? "pending_release" : released >= required ? "fully_released" : "partially_released";
}
```

Implement the quantity and serial predicates with literal allow/deny rules from the approved specification; do not query the database from this file.

- [x] **Step 4: Run the domain test and verify GREEN**

Run the Step 2 command. Expected: all Stock Out domain tests pass.

- [x] **Step 5: Commit the domain contract**

```text
git add lib/inventory/stock-out.ts tests/stock-out-domain.test.mts
git commit -m "test: define stock out domain contracts"
```

### Task 2: Additive database structures and native-schema integration

**Files:**
- Create: `supabase/migrations/202608220001_employee_stock_out_product_release.sql`
- Create: `tests/stock-out-migration.test.mts`
- Modify: `scripts/build-native-schema.mjs`
- Modify: `database/native/seed.sql`
- Generate: `database/native/schema.sql`

**Interfaces:**
- Produces tables: `sales_stock_out_requests`, `sales_stock_out_request_items`, `sales_stock_out_request_revisions`, `sales_stock_out_request_revision_items`, `sales_stock_out_releases`, `sales_stock_out_release_items`, `sales_stock_out_release_serials`, `sales_stock_out_serial_changes`, `rma_return_receipts`, `rma_return_receipt_serials`
- Extends movement type with `stock_out`, serial/allocation status with `warehouse_released`, and `sale_documents` with `finalization_idempotency_key`
- Adds sensitive permission `inventory.release_sales_stock`

- [x] **Step 1: Write a failing migration-contract test**

The test loads the migration and asserts the complete additive object set, uniqueness (`sales_order_id`, finalization token, release token, return token, release serial), required check constraints, RLS enablement/policies, service-role-only mutation RPC grants, no permission-template grant, and absence of `drop table`, `truncate`, and business-data deletion.

```ts
for (const table of requiredTables) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
assert.match(sql, /inventory\.release_sales_stock/);
assert.doesNotMatch(sql, /\b(drop table|truncate|delete from public\.(?:inventory|sales|serial|shipment))/i);
```

- [x] **Step 2: Run the migration test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/stock-out-migration.test.mts`

Expected: FAIL because the migration does not exist.

- [x] **Step 3: Add the migration tables, constraints, indexes, RLS, permission, and status extensions**

Use `create table if not exists`, named foreign keys, nonnegative quantity checks, `required_quantity >= released_quantity`, generated/stored or checked remaining quantities, unique one-request-per-order, unique request-item-per-order-item, unique document revision snapshot, unique idempotency keys, and unique successfully released serial ownership. Add read policies scoped through permission plus active warehouse assignment; direct mutations remain unavailable except through service-role RPCs.

- [x] **Step 4: Integrate the migration into native schema generation and seed**

Read the new migration in `scripts/build-native-schema.mjs` and append it after the raw public schema before final grants. Add the permission row to `database/native/seed.sql` with the existing Inventory module UUID and no template assignment. Run `npm run native:schema`.

- [x] **Step 5: Run migration/native tests and verify GREEN**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/stock-out-migration.test.mts tests/native-schema.test.mts
```

Expected: migration and generated native schema contracts pass.

- [x] **Step 6: Commit the additive schema**

```text
git add supabase/migrations/202608220001_employee_stock_out_product_release.sql tests/stock-out-migration.test.mts scripts/build-native-schema.mjs database/native/seed.sql database/native/schema.sql
git commit -m "feat: add stock out request and release ledger schema"
```

### Task 3: Atomic invoice finalization and request synchronization

**Files:**
- Modify: `supabase/migrations/202608220001_employee_stock_out_product_release.sql`
- Modify: `app/admin/sales/actions.ts`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `lib/sales/data.ts`
- Create: `tests/stock-out-finalization.test.mts`

**Interfaces:**
- Produces RPC: `finalize_sale_invoice(actor_profile_id uuid, requested_order_id uuid, requested_operation_id uuid, requested_request_version bigint) returns uuid`, plus the safe three-argument compatibility wrapper
- Keeps RPC: `generate_sale_document(...)` unchanged for delivery challans
- Action: `generateSaleDocumentAction(saleId, type, formData)` reads `operation_id`

- [x] **Step 1: Write failing finalization behavior tests**

Test operation-token validation, invoice form token presence, delivery challan preservation, the revision floor helper, and a database integration scenario that asserts two calls with the same token return the same document/request/revision while a new token creates a new invoice revision but keeps the same request.

- [x] **Step 2: Run the finalization test and verify RED**

Expected failures: missing RPC/action token and no request synchronization.

- [x] **Step 3: Implement `finalize_sale_invoice`**

The function must authorize `sales.create_invoice`, lock the confirmed sale/items/balances/reservations/request, return an existing document for a committed token, reject draft/cancelled sales, reject quantity below released, reconcile each active reservation to `required - released`, fail increases beyond eligible availability, supersede the previous invoice, create the document revision, upsert the single request and its items, insert immutable revision snapshots, calculate request status, and return the document ID in one transaction.

- [x] **Step 4: Wire the invoice form/action**

Use a hidden `operation_id` generated server-side for each rendered form. Invoice generation calls `finalize_sale_invoice`; delivery challans still call `generate_sale_document`. Revalidate Sales, Stock Out queue, and badge routes only after success, then redirect to the document.

- [x] **Step 5: Verify GREEN and regression**

Run the finalization test plus existing sale-line and sales visibility tests.

- [x] **Step 6: Commit invoice finalization**

```text
git add supabase/migrations/202608220001_employee_stock_out_product_release.sql app/admin/sales/actions.ts app/admin/sales/[saleId]/page.tsx lib/sales/data.ts tests/stock-out-finalization.test.mts
git commit -m "feat: create stock out request when invoice finalizes"
```

### Task 4: Employee navigation, scoped counts, and polling badges

**Files:**
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `components/dashboard/Shell.tsx`
- Modify: `components/dashboard/DashboardNavigation.tsx`
- Modify: `lib/dashboard/work-counts.ts`
- Create: `lib/inventory/employee-inventory-work-counts.ts`
- Create: `app/api/employee/inventory/work-counts/route.ts`
- Modify: `tests/employee-receive-stock-navigation.test.mts`
- Create: `tests/employee-inventory-work-counts.test.mts`

**Interfaces:**
- Route: `routes.employeeInventoryStockOut = "/employee/inventory/stock-out"`
- Server function: `getEmployeeInventoryWorkCounts(profileId, permissions): Promise<{"receive-new-stock"?: number; "stock-out-product-release"?: number}>`
- API response: `{ counts: Record<string, number> }`
- `DashboardNavigation` accepts `workCountsEndpoint?: string`

- [x] **Step 1: Write failing navigation/count tests**

Assert menu order, independent permissions, Inventory dashboard route precedence, receive-order count not unit count, Stock Out pending/partial request count, de-duplication, warehouse scope, and zero/unauthorized omission.

- [x] **Step 2: Run tests and verify RED**

Expected: missing Stock Out navigation and count service.

- [x] **Step 3: Implement scoped server counts and route**

Query all active employee warehouse assignments. Receive count uses distinct purchase orders with remaining items and existing receive permission. Stock Out count uses distinct pending/partial request IDs and Stock Out permission. Route authenticates an active employee and never returns unauthorized counts.

- [x] **Step 4: Implement polling UI**

Initialize from server counts, fetch the endpoint immediately after visibility returns and every 30 seconds while visible, preserve last successful counts on error, abort on unmount, and hide zero counts. Admin work counts keep existing behavior.

- [x] **Step 5: Verify GREEN and existing Receive navigation**

Run both new tests and `tests/employee-stock-receiving-workflow.test.mts`.

- [x] **Step 6: Commit navigation and badges**

```text
git add lib/constants/routes.ts lib/navigation/dashboard.ts components/dashboard/Shell.tsx components/dashboard/DashboardNavigation.tsx lib/dashboard/work-counts.ts lib/inventory/employee-inventory-work-counts.ts app/api/employee/inventory/work-counts/route.ts tests/employee-receive-stock-navigation.test.mts tests/employee-inventory-work-counts.test.mts
git commit -m "feat: add scoped inventory work badges"
```

### Task 5: Stock Out queue and detail data boundaries

**Files:**
- Create: `lib/inventory/stock-out-data.ts`
- Create: `app/employee/inventory/stock-out/page.tsx`
- Create: `app/employee/inventory/stock-out/[requestId]/page.tsx`
- Create: `app/api/employee/inventory/stock-out/serials/route.ts`
- Create: `tests/stock-out-access.test.mts`

**Interfaces:**
- `getAuthorizedStockOutQueue(profileId): Promise<StockOutQueueCard[]>`
- `getAuthorizedStockOutRequest(profileId, requestId): Promise<StockOutRequestDetail | null>`
- Serial route query: `requestItemId`, `q`; response contains only eligible exact-product/variation/warehouse serials.

- [x] **Step 1: Write failing access/view-model tests**

Assert active permission plus any active assigned warehouse, no cross-warehouse rows, request cards show invoice/customer/required/released/remaining, partial remains present, completed/cancelled excluded, and serial filtering excludes damaged/unavailable/quarantined/released/conflicting units.

- [x] **Step 2: Run tests and verify RED**

- [x] **Step 3: Implement server-only data module and queue page**

Use `requirePermission("inventory.release_sales_stock")` on the route and enforce assigned warehouse again in each trusted query. Follow the Receive page card structure and exact Bangla/English label. Do not expose Admin/global data.

- [x] **Step 4: Implement detail and serial-search route**

Return current revision, request items, packing readiness, assigned/preselected serials, release history, and serial-change history. Direct route/API access returns not-found/forbidden outside warehouse scope.

- [x] **Step 5: Verify GREEN and build-time typing**

Run the access tests and `npx tsc --noEmit`.

- [x] **Step 6: Commit queue/detail reads**

```text
git add lib/inventory/stock-out-data.ts app/employee/inventory/stock-out app/api/employee/inventory/stock-out/serials/route.ts tests/stock-out-access.test.mts
git commit -m "feat: add employee stock out queue and detail"
```

### Task 6: Atomic partial/full Stock Out and serial audit

**Files:**
- Modify: `supabase/migrations/202608220001_employee_stock_out_product_release.sql`
- Create: `app/employee/inventory/stock-out/actions.ts`
- Create: `components/inventory/StockOutReleaseForm.tsx`
- Create: `tests/stock-out-release.test.mts`

**Interfaces:**
- RPC: `confirm_sales_stock_out(actor_profile_id uuid, requested_request_id uuid, requested_operation_id uuid, requested_items jsonb) returns uuid`
- RPC: `replace_stock_out_serial(actor_profile_id uuid, requested_request_item_id uuid, requested_old_serial_id uuid, requested_new_serial_id uuid, requested_reason text) returns uuid`
- Action result: `{ ok: boolean; message: string; releaseId?: string }`

- [x] **Step 1: Write failing release tests**

Cover exact quantity/serial count, partial remainder/status, duplicate token, two-employee stale version, same serial concurrency, damaged/unavailable rejection, reservation/on-hand deltas, immutable movement/release linkage, employee audit, and rollback on forced validation failure.

- [x] **Step 2: Run release tests and verify RED**

- [x] **Step 3: Implement atomic release RPC**

Lock in deterministic order; reauthorize profile/permission/warehouse; validate request version, remaining, packed preparation, balance, reservation, and serials; decrement `on_hand` and `reserved`; decrease or consume reservation; insert one confirmed `stock_out` movement and negative movement items; update serial/allocation to `warehouse_released`; insert immutable release rows; update request totals/status; return release ID. An existing successful token returns its release without mutation.

- [x] **Step 4: Implement explicit serial replacement RPC**

Require old serial belongs to this request/order, new serial is eligible in the same warehouse/product/variation, update allocation references safely before physical release, and insert immutable change audit. Never replace after the old serial has been released.

- [x] **Step 5: Build the release form/action**

Use `useActionState` to display server validation, disable double submissions, generate one operation token per form lifecycle, allow nonserialized release quantity, preselect assigned serials, scan/search/select exact serials, and require explicit replacement reason. Refresh queue/detail/badges after committed success only.

- [x] **Step 6: Verify GREEN plus Daily Closing**

Run release tests and the existing Daily Closing aggregation tests with a new `stock_out` movement case.

- [x] **Step 7: Commit Stock Out mutation**

```text
git add supabase/migrations/202608220001_employee_stock_out_product_release.sql app/employee/inventory/stock-out/actions.ts components/inventory/StockOutReleaseForm.tsx tests/stock-out-release.test.mts tests/inventory-daily-closing.test.mts
git commit -m "feat: confirm physical stock out atomically"
```

### Task 7: Shipment separation and released-only dispatch

**Files:**
- Modify: `supabase/migrations/202608220001_employee_stock_out_product_release.sql`
- Modify: `app/admin/shipments/actions.ts`
- Modify: shipment builders/read models only where required to show released eligibility
- Create: `tests/stock-out-shipment.test.mts`

**Interfaces:**
- Replacement RPC: existing `dispatch_order_shipment(actor_profile_id, requested_shipment_id)` signature remains stable.
- Dispatch validates release ledger ceiling and `warehouse_released` serial allocations.

- [x] **Step 1: Write failing shipment tests**

Assert dispatch before Stock Out fails; partial release permits only released quantity; exact released serials are required; dispatch changes shipped/logistics state; `inventory_balances` and `inventory_reservations` remain unchanged; no second inventory movement is created.

- [x] **Step 2: Run tests and verify RED**

- [x] **Step 3: Replace only dispatch physical-deduction behavior**

Retain carrier/tracking/status-event functionality. Remove balance/reservation mutations. Validate each shipment item against `sum(confirmed release quantity) - shipped_quantity`; validate serialized allocations are `warehouse_released`; update allocation/serial to shipped and shipment/order logistics state.

- [x] **Step 4: Update safe user message**

Change “Shipment dispatched and inventory updated.” to “Shipment dispatched.” and surface the approved unreleased-product error.

- [x] **Step 5: Verify GREEN and shipment regressions**

Run shipment tests plus inventory Phase 2 tests.

- [x] **Step 6: Commit shipment separation**

```text
git add supabase/migrations/202608220001_employee_stock_out_product_release.sql app/admin/shipments/actions.ts tests/stock-out-shipment.test.mts
git commit -m "fix: dispatch only warehouse released stock"
```

### Task 8: Cancellation guard and minimal RMA Physical Return Receipt

**Files:**
- Modify: `supabase/migrations/202608220001_employee_stock_out_product_release.sql`
- Create: `app/employee/rma/[claimId]/receive/page.tsx`
- Create: `app/employee/rma/[claimId]/receive/actions.ts`
- Create: `components/inventory/PhysicalReturnReceiptForm.tsx`
- Create: `tests/stock-out-return-cancellation.test.mts`

**Interfaces:**
- Replacement RPC signature remains: `cancel_sales_order(actor_profile_id, requested_order_id, requested_reason)`
- New RPC: `confirm_physical_return_receipt(actor_profile_id uuid, requested_claim_id uuid, requested_release_item_id uuid, requested_operation_id uuid, requested_quantity numeric, requested_serial_ids uuid[]) returns uuid`

- [x] **Step 1: Write failing cancellation/return tests**

Cover cancellation before release (request cancelled, reservation released, no movement), cancellation after any unreconciled release (blocked), partial/full returns, exact original serial, over-return rejection, duplicate token, on-hand increase once, immutable `customer_return` movement/receipt linkage, and final cancellation releasing only never-released reservation.

- [x] **Step 2: Run tests and verify RED**

- [x] **Step 3: Guard cancellation**

Lock request/releases/returns. If released minus returned is positive, raise the approved physical-return requirement. Otherwise cancel pending request, release only remaining reservation, cancel eligible allocations, and create no physical movement.

- [x] **Step 4: Implement minimal atomic RMA receipt**

Authorize active `rma.receive` plus active receiving warehouse assignment; lock RMA/release/return/balance/serial rows; validate cumulative quantity and exact original serial; create confirmed `customer_return` movement and positive movement item; increase on-hand; update serial warehouse/status/service state; insert immutable receipt rows and RMA event; return existing result for duplicate token.

- [x] **Step 5: Add the narrow receipt page/form**

No sidebar module. The route requires `rma.receive`, shows only the linked claim/release/returnable units for an authorized warehouse, and provides the single Confirm Physical Return Receipt action.

- [x] **Step 6: Verify GREEN and Daily Closing Return In**

Run return/cancellation tests and Daily Closing tests.

- [x] **Step 7: Commit cancellation and return safety**

```text
git add supabase/migrations/202608220001_employee_stock_out_product_release.sql app/employee/rma components/inventory/PhysicalReturnReceiptForm.tsx tests/stock-out-return-cancellation.test.mts tests/inventory-daily-closing.test.mts
git commit -m "feat: confirm physical customer returns safely"
```

### Task 9: Apply and test migration against local PostgreSQL

**Files:**
- Create: `scripts/verify-stock-out-database.mjs`
- Modify: `package.json`
- Regenerate: `database/native/schema.sql`

**Interfaces:**
- Script reads local `DATABASE_URL`, starts a transaction, creates isolated fixture rows with unique UUIDs, exercises the real RPCs, asserts balances/ledger/statuses, and rolls back all test fixtures.
- Script command: `npm run test:stock-out`

- [x] **Step 1: Write the database verification script before applying the migration**

The script must test finalized request idempotency, reservation increase/decrease, partial/full release, serial uniqueness, stale concurrency outcome, shipment no-deduction, cancellation guard, physical return, badge SQL predicates, and Daily Closing movement rows.

- [x] **Step 2: Run and verify RED**

Expected: missing tables/functions in the current local database.

- [x] **Step 3: Back up and apply the additive migration locally**

Resolve the configured database explicitly, take a local PostgreSQL custom-format backup, apply only `202608220001_employee_stock_out_product_release.sql` with stop-on-error, and record the migration in the local schema migration ledger if present. Do not reset or delete the database.

- [x] **Step 4: Run the real database verification and verify GREEN**

Run `npm run test:stock-out`. Expected: all transaction and rollback assertions pass with no permanent fixture rows.

- [x] **Step 5: Commit the database verification harness**

```text
git add scripts/verify-stock-out-database.mjs package.json database/native/schema.sql
git commit -m "test: verify stock out database workflow"
```

### Task 10: Full regression, local build, and browser acceptance

**Files:**
- Modify only files required by failing regression tests.
- Update the implementation plan checkboxes as evidence is gathered.

**Interfaces:**
- Local handoff must include URL, Admin credentials, Employee credentials with Receive + Stock Out + warehouse permissions, migration backup/result, exact changed files/schema, and known issues.

- [x] **Step 1: Run focused suites**

```text
npm run test:stock-out
npm run test:purchasing
npm run test:sales
npm run test:inventory-phase2
npm run test:standalone
npm run test:native
```

- [x] **Step 2: Run static checks and production build**

```text
npm run lint
npx tsc --noEmit
npm run build
```

- [x] **Step 3: Start the local application and perform Admin browser checks**

Verify Confirm Sale reserves without physical deduction; Generate Invoice creates one request; re-finalization synchronizes one request; packing does not deduct; shipment blocks before release and dispatches after release without another deduction; cancellation and return rules show clear messages; existing purchasing/Receive remains intact.

- [x] **Step 4: Perform Employee browser checks**

Verify independent permissions, menu order, both badges, warehouse scoping, shared queue, serial scan/search/preselection/replacement, partial/full release, concurrency refresh behavior, Daily Closing movement, and Receive New Products carrier/tracking/serial workflow.

- [x] **Step 5: Perform public/customer checks**

Verify public availability is physical minus reserved/damaged/unavailable before release, remains correct after release, increases on pre-release cancellation, and changes physical quantity only on confirmed Stock Out/Return.

- [x] **Step 6: Request code review and fix every Critical/Important finding**

Review the implementation against this plan and the approved spec, then rerun affected tests after fixes.

- [x] **Step 7: Run the complete final verification gate fresh**

Rerun the full standalone suite, native suite, Stock Out database script, lint, typecheck, and build. Record exact pass/fail counts and exit codes. Do not claim completion from earlier runs.

- [x] **Step 8: Preserve the branch and hand off locally**

Do not deploy. Report the local URL, credentials, implementation summary, exact changed files/database objects, tests/results, backup location, and any remaining known issues.
