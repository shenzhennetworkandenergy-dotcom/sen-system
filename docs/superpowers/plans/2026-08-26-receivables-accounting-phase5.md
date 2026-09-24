# Receivables Accounting Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add a trusted, exactly-once Accounting/Quick Cash Book boundary for non-Sales Receivables without changing Sales, Payroll, or generic financial workflows.

**Architecture:** Phase 3 remains the operational Receivable source of truth. New Phase 5 RPCs create the immutable operational transaction, correct posted journal, optional Cash Book entry, immutable `receivable_accounting_postings` link, and audit record in one database transaction. BDT cash movements are mapped to the existing Cash/Bank/MFS and Accounts Receivable accounts; non-cash treatments are explicitly typed; unsupported currency or ambiguous treatment fails closed or records a review state without posting.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase PostgreSQL migrations/RPCs, existing server actions, Node test runner, native/offline schema builder.

**Spec:** `C:\Users\szwaq\.codex\attachments\1a540556-e337-4f0c-b2dc-3acd7dfd3af3\pasted-text.txt`

## Global Constraints

- Local implementation and verification only; do not apply the migration to production or deploy to Vercel.
- Use a dedicated `codex/receivables-phase5` worktree based on the verified production commit `e8d2a946527bd154f45d79bf86cf98e1e475cafd`.
- Add only migration `202608250006_receivables_accounting_phase5.sql`; never edit deployed migrations.
- Keep `record_sale_payment()`, Customer Receivables, Payroll/Phase 4 Paid, generic Accounting, Quick Cash Book, and all unrelated modules unchanged.
- No historical backfill, sample production data, currency conversion, or dependency upgrades.
- Authenticated users must not directly mutate financial tables; sensitive writes go through service-role RPCs that revalidate actor permissions.

### Task 1: Phase 5 failing contracts

**Files:**
- Create: `tests/receivables-phase5-migration.test.mts`
- Create: `tests/receivables-phase5-actions.test.mts`
- Create: `tests/receivables-phase5-ui.test.mts`
- Modify: `tests/receivables-native-schema.test.mts`

- [ ] Write tests for the additive migration, posting-link constraints, BDT mapping, closed-day/idempotency/reversal/security requirements, server actions, reconciliation UI, and native migration ordering.
- [ ] Run the focused Phase 5 tests and confirm they fail because the migration/actions/UI are not present.

### Task 2: Add the trusted database boundary

**Files:**
- Create: `supabase/migrations/202608250006_receivables_accounting_phase5.sql`

- [ ] Add nullable typed `accounting_treatment` to immutable Receivable transactions and validate supported treatments.
- [ ] Add immutable `receivable_accounting_postings` with unique operation/source/journal/Cash Book identities and one-reversal-only protection.
- [ ] Add derived reconciliation and detail views with RLS/grants.
- [ ] Seed dedicated Receivable Cash Book descriptions without altering existing descriptions.
- [ ] Implement `post_receivable_disbursement`, `post_receivable_repayment`, and `post_receivable_adjustment` as service-role-only atomic functions. Each must validate Receivables plus Accounting authority, operation payload, BDT currency, lifecycle/amount, and Cash Book timeline/closed-day rules before inserting the operational transaction, posted double-entry journal, optional Cash Book row, immutable link, lifecycle update, and audit.
- [ ] Implement `reverse_receivable_accounting_posting` as an atomic immutable reversal for posted links, with the same cash/non-cash mapping and one-reversal guard.
- [ ] Leave opening balances and Phase 4 salary-deduction repayments operational-only and represented as Historical Opening/Not Applicable or Needs Review.
- [ ] Run the migration contract tests and native SQL syntax/parity checks; fix only Phase 5 failures.

### Task 3: Add server-side domain/action wiring

**Files:**
- Modify: `lib/receivables/non-sales.ts`
- Modify: `lib/receivables/action-state.ts`
- Modify: `app/admin/receivables/actions.ts`
- Modify: `lib/receivables/data.ts`

- [ ] Add strict normalizers for accounting treatment/payment method/reversal inputs with no FX or salary-deduction spoofing.
- [ ] Add server actions that reauthorize the existing Receivables permission and pass the authenticated profile plus payload to only the new RPCs.
- [ ] Add read-only reconciliation/posting data to the existing detail DTO and a server-side paginated reconciliation query; never write journals/Cash Book rows from application code.
- [ ] Preserve existing Phase 3 actions for operational-only/history compatibility and keep `record_sale_payment()` out of the module.

### Task 4: Minimal Receivables UI

**Files:**
- Modify: `components/receivables/ReceivableOperations.tsx`
- Modify: `app/admin/receivables/loans/[id]/page.tsx`
- Modify: `components/receivables/ReceivablesNavigation.tsx`
- Create: `app/admin/receivables/reconciliation/page.tsx`

- [ ] Expose typed accounting treatment and payment method only where required, with clear BDT/Needs Review messaging.
- [ ] Show Accounting Status, journal reference, Cash Book reference, accounting date, treatment, and reversal state on the detail page.
- [ ] Add a permission-protected reconciliation view with filters/read-only links and no duplicate Receivables workflow.
- [ ] Add the accounting reversal control only for posted transactions and keep original history visible.

### Task 5: Native schema and focused behavior tests

**Files:**
- Modify: `scripts/build-native-schema.mjs`
- Modify: `tests/receivables-native-schema.test.mts`
- Create: `tests/receivables-phase5-domain.test.mts`

- [ ] Append migration `202608250006` after Phase 4 in the native build chain.
- [ ] Add domain tests for treatment compatibility, BDT-only behavior, Cash Book requirements, review states, and immutable reversal semantics.
- [ ] Rebuild native schema and verify migration ordering and required objects occur exactly once.

### Task 6: Full verification and local preview

**Files:**
- No additional source files unless a directly related test/build failure requires a minimal correction.

- [ ] Run focused Phase 5 tests, Receivables Phase 1/2/3/4 tests, Accounting/Cash Book tests, Sales payment tests, native parity, full regression, TypeScript, ESLint, production build, and `git diff --check`.
- [ ] Run the local app with disposable/local fixtures only; verify BDT disbursement, repayment, typed non-cash adjustment, reversal, reconciliation UI, and existing boundary routes without production writes.
- [ ] Confirm zero test fixtures remain, worktree contains only reviewed Phase 5 changes, and explicitly report that Phase 5 has not been deployed.
