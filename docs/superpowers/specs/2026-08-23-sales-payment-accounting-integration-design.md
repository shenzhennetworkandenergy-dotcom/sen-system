# Sales Payment Accounting Integration Design

**Status:** Approved for implementation

**Date:** 2026-08-23

**Scope:** Sales Record Payment to Quick Cash Book income and posted Sales Revenue journal

## Purpose

Integrate the existing Sales payment workflow with the existing Accounting Quick Cash Book. A successfully received Sales payment must atomically create exactly one Quick Cash Book income entry and one posted Sales Revenue journal for the amount actually received. Creating a Sale or invoice alone must not create income.

The implementation must reuse the current Sales, Cash Book, general-ledger, permission, audit, and Daily Cash Closing structures. It must not create a parallel payment or accounting system.

## Invariants

- No money received means no Accounting income.
- Each successfully received Sales payment creates exactly one Cash Book income entry and one posted Sales Revenue journal.
- Partial payments are posted separately for their individual received amounts and dates.
- The Sales payment, Cash Book entry, and journal are committed together or all rolled back.
- Retrying the same operation returns the original result and creates no additional financial records.
- A closed Cash Book date is immutable. A payment for a closed date is rejected without saving any Sales or Accounting record.
- Existing historical Sales payments are not backfilled automatically.

## Existing Structures Reused

- `sale_payments` remains the received-payment source record.
- `cashbook_descriptions` supplies the existing active `Sales` income description. No duplicate Sales category is created.
- `cashbook_entries` remains the Daily Cash Statement transaction source.
- `journal_entries` and `journal_lines` remain the general-ledger source of truth.
- Account `4000 · Sales revenue` is the income counter-account.
- Accounts `1010 · Cash`, `1020 · Bank`, and `1030 · Mobile financial services` represent the actual receipt channel.
- `cashbook_days` and its current timeline/closed-day rules remain authoritative.
- Existing `sales.record_payment` permission remains sufficient to execute the server-side integration. Recording a payment does not grant the employee general Accounting access.

## Atomic Integration Boundary

The existing `record_sale_payment` database operation remains the single write boundary:

1. Validate the actor's existing `sales.record_payment` permission.
2. Lock and validate the idempotency operation ID.
3. Validate the Sale, amount, payment date, exact method, and receipt channel.
4. Enforce the existing Cash Book timeline and closed-day rules.
5. Insert the Sales payment.
6. Recalculate the Sale's paid amount and payment status.
7. Insert a posted balanced Sales Revenue journal.
8. Insert the linked Quick Cash Book Sales income entry.
9. Write source-aware audit metadata.
10. Return the Sales Payment ID.

All steps execute in one PostgreSQL transaction. Any failure rolls back every step.

The current seven-argument `record_sale_payment` signature remains available for backward compatibility. The application uses an extended overload that accepts a unique operation ID and optional explicit receipt channel. Legacy callers do not gain unsafe method guessing.

## Idempotency and Duplicate Prevention

Every rendered Record Payment form includes a server-generated UUID operation ID. New `sale_payments` records store that ID under a unique constraint.

The database obtains an operation-specific transaction lock before checking for an existing payment. If the operation ID already exists:

- Return the original Sales Payment ID when the order, amount, date, exact method, receipt channel, payment reference, and internal note match.
- Reject the request when any submitted value differs, because one operation ID cannot represent two payments.

`cashbook_entries` stores a unique foreign key to `sale_payments.id`. This independently enforces one Cash Book entry per Sales payment. The journal uses `reference_type = 'payment'` and `reference_id = sale_payments.id`, with a uniqueness rule for the automated Sales-payment journal source.

These controls cover double-clicks, application retries, repeated submissions of the same rendered form, and concurrent requests. Merely refreshing or reopening a page performs no write.

## Payment Method and Receipt Channel

The exact Sales payment method remains unchanged on `sale_payments` and is also available to the Cash Book entry for Accounting display and audit. The ledger channel is stored independently as Cash, Bank, or MFS.

| Exact Sales method | Ledger channel | Behavior |
| --- | --- | --- |
| Cash | Cash | Post received amount. |
| Cash on Delivery | Cash | Post only when staff actually records receipt. A pending COD order is not income. |
| Mobile Banking | MFS | Post received amount. |
| Bank Transfer | Bank | Post received amount. |
| Cheque | Bank | Post received amount. |
| Card | Bank | Post received amount. |
| Credit Sale | None | Reject from Record Payment because no money was received. |
| Advance Payment | Explicit Cash/Bank/MFS required | Preserve `Advance Payment` as the exact method and use the selected actual receipt channel. |
| Other | Explicit Cash/Bank/MFS required | Preserve `Other` as the exact method and use the selected actual receipt channel. |

The current Quick Cash Book has no safe Other/Unclassified ledger channel. Advance Payment and Other therefore cannot be saved without an explicit real Cash, Bank, or MFS channel. They are never guessed as Bank.

The Sales form reveals or requires the receipt-channel selector only for ambiguous methods. The server and database enforce the same rule; client behavior is not trusted for financial classification.

## Accounting Posting

For each received amount:

- Debit `1010 · Cash`, `1020 · Bank`, or `1030 · Mobile financial services` according to the validated receipt channel.
- Credit `4000 · Sales revenue` for the same amount.
- Mark the journal posted immediately as the automatic result of an authorized received-payment business operation.
- Set the journal entry date to the Sales payment date.
- Link the journal directly to the Sales Payment ID.

The Quick Cash Book entry uses:

- Transaction type: `income`
- Description/category: existing active `Sales`
- Amount: the individual payment amount, rounded according to existing Cash Book precision
- Business date: the Sales payment date
- Ledger payment channel: Cash, Bank, or MFS
- Exact source method: the original Sales method
- Sales Payment link: the exact `sale_payments.id`
- Journal link: the posted Sales Revenue journal

Manual Cash Book income/expense and manual journal workflows remain unchanged.

## Date and Daily Cash Closing

The payment date, not the Sale or invoice creation date, determines the journal entry date and Cash Book business date.

For a payment recorded on the current Bangladesh business date, the transaction timestamp uses the current Dhaka time. For an open historical or future business date, it uses a stable time on that selected date because the existing Sales payment model stores a date rather than a time. In all cases, the derived Bangladesh business date must equal the payment date.

The operation reuses the current Cash Book timeline lock, predecessor checks, day creation/opening-balance behavior, and closed-day check. It never reopens or modifies a closed statement. A rejected closed-date submission returns a clear message instructing the user to use the existing authorized accounting correction/reopening process.

Daily statement totals continue to use the existing calculation architecture. The entry participates as Sales income, while the posted journal sends the asset side to the correct Cash, Bank, or MFS account.

## Reference and Traceability

At posting time, the operation builds a bounded description from:

- Sales Order Number
- Latest applicable non-superseded Invoice Number, when one exists
- Customer name, falling back safely to company name or email when needed
- Original Sales payment reference, when present

Example:

`Sales Payment — SEN-ORD-XXXX — SEN-INV-XXXX — Tex Rise Engineering — Ref: RAL BRAC`

The journal description and Cash Book remark retain the useful reference within their existing length limits. Structured relationships, rather than display text alone, provide authoritative traceability:

`Cash Book entry → Journal → Sales Payment → Sales Order → Invoice/Customer`

The Sales payment history shows the corresponding Cash Book/journal identity for staff already authorized to view that Sale. Accounting users see the exact source method and source reference through the Accounting server route without receiving broader Sales permissions.

## Audit and Permissions

The database records the automatic source, Sales Payment ID, order ID, exact method, derived channel, amount, date, and linked journal/Cash Book IDs in audit-safe metadata. Idempotent retries do not create duplicate audit events.

The automatic Accounting write runs as an internal consequence of the authorized Sales payment transaction. It does not require or grant `accounting.create_entry`, `accounting.manage_cashbook`, or `accounting.view` to the Sales employee. Existing Accounting read permissions continue to control who can view the resulting entries.

## Cancellation and Correction Safeguard

The repository currently has no authorized Sales payment edit, delete, refund, or reversal workflow. This implementation does not invent one and never deletes or silently reverses financial history.

Ordinary Sale cancellation is rejected when the Sale has one or more received payments. The user receives this guidance:

> This sale has received payment and cannot be cancelled directly. The recorded payment must first be reversed/refunded through an authorized payment reversal process.

The implementation does not delete Sales Payments, Cash Book income, or posted journals; automatically reduce balances; or synthesize reversal entries. A proper auditable refund/reversal module is separate future scope.

## Existing Data and Migration Safety

New source-link and idempotency fields are additive and nullable for historical records. Unique constraints apply when the new values are present. Existing Sales Payments, Cash Book entries, manual journals, and categories remain valid.

The migration does not post historical Sales payments, infer missing receipt channels, modify closed statements, or create another Sales income category. The Supabase migrations and generated native PostgreSQL schema remain synchronized for hosted and offline operation.

## User Interface Changes

Changes remain limited to the existing Sales payment form, Sales payment history, and Accounting Cash Book display:

- Add an operation ID to Record Payment submissions.
- Require the receipt channel for Advance Payment and Other.
- Remove or reject Credit Sale as a received-payment choice, with a clear explanation.
- Show linked Accounting identity in Sales payment history.
- Show exact Sales method for automatic entries while retaining the broader Cash/Bank/MFS ledger channel.
- Display atomic-operation and closed-day failures on the existing Sale detail page.

No Sales redesign, Accounting redesign, or unrelated module change is included.

## Testing

Implementation follows tests-first development. Automated coverage must verify:

1. A BDT 74,000 Sale receiving BDT 20,000 creates one BDT 20,000 Sales Payment, Cash Book income entry, and balanced posted journal on the payment date.
2. A second BDT 40,000 payment creates a separate linked posting and total received becomes BDT 60,000.
3. The remaining BDT 14,000 creates the third posting and marks the Sale paid.
4. A full BDT 74,000 payment creates one posting for exactly BDT 74,000.
5. Cash, Bank Transfer, Cheque, Card, Mobile Banking, and Cash on Delivery preserve their exact methods and debit the approved ledger accounts.
6. Advance Payment and Other require an explicit valid Cash/Bank/MFS channel and retain their exact methods.
7. Credit Sale is rejected without creating any Sales or Accounting record.
8. The journal and Cash Book references include the available order, invoice, customer, and payment reference.
9. Same-operation sequential and concurrent retries return one payment and one accounting posting.
10. Reusing an operation ID with different details is rejected.
11. A closed Cash Book date rejects the complete operation and leaves all tables unchanged.
12. Sale cancellation is blocked after a received payment without deleting or reversing records.
13. Existing manual Cash Book Income/Expense and journal behavior continues to pass.
14. Existing Sales workflows outside payment posting continue to pass.
15. Hosted Supabase and generated native PostgreSQL schemas expose the same tables, constraints, and functions.

Verification includes focused unit/static tests, a transactional PostgreSQL integration test, Sales and Cash Book suites, lint, and a production build. Browser review covers the conditional receipt channel, traceability displays, clear errors, and Daily Cash Statement totals.

## Out of Scope

- Historical payment backfill
- Payment edit, deletion, refund, reversal, or closed-day reopening
- New Accounting or payment subsystems
- Changes to invoice revenue recognition outside received payments
- Inventory, Stock Out, shipment, HR, public website, or unrelated Sales/Accounting redesign
- Production deployment
