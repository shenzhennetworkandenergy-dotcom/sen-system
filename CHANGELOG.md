# Changelog

## 2026-07-22 — Inventory Modernization Phase 3 (offline)

- Added authoritative automatic SKU previews and validation, active brand/model duplicate detection, and identifier history.
- Added product-specific atomic serialized receiving and a prominent Serial Operations Centre with generator, regeneration, printing, scanning, batches, and export routes.
- Added visible main/gallery image upload and management through the existing secured product-media architecture.
- Added explicit foreground employee shipment location sessions and customer-safe freshness-aware tracking refresh.
- Added the Phase 3 local migration and verification suite. No GitHub push, hosted database migration, or Vercel deployment was performed.

## 2026-07-22 — Inventory Modernization Phase 2

- Added customer addresses, staff-created orders, immutable commercial snapshots, stock reservations, exact serial allocation, packing, multiple partial shipments, dispatch, delivery, and customer-safe tracking.
- Added responsive staff order/shipment workspaces and the customer Order Centre with safe serial and restricted-document visibility.
- Added estimated China-to-Bangladesh route visualization with recorded checkpoints, explicit non-live-GPS language, reduced-motion support, and no paid map dependency.
- Added additive database migrations, service-role-only operational RPCs, granular permissions, RLS, audit events, static verification, and a rollback-only end-to-end local SQL test.
- Repaired packing and work-location snapshot defects discovered by the transactional local acceptance test.

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
# 2026-07-22

### Fixed
- Qualified the employee actor in the Phase 3 location-recording RPC after rollback testing exposed an ambiguous PostgreSQL reference.
- Required `shipments.view` before employees can read customer-safe shipment location projections.
- Added a rollback-only Phase 3 database acceptance test covering product identity, serialized receiving, and location sessions.
