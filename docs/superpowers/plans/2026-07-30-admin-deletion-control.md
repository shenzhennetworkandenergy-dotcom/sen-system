# Admin Deletion Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-controlled permanent deletion mode, central archive, and consistent archive/permanent-delete behavior for products and users.

**Architecture:** A singleton database setting determines the deletion policy on the server. A focused deletion-policy library provides typed decisions, while server actions re-authorize every mutation and register archived records in a central archive index. Existing product/profile archive fields remain the source of truth for visibility and restoration.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL, Node test runner.

## Global Constraints

- Every active administrator can change Permanent Deletion Mode.
- Permanent mode must never be trusted from client input.
- Audit logs are immutable and never included in permanent deletion.
- The current administrator and final active administrator remain protected.
- Existing unrelated project changes must be preserved.
- New behavior is developed test-first.

---

### Task 1: Deletion policy and database foundation

**Files:**
- Create: `lib/deletion/policy.ts`
- Create: `tests/deletion-policy.test.mts`
- Create: `supabase/migrations/202607300005_admin_deletion_control.sql`

**Interfaces:**
- Produces: `resolveDeletionOperation(permanentEnabled: boolean): "archive" | "permanent"`
- Produces: `system_settings` singleton and `archive_entries` table

- [ ] **Step 1: Write failing policy tests**

Test that disabled mode resolves to `archive` and enabled mode resolves to `permanent`.

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/deletion-policy.test.mts`.

- [ ] **Step 3: Implement the minimal pure policy helper**

Create the server-independent helper with the exact boolean-to-operation mapping.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Node test command and require zero failures.

- [ ] **Step 5: Add the database migration**

Create the singleton setting, archive index, constraints, indexes, RLS, service-role grants, and default row.

### Task 2: Server-side data-management service

**Files:**
- Create: `lib/deletion/settings.ts`
- Create: `lib/deletion/archive.ts`
- Create: `tests/archive-records.test.mts`

**Interfaces:**
- Consumes: `resolveDeletionOperation`
- Produces: `getDeletionMode()`, `registerArchiveEntry()`, `removeArchiveEntry()`

- [ ] **Step 1: Write failing archive-shaping tests**

Test stable entity keys, trimmed labels/reasons, and bounded metadata passed to the archive service.

- [ ] **Step 2: Run the focused tests and verify failure**

Run the deletion test files with Node's test runner.

- [ ] **Step 3: Implement minimal typed helpers and server-only database access**

Keep pure normalization separate from Supabase calls so behavior is directly testable.

- [ ] **Step 4: Run the focused tests and verify passing**

Require zero failures.

### Task 3: Data Management settings screen

**Files:**
- Create: `app/admin/settings/data-management/actions.ts`
- Create: `app/admin/settings/data-management/page.tsx`
- Create: `components/settings/PermanentDeletionToggle.tsx`
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`

**Interfaces:**
- Consumes: `getDeletionMode()`
- Produces: admin-only setting mutation and visible settings page

- [ ] **Step 1: Write a failing verifier for route, authorization, and warning behavior**
- [ ] **Step 2: Run it and verify failure**
- [ ] **Step 3: Implement the settings page and audited server action**
- [ ] **Step 4: Re-run the verifier and require success**

### Task 4: Product deletion and restoration

**Files:**
- Modify: `app/admin/products/actions.ts`
- Modify: `app/admin/products/[id]/page.tsx`
- Create: `lib/deletion/product.ts`
- Extend: `tests/deletion-policy.test.mts`

**Interfaces:**
- Consumes: deletion mode and archive registry
- Produces: archive-when-disabled, permanent-delete-when-enabled, and product restore

- [ ] **Step 1: Write failing product-decision tests**
- [ ] **Step 2: Run and verify the expected failure**
- [ ] **Step 3: Connect the product action to the server-side setting**
- [ ] **Step 4: Register archives and clear entries after permanent deletion or restoration**
- [ ] **Step 5: Run focused tests and the inventory admin-control verifier**

### Task 5: User deletion and restoration

**Files:**
- Modify: `app/admin/users/[id]/actions.ts`
- Modify: `app/admin/users/[id]/page.tsx`
- Create: `lib/deletion/user.ts`
- Extend: `tests/deletion-policy.test.mts`

**Interfaces:**
- Consumes: deletion mode and archive registry
- Produces: archive-when-disabled, permanent-delete-when-enabled, protected-admin rules, and user restore

- [ ] **Step 1: Write failing user-decision tests**
- [ ] **Step 2: Run and verify failure**
- [ ] **Step 3: Connect user removal to deletion mode without weakening administrator protections**
- [ ] **Step 4: Register archives and support safe restoration**
- [ ] **Step 5: Run focused tests and the inventory admin-control verifier**

### Task 6: Central Archive page

**Files:**
- Create: `app/admin/archive/actions.ts`
- Create: `app/admin/archive/page.tsx`
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`

**Interfaces:**
- Consumes: `archive_entries`, product restore, and user restore
- Produces: searchable archive listing and restore controls

- [ ] **Step 1: Add failing route and behavior verification**
- [ ] **Step 2: Run and verify failure**
- [ ] **Step 3: Implement the admin-only archive list with entity and text filters**
- [ ] **Step 4: Add restore controls and conditional permanent-delete controls**
- [ ] **Step 5: Re-run verification**

### Task 7: Full verification

**Files:**
- Modify: `package.json`
- Create: `scripts/verify-admin-deletion-control.mjs`

**Interfaces:**
- Produces: repeatable `npm run test:admin-deletion`

- [ ] **Step 1: Run `npm run test:admin-deletion`**
- [ ] **Step 2: Run `npm run test:inventory-admin-controls`**
- [ ] **Step 3: Run `npm run lint`**
- [ ] **Step 4: Run `npm run build`**
- [ ] **Step 5: Review `git diff --check` and `git status --short`**
