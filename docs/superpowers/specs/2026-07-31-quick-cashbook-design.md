# Quick Cashbook Design

## Scope

Add one database-backed Quick Cashbook panel to the existing `/admin/accounting` page. Do not modify navigation, unrelated modules, or existing journal behavior.

## User experience

- Match the supplied Daily Cash Statement format with four summary cards: previous/opening cash, total income, total expense, and closing balance.
- Default the selected date to the current Bangladesh business date.
- Provide a date field and “View daily balance” button so an administrator can inspect any specific day.
- Provide a database-backed opening cash/previous balance field for each business date.
- Provide an income/expense entry form with a saved খাত/বিবরণ, amount, and payment method (Cash, Bank, or MFS).
- Provide an inline “Create খাত/বিবরণ” form. A created description appears in the selectable list and is associated with either Income or Expense.
- Show the selected day’s transactions with time, type, description, payment method, and signed amount.
- Provide “Close Today” to store the final closing balance and lock that business date against later balance or entry changes.
- Provide a print button and print-only statement containing separate Income and Expense tables, totals, opening cash, closing cash, date/time, and preparer/approver signature lines.
- Show clear success or error feedback after mutations.

## Data model and accounting integration

`cashbook_days` stores one opening balance and optional closed snapshot per Bangladesh business date. `cashbook_descriptions` stores reusable Income/Expense descriptions. `cashbook_entries` stores the business transaction, payment method, transaction timestamp, Bangladesh business date, creator, and linked journal entry.

The database exposes security-definer functions for description creation and cashbook entry creation. Both functions validate the acting profile’s accounting permissions. Cashbook entry creation runs atomically and creates a posted, balanced general-ledger journal:

- Income: debit the selected payment-method asset account and credit Sales revenue.
- Expense: debit Operating expenses and credit the selected payment-method asset account.

Cash, Bank, and MFS use dedicated active BDT asset accounts. Existing journal tables remain the accounting source of truth, while the cashbook tables provide the quick-entry metadata and daily presentation.

Closing balance is `opening cash + total income - total expense`. A date is editable until it is closed. Closing stores that calculated value under a row lock; entry creation and opening-balance changes reject closed dates.

## Security and errors

- Read access follows `accounting.view`.
- Description and transaction mutations require `accounting.create_entry`.
- Direct authenticated table writes are not granted; mutations use service-role-only RPCs after server-side authorization.
- Invalid type, amount, payment method, description/type mismatch, inactive description, or missing ledger account produces an actionable error.
- All writes add audit log records.

## Testing

- Unit tests cover input normalization, opening and closing calculations, Bangladesh business-date selection, daily totals, and invalid values.
- Accounting integration verification covers tables, RLS, RPC grants, balanced journal linkage, reusable descriptions, and daily totals against the local database.
- The complete release gate, production build, database migration, deployment smoke checks, and production logs must pass before completion.
