# Employee Stock Out / Product Release Design

**Status:** Approved architecture consolidated for implementation  
**Date:** 2026-08-22  
**Primary scope:** Employee inventory receiving continuity, employee Stock Out / Product Release, inventory sidebar badges, and the minimum stock-synchronization safeguards required by those workflows.

## Objective

Add an employee-facing **Stock Out / Product Release** workflow that turns a successfully generated/finalized Sales Invoice into a warehouse-scoped physical release request. Confirming a sale reserves eligible stock. Finalizing its invoice creates or updates one Stock Out request. Packing remains preparation. Only an authorized Inventory Employee's confirmed Stock Out deducts physical stock and records the physical movement. Shipment dispatch then performs logistics updates without deducting inventory again.

Keep the existing **Receive New Products** workflow intact. Add server-authoritative pending badges for both Receive New Products and Stock Out / Product Release. Preserve the existing public catalogue, purchasing, sales, inventory, serial, shipment, Daily Closing, permission, and RMA foundations except for the minimum changes explicitly described here.

Production deployment is excluded. Implementation will be migrated and tested locally, then handed to the user with local Admin and Employee credentials for approval.

## Locked original scope

The Employee **Inventory & Logistics** navigation contains, in order:

1. Receive New Products
2. **স্টক থেকে পণ্য রিলিজ / Stock Out** (Stock Out / Product Release)
3. Daily Closing Sheet

The existing Receive New Products page, carrier/tracking details, serial printing, permission checks, warehouse scoping, and atomic purchase receipt behavior remain unchanged. Its only feature addition is an authorized pending-order badge and the shared badge refresh mechanism.

The Stock Out workflow is:

**Draft Sale → Confirm Sale / Reserve Stock → Generate or Finalize Sales Invoice → Create or update one Stock Out Request → Allocate/Pack → Employee verifies products and serials → Confirm Stock Out → Deduct physical stock and record movement → Daily Closing reflects the movement → Shipment may dispatch released units**

A Stock Out request is never created at draft creation, sale confirmation, or reservation time. It is created only after a Sales Invoice finalization transaction succeeds.

## Non-goals

- No general inventory-system rewrite.
- No replacement of the existing purchase receipt workflow.
- No standalone return module or RMA redesign.
- No new real-time/WebSocket infrastructure.
- No independent public-website stock counter.
- No duplicate physical movement ledger.
- No automatic production deployment.
- No destructive schema migration, table rename, or historical data rewrite.

## Existing behavior and root cause

The current inventory balance already separates `on_hand`, `reserved`, `damaged`, `unavailable`, and generated `available` quantities. Confirming a sale increases `reserved`; public catalogue queries read `available`. This is the correct reservation foundation.

The inconsistency occurs at shipment dispatch. The current dispatch function decrements `on_hand` and `reserved`, changes serial allocation states, and updates shipment state, but it does not create an authoritative inventory movement. Consequently physical deduction is coupled to logistics dispatch and Daily Closing cannot reliably trace the Stock Out.

The design moves that existing physical deduction into the new Stock Out confirmation transaction and removes only the deduction/reservation-consumption behavior from shipment dispatch. It does not introduce a second stock number.

## Authoritative stock model

The existing warehouse balance remains the source of truth:

**Available Stock = Physical On-Hand − Reserved − Damaged − Unavailable**

Existing quarantine and other ineligible serial states remain excluded. The simplified `Physical − Reserved` equation applies when no damaged or unavailable quantity exists.

- Public website and sale validation use eligible `available` stock.
- Warehouse inventory displays physical `on_hand` and its existing status buckets.
- Sale confirmation reserves only eligible available stock and may never make availability negative.
- Invoice finalization leaves physical stock unchanged.
- Confirm Stock Out decreases `on_hand` and consumes the corresponding active reservation in the same transaction.
- Damaging, quarantining, or making stock unavailable is a status change, not a Sales Stock Out.
- Daily Closing uses confirmed physical inventory movements, not invoice quantities or shipment quantities.

If a reserved serial becomes damaged, unavailable, quarantined, or otherwise ineligible before release, it cannot be released. The employee must explicitly replace it with another eligible serial, or the request remains unresolved with a shortage message.

## Permission and warehouse model

Add the sensitive permission:

- **Display name:** Inventory → Stock Out / Release Invoiced Products
- **Key:** `inventory.release_sales_stock`

It is independent of Receive New Products permission and denied by default for all existing employees. It is added to the existing permission catalogue and Admin permission-management UI; no parallel permission system is introduced.

Employee Stock Out access requires all of:

1. Active employee profile.
2. Explicit `inventory.release_sales_stock` permission.
3. Active assignment to the request's warehouse.

These checks apply to navigation, list/detail queries, badge counts, direct routes, server actions/API routes, serial search, serial replacement, partial release, and final confirmation. Admin authorization remains governed by existing Admin behavior.

Requests form a shared warehouse queue. Every active authorized employee assigned to a warehouse sees the same pending requests for that warehouse. A multi-warehouse employee sees the de-duplicated union of authorized requests. Requests are not permanently assigned to an employee. Each immutable release transaction records the employee who actually performed it.

## Persistence design

Use additive, backward-compatible structures. Exact SQL names may follow existing repository naming conventions, but the logical model is fixed.

### Current Stock Out request

`sales_stock_out_requests` stores one logical request per `sales_order_id`, enforced by a unique constraint. It references the current finalized invoice document and fulfillment warehouse and has one of:

- `pending_release`
- `partially_released`
- `fully_released`
- `cancelled`

`sales_stock_out_request_items` stores the current synchronized requirement for each Sales Invoice line, including product, variation, warehouse, finalized required quantity, released quantity, remaining quantity, and current status. The database enforces nonnegative quantities and `required_quantity >= released_quantity`. Remaining quantity is derived as required minus released.

Lines removed by a valid revision remain traceable through immutable revision snapshots. A current line with no physical release may be reduced to zero/inactive; a line with released quantity can never be reduced below that released quantity.

### Immutable invoice/request revisions

Every successful first finalization or re-finalization creates one immutable request revision linked to the generated `sale_documents` revision. Its immutable item snapshot preserves:

- Previous and new required quantities.
- Added, removed, and changed products/variations.
- Previous and new reservation requirements.
- Released quantity floor at finalization.
- Remaining quantity.
- Warehouse.
- Finalizing actor and timestamp.

The current request and items are updated to the latest valid finalized revision, but prior snapshots are never overwritten or deleted.

### Immutable physical release ledger

Each partial or full confirmation creates a new immutable Stock Out release header and item records. It never merges with an earlier release. Each release stores:

- Request, sales order, and current invoice revision.
- Warehouse and releasing employee.
- Product/variation and quantity.
- Previous and new physical `on_hand` quantities.
- Reservation consumed.
- Timestamp and confirmed transaction status.
- Unique idempotency key.
- Unique reference to the authoritative inventory movement.

Release-serial rows store the exact serial record plus SEN and manufacturer-serial snapshots. A serial can be associated with only one successful physical Stock Out release unless a later confirmed physical return makes a new lifecycle explicitly eligible.

The existing inventory movement ledger remains authoritative for physical quantity changes. Add `stock_out` to its allowed movement types. Each successful release creates exactly one confirmed `stock_out` movement with negative movement-item deltas and balance-after values. The Stock Out release references this movement; it is not a second movement.

### Serial and packing states

Add a distinct warehouse-release state to the existing serial/allocation lifecycle without reusing the existing deallocation meaning of `released`:

**Reserved/Allocated → Packed → Released from Warehouse → Shipped → existing downstream statuses**

The concrete stored value will be a clear additive status such as `warehouse_released`. Existing historical statuses remain valid.

An explicit serial replacement audit records old serial, new serial, request item, actor, reason, and timestamp. Assigned serials are never silently replaced.

### Minimal physical return receipt

Reuse existing RMA claims, `rma.receive`, and `customer_return` movement type. Add only the minimum immutable receipt linkage needed to associate a confirmed physical return with an RMA claim, original Stock Out release item, invoice, product/variation, warehouse, employee, quantity, serials, inventory movement, idempotency key, and timestamp.

No new sidebar return module is created. A narrow RMA return-receipt action/surface is permitted only where needed to execute **Confirm Physical Return Receipt** under the existing RMA authorization model.

## Atomic transaction A: finalize Sales Invoice

The Generate/Finalize Invoice form carries a unique operation token. A deliberate new revision receives a new token; double-clicks and retries reuse the same token.

One database transaction:

1. Locks the sale/order and relevant items/reservations.
2. Verifies the sale is confirmed, not cancelled, and eligible for invoice finalization.
3. If the operation token was already committed, returns the existing result without creating another revision or adjustment.
4. Reads cumulative confirmed physical releases for every line.
5. Rejects any revised quantity lower than its already released quantity with a clear message.
6. Calculates the required outstanding reservation as `finalized required − physically released`.
7. Reconciles active reservation quantities and `inventory_balances.reserved` under balance locks. An increase succeeds only when eligible availability is sufficient; a decrease restores availability without a physical movement.
8. Creates the immutable Sales Invoice document revision.
9. Creates the one-per-sale Stock Out request or updates that same request.
10. Synchronizes request items and status.
11. Creates the immutable request revision and item snapshot.
12. Commits all work together.

Any failure rolls back invoice revision, reservation changes, request changes, and snapshot changes. Badge refresh occurs only after commit.

Repeated Generate/Finalize clicks never create a duplicate request. A true later invoice revision updates the same request. Before any release, it may completely replace the current requirement. After partial release, it preserves released quantities and changes only outstanding requirements.

## Atomic transaction B: Confirm Stock Out

The page submits a unique operation token, requested per-line quantities, and exact serial selections where required.

One database transaction:

1. Revalidates the active employee, `inventory.release_sales_stock`, and active warehouse assignment.
2. Locks the request, request items, relevant order items, reservations, warehouse balances, packing/allocation rows, selected serials, and conflicting release rows in deterministic order.
3. Returns the previously committed result for an already-successful identical idempotency token.
4. Verifies the request is pending/partial and the submitted version/remaining quantities are current.
5. Verifies the release does not exceed required, remaining, reserved, physically eligible, or prepared/packed quantities.
6. Revalidates every serial's product, variation, warehouse, condition, allocation, packing, and unreleased state.
7. Requires the exact serial count to equal the released quantity for serialized lines.
8. Applies explicit, audited serial replacement when requested and valid.
9. Decrements physical `on_hand` and the corresponding reservation; generated availability remains mathematically consistent.
10. Creates the confirmed `stock_out` inventory movement and negative movement items.
11. Updates serial/allocation states to `warehouse_released` and permanently links exact serials through the release ledger.
12. Creates immutable release header, items, and serial rows linked to the movement.
13. Updates released/remaining request quantities and pending/partial/full status.
14. Commits everything together.

Any validation or concurrency failure rolls back the complete transaction and returns a precise refresh/serial/shortage message. Database row locks and uniqueness constraints protect against simultaneous employees, while the idempotency token protects against retries and double-clicks. Badge refresh and Daily Closing visibility occur only after commit.

Partial releases create separate immutable events. Another authorized employee may later release the remainder, with each employee and timestamp retained.

## Serial selection behavior

For preassigned invoice/order serials, the Stock Out detail shows SEN and manufacturer serials preselected. The server verifies that they remain packed, physically eligible, and in the correct warehouse.

If exact serials are not already assigned, the employee may scan, search, or select eligible warehouse serials for the required product/variation. Selection is warehouse- and permission-scoped. The final transaction may create the required allocation/preparation record immediately before release so the locked order remains **Allocate/Pack → Confirm Stock Out** while allowing the physical employee to identify the actual unit. This preparation has no inventory effect before successful confirmation.

Previously released serials never become selectable. Replacing a preassigned serial requires an explicit action and reason and creates an immutable audit record.

## Packing and shipment

Packing remains preparation only. It may allocate serials and create package records but must not change `on_hand`, consume reservations, create `stock_out`, or mark physical release.

Shipment dispatch is changed minimally:

- It may dispatch only quantities already confirmed as warehouse-released and not previously shipped.
- For serialized lines it accepts only exact allocations/serials recorded by Stock Out.
- It blocks unreleased quantities with a clear message directing the user to complete Stock Out.
- It updates shipment, allocation, serial, carrier, tracking, and downstream logistics states only.
- It performs no `on_hand` update, reservation update, or inventory movement.

Existing partial shipment behavior is preserved within the released quantity ceiling. Existing historical shipment records are not rewritten.

## Cancellation and revisions

Before any physical release, invoice cancellation atomically cancels the request and releases all remaining active reservations. Availability increases through the existing balance formula. No physical movement is created, and the request disappears from the pending badge.

After any physical release, ordinary cancellation is blocked while any released quantity remains physically outside the warehouse. Invoice revision is also blocked below the released quantity floor. Previously committed Stock Out movements and releases are immutable.

Cancellation becomes eligible only after confirmed physical returns cover the released quantity required by the cancellation. It then releases any remaining never-released reservation without creating a fake movement. It does not add returned stock again.

## Minimal RMA physical return transaction

`Confirm Physical Return Receipt` requires an active employee, `rma.receive`, and active access to the receiving warehouse. It validates the RMA claim, original invoice, request, release, product, released quantity, already-returned quantity, remaining returnable quantity, warehouse, and exact original serials.

One atomic transaction locks the claim, release records, return records, balances, and serials; applies a unique idempotency token; creates one confirmed `customer_return` movement with positive deltas; increases physical `on_hand`; updates returned serial/warehouse state; writes immutable receipt audit; and updates RMA receipt status. It never permits cumulative returns above confirmed physical release.

RMA creation, administrative approval, return request, or invoice cancellation does not increase stock. Separate partial return receipts remain immutable. Daily Closing sees each confirmed `customer_return` exactly once.

## Badge source and refresh

One employee badge-count service/endpoint returns only counts authorized by the current active employee's permissions and active warehouse assignments.

- Receive badge: count distinct pending purchase orders/receiving requests with remaining receipt work, not units.
- Stock Out badge: count distinct `pending_release` and `partially_released` requests, not units.
- Fully released and cancelled requests are excluded.
- A partially released request remains one pending request.
- Multi-warehouse results are de-duplicated.
- A module without permission exposes neither its menu item nor its count.

The client refreshes after successful relevant commits and approximately every 30 seconds while visible. Polling pauses or is skipped while the browser tab is hidden and refreshes immediately when it becomes active. A temporary error keeps the last known valid display and retries later; it never converts failure into a fake zero. Counts are informational only and never replace transaction authorization.

Badges use the existing compact red/white, right-aligned, responsive navigation badge style and are hidden at zero.

## Daily Inventory / Daily Closing

Daily Closing continues to derive Stock In and Stock Out from confirmed inventory movements and their confirmation timestamps.

- Sale confirmation/finalization: no physical movement.
- Packing: no physical movement.
- Confirm Stock Out: one negative `stock_out` movement.
- Shipment dispatch: no physical movement.
- Invoice cancellation: no physical movement.
- Confirm Physical Return Receipt: one positive `customer_return` movement.

Thus opening physical stock plus confirmed Stock In minus confirmed Stock Out equals closing physical stock without double counting.

## UI behavior

The Stock Out queue follows the existing employee Receive New Products card/list style. It displays invoice number, customer, warehouse, request status, products, total required/released/remaining quantities, and a clear open action.

The detail page displays current invoice revision, line requirements, preparation status, remaining quantity, serialized/nonserialized release controls, shortage/ineligibility messages, and immutable revision/release history. The confirmation button clearly states that it performs physical release. The page refreshes to current server state after a concurrency conflict.

Admin sales and shipment screens retain their existing structure. Only the necessary validation/messages and Generate/Finalize trigger behavior change. Existing sales calculations, pricing, payment behavior, carrier/tracking, and unrelated permissions remain intact.

## Migration and compatibility

Migrations are additive and backward-compatible:

- Add the new tables, constraints, indexes, permission catalogue entry, movement/status values, and narrowly required keys/links.
- Do not grant the new sensitive permission to existing employees.
- Do not rename/drop existing production tables or rewrite historical inventory/shipment data.
- Do not synthesize physical Stock Out movements for historical shipments.
- Existing already-shipped/delivered records remain legacy-complete and unchanged.
- The new request trigger applies to successful invoice finalizations/re-finalizations after migration. An existing non-shipped finalized invoice can be deliberately re-finalized to create/synchronize its request. A historical invoice with legacy shipped quantity cannot be revised below that physical floor or reopened for a second physical deduction.
- Apply equivalent schema behavior to the hosted migration history and native/offline PostgreSQL schema so local and later hosted execution remain consistent.

## Error handling

User-facing errors are clear but do not expose SQL or internal credentials. Important examples include:

- Sale must be confirmed and reserved before invoice finalization.
- Revised quantity cannot be lower than the quantity already physically released.
- Stock Out request changed or was completed; refresh and try again.
- Selected serial is no longer eligible, naming the affected SEN serial where safe.
- Insufficient eligible physical stock or reservation.
- Product has not been released from inventory; complete Stock Out before dispatch.
- Invoice cannot be cancelled until physically released products are returned.

Failed transactions may write application/server error logs, but never fake successful business audit events or inventory movements.

## Verification and acceptance

Implementation follows test-driven development. Required automated and local integration coverage includes:

1. Existing Receive New Products navigation, permission, carrier/tracking, serial printing, partial/full receipt, and inventory movement regression tests.
2. Independent Receive and Stock Out permission combinations and direct-route/API denial.
3. Warehouse-scoped and multi-warehouse shared queues and badge counts.
4. Badge count-as-request semantics, zero hiding, immediate refresh, polling, inactive-tab behavior, and error retention.
5. Confirm Sale reservation and public available-stock consistency.
6. Invoice finalization trigger, one-request uniqueness, operation idempotency, immutable revisions, and rollback behavior.
7. Valid revision increases/decreases, released-quantity floor rejection, and reservation reconciliation.
8. Serialized and nonserialized partial Stock Out, exact serial matching, explicit replacement audit, damaged/unavailable rejection, and shortages.
9. Concurrent employees, duplicate form submissions, duplicate serial attempts, and full rollback on injected failure.
10. Exactly one physical deduction, one linked `stock_out` movement, correct balance before/after, and Daily Closing visibility.
11. Shipment blocked before release, partial shipment ceiling, exact released serials, and no dispatch inventory mutation.
12. Cancellation before release, cancellation block after release, partial/full RMA return receipt, exact serial return, and no double Stock In.
13. Admin sales/purchasing/shipment regression tests and public catalogue stock tests.
14. Fresh native database migration, local build, Admin browser check, Employee browser check, and offline/LAN startup.

The final local handoff includes the local URL, Admin and Employee test credentials, migration result, test/build evidence, and an exact changed-file/database-structure list. Production remains undeployed until explicit user approval.

## Original-requirement preservation checklist

- Existing Receive New Products page remains.
- Pending Receive badge counts requests.
- New Stock Out / Product Release page exists.
- Pending Stock Out badge counts pending/partial requests.
- Generate/Finalize Invoice is the only request-creation trigger.
- Stock is reserved before physical release.
- Public website uses authoritative available quantity.
- Employee Confirm Stock Out is the only physical deduction point.
- Daily Closing reflects confirmed physical Stock Out and Return In.
- Partial release and partial return are supported.
- Exact SEN serial tracking and replacement auditing are supported.
- Employee permission and warehouse scope are enforced in UI and backend.
- Shipment dispatch does not deduct inventory.
- One Sales Invoice has one logical Stock Out request.
- No duplicate Stock Out request or double stock deduction is possible.
- Existing Receive, Admin, purchase, sales calculation, payment, carrier/tracking, and historical shipment behavior is preserved outside the minimum changes above.
