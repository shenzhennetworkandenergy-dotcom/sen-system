# HR Attendance and Workforce Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver searchable HR employee selection, manual overtime statuses, ISO currency autocomplete, multi-file employee onboarding attachments, weekday work schedules, timezone-aware automatic attendance, variance labels, and reliable success/error feedback.

**Architecture:** Add one forward-only Supabase migration for schedule and attendance persistence, then keep calculation and validation rules in focused TypeScript modules shared by manual and device flows. Reusable client inputs handle employee search, currency suggestions, schedule editing, and “use current time,” while server actions remain authoritative for validation and persistence.

**Tech Stack:** Next.js 16 App Router and server actions, React 19, TypeScript, Supabase/PostgreSQL RLS and Storage, Node test runner, ESLint.

## Global Constraints

- `overtime` and `holiday_overtime` are manual attendance statuses.
- Weekday schedules support an “apply Monday to all working days” shortcut.
- Device timestamps are automatic; admin timestamps default to now but remain editable.
- Every attendance record preserves its IANA timezone and schedule snapshot.
- Currency suggestions use ISO 4217 but valid typed three-letter codes remain accepted.
- Employee onboarding accepts PDF, JPG, PNG, and WebP files, at most 10 MB each and 50 MB total.
- Existing migrations are immutable; add a new forward-only migration.
- Product catalogue currency remains fixed to BDT.

---

### Task 1: Shared HR and currency domain contracts

**Files:**
- Create: `lib/hr/attendance.ts`
- Create: `lib/currency/currencies.ts`
- Create: `tests/hr-attendance.test.mts`
- Create: `tests/currencies.test.mts`
- Modify: `lib/hr/types.ts`
- Modify: `lib/hr/validation.ts`
- Modify: `lib/hr/device-ingestion.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `attendanceStatuses`, `AttendanceStatus`, `parseEmployeeSchedule`, `calculateAttendanceVariance`, `formatAttendanceVariance`, `resolveAttendanceWorkDate`, `parseDeviceEvent`, `currencyOptions`, `normalizeCurrencyCode`, and `filterCurrencyOptions`.

- [ ] **Step 1: Write failing attendance and currency tests**

Cover exact manual statuses, weekday schedule validation, overnight end times, signed early/late variance, IANA timezone validation, timezone-derived work dates, ISO currency suggestions, uppercase normalization, and custom three-letter codes.

- [ ] **Step 2: Run tests and confirm expected failures**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/hr-attendance.test.mts tests/currencies.test.mts
```

Expected: failure because the new modules and exports do not exist.

- [ ] **Step 3: Implement minimal domain modules**

Use immutable option arrays, strict `HH:mm` and IANA validation, signed minute differences, and locale-independent work-date formatting through `Intl.DateTimeFormat(...).formatToParts()`.

- [ ] **Step 4: Extend existing HR validation and device parsing**

Use the shared status list in `parseAttendanceInput`. Add optional `timezone` to device input, returning a normalized IANA name or `null`.

- [ ] **Step 5: Run tests and existing HR tests**

Run:

```powershell
npm run test:hr-attendance-enhancements
npm run test:hr-management
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add package.json lib/hr lib/currency tests
git commit -m "feat: add attendance and currency domain contracts"
```

### Task 2: Schedule and timezone-aware attendance persistence

**Files:**
- Create: `supabase/migrations/202607310001_hr_attendance_workforce_enhancements.sql`
- Modify: `scripts/verify-hr-management.mjs`
- Modify: `tests/hr-attendance.test.mts`

**Interfaces:**
- Produces: `hr_employee_work_schedules`, attendance snapshot columns, `hr_replace_employee_schedule(...)`, and an updated `hr_record_attendance(...)`.
- Consumes: status values and variance semantics from Task 1.

- [ ] **Step 1: Add failing migration contract assertions**

Assert both new statuses appear in attendance and correction constraints; seven-row schedule persistence has RLS; attendance stores timezone, scheduled timestamps, and signed variance; functions remain service-role only.

- [ ] **Step 2: Run the HR verifier and confirm failure**

Run `npm run test:hr-management`.

Expected: failure identifying the missing enhancement migration contracts.

- [ ] **Step 3: Add the forward-only migration**

Drop constraints by discovered names, recreate expanded constraints, create the schedule table and index, add attendance columns, create RLS policies, and grant only the required read/service-role privileges.

`hr_replace_employee_schedule` validates the actor, employee, seven weekday objects, times, and timezone before replacing rows in one transaction.

`hr_record_attendance` resolves the employee schedule, snapshots scheduled timestamps, computes signed minute variance, and upserts the attendance row without overwriting manually chosen overtime statuses during device updates.

- [ ] **Step 4: Run static migration and unit verification**

Run:

```powershell
npm run test:hr-management
npm run test:hr-attendance-enhancements
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations scripts/verify-hr-management.mjs tests/hr-attendance.test.mts
git commit -m "feat: persist employee schedules and attendance variance"
```

### Task 3: Searchable selectors, schedule editor, and currency autocomplete

**Files:**
- Create: `components/forms/CurrencyCombobox.tsx`
- Create: `components/hr/EmployeeCombobox.tsx`
- Create: `components/hr/EmployeeScheduleEditor.tsx`
- Create: `lib/hr/form-options.ts`
- Modify: `lib/hr/operational.ts`
- Modify: `components/hr/EmployeeForm.tsx`
- Modify: `app/admin/hr/attendance/page.tsx`
- Modify: `app/admin/hr/payroll/page.tsx`
- Modify: `app/admin/hr/settings/page.tsx`
- Modify: `components/accounting/JournalForm.tsx`
- Modify: `components/crm/CrmForms.tsx`
- Modify: `app/admin/crm/actions.ts`
- Modify: `components/purchasing/SupplierForm.tsx`
- Modify: `components/purchasing/PurchaseOrderBuilder.tsx`
- Modify: `components/orders/OrderBuilder.tsx`
- Modify: `scripts/verify-hr-management.mjs`
- Create: `scripts/verify-currency-inputs.mjs`

**Interfaces:**
- Produces: `EmployeeCombobox({ employees, name, required })`, `CurrencyCombobox({ name, defaultValue, required, className })`, and schedule form fields `schedule_<weekday>_*`.
- Consumes: currency options and schedule parser from Task 1.

- [ ] **Step 1: Add failing source/UI contracts**

Assert operational employee options have no 100-row pagination, all relevant HR selectors use `EmployeeCombobox`, all editable currency-code fields use `CurrencyCombobox`, CRM passes the selected currency, and the employee form renders seven schedule rows.

- [ ] **Step 2: Run verifiers and confirm failure**

Run:

```powershell
npm run test:hr-management
node scripts/verify-currency-inputs.mjs
```

Expected: failures for missing shared components and integrations.

- [ ] **Step 3: Implement accessible shared inputs**

Use combobox semantics, keyboard navigation, click selection, outside-click close, hidden submitted values for employees, and typed uppercase values plus matching suggestions for currency. Keep native form submission and required validation.

- [ ] **Step 4: Load complete employee options**

Add `getHrEmployeeOptions()` selecting only IDs, numbers, and profile labels for every non-archived employee, ordered and capped at a defensive 5000 with an explicit error if the cap is reached.

- [ ] **Step 5: Integrate schedule and currency fields**

Replace affected inputs and remove hard-coded BDT labels where administrators can choose a currency. Preserve the intentionally fixed product catalogue field.

- [ ] **Step 6: Run verifiers, TypeScript, and lint**

Run:

```powershell
npm run test:hr-management
npm run test:currency-inputs
npx tsc --noEmit --allowImportingTsExtensions
npm run lint
```

Expected: no errors; pre-existing unrelated warnings may remain documented.

- [ ] **Step 7: Commit**

```powershell
git add components lib app scripts package.json
git commit -m "feat: add searchable workforce and currency inputs"
```

### Task 4: Employee creation attachments and reliable action outcomes

**Files:**
- Create: `lib/hr/documents.ts`
- Create: `lib/actions/outcome.ts`
- Create: `tests/hr-documents.test.mts`
- Create: `tests/action-outcome.test.mts`
- Modify: `components/hr/EmployeeForm.tsx`
- Modify: `app/admin/hr/hr-actions.ts`
- Modify: `app/employee/hr/actions.ts`
- Modify: `components/hr/HrPage.tsx`
- Modify: `scripts/verify-hr-management.mjs`

**Interfaces:**
- Produces: `validateEmployeeDocuments(files)`, `uploadEmployeeDocuments(...)`, `ActionOutcome`, `actionRedirect(path, outcome)`, and warning notice rendering.
- Consumes: employee schedule parser and database function from Tasks 1-2.

- [ ] **Step 1: Write failing document and redirect tests**

Cover accepted files, MIME/extension mismatch, per-file and total limits, filename sanitization, partial upload summaries, and the rule that redirects happen outside persistence catch blocks.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/hr-documents.test.mts tests/action-outcome.test.mts
```

Expected: failures because the modules do not exist.

- [ ] **Step 3: Implement validation and outcome helpers**

Keep helpers free of Next.js so unit tests exercise real logic. `actionRedirect` is the only function that calls `redirect()` and is never invoked inside a catch block.

- [ ] **Step 4: Integrate multi-file employee creation**

Add `multiple` file input `onboarding_documents`; prevalidate all files; save employee, personal profile, and schedule; upload files; return explicit success or warning counts. Do not upload before employee persistence succeeds.

- [ ] **Step 5: Repair HR redirect control flow**

Refactor employee save, attendance correction, and leave request actions so success redirects cannot be caught. Ensure database failures return clear user messages and never expose `NEXT_REDIRECT`.

- [ ] **Step 6: Run focused and HR tests**

Run:

```powershell
npm run test:hr-attendance-enhancements
npm run test:hr-management
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add app components lib tests scripts
git commit -m "feat: add onboarding files and clear HR outcomes"
```

### Task 5: Automatic/manual time capture and attendance presentation

**Files:**
- Create: `components/hr/AttendanceTimeFields.tsx`
- Modify: `app/admin/hr/attendance/page.tsx`
- Modify: `app/admin/hr/hr-actions.ts`
- Modify: `app/api/hr/attendance-events/route.ts`
- Modify: `lib/hr/operational.ts`
- Modify: `lib/hr/self-service.ts`
- Modify: `app/employee/hr/attendance/page.tsx`
- Modify: `app/employee/hr/attendance/corrections/new/page.tsx`
- Modify: `app/admin/hr/employees/[id]/page.tsx`
- Modify: `app/admin/hr/reports/attendance.csv/route.ts`
- Modify: `docs/HR.md`
- Modify: `scripts/verify-hr-management.mjs`

**Interfaces:**
- Produces: current-time controls, timezone submission, device timezone precedence, and shared variance labels.
- Consumes: scheduling/time utilities from Task 1 and persistence from Task 2.

- [ ] **Step 1: Add failing flow contracts**

Assert admin fields initialize from device time and timezone, allow overrides, device events never use server receipt time as the occurrence time, work dates use IANA timezone, and all record views display schedule variance.

- [ ] **Step 2: Run HR tests and confirm failure**

Run `npm run test:hr-management`.

Expected: failure for missing time-capture and presentation contracts.

- [ ] **Step 3: Implement admin time controls**

Initialize browser-local `datetime-local` strings on mount, provide independent “Use current time” buttons, submit an editable timezone, and leave times blank for statuses that do not require punches.

- [ ] **Step 4: Integrate authoritative server persistence**

Validate employee existence, time order, and timezone. Pass all values to the updated RPC. For device events, resolve device-location then employee-schedule timezone, derive the work date, and preserve earliest check-in/latest check-out.

- [ ] **Step 5: Show variance and timezone throughout HR**

Add clear status badges and exact minutes to admin daily attendance, employee attendance, employee detail, and CSV exports.

- [ ] **Step 6: Update documentation and run focused verification**

Run:

```powershell
npm run test:hr-attendance-enhancements
npm run test:hr-management
npx tsc --noEmit --allowImportingTsExtensions
```

Expected: all checks pass.

- [ ] **Step 7: Commit**

```powershell
git add app components lib docs scripts
git commit -m "feat: capture timezone-aware attendance automatically"
```

### Task 6: Full regression, build, and handoff

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/HR.md`

**Interfaces:**
- Produces: verified local feature branch and implementation report.
- Consumes: all earlier tasks.

- [ ] **Step 1: Review requirement coverage**

Check every design requirement against the diff and record any gap before verification.

- [ ] **Step 2: Run full relevant regression**

Run:

```powershell
npm run test:hr-attendance-enhancements
npm run test:hr-management
npm run test:accounting-hr
npm run test:crm
npm run test:purchasing
npm run test:sales
npm run test:currency-inputs
npx tsc --noEmit --allowImportingTsExtensions
npm run lint
npm run build
```

Expected: all runnable checks pass. If local Supabase is unavailable, separate source verification from live integration and report the unavailable service honestly.

- [ ] **Step 3: Inspect representative forms**

Run the offline site and inspect employee creation, attendance, payroll, accounting, CRM lead, supplier, purchase order, and sales order forms at desktop and mobile widths. Confirm no console errors, hidden controls, or overlay collisions.

- [ ] **Step 4: Update docs and commit**

```powershell
git add docs
git commit -m "docs: document workforce attendance enhancements"
```

- [ ] **Step 5: Confirm clean branch**

Run:

```powershell
git status --short
git log --oneline --decorate -8
```

Expected: clean worktree with feature commits only and no push.

