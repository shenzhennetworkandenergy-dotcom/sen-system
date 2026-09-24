# Accounting

## Scope

The Accounting module provides the platform's initial general-ledger foundation. It includes a chart of accounts, balanced multi-line journal entries, draft and posted states, currency and reference metadata, and immutable audit events.

Journal creation and posting are separate permissions. Database functions validate active actors and enforce that total debits equal total credits before creation and again before posting. Posted entries are not editable through the application.

The initial chart contains cash, receivables, inventory, payables, equity, revenue, cost-of-goods, operating-expense and payroll accounts.

## Sales receipts

Successfully received Sales payments are automatically integrated with the existing Accounting records. The database transaction creates exactly one Quick Cash Book Income entry using the active Sales description and exactly one posted journal credit to `4000 · Sales Revenue`. Cash receipts debit `1010`, Bank receipts debit `1020`, and MFS receipts debit `1030`.

The Accounting entry stores the originating Sales Payment ID and exact Sales payment method in addition to its broader Cash, Bank or MFS channel. Its description identifies the Sales order, latest applicable invoice, customer and payment reference. The selected payment date controls the Cash Book day. Finalized days remain immutable: a payment dated to a closed day is rejected before any Sales or Accounting record is changed.

The operation is idempotent and atomic. One received payment produces one Sales Payment, one Cash Book entry and one posted journal, or none of them. Existing historical Sales payments are intentionally not backfilled, and paid-sale cancellation is blocked until a separate authorized reversal/refund workflow exists.

## Security

Accounting tables use Row Level Security. Authenticated staff require `accounting.view` to read them. Creation and posting use service-role-only database functions and the existing granular `accounting.create_entry` and `accounting.approve_entry` permissions.

## Route

The staff route is `/admin/accounting`. Administrators have full access; employees see it only when their effective permissions allow it.
