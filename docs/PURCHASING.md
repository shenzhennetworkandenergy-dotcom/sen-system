# Purchasing

The Purchasing module manages the supplier-to-inventory workflow without duplicating product, warehouse, serial, permission, or audit data.

## Workflow

1. Create and maintain an approved supplier.
2. Create a draft purchase order using existing products or variations and a destination warehouse.
3. Submit the draft for approval.
4. An authorized approver approves it and marks it ordered.
5. Ordered quantities appear as incoming inventory.
6. Authorized receiving staff post partial or full receipts.
7. A receipt atomically updates balances, inventory movements, purchase progress, serialized units, and audit history.
8. Fully received orders may be closed. Open orders may be cancelled with remaining incoming quantities reversed.

## Statuses

`draft`, `pending_approval`, `approved`, `ordered`, `partially_received`, `received`, `cancelled`, and `closed`.

## Permissions

Purchasing uses the existing granular permissions: `purchasing.view`, `create`, `edit`, `approve`, `receive`, `cancel`, and `export`. Supplier maintenance uses `suppliers.view`, `create`, `edit`, and `archive`. Receiving also requires `inventory.receive`.

## Data integrity

All stock receipts run through the server-only `receive_purchase_order` RPC. Browser clients have no direct mutation policy for purchasing or inventory records. The RPC locks the order and relevant stock rows, validates remaining quantities, creates an immutable receipt and movement, updates incoming/on-hand/available balances, and creates serial records where required.

## Local verification

Run `npm run test:purchasing`. The test refuses to mutate any non-local Supabase URL. It validates the migration and routes, creates a temporary local supplier and purchase order, exercises submit/approve/order/cancel, and removes the test records.
