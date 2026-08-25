# Receivables Phase 1 Design Specification

**Approved:** 2026-08-25

**Production baseline:** `67c965458b64f75174006bcf1a58e27980b92dfc`

**Scope:** Receivables foundation only. No production deployment in this phase.

## Objective

Add a central Procurement and Finance → Receivables workspace that reads customer debt from existing Sales/payment records and persists only non-Sales receivables. Accounting remains the authoritative financial ledger.

## Locked Boundaries

- Customer outstanding is derived from `sales_orders` and successful `sale_payments`.
- No customer receivable balance or Sales payment is copied into a new table.
- Sales accounting behavior is unchanged.
- Payroll is unchanged.
- No disbursement, repayment, cashbook, journal, or historical financial backfill is introduced.
- Existing Sales, Accounting, Payroll, Purchase, Inventory, HR, and other modules remain unchanged except for adding the Receivables navigation entry.
- All schema changes are additive and forward-only.

## Phase 1 Routes

- `/admin/receivables` — permission-aware dashboard.
- `/admin/receivables/customers` — read-only derived customer receivables.
- `/admin/receivables/loans` — persisted non-Sales accounts and opening/existing receivable creation.

Collections and Overdue routes are intentionally excluded until authoritative due-date and repayment data exists.

## Permission Model

- `receivables.view` — open the module and dashboard shell.
- `receivables.view_customer` — see customer receivable rows and their totals.
- `receivables.view_loans` — see non-Sales receivable accounts, external parties, and operational transactions.
- `receivables.create` — create a non-Sales requested receivable account.
- `receivables.manage_opening` — create an active opening/existing receivable and its immutable opening transaction.

Administrators retain the existing active-admin permission bypass. Standard Employees receive none of these permissions automatically. Aggregates are computed only from data categories the actor may view.

## Data Model

### `receivable_external_parties`

Stores only borrowers that do not already exist as an Employee, Customer, Supplier, or CRM company/contact. It contains a generated UUID, party type, display name, optional company/phone/email/reference, notes, active flag, audit columns, and timestamps.

### `receivable_accounts`

Stores non-Sales operational receivables. Each row has:

- UUID and unique `receivable_number`.
- Category: `employee_loan`, `customer_loan`, `company_loan`, `individual_loan`, `supplier_refundable_advance`, `security_deposit`, `recoverable_advance`, or `other`.
- Borrower type and exactly one borrower reference: employee, customer profile, supplier, CRM company, CRM contact, or external party.
- Requested/original/approved amounts, currency, default repayment method, installment fields, due dates, disbursement date, notes, lifecycle status, opening-balance flag/as-of date, actor columns, version, and timestamps.
- Lifecycle status: `requested`, `under_review`, `approved`, `disbursed`, `active`, `fully_repaid`, `rejected`, or `cancelled`. Overdue is derived, not stored.

Phase 1 creation produces either:

- A requested account with zero operational outstanding and no financial transaction; or
- An opening account in `active` or `fully_repaid` state with one immutable opening transaction.

### `receivable_transactions`

Immutable operational movement rows with type `opening_balance`, `disbursement`, `repayment`, `adjustment_increase`, `adjustment_decrease`, or `reversal`. The Phase 1 write path creates only `opening_balance` rows. Each row has an explicit increase/decrease direction, effective date, positive amount, source, payment method, operation UUID, optional future Payroll/Accounting links, reversal link, notes, and actor/timestamp fields.

Direct updates and deletes are not granted. Future corrections must use reversal transactions.

### Derived Views

`customer_receivables_v` derives non-cancelled Sales balances using:

`outstanding = greatest(total_amount - paid_amount, 0)`

The existing `refresh_sale_payment_totals` function stores `paid_amount` net of
refunds, so the read model must not add `refunded_amount` a second time.

It exposes the Sales order, latest generated invoice, customer, salesperson, amounts, payment status, invoice/order date, and last successful payment date. Due date, credit period, and aging are `null` in Phase 1 because no authoritative source currently exists.

`non_sales_receivables_v` derives operational outstanding from immutable transaction signs, not an editable balance column.

`receivables_overview_v` normalizes customer and non-Sales records for permission-aware dashboard metrics and lists.

## Write Operations

### `create_receivable_account`

- Revalidates active actor and `receivables.create` in the database.
- Validates category, borrower reference, currency, amounts, dates, and notes.
- Creates one requested account.
- Creates no transaction, journal, cashbook entry, or Payroll component.
- Writes an audit row in the same database transaction.

### `create_opening_receivable`

- Revalidates active actor and `receivables.manage_opening` in the database.
- Requires original amount, previously repaid amount, opening outstanding amount, and as-of date.
- Enforces `original - previously_repaid = opening_outstanding` and non-negative values.
- Uses a unique operation UUID and advisory lock for retry safety.
- Creates exactly one account and one immutable `opening_balance` transaction.
- Identical retries return the original account; changed retries fail.
- Creates no cashbook or journal entry.
- Writes an audit row atomically.

## Security

- Server Components use the existing `requirePermission`/`requireAnyPermission` data-access boundary.
- Every Server Action authenticates, authorizes, validates all form fields, and calls a database RPC.
- New tables have RLS enabled.
- Authenticated read policies use the existing effective-permission functions.
- Direct authenticated inserts, updates, and deletes are not granted.
- Derived views are server-only: no `anon` or direct authenticated grants; the authorized server DAL returns only required DTO fields.
- RPCs call the existing database permission assertion and are granted only to `service_role`.

## User Interface

The dashboard follows existing SEN cards, filters, tables, semantic status badges, and responsive patterns. It shows only authorized categories. Amounts use BDT/currency formatting already used by Sales and Accounting.

The Loans page provides:

- A read-only list of non-Sales receivable accounts and derived outstanding.
- A create-account form only with `receivables.create`.
- An opening/existing receivable form only with `receivables.manage_opening`.
- Existing Employee, Customer, Supplier, and CRM parties as references; external party creation is available only when no existing master applies.

## Audit and Data Safety

- Account/opening creation logs actor, entity, action, old/new values, source, and timestamp through the existing `audit_logs` table.
- Opening balances never fabricate historical Sales, cashbook, journal, or Payroll rows.
- No existing data is modified or backfilled.

## Offline/Native Parity

The new forward-only migration is included by `scripts/build-native-schema.mjs`, generating matching `database/native/schema.sql`. Static and local PostgreSQL tests verify table/view/RPC/RLS/permission parity.

## Explicitly Deferred

- Customer due dates, credit periods, and aging.
- Collections and Overdue modules.
- Approval, disbursement, repayment, installments, reversals, and attachments.
- Payroll deductions and Employee Self-Service.
- Accounting/cashbook postings and Accounts Receivable journal transition.
- Reports and export.
