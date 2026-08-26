# Phase 4 Payroll ↔ Receivables Integration Specification

## Goal

Connect planned Employee Loan / Salary Advance payroll deductions to the existing Phase 3 Receivables ledger without changing balances before Payroll is paid. The only balance-moving boundary is an atomic, authorized `Approved → Paid` operation.

## Approved behavior

- Draft generation may calculate eligible deductions and create/update provisional link rows and visible payroll deduction components, but it must not create receivable transactions, mark installments paid, or post Accounting/Cash Book entries.
- Approval freezes the deduction plan with a deterministic snapshot hash and creates no balance movement.
- Eligibility is limited to the same employee borrower, `employee_loan`/`salary_advance` accounts, `active` status, positive outstanding, `salary_deduction` repayment method, an approved installment schedule, and an installment due by the payroll period end. One installment per account per payroll period is planned; the final installment is capped to current outstanding.
- Mark Paid uses one trusted atomic database function. It locks the payroll, link rows, and affected receivable accounts in deterministic order; revalidates the frozen plan; creates one immutable salary-deduction repayment per account; links each repayment; marks Payroll paid; and audits the operation as one transaction.
- Idempotent retries return the existing result. Unique Payroll/account links, deterministic operation IDs, and unique repayment links prevent duplicate deductions.
- Manual Receivables repayment continues to reject `salary_deduction`; only the trusted Payroll-paid boundary may create it.
- Paid Payroll is financially final for normal actions; ordinary edit, cancel, and backward status transitions are blocked.
- No historical backfill, Accounting/Cash Book changes, Payroll redesign, or unrelated module changes are included.

## Scope

The implementation may add the Payroll↔Receivables link table, additive constraints/RLS/grants, trusted payroll planning/status RPCs, narrowly scoped Payroll actions/UI, and tests/native-schema parity. Existing Phase 1–3 Receivables semantics, FIFO allocation, permissions, and immutable transaction protections remain the source of truth.
