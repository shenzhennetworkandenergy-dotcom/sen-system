# Quick Cashbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database-backed Daily Cash Statement to Accounting with reusable খাত/বিবরণ values, opening cash, date-specific closing balances, day closing, and printing.

**Architecture:** A focused cashbook domain module normalizes inputs and calculates opening, income, expense, net movement, and closing cash. Supabase tables and atomic RPCs persist daily state, descriptions, and transactions while posting balanced entries into the existing general ledger. The existing Accounting page renders one new client form and a printable daily statement.

**Tech Stack:** Next.js 16 Server Components and Server Actions, React 19, TypeScript, Supabase PostgreSQL/RLS/RPC, Node test runner, Tailwind CSS.

## Global Constraints

- Change only Accounting cashbook files, its database migration, focused tests, and release verification.
- Every cashbook transaction must atomically create a posted, balanced journal entry.
- Mutations require `accounting.create_entry`; reads require `accounting.view`.
- Default and stored business dates use `Asia/Dhaka`.
- Payment methods are exactly `cash`, `bank`, and `mfs`.
- Closed cashbook dates reject new entries and opening-balance changes.

---

### Task 1: Cashbook domain behavior

**Files:**
- Create: `lib/accounting/cashbook.ts`
- Create: `tests/accounting-cashbook.test.mts`

**Interfaces:**
- Produces: `normalizeCashbookDescriptionInput`, `normalizeCashbookEntryInput`, `normalizeOpeningBalance`, `getBusinessDate`, and `summarizeCashbookEntries`.

- [ ] **Step 1: Write failing tests**

Test literal Income/Expense normalization, non-negative opening cash, positive two-decimal amounts, supported payment methods, Bangladesh date boundaries, and hand-calculated closing cash.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/accounting-cashbook.test.mts`

Expected: FAIL because `lib/accounting/cashbook.ts` does not exist.

- [ ] **Step 3: Implement the domain functions**

Use narrow string unions, trim description names to 160 characters, reject non-positive amounts, round amounts to two decimals, and calculate `income`, `expense`, and `net`.

- [ ] **Step 4: Run test to verify it passes**

Run the Task 1 command and expect all cashbook tests to pass.

### Task 2: Persistent cashbook and ledger posting

**Files:**
- Create: `supabase/migrations/202607310013_accounting_quick_cashbook.sql`
- Modify: `scripts/verify-accounting-hr.mjs`

**Interfaces:**
- Produces: `cashbook_descriptions`, `cashbook_entries`, `create_cashbook_description(uuid,text,text)`, and `create_cashbook_entry(uuid,uuid,numeric,text,timestamptz)`.
- Consumes: existing `accounting_accounts`, `journal_entries`, `journal_lines`, `audit_logs`, `assert_actor_permission`, and `next_journal_entry_number`.

- [ ] **Step 1: Extend the verifier before the migration exists**

Require both cashbook tables, RLS policies, RPC security, description creation, entry creation, posted journal linkage, and daily income/expense totals.

- [ ] **Step 2: Run verification to observe failure**

Run: `npm run test:accounting-hr`

Expected: FAIL because cashbook tables and RPCs do not exist.

- [ ] **Step 3: Add the migration**

Create indexed daily-state, description, and entry tables with validation; seed payment accounts and common descriptions; add RLS; implement permission-checked security-definer RPCs for opening cash, entry creation, and day closing; create balanced posted journals atomically; audit mutations; and grant only required reads/role execution.

- [ ] **Step 4: Reset or migrate the local database and rerun verification**

Run the local Supabase migration command, then `npm run test:accounting-hr`; expect the linked transaction and cleanup probes to pass.

### Task 3: Accounting data, actions, and UI

**Files:**
- Modify: `lib/accounting/data.ts`
- Modify: `app/admin/accounting/actions.ts`
- Create: `components/accounting/QuickCashbook.tsx`
- Modify: `app/admin/accounting/page.tsx`

**Interfaces:**
- `getAccountingDashboard(date: string)` returns existing ledger data plus day state, cashbook descriptions, entries, and opening/closing summary for that date.
- `setCashbookOpeningBalanceAction(FormData)`, `createCashbookDescriptionAction(FormData)`, `createCashbookEntryAction(FormData)`, and `closeCashbookDayAction(FormData)` authorize, validate, call their RPC, revalidate, and redirect with feedback.
- `QuickCashbook` consumes selected date, descriptions, entries, summary, and create permission.

- [ ] **Step 1: Add an integration/source verification that requires the new page contract**

Require the date query, four summary cards, opening balance, description creation action, entry action, close action, print statement, three payment methods, and the Bengali label.

- [ ] **Step 2: Run verification to observe failure**

Run: `npm run test:accounting-hr`

Expected: FAIL because the page contract is not implemented.

- [ ] **Step 3: Implement data loading and server actions**

Validate query dates, load only selected-day entries, join descriptions, and keep redirects outside `try/catch`.

- [ ] **Step 4: Implement the scoped Quick Cashbook component**

Render selected-day cards, GET date filter, opening balance form, inline description creator, transaction form, filtered description selector, close and print buttons, and a responsive split Income/Expense statement above the existing journal form.

- [ ] **Step 5: Run focused verification**

Run the cashbook unit test and `npm run test:accounting-hr`; expect both to pass.

### Task 4: Release and deployment

**Files:**
- Modify: `package.json`
- Modify: `scripts/release-gate.mjs`

**Interfaces:**
- Adds `test:accounting-cashbook` and includes it in the release gate.

- [ ] **Step 1: Add the focused test script to the release gate**

Run the cashbook unit tests through `npm run test:accounting-cashbook`.

- [ ] **Step 2: Run complete local verification**

Run: `npm run test:release`

Expected: all checks, standalone tests, database verification, lint, and production build pass.

- [ ] **Step 3: Commit and push**

Commit only the scoped Quick Cashbook changes and push `codex/quick-cashbook`, then fast-forward `main` when it remains compatible.

- [ ] **Step 4: Apply the migration and deploy**

Dry-run the remote migration, apply it, deploy the exact pushed commit to Vercel production, and wait for Ready.

- [ ] **Step 5: Verify production**

Run production route smoke tests, inspect the production deployment, check new error logs, and confirm the remote migration and cashbook schema.
