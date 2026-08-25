# Receivables Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authorized Receivables foundation that derives customer debt from Sales and persists only non-Sales opening/requested receivables.

**Architecture:** A forward-only migration creates non-Sales operational tables, immutable transactions, server-only derived views, permission/RLS policies, and atomic RPCs. Next.js Server Components query DTOs through an authorized DAL; Server Actions validate forms and invoke RPCs without changing Accounting, Payroll, or Sales writes.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Supabase/PostgreSQL, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-receivables-phase1-design.md`

## Global Constraints

- Work from production commit `67c965458b64f75174006bcf1a58e27980b92dfc` in `codex/receivables-phase1`.
- Phase 1 only; do not deploy to Vercel.
- Do not modify Sales accounting, Payroll, Accounting journals, Cashbook records, Purchase, Inventory, HR, or existing financial history.
- Use additive migrations; no destructive rename/drop/backfill.
- Customer receivables are derived; non-Sales receivables are persisted.
- Standard Employees receive no Receivables permissions by default.

---

### Task 1: Migration contract and permission catalogue

**Files:**
- Create: `tests/receivables-phase1-migration.test.mts`
- Create: `supabase/migrations/202608250001_receivables_phase1.sql`
- Modify: `package.json`

**Interfaces:**
- Produces: three tables, three views, `create_receivable_account`, `create_opening_receivable`, five permission keys, RLS, and grants.

- [ ] **Step 1: Write the failing migration-contract test**

Assert that the migration is transactional; defines the approved permissions, tables, views, RPCs, checks, RLS, audit inserts, operation-ID uniqueness, no Standard Employee grants, and no journal/cashbook/payroll writes.

```ts
assert.match(sql, /create table public\.receivable_accounts/i)
assert.match(sql, /create view public\.customer_receivables_v/i)
assert.match(sql, /receivables\.manage_opening/i)
assert.doesNotMatch(sql, /insert into public\.(journal_entries|cashbook_entries|hr_payroll)/i)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/receivables-phase1-migration.test.mts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the minimal migration**

Create the additive schema, views, RLS, grants, RPC validation, operation lock/idempotency, and transactional audit writes defined in the specification. Do not add permission template items for `standard_employee`.

- [ ] **Step 4: Add the focused script**

Add `test:receivables` to `package.json`, running all Phase 1 Node tests.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm run test:receivables`

Expected: PASS.

### Task 2: Receivables domain DTOs and validation

**Files:**
- Create: `tests/receivables-domain.test.mts`
- Create: `lib/receivables/domain.ts`

**Interfaces:**
- Produces: `ReceivableCategory`, `BorrowerType`, `ReceivableStatus`, `OpeningReceivableInput`, `normalizeOpeningReceivableInput`, `normalizeRequestedReceivableInput`, `deriveReceivableStatus`, and `formatReceivableNumber`.

- [ ] **Step 1: Write failing domain tests**

Cover trimmed values, positive BDT amounts, exact opening equation, one borrower reference, requested-account defaults, operation UUID validation, and derived paid/current states.

```ts
assert.throws(() => normalizeOpeningReceivableInput({
  originalAmount: 200000,
  previouslyRepaidAmount: 120000,
  openingOutstandingAmount: 70000,
}), /must equal/i)
```

- [ ] **Step 2: Run and verify RED**

Run the single domain test and confirm missing exports cause the failure.

- [ ] **Step 3: Implement pure validators and DTO types**

No database access or financial posting is allowed in this file.

- [ ] **Step 4: Run and verify GREEN**

Run the domain test and `npm run test:receivables`.

### Task 3: Authorized read data layer

**Files:**
- Create: `tests/receivables-data.test.mts`
- Create: `lib/receivables/data.ts`

**Interfaces:**
- Produces: `getReceivablesDashboard`, `getCustomerReceivables`, `getNonSalesReceivables`, and `getReceivablePartyOptions`.
- Consumes: existing Supabase admin client and approved view fields.

- [ ] **Step 1: Write failing source-contract tests**

Verify the DAL is server-only, queries the approved views, supports pagination/search, never writes, and conditionally excludes customer/loan categories when permission flags are false.

- [ ] **Step 2: Verify RED**

Run the data contract test and confirm the module is missing.

- [ ] **Step 3: Implement the minimal DAL**

Select only display-safe DTO columns, cap page size, trim search to 80 characters, and compute dashboard metrics from authorized normalized rows only.

- [ ] **Step 4: Verify GREEN**

Run the data and all Receivables tests.

### Task 4: Server actions and opening-balance forms

**Files:**
- Create: `tests/receivables-actions.test.mts`
- Create: `app/admin/receivables/actions.ts`
- Create: `components/receivables/ReceivableAccountForms.tsx`

**Interfaces:**
- Produces: `createRequestedReceivableAction`, `createOpeningReceivableAction`, and client forms using `useActionState`.
- Consumes: domain validation, `requirePermission`, RPCs, and routes.

- [ ] **Step 1: Write failing action/source tests**

Assert both actions are server functions, reauthorize separately, validate FormData, pass actor IDs from the session, call only the approved RPC, and revalidate/redirect after success.

- [ ] **Step 2: Verify RED**

Run the action test and confirm files/exports are missing.

- [ ] **Step 3: Implement actions and forms**

Use visible labels, accessible errors, pending-state submit buttons, existing masters before external-party fields, and no Accounting/Payroll controls.

- [ ] **Step 4: Verify GREEN**

Run action, domain, and focused Receivables tests.

### Task 5: Routes, navigation, dashboard, and lists

**Files:**
- Create: `tests/receivables-ui.test.mts`
- Create: `components/receivables/ReceivablesNavigation.tsx`
- Create: `app/admin/receivables/page.tsx`
- Create: `app/admin/receivables/customers/page.tsx`
- Create: `app/admin/receivables/loans/page.tsx`
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`

**Interfaces:**
- Produces: three dynamic authorized routes and one main sidebar item.
- Consumes: DAL functions, permission context, forms, SEN card/table/badge patterns.

- [ ] **Step 1: Write failing route/UI tests**

Verify exact route constants, one Procurement and Finance sidebar item, no Collections/Overdue route, page-level permission checks, permission-aware aggregate rendering, and required headings/forms.

- [ ] **Step 2: Verify RED**

Run the UI test and confirm route/source assertions fail.

- [ ] **Step 3: Implement the minimal UI**

Use a dashboard card grid, recent records, internal three-tab navigation, responsive tables, semantic badges, empty states, search/pagination, and no fabricated due/aging values.

- [ ] **Step 4: Verify GREEN**

Run UI and all focused tests, then TypeScript.

### Task 6: Native/offline schema parity

**Files:**
- Create: `tests/receivables-native-schema.test.mts`
- Modify: `scripts/build-native-schema.mjs`
- Modify generated: `database/native/schema.sql`

**Interfaces:**
- Produces: native schema containing the identical Phase 1 migration once.

- [ ] **Step 1: Write failing native-parity test**

Assert the builder imports the new migration and the generated schema contains tables, views, permissions, RLS, and RPCs exactly once.

- [ ] **Step 2: Verify RED**

Run the native test and confirm the migration is absent from the builder/output.

- [ ] **Step 3: Update the builder and regenerate**

Run: `node scripts/build-native-schema.mjs`.

- [ ] **Step 4: Verify GREEN**

Run native parity and existing native schema tests.

### Task 7: Local database RLS, idempotency, and data-safety acceptance

**Files:**
- Create: `supabase/tests/receivables_phase1.sql`
- Create: `scripts/verify-receivables-database.mjs`

**Interfaces:**
- Validates deployed local schema and RPC behavior without production data.

- [ ] **Step 1: Write transactional SQL acceptance tests**

Within `begin`/`rollback`, create admin/employee/customer fixtures; test denied default employee access, explicit permission access, unauthorized RPC rejection, exact opening balance, unchanged retry, changed retry rejection, immutable transaction protections, audit rows, and absence of journal/cashbook/payroll side effects.

- [ ] **Step 2: Verify RED against local Supabase**

Start/reset only the local Supabase project, apply migrations, and run the test before the migration implementation is available in a clean temporary database; expected failure is missing Receivables objects.

- [ ] **Step 3: Apply the completed migration locally**

Reset only the verified local Supabase stack and run the transactional acceptance script.

- [ ] **Step 4: Verify GREEN**

Run the database verifier twice to prove fixture rollback and idempotent behavior.

### Task 8: Full verification and local preview

**Files:**
- Modify only if a directly related failure is reproduced.

- [ ] **Step 1: Run focused tests**

Run `npm run test:receivables`, permission/RLS acceptance, and native schema tests.

- [ ] **Step 2: Run regression gates**

Run existing Sales, Accounting/Cashbook, HR/Payroll, Purchasing, Inventory, permissions, and standalone suites.

- [ ] **Step 3: Run static/build gates**

Run TypeScript, ESLint, production build, and the full release gate using only local database infrastructure.

- [ ] **Step 4: Inspect the final diff**

Confirm only the approved Receivables files, route constants/navigation line, package script, migration, native builder/output, tests, spec, and plan changed.

- [ ] **Step 5: Start the local app**

Run on an available localhost port with the local Supabase environment, smoke-test all three Receivables routes plus Sales, Accounting, Payroll, Purchase, Inventory, and HR route health, and provide the exact URL and safe local credentials already supported by the local fixture environment.
