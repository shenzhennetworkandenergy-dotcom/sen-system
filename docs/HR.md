# Human Resources

## Scope

The HR module extends existing authenticated staff profiles rather than creating a second identity system. An HR employee record links one-to-one to `profiles` and adds an employee number, department, job title, employment terms, work location, manager and optional salary information.

The database also includes leave requests and daily attendance records. Leave review is implemented in the staff interface; attendance is a secured schema foundation for the next timekeeping phase.

Departments are reusable organizational records. Employee records may reference existing work locations and active staff profiles, preserving the platform's shared organization and authentication boundaries.

## Security

HR tables use Row Level Security. HR staff require `hr.view`; employee-record creation requires `hr.manage_employees`; leave approval or rejection requires `hr.manage_leave`. Sensitive mutations are performed through service-role-only database functions and generate central audit events.

## Route

The staff route is `/admin/hr`. Administrators have full access; employees see it only when their effective permissions allow it.
