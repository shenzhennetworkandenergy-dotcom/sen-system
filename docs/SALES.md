# Minimal Sales Module

## Scope

Sales reuses `sales_orders` and the Phase 2 fulfilment tables as the single source of truth. It adds a focused staff workflow for creating sales, server-calculated commercial totals, customer billing and delivery snapshots, price-change reasons, inventory reservation, exact serial allocation, payments, printable invoices and delivery challans.

## Routes

- `/admin/sales` — permission-aware dashboard and filtered sale list.
- `/admin/sales/new` — customer selection/basic customer creation and sale builder.
- `/admin/sales/[saleId]` — commercial, payment, fulfilment, serial, document and audit detail.
- `/admin/sales/[saleId]/documents/[documentId]` — immutable printable document snapshot.
- `/account/sales` — the signed-in customer’s own sales history.
- `/admin/users/[id]/sales` — administrator view of a customer’s sales history.

## State and stock rules

Draft creation does not reserve stock. Confirmation calls the existing atomic order confirmation RPC and creates reservations. Cancellation uses the existing cancellation RPC and releases eligible reservations and serial allocations. Packing, shipments and delivery remain the Phase 2 source of truth.

## Commercial records

All currency is BDT. `create_minimal_sale` creates the order, commercial metadata and adjustment history in one transaction. Manual price changes and discounts require reasons. Payments are append-only received records and update the sale payment state server-side. Invoice and challan rows store immutable JSON snapshots and can be printed or saved as PDF from the browser.

## Permissions

Administrators retain full access. Employee access uses granular `sales.*` permissions for own/all viewing, creation, editing, price changes, discounts, stock reservation, serial allocation, cancellation, payments and documents. Older `orders.*` permissions remain valid for backward compatibility.

## Offline verification

Run the static suite, database reset and transactional test before browser review:

```text
npm run test:sales
npx supabase db reset
npx supabase test db supabase/tests/minimal_sales.sql
npm run lint
npm run build
```

The SQL test rolls back all fixtures and verifies creation, totals, adjustment history, reservation, partial/full payment, documents, cancellation and reservation release.
