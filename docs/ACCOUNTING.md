# Accounting

## Scope

The Accounting module provides the platform's initial general-ledger foundation. It includes a chart of accounts, balanced multi-line journal entries, draft and posted states, currency and reference metadata, and immutable audit events.

Journal creation and posting are separate permissions. Database functions validate active actors and enforce that total debits equal total credits before creation and again before posting. Posted entries are not editable through the application.

The initial chart contains cash, receivables, inventory, payables, equity, revenue, cost-of-goods, operating-expense and payroll accounts. Future sales, purchasing, payment and payroll phases can create journals through the `reference_type` and `reference_id` integration boundary without duplicating commercial records.

## Security

Accounting tables use Row Level Security. Authenticated staff require `accounting.view` to read them. Creation and posting use service-role-only database functions and the existing granular `accounting.create_entry` and `accounting.approve_entry` permissions.

## Route

The staff route is `/admin/accounting`. Administrators have full access; employees see it only when their effective permissions allow it.
