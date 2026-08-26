# Phase 4 Payroll ↔ Receivables Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add planned Employee Loan / Salary Advance deductions to Payroll and make `Approved → Paid` create exactly-once immutable Receivables repayments atomically.

**Architecture:** Extend the Phase 3 generic Receivables model with one additive `payroll_receivable_deductions` link per Payroll/account. Draft and approval use provisional/frozen snapshots only. A trusted database function locks Payroll → links → sorted Receivable accounts, revalidates the snapshot, inserts salary-deduction repayments, links them, marks Payroll paid, and audits in one transaction. Manual Receivables repayment remains unable to create salary deductions.

**Tech Stack:** Next.js/TypeScript server actions, Supabase/PostgreSQL migrations and RPCs, Vitest-style `.test.mts` tests, existing SEN HR/Receivables components.

**Spec:** `docs/superpowers/specs/2026-08-26-payroll-receivables-phase4.md`

## Task 1: Establish test contracts and domain planning helpers

- [ ] Add domain tests for eligibility, one-installment-per-account planning, final-installment capping, negative-net protection, deterministic operation IDs, plan hashes, and status transitions.
- [ ] Add migration contract tests for the additive link table, uniqueness, RLS, trusted Paid RPC, and preserved manual salary-deduction block.
- [ ] Add source-contract tests ensuring the Paid action delegates to the trusted RPC and contains no direct paid update or accounting/cashbook posting.
- [ ] Run the focused tests and confirm they fail for missing Phase 4 behavior.
- [ ] Implement pure planning/validation helpers with no database side effects and rerun the focused tests.

## Task 2: Add the forward-only database boundary

- [ ] Confirm the next unused migration number after production’s `202608250004`; use `202608250005_payroll_receivables_phase4.sql` only after verification.
- [ ] Add `payroll_receivable_deductions` with Payroll/account/component references, planned amount, operation ID, snapshot hash, repayment link, metadata, and uniqueness constraints.
- [ ] Add RLS/grants and trusted RPCs for planning/approval and atomic Paid; do not grant direct salary-deduction writes.
- [ ] Reuse Phase 3 outstanding/FIFO semantics and immutable transactions, with deterministic locks and rollback on any stale/unsafe plan.
- [ ] Add native/offline schema parity and migration-order assertions.

## Task 3: Integrate narrowly with Payroll actions and UI

- [ ] Generate eligible planned deductions through the existing Payroll creation path without changing existing salary math outside the new deduction lines.
- [ ] Freeze the approved snapshot and plan hash without reducing Receivables outstanding.
- [ ] Route only `Approved → Paid` through the trusted RPC; preserve Admin/Payroll authorization and block paid backward transitions.
- [ ] Display traceable loan deduction lines and clear stale-plan/negative-net errors while preserving existing HR layout and unrelated payroll behavior.
- [ ] Keep manual salary-deduction Receivables actions blocked and do not touch Accounting/Cash Book.

## Task 4: Verify integration and regression boundaries

- [ ] Add tests for draft/approval no-movement, multiple loans, stale plans, exactly-once retries, concurrency/overpayment, FIFO/final installment, security, and paid finality.
- [ ] Run Phase 1–3 Receivables regressions, HR/Payroll tests, native parity, TypeScript, ESLint, production build, and full regression suite.
- [ ] Run an authenticated local browser flow for Payroll draft → approve → paid using a safe local fixture; verify balances and links without production data.
- [ ] Review `git diff --check`, exact files, and worktree cleanliness; commit only the reviewed Phase 4 changes.
- [ ] Start the local preview and stop for user review. Do not deploy.

## Safety boundaries

- [ ] Do not modify Sales, Customer Receivables, Accounting, Quick Cash Book, Purchase, Supplier, Inventory, Receive, Stock Out, Shipment, Quotations, HR/Attendance, Public Website, or dependencies.
- [ ] Do not backfill or alter historical Payroll/Receivables records and do not create production test data.
