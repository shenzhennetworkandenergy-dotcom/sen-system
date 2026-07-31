# HR Admin Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only permanent deletion of selected attendance records and employee documents behind the existing global deletion switch.

**Architecture:** A small pure validation module normalizes selected UUIDs and enforces deletion-mode gating. Attendance deletion uses one transactional database function; document deletion coordinates private storage removal and metadata deletion in the existing HR server-action module.

**Tech Stack:** Next.js 16 server actions, React server components, TypeScript, Supabase PostgreSQL and Storage, Node test runner.

## Global Constraints

- Preserve existing HR, authentication, Supabase, RLS, upload, attendance, and audit behavior.
- Do not expose deletion controls or execute deletion while Permanent Deletion Mode is disabled.
- Do not refactor unrelated files.

---

### Task 1: Deletion validation contract

**Files:**
- Create: `lib/hr/permanent-deletion.ts`
- Create: `tests/hr-permanent-deletion.test.mts`

**Interfaces:**
- Produces: `parsePermanentHrDeletion(modeEnabled: boolean, values: unknown[], maximum: number): string[]`

- [ ] Write tests proving disabled mode, malformed UUIDs, empty selection, duplicates, and bounds are handled.
- [ ] Run the focused test and confirm it fails because the module is missing.
- [ ] Implement the parser with strict UUID validation and deterministic errors.
- [ ] Run the focused test and confirm it passes.

### Task 2: Transactional attendance deletion

**Files:**
- Create: `supabase/migrations/202607310005_hr_admin_permanent_deletion.sql`
- Modify: `app/admin/hr/hr-actions.ts`
- Modify: `app/admin/hr/attendance/page.tsx`
- Test: `tests/hr-permanent-deletion.test.mts`

**Interfaces:**
- Database function: `admin_delete_hr_attendance(actor_profile_id uuid, requested_attendance_ids uuid[]) returns integer`
- Server action: `deleteAttendanceAction(form: FormData)`

- [ ] Add failing migration and page/action integration assertions.
- [ ] Confirm the tests fail because the function, action, and controls are absent.
- [ ] Add the guarded transactional function, server action, and selection controls.
- [ ] Confirm focused tests pass.

### Task 3: Selected employee document deletion

**Files:**
- Modify: `app/admin/hr/hr-actions.ts`
- Modify: `app/admin/hr/employees/[id]/page.tsx`
- Test: `tests/hr-permanent-deletion.test.mts`

**Interfaces:**
- Server action: `deleteEmployeeDocumentsAction(form: FormData)`

- [ ] Add failing tests for selected-document controls and storage/metadata removal wiring.
- [ ] Confirm the tests fail for the missing behavior.
- [ ] Implement ownership validation, storage removal, metadata deletion, audit logging, and UI selection.
- [ ] Confirm focused tests pass.

### Task 4: Production verification and delivery

**Files:**
- Verify all modified files.

- [ ] Run `npm run test:standalone`.
- [ ] Run `npm run lint`.
- [ ] Run the production build with the project environment.
- [ ] Run `npm run test:release`.
- [ ] Request independent code review and fix all Critical or Important findings.
- [ ] Commit, push, merge the pull request, wait for Vercel, and verify the deployed protected routes.
