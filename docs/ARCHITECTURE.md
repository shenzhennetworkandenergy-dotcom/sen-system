# SEN Platform Architecture

## Platform Purpose

The SEN Platform is planned as one scalable system for Shenzhen Energy & Networks. It will grow from the current public foundation into a corporate website, product catalogue, e-commerce experience, customer portal and internal ERP.

## Application Boundaries

### Public Website

The public website owns marketing, company information, public product discovery and contact-oriented content. It must not contain privileged customer, employee or operational data.

### Customer Portal

The customer portal will eventually own authenticated customer workflows such as account information, quotations, orders, warranty requests and service visibility. No portal authentication or permissions are implemented in Phase 1.

### ERP

The ERP boundary now owns private product and inventory administration. Purchasing, suppliers, CRM, sales, delivery and reporting remain planned. ERP pages are separate from public marketing routes and use the Phase 3B server permission guards.

## Shared Application Foundations

Shared components belong in `components/ui` for primitive UI and `components/layout` for structural layouts. They must remain business-logic free, typed, reusable and server-compatible by default.

Feature-specific code should be organized by responsibility and route boundary as features are introduced. Shared utilities should live under `lib` only when they are general-purpose and not duplicated elsewhere.

## Next.js Route Strategy

The application uses the Next.js App Router under `app`. Future route groups should separate public, portal and ERP concerns without changing visible URLs unnecessarily. Server Components are the default for pages, layouts and shared components.

Client Components are exceptions and require a clear browser-side need such as local state, effects, browser APIs or event handlers. Client-only code must not import server-only utilities or secrets.

## Supabase Responsibilities

Supabase is the backend infrastructure for database and future authentication responsibilities. Shared Supabase clients must remain centralized under `lib/supabase` and should not be duplicated in feature folders. Privileged operations must remain server-side, and service-role keys must never be exposed to browser code.

## Environment Variable Security

Only explicitly public variables prefixed for browser use may be read by client-side code. Server secrets, database passwords, access tokens and service-role keys must not be committed, logged or exposed to browser bundles.

## Future Authentication and Roles

Authentication, authorization and role permissions are intentionally not implemented in Phase 1. Future portal and ERP work should define a central permission model before adding protected routes or business operations.

## Product and inventory architecture

Catalogue data is normalized across products, categories, brands, tags, reusable attributes, variations, media metadata, and assignments. `lib/inventory/products.ts` provides bounded product queries, while `lib/inventory/stock.ts` is the single application stock-status calculation.

Inventory is movement-led. Warehouse balances are never directly edited by browser clients; service-role-only, fixed-search-path RPCs atomically validate permission, update balances and serialized units, create immutable movement rows, and write audit events. RLS allows authorized reads but no arbitrary browser stock writes. Reservations and future movement types are schema foundations only.

The private `product-media` Storage bucket accepts bounded JPG, PNG, WebP, and PDF uploads through secured server actions. Storage paths are generated server-side.

Serialized inventory uses a durable unit identity independent of changing product display data. SEN identifiers are generated only in privileged database functions, issued identifiers are never edited in place, and regeneration reserves the previous value in append-only history. Serialized stock operations update unit state, aggregate balance, movement, history, workplace snapshot, and audit data atomically. Product descriptions are sanitized against an explicit allowlist before storage and again before public rendering.

## Infrastructure

## Order fulfilment and shipment tracking

Phase 2 connects customer orders to physical-unit inventory. Order confirmation creates warehouse reservations; serialized allocation selects exact units; packing accepts only assigned units; dispatch atomically updates quantities, reservations, movements, shipments, and serial state; delivery derives final order state. Multiple shipments may fulfil one order.

Commercial, product, address, route, and transport details are snapshotted so historical records remain stable. Customer routes filter by authenticated profile and expose only safe serial identity, explicitly customer-visible events, and restricted warranty/invoice documents. Operational maps are estimates built from recorded points, not live GPS.

Phase 3 adds explicit foreground delivery-location sessions rather than hidden employee tracking. High-frequency coordinates live in dedicated session/update tables; audit logs record only meaningful session transitions. Customer pages receive a filtered shipment projection with centralized freshness labels.

## Sales

The minimal Sales module is a commercial interface over the existing Phase 2 order and fulfilment source of truth. `sales_orders` is not duplicated. `create_minimal_sale` atomically creates the order, BDT totals, billing/delivery snapshots and auditable price adjustments. Confirmation and cancellation reuse existing inventory reservation functions; serial allocation, packing and shipments reuse the existing exact-unit workflow.

Payment and document records are append-oriented. Payment totals and statuses are recalculated in fixed-search-path server RPCs. Invoice and delivery-challan rows contain immutable snapshots so later catalogue or profile edits do not change issued records. Administrators can view all sales; employees are restricted by granular `sales.*` permissions and own/all scope; customers see only their own history.

- GitHub is the source of truth for source control and review.
- Vercel is the deployment infrastructure for the Next.js application.
- Supabase is the backend infrastructure for database and future authentication capabilities.

## Authentication and authorization

Phase 3A provides Supabase authentication and the `profiles` role/status model. Public registration always creates a customer. Only an active administrator can promote an existing account to employee or administrator.

Phase 3B adds stable `module.action` permission keys. Active administrators bypass employee permission rows. Active employees resolve access from one active template, then explicit allow or deny overrides; deny takes precedence. Customers and inactive accounts have no staff permissions.

Server pages and actions use the centralized helpers in `lib/auth/permissions.ts`. Dashboard navigation is configured in `lib/navigation/dashboard.ts`, but navigation visibility is never treated as authorization. The database remains authoritative through RLS, fixed-search-path functions and service-role-only transactional account RPCs.

The active dashboard shell is `components/dashboard/Shell.tsx`. `components/layout/DashboardShell.tsx` remains only as a compatibility re-export so there is one implementation.

Audit activity reuses `audit_logs`, extended with actor role, module, entity, safe description, and old/new summaries. Sensitive authentication values are neither selected for activity pages nor accepted by the central audit helper.
