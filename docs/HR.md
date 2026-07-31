# SEN Human Resources

## Purpose and access

The HR module uses the existing `profiles` account as identity and adds one
`hr_employee_records` row for employment data. HR administration is restricted
to administrators. Employees use `/employee/hr` for their own attendance,
correction requests, leave balances, leave requests, goals, and HR
notifications. They cannot read another employee's HR, salary, payroll,
performance, or document records.

## Admin routes

- `/admin/hr` — operational overview
- `/admin/hr/employees` — employee directory and lifecycle
- `/admin/hr/departments` — departments, teams, and designations
- `/admin/hr/attendance` — daily attendance and CSV import
- `/admin/hr/attendance/corrections` — correction approvals
- `/admin/hr/leaves` — leave types, balances, and approvals
- `/admin/hr/payroll` — payroll records and status
- `/admin/hr/performance` — reviews and goals
- `/admin/hr/reports` — protected CSV exports
- `/admin/hr/settings` — work rules and attendance device registration

## Employee routes

- `/employee/hr`
- `/employee/hr/attendance`
- `/employee/hr/attendance/corrections/new`
- `/employee/hr/leaves`
- `/employee/hr/leaves/new`

## Attendance CSV

Upload a UTF-8 CSV from the attendance page. Required headers are
`employee_number`, `work_date`, and `status`. Optional headers are `check_in`,
`check_out`, `timezone`, and `notes`. Timezone values use IANA names such as
`Asia/Dhaka`. Employee number and all rows are validated before
records are written.

## Fingerprint/camera device readiness

SEN does not store raw fingerprints, face images, or reusable biometric
templates. A future device or local gateway sends normalized events to
`POST /api/hr/attendance-events` with the `x-sen-device-key` header.

Example JSON:

```json
{
  "eventUid": "stable-device-event-id",
  "employeeExternalId": "device-employee-id",
  "eventType": "check_in",
  "occurredAt": "2026-07-30T01:00:00.000Z",
  "timezone": "Asia/Dhaka",
  "metadata": { "terminal": "front-door" }
}
```

The endpoint requires an active registered device and employee mapping,
deduplicates events, stores safe metadata, and updates daily attendance.
`occurredAt` is captured automatically by the device or gateway; administrators
do not choose device timestamps. The optional timezone takes priority over the
device location and employee schedule timezone. Earliest check-in, latest
check-out, scheduled-time snapshots, and signed early/late minute differences
are retained. Device
ingestion must be explicitly enabled in HR settings.

## Security and deployment

- HR tables use Row Level Security.
- Admin actions require an authenticated administrator.
- Self-service derives the employee from the signed-in profile.
- Employee archival preserves historical and linked records.
- HR documents use a private bucket and short-lived signed download URLs.
- Device keys are stored only as hashes and displayed once when created.
- Apply `202607300004_integrated_hr_management.sql` and
  `202607310001_hr_attendance_workforce_enhancements.sql` locally before hosted
  Supabase. Never commit service keys or device keys.
