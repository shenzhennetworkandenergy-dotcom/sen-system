# Phase 3A Authentication

SEN uses Supabase Auth for email/password registration, login, logout, session handling and server-side route protection. Public registration has one path only: every new registrant becomes a `customer` profile with `active` status. Employee and admin roles are assigned later by administrators.

## Roles and status

Roles are `admin`, `employee` and `customer`. Status values are `active`, `suspended` and `disabled`. Suspended and disabled profiles may have sessions, but dashboard route guards block access and direct users to contact SEN.

## Routes

- `/register` creates a customer auth account and passes safe profile metadata to the database trigger.
- `/login` signs in with Supabase Auth and redirects by profile role: admin to `/admin`, employee to `/employee`, customer to `/account`.
- `/forgot-password` provides contact-admin guidance because automated password recovery and email verification are planned for a later phase.
- `/admin`, `/employee` and `/account` use server-side guards in `lib/auth/server.ts`.

## RLS

`public.profiles` and `public.audit_logs` enable RLS. Users can read their own profile. Admins can read all profiles and perform protected account updates through server-only actions. Ordinary users cannot read all audit logs or self-promote.

## Phase 3B

Granular employee module permissions, employee activity dashboards and ERP business workflows will be added in Phase 3B.
