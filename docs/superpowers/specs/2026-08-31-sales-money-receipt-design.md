# Sales Money Receipt Design

## Status and scope

This design adds an optional, document-only Money Receipt to the existing
Sales payment workflow. The relationship is exactly one successful
`sale_payments` row to zero or one `sale_money_receipts` row:

```text
Sales payment (existing) ── 0..1 ── Money Receipt (new)
```

Recording a payment remains the only financial transaction. A receipt is
created only when an authorized user explicitly selects **Generate Money
Receipt** for a payment that already exists and has status `received`.

The existing payment form, payment RPC, accounting posting, invoice/challan
generators, inventory, shipments, and unrelated modules are out of scope and
remain unchanged.

## Alternatives considered

### Separate receipt table and RPC (selected)

Create a new `sale_money_receipts` table keyed by a unique `payment_id`.
An idempotent, security-definer RPC locks the payment and sale, validates the
actor and scope, computes the historical summary, and inserts one immutable
snapshot. A separate server action and printable route expose the document.

This keeps receipt generation isolated from the revision-coupled
`sale_documents` table and from the accounting/payment RPC. It also supports
legacy payments because a receipt can be generated lazily at any time.

### Extend `sale_documents` (rejected)

Adding a `money_receipt` document type would require changing the invoice/
challan type constraint and their revision/supersession behavior. That would
couple a new document to frozen invoice and stock-out paths and increase
regression risk.

### Independent receipt-entry form (rejected)

This would duplicate payment amount/date/method/reference and create a second
source of truth. It violates the required payment-to-receipt relationship.

## Data model and invariants

The additive migration creates:

- `sale_money_receipt_number_seq` and a sequence-backed
  `next_sale_money_receipt_number()` that returns
  `SEN-MR-YYYYMMDD-00001`-style numbers.
- `sale_money_receipts` with a UUID primary key, `payment_id` foreign key
  (`ON DELETE RESTRICT`) and a unique constraint, `order_id` foreign key,
  permanent unique `receipt_number`, `receipt_date`, immutable `snapshot`
  JSONB, `generated_by`, and `created_at`.
- An immutable-row trigger that rejects updates and deletes.
- RLS and grants that permit reads only to staff with the receipt permission
  and matching broad/own sale scope; browser clients and customers receive no
  insert/update/delete capability.

The snapshot stores the payment ID, exact amount/date/method/reference,
received-by identity, sale reference and total, invoice number present at
issuance (if any), customer/company/contact data, the order billing/shipping
address snapshot, amount in words, receipt date/creation timestamp, and the
historical payment summary. Internal payment notes are not copied to the
customer-facing snapshot.

The unique payment constraint is the authoritative one-receipt invariant.
The generation RPC locks the target payment and parent sale, checks for an
existing receipt, and uses an insert conflict path before returning the
existing or newly created ID. This makes repeated clicks, refreshes, duplicate
requests, and concurrent requests converge on one receipt and one number.

## Authorization

The migration adds one active sensitive catalogue permission:
`sales.money_receipt`. The existing permission catalogue and employee
assignment screens discover it dynamically, so no permission-system redesign
or template backfill is needed.

Every generation action and receipt page performs all of these checks:

1. The request has an active authenticated profile.
2. The profile has `sales.money_receipt` (active admins are handled by the
   existing admin bypass).
3. The profile can access the sale through the existing Sales scope: an admin
   or employee with broad `sales.view`/`sales.view_all` access may view any
   sale; an employee with `sales.view_own` may view only a sale whose
   `created_by` is that profile.
4. The payment belongs to the requested sale and is a successful `received`
   payment.

The same permission and sale-scope rules are enforced inside the RPC because
the application’s native/admin client is privileged and therefore cannot rely
on RLS alone. A guessed sale, payment, or receipt URL is denied without
revealing the document.

## Historical summary

Payment order uses the existing append-only ordering convention
`created_at ASC, id ASC`; the entered `payment_date` is displayed exactly but
does not reorder backdated payments. The RPC sums only `received` payments
strictly preceding the selected payment, then snapshots:

- previously paid;
- this payment;
- total paid after this payment;
- remaining balance after this payment (floored at zero); and
- `PARTIAL PAYMENT` or `FULL PAYMENT` status.

Later payments, refunds, customer edits, invoice revisions, or profile changes
cannot alter an already-issued receipt because all displayed values are in the
immutable snapshot.

The current schema does not retain a sale-total-at-payment column, and the
payment/accounting path is explicitly frozen. Therefore the sale total is
captured when the optional receipt is first issued. Adding payment-time sale
total capture would be a separate, higher-risk change and is not part of this
minimal-diff implementation.

## Application flow

The Sales detail page continues to render the existing Record Payment form
unchanged. Its payment table gains a receipt column:

- no receipt: a row-specific **Generate Money Receipt** server-action button;
- existing receipt: **View Money Receipt** and print access.

The action calls only the new receipt RPC, revalidates the sale page, and
redirects to a dedicated route:
`/admin/sales/[saleId]/payments/[paymentId]/receipt`.

The route loads only the immutable receipt snapshot after repeating the
permission and sale-scope checks. It renders a standard SEN MONEY RECEIPT
with the official logo, company identity, dark navy/blue styling, customer and
payment sections, amount in words, historical summary, status, and signature
area. It reuses the existing `PrintDocumentButton` and A4 print CSS; browser
Print/Save as PDF is the only PDF mechanism.

## Amount in words and currency

No dependency is added. A small isolated formatter/database helper emits
“Bangladeshi Taka … Only” for BDT amounts, including poisha when present. A
legacy non-BDT sale uses “`<ISO currency code> <amount in words> Only`” rather
than incorrectly labelling the amount as Taka. The generated string is stored
in the snapshot so reopening a receipt does not depend on future formatter
changes.

## Audit and side-effect boundary

The receipt RPC writes one safe `sales.money_receipt_generated` audit event
only when it creates a new receipt. Idempotent reads do not create duplicate
events. It never invokes `record_sale_payment`, posts cashbook/journal rows,
changes order totals, touches stock/reservations/allocations/shipments, or
creates/revises invoices or challans.

## Verification and local-only delivery

Focused TypeScript/static tests and a transactional SQL test cover optional
generation, exact field mapping, amount words, partial/second/final history,
old-receipt immutability, duplicate/concurrent generation, permission and
direct-URL denial, and no accounting/inventory side effects. Existing Sales,
payment-accounting, invoice, challan, native-schema, lint, typecheck, and
production-style build checks remain part of verification.

The native schema builder includes the new migration and the generated schema
is regenerated for the disposable local review database. A local/test admin
is created only through the existing native development mechanism; no
production credentials, environment variables, deployment, push, merge, or
production migration are permitted.
