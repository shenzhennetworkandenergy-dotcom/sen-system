# Non-Sales Receivables Phase 3 Design

## Scope

Extend the deployed generic Receivables foundation for Admin/Finance operational management of employee loans, salary advances, customer/company/individual loans, supplier refundable advances, security deposits, rent advances, and other recoverable advances.

Customer Receivables Phase 2, Sales payments, Accounting, Quick Cash Book, Payroll, HR, Purchase, Inventory, Stock Out, Shipment, Quotations, and the public website remain unchanged.

## Architecture

Use the existing authoritative master entity and generic `receivable_accounts` account. All balance changes are immutable `receivable_transactions`; current outstanding is a derived signed sum. Add one `receivable_installments` child table for approved schedules, with paid/partial/overdue state derived FIFO from immutable reductions. Never create category-specific balance tables.

## Lifecycle and operations

- Requested -> Under Review -> Approved -> Active -> Fully Repaid.
- Rejected and Cancelled are terminal before any balance movement.
- Approval creates no balance movement.
- Confirm Disbursement inserts one operational disbursement, records actor/time, and activates the account atomically.
- Manual repayments allow cash, bank, MFS, and other only. Salary deduction is reserved for Phase 4.
- Adjustments require `receivables.adjust`; scheduled-account increases are blocked.
- Reversal creates a new exact opposite immutable transaction and may reactivate a Fully Repaid account.
- Phase 3 creates no Accounting, Cash Book, or Payroll entry.

## Security

Reuse Phase 1 permissions and add `receivables.approve`, `receivables.disburse`, `receivables.record_repayment`, and `receivables.adjust`. All Server Actions reauthorize, and all RPCs revalidate database permissions. Standard Employees receive none automatically. RLS protects accounts, installments, transactions, and aggregates.

## Database boundary

Migration `202608250003_non_sales_receivables_phase3.sql` is additive. It adds missing categories, lifecycle metadata, installments, a one-reversal index, validation helpers, controlled RPCs, non-Sales detail/installment/metric views, permissions, RLS, and grants. It performs no historical backfill and modifies no Sales, payment, journal, Cash Book, Payroll, Purchase, or inventory data.

## User interface

Enhance `/admin/receivables/loans` with server-side search/filter/pagination and permission-controlled creation/opening forms. Add `/admin/receivables/loans/[id]` for summary, lifecycle actions, schedule, disbursement, repayment, adjustment, reversal, immutable transactions, and audit activity. Display that operational movements are not automatically posted to Accounting.

