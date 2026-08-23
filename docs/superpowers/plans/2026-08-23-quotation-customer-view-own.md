# Quotation Customer Experience and Own-View Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immediate Quotation customer creation, shared searchable customer selection, and server-enforced creator-only quotation viewing without changing unrelated behavior.

**Architecture:** Reuse one shared customer search component and one server-only basic customer creation service across Sales and Quotations. Add a nullable creator field and permission catalogue row, then resolve quotation access to broad or creator-only scope at every admin read and operation lookup.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions and `useActionState`, TypeScript, Supabase/PostgreSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-quotation-customer-view-own-design.md`

## Global Constraints

- Do not change Sales calculations, stock, Accounting, Orders, Inventory, Purchase, Shipment, HR, Payroll, public website, or product management.
- Preserve existing `quotations.view`, `quotations.view_all`, and every operation permission.
- Do not backfill historical quotation ownership or assign the new permission to existing employees or templates.
- Use the existing profiles/customer-address CRM records; do not create quotation-only customers.
- Deploy only after all critical local checks pass.

---

### Task 1: Shared customer search behavior

**Files:**
- Create: `lib/customers/search.ts`
- Create: `components/customers/CustomerTypeahead.tsx`
- Test: `tests/customer-typeahead.test.mts`
- Modify: `components/sales/SaleBuilder.tsx`

**Interfaces:**
- Produces: `CustomerSearchOption`, `customerOptionLabel(customer)`, `filterCustomerOptions(customers, query, limit)`, and `CustomerTypeahead`.
- Preserves: Sales `customer_id` form field and default-address selection callback.

- [ ] Write tests proving partial name, company, email, and phone matching; blank-query behavior; unrelated exclusion; and the 20-result cap.
- [ ] Run the focused test and confirm it fails because the shared search module does not exist.
- [ ] Implement the pure search module and shared controlled-selection component.
- [ ] Replace only the inline Sales customer search markup with the shared component.
- [ ] Run focused search and Sales regression tests until green.

### Task 2: Immediate Quotation customer creation

**Files:**
- Create: `lib/customers/create-basic.ts`
- Modify: `lib/customers/basic.ts`
- Modify: `app/admin/sales/actions.ts`
- Modify: `app/admin/quotations/actions.ts`
- Modify: `components/quotations/QuotationBuilder.tsx`
- Modify: `app/admin/quotations/new/page.tsx`
- Test: `tests/quotation-customer-creation.test.mts`

**Interfaces:**
- Produces: `createBasicCustomerRecord(input)` returning `{ id, full_name, email, phone, company_name }`.
- Produces: `createQuotationCustomerAction(previousState, formData)` returning a serializable success/error state.

- [ ] Extend the existing customer test with company normalization, returned customer state, no redirect contract, shared service use, and client-side auto-selection expectations.
- [ ] Run it and confirm failure against the redirect-only/missing implementation.
- [ ] Implement the server-only shared customer creation service with auth-user rollback on profile/address failure.
- [ ] Refactor the Sales action to the service while preserving its permission and redirect behavior.
- [ ] Add the Quotation `useActionState` quick-create form outside the quotation form; append and select the returned customer without navigation.
- [ ] Remove the unused duplicate inline-customer branch from quotation creation and continue validating the selected central customer record.
- [ ] Run focused customer, quotation creation, CRM, and Sales tests until green.

### Task 3: Creator ownership and view-own permission

**Files:**
- Create: `lib/quotations/access-policy.ts`
- Create: `lib/quotations/access.ts`
- Create: `supabase/migrations/202608230003_quotation_view_own.sql`
- Create: `tests/quotation-own-access.test.mts`
- Modify: `app/admin/quotations/page.tsx`
- Modify: `app/admin/quotations/[id]/manage/page.tsx`
- Modify: `app/admin/quotations/[id]/page.tsx`
- Modify: `app/admin/quotations/actions.ts`
- Modify: `app/admin/quotations/workflow-actions.ts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `lib/navigation/permission-destinations.ts`

**Interfaces:**
- Produces: `QUOTATION_VIEW_PERMISSIONS`, `resolveQuotationViewScope(role, permissions)`, `mustRestrictQuotationToCreator(role, permissions)`, and `requireQuotationView()`.
- Database: nullable `quotation_requests.created_by`; permission key `quotations.view_own`.

- [ ] Write tests for own-only scope, admin/broad compatibility, no implicit operation grants, additive migration safety, navigation, and scoped list/detail/action reads.
- [ ] Run the test and confirm it fails because the permission, creator field, and policy do not exist.
- [ ] Add the pure access policy and authenticated server wrapper.
- [ ] Add the migration without updates, grants, backfill, template assignment, or destructive statements.
- [ ] Set `created_by` on staff quotation creation and allow creators with own-view to return to the list.
- [ ] Apply creator filtering to list, manage, printable document, and every quotation mutation lookup for own-only viewers.
- [ ] Keep edit/approve/assign/reject/print/history/convert capability checks independent and require print for own-only printable access.
- [ ] Add navigation and permission-destination support.
- [ ] Run focused permission, quotation, and navigation tests until green.

### Task 4: Full local and production release gate

**Files:**
- Verify only; no unrelated edits.

**Interfaces:**
- Consumes all tasks above.
- Produces a tested commit, required production migration, Vercel deployment, and smoke-test report.

- [ ] Run all focused Quotation, Sales, CRM, permission, navigation, and database tests.
- [ ] Run `npm run test:standalone` and confirm zero failures.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` with production-compatible environment values.
- [ ] Run the local app and verify quick-create, auto-selection, type-ahead, own list/detail denial, broad access, and independent controls.
- [ ] Inspect the exact diff and confirm unrelated dirty workspace files are neither staged nor changed by this task.
- [ ] Dry-run and apply only `202608230003_quotation_view_own.sql`; compare production quotation/customer counts before and after.
- [ ] Deploy to Vercel only if all critical checks are green.
- [ ] Verify production routes, deployed database objects, zero ownership backfill, and absence of new runtime errors without creating live financial or customer test data.
