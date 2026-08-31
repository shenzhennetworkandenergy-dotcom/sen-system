# Receivables Phase 6B Final Reports & Statements Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Keep every read path authenticated, scoped, bounded, and read-only; run the listed tests after each task.

**Goal:** Build the final user-facing Receivables reports and statements on top of the Phase 6A authorization/reporting foundation, without a migration or any financial write-path changes.

**Architecture:** Server-rendered report pages call a single bounded Phase 6B reporting DAL. The DAL resolves the Phase 6A reporting scope before querying existing Sales, Receivables, installment, and reconciliation sources, then returns explicit report DTOs. Customer Sales reports remain Sales-derived; non-Sales reports remain receivable-account-derived; accounting and payroll fields are conditionally queried and sanitized.

**Tech Stack:** Next.js App Router server components, TypeScript, existing Supabase server client/query helpers, existing SEN UI primitives, Vitest/Node test suites, ESLint, TypeScript compiler, production build.

**Spec:** User-approved “PHASE 6B — STRICT IMPLEMENTATION — FINAL RECEIVABLES REPORTS & STATEMENTS” command (2026-08-31).

## Global Constraints

- No database migration, schema change, dependency update, or production deployment.
- Do not modify Sales/payment, Accounting/Cash Book, Payroll, Phase 3/4 write workflows, or protected Attendance/Inventory/Purchase/Quotation modules.
- Reuse `resolveReceivablesReportScope`/Phase 6A helpers; never fetch service-role financial rows before authorization.
- Use Asia/Dhaka half-open date ranges, explicit DTOs, currency grouping, validated filters, stable ordering, and page size 25 (maximum 100).
- Do not add export/print/PDF/XLSX/CSV/chart/report-job features.
- Each implementation task follows: add a focused failing test, run it to observe the failure, make the smallest implementation, rerun to green, then commit only the task’s files.

## Task 1: Map existing report sources and contracts

1. Inspect the existing Phase 1–5 views, transaction semantics, payment/refund fields, Phase 6A DAL, and Receivables navigation/pages.
2. Add a focused contract test describing the DTOs and report modes required by Phase 6B (outstanding, due/aging, statements, installments, activity, reconciliation, summary), including source separation and accounting/payroll redaction.
3. Run the focused test and record the expected red failure.
4. Document the verified source mapping in the implementation code comments/types only where needed; do not change schema.
5. Run the focused test again and commit the contract/test baseline.

## Task 2: Add pure reporting normalization and derivation helpers

1. Add failing tests for due-status/aging labels, running-balance derivation, opening/reversal classification, collection-versus-adjustment classification, currency grouping, Dhaka dates, and pagination/filter validation.
2. Implement small pure helpers/types in a dedicated reporting module, delegating date/currency/bounds behavior to Phase 6A primitives.
3. Ensure no helper treats a missing due date as overdue, no mixed currencies are summed, and reversals preserve original events while exposing net effect.
4. Run focused tests to green and commit.

## Task 3: Implement the bounded Phase 6B server DAL

1. Add failing tests with mocked query boundaries for each report family and for unauthorized/own-scope/accounting-hidden/payroll-hidden actors.
2. Implement scoped, paginated DAL functions using existing views/tables only:
   - customer outstanding/due/aging rows and currency-separated aggregates;
   - Sales-derived customer statement events;
   - non-Sales account statement and installment rows;
   - repayment/collection activity separated by source;
   - reconciliation filters gated by accounting visibility;
   - management summary metrics.
3. Return normalized DTOs, never raw service-role records; omit protected accounting/payroll payloads before serialization.
4. Run focused DAL/security tests to green and commit.

## Task 4: Build the Reports hub and customer report screens

1. Add failing route/component tests or static assertions for the Reports navigation and report links.
2. Add `/admin/receivables/reports` hub and a bounded customer reports page supporting outstanding, due/overdue, and aging modes with concise filters, summary cards, tables, and pagination.
3. Add customer Sales Statement route linked from authorized customer rows; keep it separate from non-Sales accounts.
4. Verify direct URL authorization and empty/error states.
5. Run focused UI/type tests and commit.

## Task 5: Build non-Sales statements, installments, activity, and reconciliation reports

1. Add failing tests for opening-balance labels, installment statuses, FIFO-derived amounts, source-separated activity, accounting-hidden reconciliation, and reversal presentation.
2. Add non-Sales account statement/detail report, installment statement, activity report, and the bounded reconciliation improvements using existing navigation/detail links.
3. Keep accounting references behind `accounting.view`; keep payroll-linked rows operational-only unless payroll visibility permits the limited fields.
4. Run focused tests and commit.

## Task 6: Integrate summary/navigation without touching protected modules

1. Add failing assertions for currency-separated dashboard/report summaries and the single Reports navigation entry.
2. Add only the minimal Receivables navigation/dashboard links; preserve Attendance navigation and all Phase 6A behavior.
3. Run Phase 6A regressions and focused tests; commit.

## Task 7: Verification and local UAT

1. Run Phase 6B focused tests, Phase 6A and Receivables Phase 1–5 suites, Sales visibility/payment-accounting regressions, Payroll/Accounting/Cash Book regressions, Attendance/HR, Inventory/Purchase/Quotation/Stock Out suites, native parity, standalone regression, TypeScript, ESLint, production build, and `git diff --check`.
2. Start a disposable local current-schema backend only; create minimal local role fixtures and verify Admin, Sales-own, loan-visible/accounting-hidden, accounting-authorized, payroll-hidden, and Standard Employee behavior across all reports.
3. Verify Dhaka date boundaries, currency isolation, pagination bounds, direct URL authorization, and no protected payload queries.
4. Remove every disposable fixture, rerun affected focused tests, verify clean worktree, and recheck production without deploying.
