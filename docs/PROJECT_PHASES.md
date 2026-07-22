# SEN Platform Project Phases

## Completed foundations

- **Phase 0 — Environment setup:** local development, GitHub, Vercel and Supabase connectivity.
- **Phase 1 — Project foundation and design system:** shared architecture, UI primitives and project standards.
- **Phase 2 — Public corporate website:** enterprise homepage and public content foundation.
- **Phase 3A — Authentication and accounts:** Supabase registration, login/logout, customer profiles, customer/employee/admin roles, account statuses, protected dashboards and admin account management.

## Completed permissions foundation

### Phase 3B — Permissions and activity foundation

Granular employee permission keys, conservative templates, individual overrides, centralized route guards, account administration, safe audit logging, employee activity and administrator Team Activity.

Phase 3B defines access keys for future ERP modules but does not implement their business workflows or create mock operational data.

## Current phase

### Product and inventory administration

The private ERP now includes product administration, categories, brands, attributes, variations, multi-warehouse inventory, atomic stock adjustments and transfers, movement history, serial-number administration, and CSV export. These features reuse Phase 3B permission guards and audit logging. Public catalogue, import, purchasing, shipments, sales, and checkout remain out of scope.

### Inventory modernization — Phase 1 in review

Product model numbers, rich descriptions, classified media, individually generated SEN serials, optional manufacturer serials, labels, scanning, workplace snapshots, configurable tracking statuses, revision history, and serialized stock RPCs are implemented in the feature branch. The database migration and authenticated operational matrix must pass in an approved disposable environment before this phase can be marked complete.

## Future phases

1. Validated product/inventory CSV import and public product catalogue.
2. Suppliers, purchasing and China-to-Bangladesh logistics.
3. Sales, CRM and quotations.
4. Customer e-commerce, orders and service workflows.
5. Accounting, HR, manufacturing, projects, support and reporting.

Future routes must use the Phase 3B permission catalogue and server guards before accessing operational data.

## Offline review checkpoint — Inventory modernization Phase 2

Customer addresses, staff-created customer orders, reservations, exact serial allocation, packing, multiple partial shipments, dispatch, recorded tracking checkpoints, delivery, restricted documents, and the customer Order Centre are implemented on the offline Phase 2 branch. Local migrations and the rollback-only order-to-delivery database workflow pass. GitHub, hosted Supabase, and Vercel remain unchanged pending user review.
