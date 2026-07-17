# Phase 3A authentication and navigation

Phase 3A is complete when registration, automatic customer profile creation, login/logout, role redirects, protected dashboards, and authentication-aware public navigation all pass lint and production build.

## Public header behavior

The public header reads the current Supabase session and `public.profiles` row on the server. Logged-out visitors see `Login`, `Create account`, and `Request a Quote`. Authenticated active users never see a `Login` link in the public header; instead they see the role dashboard link from centralized route/destination helpers:

- `admin` → `Admin Dashboard` → `/admin`
- `employee` → `Employee Dashboard` → `/employee`
- `customer` → `My Account` → `/account`

Authenticated users also see `Logout`. The mobile menu uses the same server-derived state while preserving Escape, click-outside, `aria-expanded`, and `aria-controls` behavior.

## Login and register redirects

`/login` and `/register` check for an active profile before rendering forms. Active users are redirected to their role destination. Missing or inactive profile states are handled safely by signing out or redirecting to a safe status message path instead of exposing protected dashboards.

## Dashboard navigation

Each protected dashboard includes a clearly visible `View Public Website` link and a visible `Logout` action. Dashboard titles reflect the active role: Admin Dashboard, Employee Workspace, or Customer Account.

## Role source of truth

Visible role/status values are read from `public.profiles`, not editable auth metadata. Registration does not expose role or status controls to end users.
