# Customer Receivables Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sales commercial terms, authoritative due dates, aging, server-scoped Customer Receivables reporting, and operational dashboard metrics without duplicating balances, payments, or Accounting.

**Architecture:** Three nullable fields live on the authoritative Sale. One additive migration supplies the audited update RPC and derived detail, summary, and metric views. Server-only TypeScript resolves the existing Sales visibility scope and applies it uniformly to all service-role reads.

**Tech Stack:** Next.js 16.2 App Router, React 19 Server Components and Server Actions, TypeScript 5, Supabase/PostgreSQL, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-customer-receivables-phase2-design.md`

## Global Constraints

- Base every change on commit `6847c880f32bd8bdf15bc92e8f501957c3a31627` in the isolated `codex/receivables-phase2` worktree.
- Do not modify `record_sale_payment()`, Accounting, Cash Book, invoice finalization, Inventory, Stock Out, Shipment, Purchase, HR, Payroll, Attendance, Quotations, or the Public Website.
- Do not backfill historical due dates or mutate historical Sales/payment/Accounting data.
- Keep Customer Receivables derived; no duplicate balance, payment, or transaction storage.
- Use `Asia/Dhaka` for due-date and aging boundaries.
- Keep all new read models service-role-only and enforce Sales scope in every server query.
- Do not deploy; finish with a local preview for user approval.

---

### Task 1: Commercial Terms Domain and Sales Scope

**Files:**
- Create: `lib/sales/commercial-terms.ts`
- Create: `lib/sales/visibility.ts`
- Create: `tests/customer-receivables-phase2-domain.test.mts`
- Create: `tests/customer-receivables-phase2-authorization.test.mts`

**Interfaces:**
- Produces `normalizeCommercialTermsDraft`, `deriveEffectiveDueDate`, `deriveReceivableState`, `formatCommercialTerms`, `resolveSalesVisibilityScope`, and `canAccessSaleUnderScope`.

- [ ] **Step 1: Write failing domain tests** with hand-derived dates for presets, custom periods, explicit override, invoice anchor stability, all aging buckets, paid/no-date behavior, and invalid combinations.
- [ ] **Step 2: Run** `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/customer-receivables-phase2-domain.test.mts` and verify missing-module failures.
- [ ] **Step 3: Implement the minimum pure functions** with literal `Asia/Dhaka` date handling and narrow validation.
- [ ] **Step 4: Re-run the domain tests** and confirm all pass.
- [ ] **Step 5: Write failing authorization tests** for Admin, all-Sales, own-Sales, and no-Sales scopes.
- [ ] **Step 6: Implement the minimum scope resolver** and re-run authorization tests.

### Task 2: Additive Phase 2 Migration

**Files:**
- Create: `supabase/migrations/202608250002_customer_receivables_phase2.sql`
- Create: `tests/customer-receivables-phase2-migration.test.mts`

**Interfaces:**
- Produces nullable `sales_orders` commercial-term fields, `update_sale_commercial_terms`, and the customer detail/summary/metrics views.

- [ ] **Step 1: Write failing migration-contract tests** for additive fields, constraints, invoice anchor, draft exclusion, statuses, aging, audited/idempotent update, service-only grants, and prohibited financial mutations.
- [ ] **Step 2: Run the migration tests** and verify failure because the migration does not exist.
- [ ] **Step 3: Implement one transactional migration** containing only the approved Phase 2 schema, RPC, views, grants, and schema reload.
- [ ] **Step 4: Re-run the migration tests** and confirm all pass.

### Task 3: Server-Scoped Customer Data Access

**Files:**
- Modify: `lib/receivables/data.ts`
- Modify: `lib/receivables/summary.ts`
- Modify: `tests/receivables-data.test.mts`
- Create: `tests/customer-receivables-phase2-data.test.mts`

**Interfaces:**
- Consumes `SalesVisibilityScope` and Phase 2 views.
- Produces `getCustomerReceivables`, `getCustomerReceivableSummaries`, and scoped `getReceivablesDashboard` results.

- [ ] **Step 1: Write failing behavior tests** for filter normalization, currency-safe summary merging, aggregate status values, and scope selection.
- [ ] **Step 2: Run the data tests** and verify the expected missing APIs/fields fail.
- [ ] **Step 3: Implement server-side filter parsing and scoped view queries**; apply `.eq("responsible_profile_id", ownProfileId)` before count, ordering, pagination, summary, and metrics reads.
- [ ] **Step 4: Keep Phase 1 non-Sales loading unchanged** and combine only already-authorized metric rows by currency.
- [ ] **Step 5: Re-run all Receivables data tests** and confirm pass.

### Task 4: Commercial Terms Atomic Action and Sale Detail UI

**Files:**
- Modify: `app/admin/sales/actions.ts`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `lib/sales/data.ts`
- Create: `tests/sales-commercial-terms-action.test.mts`
- Create: `tests/sales-commercial-terms-ui.test.mts`

**Interfaces:**
- Consumes domain normalization and `update_sale_commercial_terms` RPC.
- Produces `updateSaleCommercialTermsAction` and the Sale detail Commercial Terms card.

- [ ] **Step 1: Write failing action tests** proving reauthorization, Sales ownership validation, a stable operation UUID, approved RPC arguments, audit handled by the RPC, and no payment/invoice RPC changes.
- [ ] **Step 2: Write failing UI tests** for presets, custom period, read-only post-invoice terms, explicit override reason, and effective due-date display.
- [ ] **Step 3: Run both tests** and verify they fail on missing action/UI.
- [ ] **Step 4: Implement the minimal server action** with `sales.edit`, existing Sales visibility, normalized form input, RPC call, revalidation, and safe redirect.
- [ ] **Step 5: Add the Commercial Terms card** while leaving Products, Payments, Documents, and invoice actions unchanged.
- [ ] **Step 6: Re-run focused Sales commercial-term tests** and existing Sales payment/invoice tests.

### Task 5: Customer Receivables and Dashboard UI

**Files:**
- Modify: `app/admin/receivables/customers/page.tsx`
- Modify: `app/admin/receivables/page.tsx`
- Modify: `tests/receivables-ui.test.mts`
- Create: `tests/customer-receivables-phase2-ui.test.mts`

**Interfaces:**
- Consumes scoped detail, summary, and metric DAL results.
- Produces authorized server-filtered pages and links to the existing Sale collection path.

- [ ] **Step 1: Write failing page tests** for Sales scope resolution, server-side filters, Phase 2 columns, customer rollups, currency separation, and no duplicate Record Payment form.
- [ ] **Step 2: Run the UI tests** and verify expected Phase 2 elements are absent.
- [ ] **Step 3: Implement the Customer page filters, pagination, rollups, status chips, and Sale links** using Server Component `searchParams`.
- [ ] **Step 4: Implement dashboard Customer metrics from the aggregate view** while preserving non-Sales summaries.
- [ ] **Step 5: Re-run all Receivables UI tests**.

### Task 6: Database Verifier and Native/Offline Parity

**Files:**
- Modify: `scripts/build-native-schema.mjs`
- Modify: `scripts/verify-receivables-database.mjs`
- Modify: `tests/receivables-native-schema.test.mts`
- Modify: `tests/receivables-database-verifier.test.mts`
- Modify generated: `database/native/schema.sql`

**Interfaces:**
- Appends the exact Phase 2 migration after Phase 1 and verifies rollback-only database behavior.

- [ ] **Step 1: Write failing native/verifier tests** for migration order, exact inclusion, draft exclusion, due-date derivation, payment recalculation, scoped reads, audit, and financial isolation.
- [ ] **Step 2: Run those tests** and verify Phase 2 parity is missing.
- [ ] **Step 3: Extend the builder and rollback-only verifier** without changing existing Phase 1 cases.
- [ ] **Step 4: Run** `node scripts/build-native-schema.mjs` to regenerate native schema.
- [ ] **Step 5: Re-run native, database-verifier contract, and local database verification**.

### Task 7: Full Verification and Local Review

**Files:**
- Verify only; do not add features.

**Interfaces:**
- Produces the reviewable Phase 2 commit and local preview.

- [ ] **Step 1: Run focused suites**: `npm run test:receivables`, Phase 2 domain/action/security tests, Sales payment/accounting tests, and native parity.
- [ ] **Step 2: Run local rollback-only database verification** with the Phase 2 migration applied to a local database.
- [ ] **Step 3: Run** `npm run test:standalone`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- [ ] **Step 4: Start the local server** and authenticate as Admin and a safely scoped employee where fixtures exist.
- [ ] **Step 5: Verify** Sale terms → invoice anchor → Receivables due/aging → existing payment recalculation without creating production data.
- [ ] **Step 6: Inspect the final diff** to prove no Accounting, payment RPC, invoice finalization, or unrelated module changes.
- [ ] **Step 7: Commit the isolated implementation** and report the local URL and credentials without deploying.
