# SEN Human Resources Management Design

**Date:** 2026-07-30  
**Status:** Approved for implementation planning  
**Scope:** Integrated HR management for the existing SEN platform

## 1. Objective

Build a production-ready Human Resources module inside the existing SEN application. The module must manage more than 5,000 employees while remaining simple enough for non-technical administrators.

The HR module is not a standalone application. It reuses the existing:

- Next.js application and dashboard shell
- Supabase project and main database
- `profiles` identity records
- authentication cookies and session helpers
- administrator role
- employee permission and self-service boundaries
- central audit log
- responsive design system

No duplicate authentication system or independent employee identity database will be introduced.

## 2. Access Model

### Administrators

Only active SEN administrators can access HR administration routes. Administrators manage:

- employee records and lifecycle
- departments, teams and designations
- attendance and attendance corrections
- leave types, balances and approvals
- payroll information
- employee documents
- performance reviews
- HR reports and exports
- future attendance devices

The existing `admin` account role is the sole HR administration role. The proposed HR Manager, HR Staff and Department Manager roles are intentionally excluded.

### Employees

Active employees receive limited self-service access in their existing employee account. Employees can:

- view their own HR profile
- view their attendance history and summary
- request an attendance correction
- apply for leave
- view leave balances, requests and decisions
- view notifications related to their HR requests

Employees cannot view other employees, payroll details, administration reports or HR configuration.

## 3. Delivery Strategy

The module will be delivered in verified phases.

### Phase A — HR foundation and employee management

- focused HR dashboard
- employee directory with server-side search, filters and pagination
- employee creation, editing, viewing, deactivation and soft deletion
- personal and employment information
- departments, teams and designations
- manager and work-location assignment
- employee documents
- employee activity timeline

### Phase B — Attendance and leave

- daily attendance
- manual entry and bulk CSV import
- attendance statuses and summaries
- employee attendance-correction requests
- administrator approval and rejection
- leave types and leave balances
- employee leave applications
- administrator leave decisions and comments
- daily, monthly and department reports

### Phase C — Payroll, performance and reporting

- payroll records with salary, allowance, bonus and deduction components
- payroll status and salary history
- performance reviews, ratings, comments and goals
- employee, attendance, leave, department and payroll reports
- CSV, Excel and print/PDF-compatible exports

### Phase D — Physical attendance devices

- attendance-device registry
- device-to-work-location assignment
- external employee identifier mapping
- secure attendance-ingestion API
- duplicate-event prevention
- device synchronization status and health
- support for fingerprint, face/camera and card verification

The exact physical-device connector will be implemented after a device is selected.

## 4. Information Architecture

### Administrator routes

- `/admin/hr` — HR overview
- `/admin/hr/employees` — employee directory
- `/admin/hr/employees/new` — employee creation
- `/admin/hr/employees/[id]` — employee profile and history
- `/admin/hr/attendance` — daily and monthly attendance
- `/admin/hr/attendance/corrections` — correction approvals
- `/admin/hr/leaves` — leave requests and decisions
- `/admin/hr/departments` — departments, teams and designations
- `/admin/hr/payroll` — payroll records
- `/admin/hr/performance` — reviews and goals
- `/admin/hr/reports` — HR reports and exports
- `/admin/hr/settings` — leave types and future device settings

### Employee self-service routes

- `/employee/hr` — personal HR overview
- `/employee/hr/attendance` — own attendance
- `/employee/hr/attendance/corrections/new` — correction request
- `/employee/hr/leaves` — own leave balances and history
- `/employee/hr/leaves/new` — leave application

All administrator pages require an active administrator session. All employee pages scope records to the current authenticated profile.

## 5. Data Model

### Existing records retained

- `profiles` remains the canonical account and identity record.
- `hr_employee_records` remains the one-to-one HR extension of a staff profile.
- `hr_departments`, `hr_leave_requests` and `hr_attendance` are extended rather than replaced.
- `audit_logs` remains the central activity history.
- `work_locations` remains the shared location reference.

### New or extended HR records

- `hr_employee_profiles` — date of birth, gender, address and emergency details not already stored on the account profile
- `hr_teams` — teams within departments
- `hr_designations` — reusable job titles/designations
- `hr_leave_types` — configurable leave definitions
- `hr_leave_balances` — yearly employee leave entitlements and usage
- `hr_attendance_correction_requests` — requested and reviewed attendance changes
- `hr_payroll_records` — period-based payroll summaries
- `hr_payroll_components` — allowance, bonus and deduction lines
- `hr_performance_reviews` — review header, rating and comments
- `hr_performance_goals` — goals attached to reviews or employees
- `hr_employee_documents` — private file metadata and access records
- `hr_attendance_devices` — future device registry
- `hr_device_employee_mappings` — external device identifiers mapped to employees
- `hr_attendance_events` — normalized device/manual ingestion events

Relationships use foreign keys. Operational records use restrictive deletion rules. Employee lifecycle removal uses soft-deletion fields so finance, sales, purchasing, payroll and audit references remain valid.

## 6. Employee Lifecycle

An employee record is created only for an existing active `employee` or `admin` profile. Creation assigns an immutable employee number.

Supported employment states:

- probation
- active/permanent
- on leave
- inactive
- terminated

Deactivation blocks new operational HR activity but preserves history. Soft deletion archives the employee record and excludes it from default lists. Restoring an archived record is an administrator action.

## 7. HR Dashboard

The dashboard prioritizes information an administrator can understand within five seconds:

- total active and inactive employees
- present, absent, late and on-leave counts for today
- probation, permanent and newly joined employee counts
- employee count by department
- pending leave approvals
- pending attendance corrections
- quick links to add an employee, review leave, view attendance and open reports

Charts are used only where they improve comprehension, such as department distribution. All summary queries are bounded and calculated in the database.

## 8. Attendance

Attendance has one normalized workflow regardless of its source:

```text
Manual form / CSV import / future device
                    ↓
Normalized attendance event
                    ↓
Validation and duplicate detection
                    ↓
Daily attendance record
                    ↓
Summary, review and audit history
```

Supported daily statuses:

- present
- absent
- late
- half day
- leave
- holiday
- remote

Manual entries, corrections and imports record the acting administrator. Employee correction requests never modify attendance directly; approval applies the correction in a transaction and records both before and after values.

Bulk CSV import validates every row before mutation and returns a row-level error report.

## 9. Future Fingerprint and Camera Integration

The initial release provides manual and CSV attendance while keeping a stable device adapter boundary.

The future local connector will:

1. read events from the selected device SDK, API or export mechanism;
2. authenticate with a dedicated device credential;
3. map the external employee identifier to an SEN employee;
4. submit a normalized attendance event;
5. retry safely when internet access is unavailable;
6. retain an immutable external event reference for deduplication.

Supabase stores attendance facts, device metadata, synchronization information and optional compressed verification-image references. Raw fingerprint images are never stored in the main database. Biometric templates remain encrypted on the device or its approved local controller.

## 10. Leave

Administrators configure leave types and annual entitlements. Employees submit leave applications from their accounts. An administrator approves or rejects a pending request with an optional comment.

Approval:

- verifies sufficient balance when applicable;
- records the reviewing administrator and time;
- updates the employee leave balance transactionally;
- marks relevant attendance dates as leave when appropriate;
- creates a notification for the employee;
- records an audit event.

Rejected and cancelled requests do not consume leave balance.

## 11. Payroll

Payroll is an HR information module, not a replacement accounting system.

Each payroll period stores:

- basic salary
- allowances
- bonuses
- deductions
- net amount
- currency
- payment status
- payment date/reference

Salary changes create history rather than overwriting prior records. Payroll information is admin-only. Future accounting integration may post summarized payroll journals through the existing accounting module, but that is outside the initial payroll scope.

## 12. Documents

Employee documents use a private Supabase Storage bucket. Database records store:

- employee
- document category
- original and stored filename
- MIME type and size
- storage path
- issue and expiry dates
- uploader and timestamps
- archived status

Downloads use short-lived signed URLs generated server-side after authorization. Upload size and accepted MIME types are validated.

## 13. Performance

Administrators create reviews containing:

- employee and reviewer
- review date and period
- numeric rating using one consistent scale
- comments
- review status
- goals and target dates

Edits preserve audit history. Historical reviews are read-only after finalization unless explicitly reopened by an administrator.

## 14. Security and Database Behavior

- Row Level Security is enabled on all HR tables.
- Administrators access HR administration through server-side authorization and service-role database functions.
- Employees can read only their own permitted HR records.
- Employees can insert only their own leave and correction requests through validated server actions or restricted functions.
- Sensitive database mutations are transactional and audit logged.
- Salary and private documents never reach unauthorized browser payloads.
- Database functions use a fixed `search_path`.
- Input lengths, enum values, dates, numbers and foreign keys are validated.
- No raw database errors, credentials or biometric data are displayed to users or written to unsafe logs.

## 15. API and Server Architecture

The existing application favors server components, server actions and Supabase functions. The HR module follows that pattern instead of adding a parallel REST framework.

Where machine-to-machine integration is necessary, such as future attendance devices, dedicated API routes will:

- authenticate the device or connector;
- validate a versioned request schema;
- apply rate limiting and idempotency;
- call transactional database functions;
- return stable status and error codes.

Internal data access is centralized under `lib/hr/`. UI components do not scatter direct privileged queries throughout pages.

## 16. Performance

- employee lists use database pagination, never load all employees;
- search fields use normalized indexed columns;
- attendance queries require bounded date ranges;
- dashboard counts use aggregate database functions;
- reports run with filters and bounded exports;
- large tables render responsive summaries on small screens;
- documents and profile images are lazy loaded;
- repeated reference data such as departments and designations is loaded once per request.

The system is designed for 5,000+ employee records and substantially larger attendance history.

## 17. Error Handling

- forms identify the exact invalid field and preserve safe submitted values;
- duplicate employee/profile assignments return a clear message;
- bulk imports return row-level validation errors;
- partial database writes are prevented through transactions;
- unavailable reporting or storage services display recoverable error states;
- empty states distinguish no records from failed queries;
- failed approvals never silently change balances or attendance.

## 18. Testing and Acceptance

Each delivery phase must include:

- database migration verification on local Supabase
- permission and Row Level Security checks
- server action and database-function tests
- employee/admin route-guard tests
- input-validation tests
- responsive checks for desktop, tablet and mobile
- lint and production build
- regression checks for authentication, permissions, dashboard navigation, users, inventory, purchasing, sales, accounting and CRM

The work remains local until the user verifies it. No branch is pushed or pull request created without explicit instruction.

## 19. Out of Scope Until Hardware Selection

- vendor-specific fingerprint SDK code
- face-recognition model selection
- camera firmware
- biometric-template storage or matching
- direct LAN communication with an unknown attendance device

The device-neutral schema and ingestion boundary are included so these can be added without redesigning HR.
