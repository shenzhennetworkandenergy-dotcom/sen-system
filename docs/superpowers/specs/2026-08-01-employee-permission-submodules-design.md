# Employee Permission Submodules Design

## Problem

Employee permission assignments are persisted correctly, and `employees.view` now exposes the Employees module. The remaining Employees permissions are not consumed by employee-facing routes: the employee detail page always renders the same read-only contact/workplace view and offers no permission, activity, or editing controls.

## Scope

Implement all six permissions in the Employees module:

- `employees.view`: searchable active employee directory and contact summaries.
- `employees.view_detail`: contact and workplace detail.
- `employees.edit_profile`: safe staff-profile editing without role, status, password, authentication metadata, or deletion controls.
- `employees.view_permissions`: read-only effective permission summary for another employee.
- `employees.manage_permissions`: edit another employee's active template and overrides; delegated managers cannot edit themselves.
- `employees.view_activity`: safe audit timeline for another employee.

Any one of these permissions makes the Employees navigation module visible. The directory adapts to the caller's permissions and shows only the links and data needed to reach granted submodules. Direct URLs and Server Actions independently re-check the exact permission.

## Security Boundaries

- Only active employee targets are available from delegated routes.
- Employees never receive Supabase Auth metadata, password controls, role/status changes, archive/delete controls, or unrestricted admin navigation.
- Delegated permission management is enforced in the database RPC as well as the Server Action.
- Non-admin managers cannot change their own permissions, preventing self-escalation.
- Every mutation re-reads the target and validates submitted permission/template identifiers before writing.
- Audit records identify the acting employee and target employee.

## UI and Data Flow

The employee directory is the module entry point. It requires any Employees permission and renders contact fields only for `employees.view`; otherwise it renders the minimum identity needed to choose a target. Each card exposes only granted actions.

The detail page is an adaptive hub. Contact/workplace, edit form, permission summary/editor, and activity link appear independently according to their exact keys. Dedicated permission and activity routes support focused use and direct-route testing.

## Verification

- Unit/source tests prove every Employees key maps to visible UI and an exact route/action guard.
- Local Supabase integration proves delegated permission updates succeed, self-updates fail, and unauthorized employees fail.
- Signed-in route tests grant one Employees permission at a time and verify allowed content plus denied sibling submodules.
- Full release gate, lint, TypeScript, production build, PR checks, Vercel deployment, and live role verification must all pass.
