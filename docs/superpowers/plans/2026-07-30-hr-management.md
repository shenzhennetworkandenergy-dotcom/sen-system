# SEN Human Resources Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a complete, admin-controlled HR module with employee self-service, attendance and leave workflows, payroll, performance, reporting, and a device-ready attendance ingestion boundary.

**Architecture:** Extend the existing Supabase-backed identity, work-location, audit, and notification foundations with forward-only HR migrations. All HR administration routes require the `admin` role. Employees can access only their own HR profile, attendance, corrections, leave, and notifications. Mutations use validated server actions or a secured device route, while PostgreSQL constraints, RLS, and security-definer RPCs enforce the same rules in the main database.

**Tech Stack:** Next.js 16 App Router, React 19 server components/actions, TypeScript, Supabase PostgreSQL/Auth/Storage, Tailwind CSS, Node verification scripts.

## Global Constraints

- Preserve all existing SEN authentication, inventory, sales, purchasing, accounting, CRM, quotation, support, and public-site behavior.
- Add forward-only migrations; never rewrite an already-applied migration.
- Use `profiles` as the canonical account identity and `hr_employee_records` as the canonical employment record.
- Never store raw fingerprint images, face images, or reusable biometric templates.
- Do not push or create a pull request until the user verifies the local result.
- Use bounded queries and server-side pagination for employee lists.

---

## Task 1: Database foundation and failing verification

**Files:**
- Create: `scripts/verify-hr-management.mjs`
- Create: `supabase/migrations/202607300004_integrated_hr_management.sql`
- Modify: `package.json`

- [ ] Add static assertions for every required HR table, RPC, RLS policy, constraint, notification integration, and device-ingestion safeguard.
- [ ] Run `npm run test:hr-management` and confirm it fails before the migration exists.
- [ ] Add organization, employee profile, leave, correction, payroll, performance, document, and attendance-device tables.
- [ ] Extend existing HR tables without duplicating identity or employment records.
- [ ] Add soft-delete fields, indexes, unique constraints, self-service RLS, admin-only policies, fixed-search-path RPCs, and audit writes.
- [ ] Add a private `hr-documents` storage bucket and safe policies.
- [ ] Re-run the verifier until static and local-database checks pass.

## Task 2: Typed validation and data-access layer

**Files:**
- Create: `lib/hr/types.ts`
- Create: `lib/hr/validation.ts`
- Create: `lib/hr/admin.ts`
- Create: `lib/hr/self-service.ts`
- Modify: `lib/hr/data.ts`
- Create: `tests/hr-validation.test.mts`

- [ ] Write failing tests for employment dates, leave ranges, attendance timestamps, payroll amounts, device event identifiers, and pagination bounds.
- [ ] Implement parsers that return field-specific errors and normalized values.
- [ ] Implement `requireHrAdmin()` using the existing session layer and an explicit admin role check.
- [ ] Implement bounded admin directory/dashboard/detail queries.
- [ ] Implement employee self-service queries scoped to the authenticated profile.
- [ ] Run validation tests until they pass.

## Task 3: Route constants and navigation boundaries

**Files:**
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `app/employee/page.tsx`

- [ ] Add exact admin and employee HR route constants.
- [ ] Keep the HR administration navigation visible to admins only.
- [ ] Add a separate employee “My HR” navigation item requiring no admin permission.
- [ ] Add an employee HR summary card/link without exposing admin modules.

## Task 4: Admin HR dashboard and employee lifecycle

**Files:**
- Rewrite: `app/admin/hr/page.tsx`
- Create: `app/admin/hr/layout.tsx`
- Create: `components/hr/HrAdminNavigation.tsx`
- Create: `app/admin/hr/employees/page.tsx`
- Create: `app/admin/hr/employees/new/page.tsx`
- Create: `app/admin/hr/employees/[id]/page.tsx`
- Create: `app/admin/hr/employees/actions.ts`

- [ ] Build a compact admin dashboard with actionable counts and recent activity.
- [ ] Build paginated directory search/filter by name, employee number, department, designation, status, and location.
- [ ] Build validated employee creation linked to an existing employee/admin profile.
- [ ] Build profile editing for personal, employment, organization, manager, salary, and emergency details.
- [ ] Build deactivate, archive, and restore actions; preserve linked financial and operational records.
- [ ] Display document and activity history sections.

## Task 5: Organization structure

**Files:**
- Create: `app/admin/hr/departments/page.tsx`
- Create: `app/admin/hr/departments/actions.ts`

- [ ] Manage departments, teams, and designations with active/inactive states.
- [ ] Prevent unsafe deletion of referenced organization records.
- [ ] Preserve existing department compatibility.

## Task 6: Attendance and correction workflow

**Files:**
- Create: `app/admin/hr/attendance/page.tsx`
- Create: `app/admin/hr/attendance/actions.ts`
- Create: `app/admin/hr/attendance/corrections/page.tsx`
- Create: `app/employee/hr/page.tsx`
- Create: `app/employee/hr/attendance/page.tsx`
- Create: `app/employee/hr/attendance/corrections/new/page.tsx`
- Create: `app/employee/hr/attendance/actions.ts`

- [ ] Build admin daily attendance search, filters, manual entry, and CSV import.
- [ ] Enforce one attendance record per employee/date and valid status/timestamp combinations.
- [ ] Build employee personal attendance history.
- [ ] Build correction requests with reason and requested values.
- [ ] Build admin approve/reject actions that update attendance atomically and notify the employee.

## Task 7: Leave management

**Files:**
- Create: `app/admin/hr/leaves/page.tsx`
- Create: `app/admin/hr/leaves/actions.ts`
- Create: `app/employee/hr/leaves/page.tsx`
- Create: `app/employee/hr/leaves/new/page.tsx`
- Create: `app/employee/hr/leaves/actions.ts`

- [ ] Manage leave types and yearly employee balances.
- [ ] Build employee leave requests with overlap and balance validation.
- [ ] Build admin approval/rejection with balance consumption and notifications.
- [ ] Show employee balances, request history, and highlighted status updates.

## Task 8: Payroll and performance

**Files:**
- Create: `app/admin/hr/payroll/page.tsx`
- Create: `app/admin/hr/payroll/actions.ts`
- Create: `app/admin/hr/performance/page.tsx`
- Create: `app/admin/hr/performance/actions.ts`

- [ ] Build payroll period records, components, calculated totals, payment status, and CSV export.
- [ ] Build performance reviews and goals with rating/date validation.
- [ ] Keep salary and performance data admin-only.

## Task 9: Reports and settings

**Files:**
- Create: `app/admin/hr/reports/page.tsx`
- Create: `app/admin/hr/reports/attendance/route.ts`
- Create: `app/admin/hr/reports/leave/route.ts`
- Create: `app/admin/hr/reports/payroll/route.ts`
- Create: `app/admin/hr/settings/page.tsx`
- Create: `app/admin/hr/settings/actions.ts`

- [ ] Add employee, attendance, leave, department, and payroll report summaries.
- [ ] Add filtered CSV downloads and print-friendly report layouts.
- [ ] Add HR settings for attendance grace, working hours, leave year, and device-ingestion configuration.

## Task 10: Device-ready attendance boundary

**Files:**
- Create: `app/api/hr/attendance-events/route.ts`
- Create: `lib/hr/device-ingestion.ts`
- Create: `tests/hr-device-ingestion.test.mts`

- [ ] Validate device key, event identifier, external employee identifier, timestamp, event type, and optional metadata.
- [ ] Resolve active registered device and employee mapping.
- [ ] Deduplicate using device/event identifiers.
- [ ] Store normalized events and update attendance without biometric payloads.
- [ ] Return stable success/error responses suitable for a future fingerprint/camera gateway.

## Task 11: Documentation and full verification

**Files:**
- Rewrite: `docs/HR.md`
- Modify: `docs/PROJECT_PHASES.md`
- Modify: `docs/CHANGELOG.md`

- [ ] Document roles, routes, workflows, schema, device integration contract, privacy, and deployment order.
- [ ] Apply the migration to the local Supabase database only.
- [ ] Run HR unit/static/database checks.
- [ ] Run all existing regression suites.
- [ ] Run ESLint and production build.
- [ ] Start the local app, verify routes with HTTP requests, then test admin and employee workflows in a browser at desktop and mobile sizes.
- [ ] Confirm the working tree contains only intended local changes and report remaining limitations honestly.
