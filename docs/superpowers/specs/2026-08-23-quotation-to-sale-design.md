# Approved Quotation to Sale Integration Design

## Objective

Integrate the existing Quotation and Sales modules so an authorized user can record a customer outcome and create one draft Sale from one accepted quotation through the existing Sales creation interface. The integration must preserve internal approval as a separate business event, transfer the accepted commercial values, remain idempotent under retries and concurrency, and leave confirmation, inventory, invoice finalization, Stock Out, Accounting, and Shipment behavior unchanged.

## Existing Architecture and Verified Meanings

`quotation_requests` and `quotation_request_items` already store the customer, product and variation references, commercial snapshots, line and header discounts and taxes, address snapshots, terms, notes, expiry, internal approval/rejection metadata, and forward links to a converted order and invoice.

The current `approved` status is produced by a staff action protected by `quotations.approve`. It is internal company approval, not customer acceptance. The existing `accepted` and `declined` values have no controlled workflow or decision metadata. The existing direct conversion accepts either `approved` or `accepted`, creates a draft Sales order and an invoice document immediately, and marks the quotation `converted_to_invoice`.

Sales creation currently uses `/admin/sales/new`, `SaleBuilder`, `createSaleAction`, and the atomic `create_minimal_sale` database function. That function creates a draft only. Stock is reserved later by the existing `confirm_sales_order` path. Invoice finalization and Stock Out are later, separate operations and remain authoritative.

Quotation visibility resolves to `all` for administrators or employees with `quotations.view`/`quotations.view_all`, and to `own` for employees with only `quotations.view_own`. Own scope means `quotation_requests.created_by` equals the current employee.

## Business State Model

Keep the single existing `quotation_requests.status` field and extend its allowed values additively. Do not create a second status field.

The active staff-created quotation path is:

1. `draft` — created and editable, not issued, not convertible.
2. `approved` — internally approved by SEN; internal approval actor/time remains recorded.
3. `quoted` — issued/sent to the customer; displayed as “Issued”.
4. `accepted` — customer acceptance recorded by an authorized staff member.
5. `declined` — customer rejection recorded by an authorized staff member; displayed as “Rejected by Customer”.
6. `converted_to_sale` — one linked draft Sale has been created successfully.

Existing states remain valid for backward compatibility: `submitted`, `reviewing`, `additional_info_required`, `rejected` (internal rejection), `closed`, `expired`, and `converted_to_invoice` (legacy conversion). Existing rows are not rewritten.

Internal `approved` and `rejected` events remain distinct from customer `accepted` and `declined` events. Conversion eligibility requires `accepted`; internal approval alone is insufficient.

The database migration adds nullable issuance and customer-outcome metadata to `quotation_requests`:

- `issued_at`, `issued_by`
- `customer_accepted_at`, `customer_accepted_by`
- `customer_declined_at`, `customer_declined_by`
- `customer_decline_reason`

The `*_by` values identify the staff member who recorded the business event. Audit descriptions make clear that the customer outcome was recorded by staff, not necessarily performed by that staff member.

Accepted, declined, internally rejected, expired, and converted quotations are immutable through the normal quotation edit actions. Legacy converted quotations remain locked.

## Controlled Transitions

All workflow actions reauthenticate, reauthorize, reapply quotation visibility scope, validate the current state, and record an audit event.

- Create staff quotation: creates `draft`.
- Internal approve: allowed from `draft` or `reviewing`; requires `quotations.approve`.
- Internal reject: allowed before customer acceptance; requires `quotations.reject`.
- Issue/send: allowed from `approved`; requires existing `quotations.send`; writes issuance actor/time and changes status to `quoted`.
- Record customer acceptance: allowed from `quoted`, only while not expired; requires `quotations.record_customer_outcome`; writes acceptance actor/time and changes status to `accepted`.
- Record customer rejection: allowed from `quoted`; requires the same outcome permission, requires a reason, writes rejection actor/time/reason, and changes status to `declined`.
- Convert: allowed only from a non-expired `accepted` quotation with no converted order; requires `sales.create` and `quotations.convert_to_sale`.

Legacy customer-request states are preserved and are not bulk migrated. Existing generic status mutation must not be able to manufacture acceptance or conversion states; active workflow states are changed only by their dedicated actions.

## Permissions

Reuse existing permissions where their meaning matches:

- `quotations.approve` — internal approval
- `quotations.reject` — internal rejection
- `quotations.send` — issue/send
- `quotations.view_own`, `quotations.view`, `quotations.view_all` — visibility
- `sales.create` — permission to create a draft Sale

Add two non-overlapping permissions:

- `quotations.record_customer_outcome` — record customer acceptance or rejection
- `quotations.convert_to_sale` — create one linked draft Sale from an accepted quotation

The legacy `quotations.convert_to_invoice` permission and database function remain for historical compatibility but are removed from the active UI and active Server Action path. They are not treated as authorization for the new workflow.

UI visibility is convenience only. The selection page, type-ahead action, prefill loader, final Server Action, and database conversion function each enforce their applicable permissions and resource scope. Administrators retain the existing active-admin bypass behavior.

## Sales Entry Points and Selection

The Sales dashboard keeps the existing **Create Sale** action unchanged and adds **Create Sale from Quotation** only for users with both required permissions.

The conversion entry opens a dedicated selection page. A debounced, bounded type-ahead searches eligible quotations by:

- exact or partial quotation reference, with the reference displayed first;
- customer name;
- customer company;
- customer email as an additional safe reference.

Search results include only accepted, non-expired, unconverted quotations inside the caller’s quotation visibility scope. Server responses contain only fields needed for selection. The quotation manage page uses the same workflow by linking directly to the Sales creation page with the selected quotation ID.

## Review-First Prefill

Selecting a quotation opens the existing `/admin/sales/new` page and existing `SaleBuilder` with a typed initial-value object. The manual route without a quotation continues to render the current empty defaults.

Prefill transfers:

- the existing customer ID and safe display/contact data;
- existing billing and delivery address IDs/snapshots where compatible;
- product ID, variation ID, SKU/display snapshots, quantity, quotation unit price, line discount, line tax, and calculated line total;
- quotation header discount and tax;
- `required_by` as expected delivery date;
- customer notes and compatible internal notes.

Quotation payment terms, delivery information, and terms and conditions are shown in a read-only source-quotation summary. They are not copied into unrelated Sales fields. Quotation shipping and service charges do not exist, so no value is invented.

The selected quotation ID is carried as untrusted form input and revalidated on submission. Selecting, searching, or importing performs no database mutation and creates no reservation, invoice, Stock Out request, or inventory movement.

The quotation customer is fixed for conversion. Product, quantity, and commercial editing uses the existing Sales controls. The accepted quotation values are the commercial baseline: carrying them into Sales does not require a catalogue-price override permission. Changes made after import continue to require the existing Sales change-price and discount permissions as applicable. The original quotation is never changed to reflect Sales edits.

## Atomic and Idempotent Creation

The conversion submit uses a dedicated Server Action that shares the existing Sales input parsers and validation rules. It requires `sales.create` and `quotations.convert_to_sale`, validates visibility, and calls one database function.

The additive database function performs one transaction:

1. Verify the actor is active and holds both permissions.
2. Lock the quotation row with `FOR UPDATE`.
3. Enforce administrator/all/own quotation visibility at the database boundary.
4. If the quotation already has `converted_order_id`, return that existing Sale ID.
5. Require `accepted`, a non-expired date, an active existing customer, valid catalogue-linked items, and a matching requested customer.
6. Validate requested commercial changes against the accepted quotation and the actor’s Sales permissions.
7. Call the existing `create_minimal_sale` logic with the reviewed values to create a draft Sale and items.
8. Set `converted_order_id`, `converted_at`, `converted_by`, and `status='converted_to_sale'` on the quotation.
9. Write the quotation conversion audit entry, including quotation reference, Sale ID/number, actor, timestamp, and whether accepted values were edited.
10. Return the linked Sale ID/number.

The existing unique partial index on `quotation_requests.converted_order_id`, the row lock, and the early existing-link return provide one-to-one retry and concurrency protection. No duplicate Sales-side relationship is added. Any failure rolls back Sale creation, item creation, audit, link, and status together.

The Server Action redirects repeated requests to the existing linked Sale. It does not create or finalize an invoice and does not call Sale confirmation.

## Traceability and UI

Quotation list and management screens use compact status badges consistent with the existing SEN styling. Draft is gray, issued is blue, accepted is green, internal/customer rejection is red, expired is amber/gray, and converted is completed green.

The quotation management page shows the linked Sale number and link after conversion. The Sales detail loader resolves the source quotation by querying `quotation_requests.converted_order_id = sales_orders.id` and displays the source quotation reference and link. This reuses the existing relationship without duplicating foreign keys.

Quotation history continues to use `audit_logs`. New workflow and conversion events include actor, prior/new state, reason where applicable, linked Sale, and timestamps. The Sale’s existing order-status event records that the draft originated from the quotation.

## Database and Native Schema Safety

The migration is additive:

- extend the existing status check;
- add nullable workflow metadata columns;
- add the two permission catalogue rows;
- extend quotation notification types/labels for draft, issued, accepted, declined, and converted-to-sale states;
- add the atomic conversion function and service-role-only grant;
- add safe search indexes only if query analysis shows they are needed.

No quotation, Sale, customer, product, inventory, invoice, or historical status is deleted or rewritten. Existing `converted_order_id`, `converted_invoice_id`, and legacy conversion records remain intact.

The native/offline schema builder must include both the existing View Own migration and the new integration migration. Generated native schema and permission seed output are verified for parity without modifying unrelated native behavior.

## Testing Strategy

Implementation is test-driven. Automated tests cover:

- permitted and forbidden state transitions, including draft, issued, accepted, internal rejection, customer rejection, expiry, and legacy conversion;
- customer outcome actor/time/reason and immutable accepted quotations;
- eligible search by reference/name/company and View Own filtering;
- route, UI, Server Action, and database permission enforcement;
- exact customer, product, variation, quantity, quotation price, line/header discount, line/header tax, address, notes, and expected-date prefill;
- quotation pricing remaining the baseline instead of current catalogue price;
- normal Sales validation and price/discount permissions after import;
- zero inventory/reservation/invoice/Stock Out side effects during search, import, and draft conversion;
- atomic rollback on invalid data or failed Sale creation;
- double click, retry, refresh, multiple tabs, and concurrent database calls returning one linked Sale;
- quotation-to-Sale and Sale-to-quotation links plus audit entries;
- unchanged manual Create Sale, confirmation/reservation, invoice finalization, Stock Out, shipment, quotation create/view/edit/print, and unrelated test suites;
- Supabase migration safety, native schema parity, TypeScript, ESLint, full automated tests, production audit/release gates, and production build.

## Isolation, Release, and Deployment

Implementation occurs in a clean Git worktree created from the current committed HEAD. Unrelated uncommitted files in the primary workspace are neither copied, edited, staged, committed, nor deployed. The feature is committed as an isolated reviewed revision.

Deployment is conditional on every critical local check passing. The production database receives only the reviewed additive migration, followed by the isolated Vercel production deployment. No unrelated feature or redesign is introduced during deployment.

After deployment, production smoke testing verifies public/login health and the authenticated Quotation-to-Sale workflow with safe test records or an approved existing test account. The smoke test confirms permissions, accepted-only eligibility, one linked draft Sale, no premature invoice/reservation/stock mutation, reverse links, and continued access to the existing downstream Sales actions. Any critical failure stops deployment or triggers an approved forward repair/rollback procedure; it is not reported as successful.
