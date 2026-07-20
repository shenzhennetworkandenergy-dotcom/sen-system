# Phase 3B: Permissions and Activity Foundation

## Scope

Phase 3B controls staff access without implementing the future ERP business modules. Public registration remains customer-only. An active administrator promotes an existing customer to employee and assigns an active template; Standard Employee is preselected and grants only `dashboard.view` and `activity.view_own`.

Administrators have full access automatically. Customers have no staff permissions. Suspended or disabled accounts have no protected access. The final active administrator cannot be downgraded or made inactive, and administrators cannot change their own role, status or permissions.

## Delivered interfaces

- `/admin/users` and `/admin/users/[id]`: account, employment, template, overrides and activity entry point.
- `/admin/permissions`: module catalogue and protected/custom template administration.
- `/admin/activity` and `/admin/activity/[userId]`: filtered, paginated team activity and account timelines.
- `/employee`: assigned template, permitted modules, effective count and recent activity.
- `/employee/activity`: the current employee's safe activity only.

## Database objects

The migration adds `app_modules`, `permissions`, `permission_templates`, `permission_template_items`, `profile_permission_templates` and `profile_permission_overrides`. It extends the existing `audit_logs` table; it does not create a competing audit system.

The authoritative permission order is inactive denied, active admin allowed, non-employee denied, explicit deny, explicit allow, template permission, then denied.

See `PERMISSIONS.md`, `ACTIVITY_AUDIT.md` and `DATABASE_DEVELOPMENT.md` for operational details.
