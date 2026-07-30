# Sale Line Editing Design

## Goal

Allow authorized staff to edit a sale’s product quantity, unit price, and discount after product selection while preserving inventory, payment, invoice, and fulfilment integrity.

## Editable fields

The sale detail page exposes exactly these line-item controls:

- Quantity
- Unit price
- Discount, entered as either a percentage or a fixed amount

Warehouse, tax, product identity, variation, serial assignment, and other fulfilment fields are not editable through this interface.

Every changed line requires an adjustment reason.

## Availability by sale state

- Editing is available from draft through all pre-delivery states.
- A delivered sale is read-only.
- A cancelled sale is read-only.
- Shipped quantities cannot be reduced or removed.
- Quantity cannot be lower than the greatest of allocated, packed, or shipped quantity.
- Increasing quantity is allowed only when sufficient stock can be reserved from the line’s existing warehouse.
- Serialized products follow the same quantity boundary and keep existing serial allocations.

## Interface

Add **Edit products and pricing** to the Products & Pricing card on the sale detail page.

Editing opens an inline form for all current lines:

- Current product identity remains read-only.
- Quantity and unit price are numeric fields.
- Discount type switches between **Percentage** and **Fixed amount**.
- The interface displays the recalculated line subtotal and order total before saving.
- Existing reserved, allocated, packed, shipped, and serial counts remain visible.
- Cancel leaves the sale unchanged.
- Save applies the entire edit as one operation.

## Atomic update workflow

A database function performs the update in one transaction:

1. Authenticate the actor and verify sale-edit permission.
2. Lock the sale, line items, active reservations, and affected inventory balances.
3. Reject delivered or cancelled sales.
4. Validate every submitted line belongs to the sale.
5. Validate quantity boundaries against allocated, packed, and shipped quantities.
6. Validate non-negative prices and discounts, and percentage discounts from 0 through 100.
7. Calculate each line total and the revised sale subtotal and total.
8. Reject a total below the net amount already paid.
9. Increase or release active reservations to match each revised quantity.
10. Update line quantities, unit prices, discounts, totals, and order totals.
11. Record quantity, price, and discount adjustments with the supplied reason and actor.
12. Mark generated invoices as superseded when financial values changed.
13. Commit all changes together or roll back everything.

## Reservations and fulfilment

- Draft sales have no active reservation; edits update the line only.
- Confirmed pre-shipment sales adjust the existing reservation by the quantity difference.
- Reducing quantity releases only the unallocated portion.
- Increasing quantity checks the existing warehouse’s available balance and reserves the difference.
- Existing allocation, packing, and shipment records are never rewritten by the pricing editor.
- Order status is recalculated after the update.

## Payments and invoices

- The revised sale total cannot be lower than the net amount already paid.
- Existing invoice files remain immutable historical snapshots.
- When a financial change affects an invoiced sale, generated invoices are marked **superseded**.
- The sale page clearly offers **Generate revised invoice**.
- New documents use a revision-aware invoice reference while preserving earlier files.

## Permissions and audit

- Administrators can edit eligible sales.
- Employees need sale-edit permission.
- Unit-price changes require price-change permission.
- Discount changes require discount permission.
- Every update records the actor, time, reason, previous values, and new values.
- Direct browser requests cannot bypass permissions or state validation.

## Error handling

The form returns clear messages for insufficient stock, invalid discounts, totals below paid amounts, delivered or cancelled sales, stale concurrent edits, and quantities below fulfilment progress. No partial updates remain after an error.

## Testing

- Test quantity, price, percentage-discount, and fixed-discount normalization.
- Test minimum quantity against allocated, packed, and shipped values.
- Test reservation increases and releases.
- Test insufficient-stock rollback.
- Test totals against paid amounts.
- Test delivered and cancelled sale rejection.
- Test permission combinations.
- Test invoice superseding and revised-document generation.
- Verify the inline editor at mobile and desktop widths.

