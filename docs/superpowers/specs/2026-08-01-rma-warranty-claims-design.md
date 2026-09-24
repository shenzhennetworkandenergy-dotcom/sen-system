# RMA, Warranty Tracking, and Customer Claims Design

## Objective

Add a simple RMA module that connects customer orders, warranty coverage, SEN serial numbers, returned or damaged products, resolutions, notifications, permissions, and audit history through the existing Supabase database.

The customer entry point is the existing **My Account → Orders** area. Customers do not search the entire catalogue to open claims; they select an item that they actually purchased.

## Scope

The first release includes:

- Product-level default warranty configuration.
- Per-order-line warranty snapshots with an authorized staff override.
- Warranty activation when an order item is delivered or customer-received.
- Warranty visibility from customer order details.
- Customer warranty, damaged-item, and return claim submission.
- Optional claim attachments for images and supporting documents.
- A compact staff RMA dashboard, claim list, and claim detail workflow.
- Repair, replacement, refund, rejection, and closure resolutions.
- Customer notifications and complete audit history.
- Integration with existing products, sales orders, profiles, SEN serials, warehouses, inventory movements, permissions, and notifications.

The first release does not include repair-parts consumption, technician scheduling, supplier/manufacturer RMA forwarding, automated courier booking, or automatic financial refunds. Those can be added later without replacing the core claim records.

## Customer Experience

### Purchased products and warranty visibility

Inside **My Account → Orders → Order detail**, every delivered order item displays:

- Product name and image.
- Order number and purchase date.
- Delivered quantity.
- SEN serial number and manufacturer serial number when applicable.
- Warranty duration and terms captured when the order was placed.
- Warranty start and expiry dates.
- A status of `Active`, `Expiring soon`, `Expired`, `Claim in progress`, or `Resolved`.
- A **Claim warranty** action when an eligible unit or order item has no conflicting active claim.

An undelivered item cannot receive active warranty dates and cannot be submitted as a normal warranty claim. Authorized staff may create an exceptional claim with a mandatory audit reason.

### Claim form

The customer selects the purchased order item and, for serialized products, the exact SEN serial. The form contains:

- Claim type: warranty, damaged/defective, or return request.
- A required issue description.
- Quantity for non-serialized products, limited to the delivered quantity not already covered by another active claim.
- Optional image or document attachments.
- A confirmation showing the selected product, order, serial, and warranty eligibility.

After submission, the customer receives an RMA number and a notification. Customers can view only their own claims and attachments.

## Warranty Assignment and Activation

### Product defaults

Product create/edit screens include:

- Warranty enabled.
- Default duration in months.
- Warranty terms and exclusions.

These values are defaults for future sales and do not rewrite existing customer coverage.

### Sale and order snapshots

When an admin or permitted employee creates or confirms a sale, each product line receives a warranty snapshot. Staff can keep the product default or override the duration and terms for that sale line. An override is audited.

The snapshot protects historical accuracy when product defaults change later.

### Coverage activation

Warranty begins on the recorded delivery or customer-received date:

- Serialized products receive start and expiry dates for each allocated SEN serial.
- Non-serialized products receive coverage against the delivered order item and quantity.
- Coverage remains linked to the customer, order, order item, product, and serial where applicable.

Expired coverage remains visible. An admin may accept an exceptional out-of-warranty claim only with a recorded reason.

## Staff RMA Module

Add **RMA** to the dashboard navigation for admins and employees with effective RMA permissions.

### Dashboard and list

The compact RMA dashboard shows:

- New claims.
- Claims under review.
- Products awaiting return.
- Products received or under inspection.
- Resolutions in progress.
- Overdue open claims.
- Recently closed claims.

The claim list supports search by RMA number, customer, order number, product, SKU, SEN serial, or manufacturer serial, plus status, claim type, assignee, and date filters.

### Claim detail

One page displays the customer, order, product, serial, warranty eligibility, issue, attachments, return destination, assignee, internal notes, customer-visible notes, and chronological activity.

Only valid next actions appear. The visible workflow is:

1. Submitted
2. Under Review
3. Return Requested
4. Product Received
5. Resolution in Progress
6. Closed

The terminal resolution is one of:

- Repaired
- Replaced
- Refunded
- Rejected
- Damaged beyond repair / retired

Claims may move directly from review to a resolution when physical return is not required. Every nonstandard transition requires a reason.

## Database Design

### Warranty policy and snapshots

Extend products with structured warranty defaults while retaining the existing free-text warranty information for backward compatibility.

Extend sales order items with immutable warranty snapshot fields. Existing rows remain valid with warranty disabled until explicitly configured or backfilled.

Add `warranty_coverages` to represent activated customer coverage. Each row links to:

- Customer profile.
- Sales order.
- Sales order item.
- Product and optional variation.
- Optional SEN serial.
- Covered quantity for non-serialized items.
- Start and expiry dates.
- Terms snapshot and status.

Uniqueness rules prevent duplicate active coverage for the same serialized unit and inconsistent quantities for non-serialized items.

### RMA records

Add:

- `rma_claims`: RMA number, customer, coverage, order/product/serial references, type, issue, status, resolution, quantities, assignee, return warehouse/location, decisions, and timestamps.
- `rma_events`: append-only status and activity history with actor, visibility, message, and before/after metadata.
- `rma_attachments`: storage metadata, file type, size, uploader, and customer/internal visibility.

RMA numbers use a unique, database-generated sequence such as `RMA-2026-000001`.

### Atomic operations

Database functions perform claim submission, assignment, status transitions, receipt, resolution, and closure atomically. Each operation validates ownership or effective permission, writes the claim/event, records an audit entry, and creates customer notifications where required.

## Inventory and Serial Integration

Receiving a returned physical unit requires a designated RMA/service warehouse or location. The system records an inventory movement rather than silently modifying stock.

Serialized units move through RMA-aware states such as returned, under inspection, under service, replaced, available, or retired. Non-serialized returns update inventory through the same audited inventory movement architecture.

- Repaired units may return to the customer or available stock.
- Replacement links the original and replacement SEN serials.
- Refunded returned units remain in inspection, available, or retired stock based on the recorded decision.
- Destroyed or irreparable units are retired and cannot be allocated to another order.

No RMA action may directly bypass existing inventory balance, movement, or serial-allocation safeguards.

## Permissions and Security

Add an `rma` application module and focused permissions:

- `rma.view`
- `rma.create`
- `rma.review`
- `rma.assign`
- `rma.receive`
- `rma.resolve`
- `rma.close`
- `rma.manage_attachments`
- `rma.override_warranty`

Admins retain their existing active-admin bypass. Employees see the module and actions only when granted effective permissions. Customers may create and view only claims tied to their own authenticated profile and purchased order items.

RLS remains enabled on all new tables. Browser code never receives service-role credentials. Internal notes and internal attachments are never exposed to customers.

## Notifications

Customer notifications are created for:

- Successful claim submission.
- Additional information requested.
- Return requested.
- Returned product received.
- Claim approved or rejected.
- Repair, replacement, or refund decision.
- Claim closure.

Staff dashboard badges highlight new and overdue RMA work. Email delivery is optional infrastructure; in-account notifications are required in this release.

## Error Handling

User-facing forms return specific field errors without exposing database details. Important invalid cases include:

- The item does not belong to the authenticated customer.
- The order item is not delivered.
- Warranty is expired and no authorized override exists.
- A conflicting active claim already exists.
- Claimed quantity exceeds eligible delivered quantity.
- The serial is allocated to another customer or order.
- An invalid status transition is attempted.
- Inventory receipt or resolution cannot complete atomically.

Failed multi-record operations roll back completely and write no partial inventory or warranty state.

## User Interface Principles

- Reuse the current responsive dashboard and My Account design system.
- Keep the customer flow to product selection, issue details, attachments, and confirmation.
- Show plain-language warranty and claim status labels.
- Use a timeline for claim progress.
- Keep staff actions contextual instead of displaying every action simultaneously.
- Provide loading, success, empty, and actionable error states on desktop, tablet, and mobile.

## Backward Compatibility

- Existing products, orders, invoices, inventory, serials, permissions, authentication, and customer account behavior must remain functional.
- Existing free-text product warranty information is preserved.
- Existing sales orders without structured warranty snapshots continue to render.
- No unrelated route, database object, or UI component is renamed or removed.
- Existing functions are modified only where warranty snapshotting or claim integration requires a minimal extension.

## Verification and Acceptance

Verification must include:

- Migration application on the local Supabase environment.
- Database tests for constraints, RLS, permissions, atomic transitions, duplicate-claim prevention, notifications, warranty activation, and inventory/serial state changes.
- Application tests for product warranty defaults, sale-line overrides, customer order warranty display, claim submission, staff processing, and customer notifications.
- Admin and employee permission matrix tests.
- Customer ownership/isolation tests.
- Serialized and non-serialized claim flows.
- Repair, replacement, refund, rejection, and destroyed/retired resolutions.
- Responsive browser tests for the customer and staff workflows.
- `npm run lint`, the repository test suites, and `npm run build`.
- Local verification before any push.
- GitHub branch/PR verification after push.
- Vercel Preview deployment and authenticated end-to-end verification against a database containing the RMA migration.

The work is complete only when the database migration, application routes, permissions, local tests, GitHub changes, and Vercel Preview are all verified together. A green build without applying and exercising the RMA database schema is not sufficient.
