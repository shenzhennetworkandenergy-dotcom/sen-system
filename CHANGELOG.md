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

## Phase 3A — Authentication and Account Foundation

- Added Supabase Auth pages for registration, login, logout and contact-admin password help.
- Added central profiles/audit schema migrations, RLS policies and first-admin manual bootstrap SQL.
- Added admin, employee and customer dashboard foundations with role/status route guards.
- Documented authentication, admin bootstrap and local database development workflows.
