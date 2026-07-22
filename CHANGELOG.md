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

## Inventory Administration

- Restored the complete grouped administrator navigation with honest Planned states and responsive desktop/mobile behavior.
- Added Supabase-backed simple and variable products, categories, brands, attributes, media metadata and safe bulk archive operations.
- Added multi-warehouse balances, atomic adjustments and transfers, movement history, serial tracking, inventory CSV export and permission-aware routes.
- Added additive inventory migrations, strict RLS, service-role-only stock RPCs, centralized stock-state calculation and audit activity labels.
- Added pre-deployment inventory integrity hardening for global SKUs, stock ownership, relationship constraints, adjustment direction, transactional product/category saves, and deterministic transfer locking.

## Inventory Modernization — Phase 1

- Added model numbers, sanitized rich product content, media purpose/visibility metadata, and immutable product revisions.
- Added pre-receipt SEN serial batches, optional normalized manufacturer serials, controlled regeneration history, Code 128/QR labels, CSV export, scan/search, and unit trace pages.
- Added work locations, employee primary workplace assignment, immutable event-location snapshots, and configurable tracking statuses.
- Added atomic serialized receipt, adjustment, and transfer RPCs with permission, balance, unit-count, history, and audit enforcement.
