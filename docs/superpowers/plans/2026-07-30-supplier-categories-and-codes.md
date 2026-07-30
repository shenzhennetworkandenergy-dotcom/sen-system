# Supplier Categories and Automatic Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlimited-depth supplier categories, optional brand assignment, and secure automatically generated supplier codes while preserving all existing supplier and purchasing behavior.

**Architecture:** A new additive Supabase migration owns hierarchy integrity, relations, RLS, and authoritative code generation. Small TypeScript helpers provide deterministic category paths and browser previews. Existing supplier pages consume centralized supplier options and server actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Node test runner, ESLint.

## Global Constraints

- Do not change unrelated working functionality.
- Keep existing supplier codes and purchase orders intact.
- Category depth is unlimited; cycles are forbidden.
- Supplier codes are server-generated, unique, and immutable unless an administrator explicitly regenerates one.
- Work locally only; do not commit or push.

---

### Task 1: Supplier-code rules

**Files:**
- Create: `tests/supplier-codes.test.mts`
- Create: `lib/purchasing/supplier-codes.ts`

**Interfaces:**
- Produces: `categoryCodeSegment(name: string): string`
- Produces: `supplierCodePrefix(path: string[]): string`
- Produces: `supplierCodePreview(path: string[], suffix?: number): string`

- [ ] Write tests for normalization, short names, special characters, unlimited paths, and five-digit suffixes.
- [ ] Run the test and confirm it fails because the module does not exist.
- [ ] Implement only the tested helpers.
- [ ] Run the test and confirm all cases pass.

### Task 2: Database hierarchy and supplier relations

**Files:**
- Create: `supabase/migrations/202607300002_supplier_categories_and_codes.sql`
- Create: `scripts/verify-supplier-categories.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `public.supplier_categories`
- Produces: `public.generate_supplier_code(uuid)`
- Adds: `public.suppliers.supplier_category_id`
- Adds: `public.suppliers.brand_id`

- [ ] Write a static verifier that requires the new objects, cycle guard, unlimited-level derivation, RLS, grants, and supplier relations.
- [ ] Run it and confirm failure before the migration exists.
- [ ] Add the migration with idempotent additive DDL, hierarchy triggers, RLS, indexes, and code generator.
- [ ] Run the static verifier and confirm it passes.

### Task 3: Category management

**Files:**
- Create: `app/admin/supplier-categories/actions.ts`
- Create: `app/admin/supplier-categories/page.tsx`
- Create: `app/admin/supplier-categories/[id]/page.tsx`
- Create: `components/purchasing/SupplierCategoryForm.tsx`
- Modify: `lib/purchasing/data.ts`
- Modify: `lib/constants/routes.ts`

**Interfaces:**
- Produces: `getSupplierCategories()`
- Produces: `createSupplierCategoryAction(form: FormData)`
- Produces: `updateSupplierCategoryAction(id: string, form: FormData)`

- [ ] Extend static verification to require both routes, permission guards, and actions.
- [ ] Run it and confirm the new assertions fail.
- [ ] Implement hierarchy loading, safe parent options, forms, and audited server actions.
- [ ] Run the verifier and targeted TypeScript checks.

### Task 4: Supplier form and actions

**Files:**
- Modify: `components/purchasing/SupplierForm.tsx`
- Modify: `app/admin/purchasing/actions.ts`
- Modify: `app/admin/suppliers/page.tsx`
- Modify: `app/admin/suppliers/[id]/page.tsx`

**Interfaces:**
- Supplier form consumes category paths and active brands.
- Supplier creation obtains its authoritative code from `generate_supplier_code`.
- Supplier update preserves the current code.
- Admin regeneration explicitly replaces the code and writes an audit record.

- [ ] Extend static verification for removed inputs, read-only code, category/brand selection, immutable update, and explicit regeneration.
- [ ] Run it and confirm the assertions fail.
- [ ] Implement the smallest compatible page and action changes.
- [ ] Run unit and static tests until green.

### Task 5: Local integration verification

**Files:**
- Modify only if a failing verification identifies a scoped defect.

- [ ] Start local Supabase and apply the new migration without resetting data.
- [ ] Verify arbitrary-depth category creation, cycle rejection, supplier creation, collision-safe code generation, saved-code immutability, and admin regeneration.
- [ ] Run `npm run test:purchasing`.
- [ ] Run `npm run test:supplier-categories`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Inspect `git status --short` and confirm no secrets or generated output are tracked.
- [ ] Report the exact results and leave all work local for user review.
