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

## Phase 3A authentication/navigation completion

- Added server-authenticated public header and mobile menu states so logged-in users see a role-aware dashboard link and Logout instead of Login.
- Added authenticated `/login` and `/register` redirects to admin, employee, or customer dashboard destinations.
- Added protected dashboard shells with role-accurate titles and public website return navigation.
- Fixed SEN logo `next/image` sizing so CSS preserves the intrinsic aspect ratio.
- Documented Phase 3A completion behavior and remaining Phase 3B handoff notes.
