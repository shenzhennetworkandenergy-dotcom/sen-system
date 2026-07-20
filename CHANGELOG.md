# Changelog

## 2026-07-11

### Added

- Local development environment
- Next.js foundation
- Supabase connectivity
- GitHub workflow
- Vercel deployment
- Project foundation documentation
- Shared design-system foundation

## Phase 2 - Public Corporate Homepage

- Built the public SEN corporate homepage with enterprise hero, business categories, company introduction, featured solutions, sample product previews, benefits, industries, workflow, capabilities, brands/technologies and final CTA sections.
- Moved the existing Supabase environment verification experience from `/` to `/environment-check` while preserving the existing `environment_check` query.
- Expanded public navigation, footer groups, CTAs, business category and solution configuration in `config/site.ts`.
- Added homepage documentation and configured App Router metadata and icon references.

## Phase 3A - Authentication and Account Foundation

- Added Supabase registration, login, logout, customer profiles, role-aware dashboards, admin account management and final-active-admin protection.
- Corrected authenticated navigation caching and profile country fields.

## Phase 3B - Granular Permissions and Activity

- Added 22 permission modules, stable permission keys, templates, employee assignments and allow/deny overrides.
- Added centralized server permission guards, fixed-search-path database authorization functions and service-role-only account RPCs.
- Added admin permission templates, employee permission checklists, Team Activity, employee activity and permission-aware navigation.
- Extended safe audit logging for authentication, account access and permission administration.
