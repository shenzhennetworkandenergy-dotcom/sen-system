# Customer Receivables Phase 2 Design

## Objective

Extend the deployed Phase 1 Receivables foundation with authoritative Sales commercial terms, due dates, aging, scoped customer exposure, and operational reporting. Customer balances remain derived from existing Sales and payment records; Accounting and Cash Book posting remain unchanged.

## Production Baseline

- Git commit: `6847c880f32bd8bdf15bc92e8f501957c3a31627`
- Vercel deployment: `dpl_zkZe6r3wETJ45vu9ukXG6tkLTWrk`
- Database foundation: `202608250001_receivables_phase1.sql`
- Phase 2 worktree: `.worktrees/receivables-phase2`
- Phase 2 branch: `codex/receivables-phase2`

## Data Model

Add three nullable fields to `public.sales_orders`:

- `payment_terms_type text`: `immediate`, `partial`, or `credit`.
- `credit_period_days integer`: positive whole days, capped at 3650.
- `payment_due_date date`: an explicit authoritative override.

Historical rows remain null. No row is backfilled. No Customer Receivables balance table is added.

New or edited commercial terms follow these invariants:

- `immediate` has no credit period or due date.
- `partial` and `credit` require either a credit period or an explicit due date.
- The standard UI presets are 7, 15, 30, 45, and 60 days; a custom positive period is stored as the integer itself.
- Before the first non-voided invoice, an authorized Sales editor may change the structured terms.
- After the first non-voided invoice, the stored type and period are frozen. A correction must set an explicit due date and include a reason.
- Every successful update is recorded in `audit_logs` by one atomic, idempotent RPC.

## Due-Date Authority

The effective due date is derived in this order:

1. `sales_orders.payment_due_date`, when present.
2. Earliest non-voided invoice business date in `Asia/Dhaka` plus `credit_period_days`.
3. Null (`Not Set`) when neither source exists.

Invoice revisions never restart a period-derived due date. The latest non-voided invoice remains the displayed invoice reference while the earliest non-voided invoice remains the credit anchor.

## Derived Read Models

`customer_receivables_v` keeps the Phase 1 common-column contract used by `receivables_overview_v`, but it:

- excludes `draft` and `cancelled` Sales;
- preserves confirmed historical Sales without an invoice;
- derives outstanding from `total_amount - paid_amount` using the existing net Sales totals;
- derives the effective due date, days overdue, and operational status;
- never ages a paid record or a record without a genuine due date.

`customer_receivables_detail_v` adds customer contact, company, salesperson, invoice date, Sales payment status, structured terms, due date, days overdue, aging bucket, and last payment date for server-side search and filters.

`customer_receivables_summary_v` groups by customer, currency, and responsible Sales owner so the application can apply the same Sales scope before merging authorized rollups.

`customer_receivables_metrics_v` groups by currency and responsible Sales owner. It exposes customer outstanding, current, due today, due in the next seven days, overdue, no-due-date, and collected-this-month metrics without loading every Sale row.

All Phase 2 views remain service-role-only. Browser roles cannot query them directly.

## Status and Aging

The `Asia/Dhaka` business date drives every boundary.

Operational statuses:

- `paid`: outstanding is zero.
- `no_due_date`: outstanding exists and no genuine due date exists.
- `overdue`: outstanding exists and due date is before today.
- `due_soon`: outstanding exists and due date is between today and seven days from today, inclusive.
- `current`: outstanding exists and due date is more than seven days away.

Aging buckets:

- `paid`
- `no_due_date`
- `not_yet_due`
- `due_today`
- `1_30_days_overdue`
- `31_60_days_overdue`
- `61_90_days_overdue`
- `90_plus_days_overdue`

## Authorization

Customer Receivables requires both `receivables.view` and `receivables.view_customer`, plus existing Sales visibility:

- Active Admin: all Sales.
- `sales.view` or `sales.view_all`: all Sales.
- `sales.view_own`: only Sales whose `created_by` equals the current employee profile.
- No Sales view permission: no Customer Receivables rows, search results, rollups, or aggregates.

The scope is resolved on the server and applied to detail rows, summary rows, metrics, and collected-this-month totals. The service-role client is never allowed to bypass this application authorization boundary.

Commercial terms editing requires `sales.edit` plus the same Sales visibility/ownership rule. The database RPC independently revalidates role, active status, permission, and ownership.

## User Interface

The Sales detail page gains one Commercial Terms card. It reuses the existing Sale detail authorization and server action pattern:

- Before invoice: payment terms type, standard/custom period, optional explicit due date, optional reason.
- After invoice: read-only terms and period, required explicit due-date correction, required reason.
- Effective due date and credit anchor are displayed without altering invoice snapshots.

The Customer Receivables page gains server-side search, filters, pagination, the Phase 2 detail columns, and currency-separated customer rollups. It links to the existing Sale detail/Record Payment workflow instead of adding another payment action.

The Receivables dashboard reads the scoped metrics view for Customer exposure and preserves the Phase 1 non-Sales summary path.

## Explicit Non-Goals

- No change to `record_sale_payment()`.
- No new payment, refund, Accounting, Cash Book, or Accounts Receivable posting.
- No changes to invoice generation/finalization or invoice snapshots.
- No changes to Quotations, Inventory, Stock Out, Shipment, Purchase, HR, Payroll, Attendance, or the Public Website.
- No historical due-date backfill.
- No changes to Phase 1 non-Sales tables, transactions, or opening balances.

## Verification

Use strict red-green TDD for pure domain rules, authorization scope, query filters, migration/read-model contracts, and UI wiring. Then run the local rollback-only database verifier, native/offline parity checks, the full standalone regression suite, TypeScript, ESLint, production build, and authenticated local browser checks for Admin and restricted employee scope.
