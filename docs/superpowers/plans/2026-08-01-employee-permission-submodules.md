# Employee Permission Submodules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every permission in the Employees module expose and enforce its corresponding employee-facing submodule.

**Architecture:** Use the existing employee directory as an adaptive permission hub, with focused permission/activity routes and thin Server Actions. Extend the existing atomic permission RPC to allow explicitly authorized employee managers while preventing self-escalation.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components/Actions, Supabase Postgres/RPC, TypeScript, Node test runner.

## Global Constraints

- Preserve admin behavior and existing employee routes.
- Never expose authentication metadata, role/status changes, passwords, or deletion controls to employees.
- Every route and mutation must enforce its permission server-side.
- Non-admin permission managers cannot modify their own permissions.

---

### Task 1: Employees permission contract

**Files:**
- Modify: `lib/navigation/dashboard.ts`
- Create: `lib/auth/employee-permission-submodules.ts`
- Test: `tests/employee-permission-submodules.test.mts`

- [ ] Write failing tests for all six Employees permission keys, navigation visibility, and submodule routes.
- [ ] Run the focused test and confirm the missing contract fails.
- [ ] Add the minimal shared Employees permission/route contract and navigation alternatives.
- [ ] Run the focused test and confirm it passes.

### Task 2: Adaptive directory and detail hub

**Files:**
- Modify: `app/employee/employees/page.tsx`
- Modify: `app/employee/employees/[id]/page.tsx`
- Create: `app/employee/employees/[id]/actions.ts`

- [ ] Add failing route/source assertions for permission-specific links, sections, and action guards.
- [ ] Implement permission-adaptive directory/detail rendering and safe profile editing.
- [ ] Verify exact-key controls and denied direct actions.

### Task 3: Permission and activity submodules

**Files:**
- Create: `app/employee/employees/[id]/permissions/page.tsx`
- Create: `app/employee/employees/[id]/activity/page.tsx`
- Modify: `components/activity/ActivityTable.tsx`
- Modify: `lib/auth/permissions.ts`
- Create: `supabase/migrations/202608010004_delegated_employee_permissions.sql`

- [ ] Add a failing database integration case for delegated permission updates and self-escalation prevention.
- [ ] Add read-only permission/activity pages with exact route guards.
- [ ] Add a permission-managed action and database authorization for delegated managers.
- [ ] Run the database and route tests until green.

### Task 4: End-to-end verification and delivery

**Files:**
- Modify: `scripts/verify-offline-permissions.mjs`

- [ ] Grant every Employees permission one at a time and verify its route/UI while sibling controls remain hidden.
- [ ] Run the full release gate, lint, TypeScript, and production build.
- [ ] Perform Critical/Important security review and resolve findings.
- [ ] Push a focused PR, merge after checks, deploy to Vercel, and verify the production role state and pages.
