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

## Payment accounting integration

`record_sale_payment` is the single atomic operation for a received Sales payment. It saves the Sales Payment, creates one Income row in the existing Quick Cash Book, and posts one balanced journal that debits the applicable receipt account and credits `4000 · Sales Revenue`. All three records share the Sales Payment ID, and a client-generated operation ID makes retries and double submissions idempotent. Reusing an operation ID with different payment details is rejected.

The exact Sales method is retained for audit and display. The ledger channel is derived separately:

- Cash and a received Cash on Delivery payment use Cash.
- Bank Transfer, Cheque and Card use Bank.
- Mobile Banking uses MFS.
- Credit Sale is not accepted as a received payment.
- Advance Payment and Other require an explicit Cash, Bank or MFS receiving channel.

Only the received amount is posted. Partial payments remain separate transactions, and the Accounting date is the entered payment date rather than the Sale creation date. Posting to a finalized Cash Book day rejects the whole operation without saving any of the three financial records.

The Cash Book description contains the Sales order, latest generated invoice when available, customer, and entered payment reference. Existing historical payments are not backfilled. Because a refund/reversal workflow is outside this scope, a Sale with any received payment cannot be cancelled directly and no financial records are silently deleted or reversed.

## Permissions

Administrators retain full access. Employee access uses granular `sales.*` permissions for own/all viewing, creation, editing, price changes, discounts, stock reservation, serial allocation, cancellation, payments and documents. Older `orders.*` permissions remain valid for backward compatibility.

## Offline verification

Run the static suite, database reset and transactional test before browser review:

```text
npm run test:sales
npm run test:sales-payment-accounting
npx supabase db reset
npx supabase test db supabase/tests/minimal_sales.sql
npx supabase test db supabase/tests/sales_payment_accounting.sql
npm run lint
npm run build
```

The SQL tests roll back all fixtures. They cover creation, totals, adjustment history, reservation, documents, ordinary unpaid cancellation, received partial/full payments, Cash/Bank/MFS mapping, exact-method traceability, idempotency, closed-day rejection, journal posting and paid-sale cancellation protection.
