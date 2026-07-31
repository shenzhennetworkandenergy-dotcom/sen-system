# HR Attendance and Workforce Enhancements Design

## Goal

Improve HR administration by making every active employee selectable for attendance, adding manual overtime statuses, recording timezone-aware attendance against employee schedules, supporting multiple onboarding documents, standardizing editable currency fields, and replacing leaked Next.js redirect errors with clear operation results.

## Scope

This work covers:

- HR employee creation and editing.
- HR attendance entry, CSV import, employee correction requests, reporting, and device ingestion.
- Editable currency-code fields in HR, accounting, CRM, purchasing, and order administration.
- Success, partial-success, and failure feedback for employee creation and related HR actions.

Product catalogue currency remains fixed to BDT because it is intentionally enforced by existing inventory policy and is not an editable currency field.

## Employee Selection

Attendance will use a reusable searchable employee selector instead of a native select limited to the first 100 HR records. A lightweight query will load all non-archived employees needed by operational forms, ordered by employee name and number. The selector will search name, email, and employee number, retain a real hidden form value, expose keyboard navigation, and show a clear empty state.

The same selector will replace other HR operational employee dropdowns where the current 100-record limit can hide employees, including payroll and device mapping.

## Attendance Statuses

The manual attendance status set becomes:

- Present
- Absent
- Late
- Half day
- Remote
- Leave
- Holiday
- Overtime
- Holiday overtime

`overtime` and `holiday_overtime` are explicit manual choices. They are not inferred automatically. The database constraints, TypeScript types, server validation, CSV import, correction workflow, admin UI, employee UI, and reports will use the same status list.

## Employee Work Schedules

Each employee has a weekday schedule with one row per weekday:

- Weekday
- Working-day flag
- Start time
- End time
- IANA timezone

The employee form provides a compact Monday-to-Sunday editor and an “Apply Monday to all working days” control. New employees default to Monday-Friday using the global HR workday start/end and their selected work location timezone. If a location has no timezone, the fallback is `Asia/Dhaka`.

Schedules are saved only after the employee record exists. Editing an employee replaces that employee’s seven schedule rows atomically through a service-role database function. Overnight schedules are supported by treating an end time earlier than the start time as the following calendar day.

## Time Capture and Variance

Attendance timestamps remain `timestamptz` values so their absolute instants are preserved. Each attendance row also stores:

- The IANA timezone used to interpret the event.
- Scheduled start and end timestamp snapshots.
- Signed check-in variance in minutes.
- Signed check-out variance in minutes.

Negative check-in variance means early arrival; positive means late arrival. Negative check-out variance means early departure; positive means late departure. Zero means on time. A configured grace period affects the visual “on time” label but does not destroy the exact signed variance.

Snapshotting scheduled timestamps prevents historical attendance from changing when an employee’s future schedule changes.

Admin manual attendance defaults check-in and check-out controls to the current device time. “Use current time” controls refresh either value, while administrators may type another time. The browser supplies its IANA timezone, which remains editable through a searchable timezone field.

Device events use the submitted timestamp without requiring manual entry. The device payload may include an IANA timezone. When omitted, the registered device’s work-location timezone is used; if no device location exists, the employee schedule timezone is used; the final fallback is `Asia/Dhaka`. The work date is derived in that timezone rather than by slicing a UTC timestamp.

The attendance table, employee attendance history, employee detail history, and attendance CSV export display timezone plus readable arrival and departure labels such as “12 min early,” “On time,” or “8 min late.”

## Currency Input

A reusable `CurrencyCombobox` will use a maintained ISO 4217 code/name list. It accepts typed three-letter codes, converts them to uppercase, and shows matching suggestions by code, currency name, and country/region label.

It will replace editable currency inputs in:

- Employee salary.
- HR payroll.
- Accounting journals.
- CRM lead estimated value.
- Supplier default currency.
- Purchase orders.
- Administrative sales orders.

Server validation will continue to require a three-letter uppercase code. Existing saved values remain valid even if a withdrawn or private code is not in the suggestions, because administrators may type a code directly.

## Employee Attachments

The add-employee form accepts multiple PDF, JPG, PNG, and WebP files. Each file is limited to 10 MB, with a 50 MB total request limit. Uploaded files use the existing private `hr-documents` bucket and `hr_employee_documents` metadata table.

During creation:

1. Validate employee data, schedule, and all files.
2. Save the employee and personal profile.
3. Save the weekday schedule.
4. Upload each attachment and create metadata using its original filename as the title and `onboarding_attachment` as the document type.

If employee creation fails, no files are uploaded. If the employee is created but one or more uploads fail, uploaded files remain associated with the employee and the user receives an explicit partial-success message listing counts. The employee detail page continues to support categorized single-document uploads.

## Redirect and Feedback Reliability

Next.js redirect exceptions must never be caught as application errors. Server actions will:

- Catch only validation and persistence work.
- Convert expected failures into safe user-facing messages.
- Perform `redirect()` after the catch boundary.
- Use success, warning, or error query notices.

Employee creation messages distinguish:

- Employee created successfully.
- Employee created with a partial attachment failure.
- Employee creation failed and no employee was added.

The same pattern will repair HR employee self-service actions that currently call redirects inside broad `try/catch` blocks.

## Database Migration

A new forward-only migration will:

- Expand attendance and correction status constraints.
- Add `hr_employee_work_schedules`.
- Add timezone, schedule snapshot, and variance columns to `hr_attendance`.
- Add a secure service-role schedule replacement function.
- Update the secure attendance-recording function to compute and snapshot schedule variance.
- Preserve existing attendance rows and statuses.
- Add RLS policies and grants consistent with the integrated HR module.

No existing migration will be edited.

## Validation and Error Handling

- Employee selectors reject missing or archived employee IDs on the server.
- Currency codes require exactly three ASCII letters.
- Timezones must be accepted by `Intl.DateTimeFormat`.
- Schedule rows require valid weekday numbers and valid `HH:mm` times.
- File MIME type, extension, individual size, and total size are validated before persistence.
- Device events reject invalid timezone names and timestamps.
- Attendance check-out cannot precede check-in.
- Missing schedules retain attendance times but show “Schedule unavailable” rather than inventing variance.

## Testing

Tests will cover:

- Searchable employee option generation and no 100-row truncation.
- All attendance statuses across TypeScript, server validation, migration constraints, CSV, and corrections.
- Weekday schedule validation, overnight schedules, timezone conversion, work-date derivation, and signed variance.
- Device timezone precedence and automatic event timestamps.
- Currency autocomplete suggestions, free typing, normalization, and form adoption.
- Multi-file type and size validation plus partial upload reporting.
- Redirect control flow proving successful actions cannot surface `NEXT_REDIRECT`.
- Existing HR, accounting, CRM, purchasing, sales, lint, TypeScript, and production build verification.

