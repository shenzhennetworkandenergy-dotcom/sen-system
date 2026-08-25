# Non-Sales Receivables Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe Admin/Finance operational management for non-Sales loans, advances, deposits, installments, repayments, adjustments, reversals, and due/overdue reporting.

**Architecture:** Extend Phase 1 generic accounts and immutable transactions. Add only an installment child table and controlled database operations; all balances and installment states remain derived. Accounting, Cash Book, Payroll, Sales, and Customer Receivables stay untouched.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Supabase/PostgreSQL, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-non-sales-receivables-phase3-design.md`

## Global Constraints

- Start from production commit `2f3639fa5d123dde69d83e4b97ed24c1264fab22` in isolated branch `codex/receivables-phase3`.
- Use only additive migration `202608250003_non_sales_receivables_phase3.sql`.
- Do not modify Sales, Customer Receivables Phase 2, `record_sale_payment()`, Accounting, Cash Book, Payroll, HR, Purchase, Inventory, Stock Out, Shipment, Quotations, or public website business logic.
- No dependency upgrades, historical backfill, sample data, Accounting posting, Cash Book entry, or Payroll deduction.
- Each new behavior starts with a failing test and must preserve immutable transaction history, authorization, idempotency, and currency isolation.

---

### Task 1: Domain validation and derived installment behavior

**Files:**
- Modify: `tests/receivables-domain.test.mts`
- Create: `tests/receivables-phase3-domain.test.mts`
- Modify: `lib/receivables/domain.ts`
- Create: `lib/receivables/non-sales.ts`

**Interfaces:**
- Produces `normalizeLifecycleInput`, `normalizeDisbursementInput`, `normalizeRepaymentInput`, `normalizeAdjustmentInput`, `normalizeReversalInput`, `buildInstallmentSchedule`, and `deriveInstallmentStates`.
- All monetary inputs normalize to four decimals; operation/account IDs are UUIDs; Phase 3 manual repayment rejects `salary_deduction`.

- [ ] Write failing tests for missing categories, borrower compatibility, installment rounding/FIFO, lifecycle payloads, overpayment inputs, unsafe scheduled increases, and salary-deduction rejection.
- [ ] Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/receivables-domain.test.mts tests/receivables-phase3-domain.test.mts` and confirm failures identify missing behavior.
- [ ] Implement the minimal pure TypeScript validators and derived helpers.
- [ ] Re-run the focused tests and confirm they pass.
- [ ] Commit the domain slice.

### Task 2: Additive database, RLS, idempotency, and immutable operations

**Files:**
- Create: `supabase/migrations/202608250003_non_sales_receivables_phase3.sql`
- Create: `tests/receivables-phase3-migration.test.mts`
- Modify: `scripts/verify-receivables-database.mjs`

**Interfaces:**
- Adds `receivable_installments`, lifecycle metadata, missing category values, category compatibility, and one-reversal enforcement.
- Adds service-only RPCs `transition_receivable_account`, `set_receivable_installment_schedule`, `confirm_receivable_disbursement`, `record_receivable_repayment`, `record_receivable_adjustment`, and `reverse_receivable_transaction`.
- Adds detail/installment/metric read views while preserving the Phase 2 customer view contract.

- [ ] Write failing migration-contract tests asserting categories, table constraints, permissions, RLS, operation locking, exact retry behavior, accounting/payroll isolation, reversal uniqueness, and derived views.
- [ ] Run the migration-contract test and confirm it fails because the Phase 3 migration is absent.
- [ ] Implement the additive migration with atomic audit logging and no writes to excluded modules.
- [ ] Extend the rollback-only database verifier with real account, lifecycle, concurrent/idempotent operation, installment, repayment, adjustment, reversal, authorization, and no-posting assertions.
- [ ] Run migration contract and available database verification; fix only Phase 3 failures.
- [ ] Commit the database slice.

### Task 3: Server Actions and operational read model

**Files:**
- Modify: `tests/receivables-actions.test.mts`
- Modify: `tests/receivables-data.test.mts`
- Modify: `app/admin/receivables/actions.ts`
- Modify: `lib/receivables/data.ts`

**Interfaces:**
- Server Actions call only approved Phase 3 RPCs and reauthorize the matching permission.
- Data functions return paginated loan rows, account detail, installment states, transaction history, audit activity, exposure, and currency-separated metrics.

- [ ] Add failing tests for every new action permission/RPC pair, read-only data access, scoped aggregates, pagination, and absence of Payroll/Accounting mutations.
- [ ] Run action/data tests and confirm the missing interfaces fail.
- [ ] Implement minimal Server Actions and DAL mapping, using `revalidatePath` for the loans/dashboard/detail routes.
- [ ] Re-run focused tests and confirm pass.
- [ ] Commit the application-boundary slice.

### Task 4: Loans list, detail, workflow forms, and dashboard

**Files:**
- Modify: `tests/receivables-ui.test.mts`
- Create: `tests/receivables-phase3-ui.test.mts`
- Modify: `components/receivables/ReceivableAccountForms.tsx`
- Create: `components/receivables/ReceivableWorkflowForms.tsx`
- Modify: `app/admin/receivables/loans/page.tsx`
- Create: `app/admin/receivables/loans/[id]/page.tsx`
- Modify: `app/admin/receivables/page.tsx`

**Interfaces:**
- List uses server query filters and detail links.
- Detail conditionally exposes Review/Approve/Reject/Cancel, Disburse, Repay, Adjust, Reverse, and pre-approval schedule actions by permission and current state.
- All operation IDs are stable client-generated UUIDs and forms show pending/result feedback.

- [ ] Add failing UI contract tests for route security, contextual borrower/category fields, detail summary, immutable history, schedule, permissions, and operational-only financial warning.
- [ ] Run UI tests and confirm failures identify missing pages/components.
- [ ] Implement the smallest accessible SEN-styled list/detail/forms/dashboard changes.
- [ ] Re-run UI and Receivables tests and confirm pass.
- [ ] Commit the UI slice.

### Task 5: Native/offline schema parity

**Files:**
- Modify: `tests/receivables-native-schema.test.mts`
- Modify: `scripts/build-native-schema.mjs`
- Regenerate: `database/native/schema.sql`

**Interfaces:**
- Native builder appends Phase 3 exactly once after Phase 2; native schema contains the complete additive migration and never grants new permissions to Standard Employees.

- [ ] Add failing native parity assertions for the Phase 3 migration and sensitive permissions.
- [ ] Run `npm run test:native` and confirm the Phase 3 assertions fail.
- [ ] Append the migration in the native builder and regenerate the schema.
- [ ] Run native and Receivables tests and confirm pass.
- [ ] Commit the parity slice.

### Task 6: Full verification and local preview

**Files:**
- Modify only Phase 3 tests/verifier if verification reveals a Phase 3 defect.

**Interfaces:**
- Produces a clean Phase 3 commit and a local authenticated preview; no production deployment.

- [ ] Run focused Receivables tests, database/RLS verifier, permissions/idempotency checks, Phase 1/2 regressions, and native parity.
- [ ] Run `npm run test:standalone`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- [ ] Start the local app with the linked safe local environment and verify Admin list/detail/create/review/approve/disburse/repay/adjust/reverse/installment workflows without production writes.
- [ ] Inspect `git diff` and `git status` to prove only approved Phase 3 files changed and excluded modules are untouched.
- [ ] Commit the verified Phase 3 implementation and report the local URL, credentials, commit, schema, files, tests, and limitations; do not deploy.

