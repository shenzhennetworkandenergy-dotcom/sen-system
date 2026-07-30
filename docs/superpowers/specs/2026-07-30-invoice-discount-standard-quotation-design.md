# Invoice Discount and Standard Quotation Design

## Goal

Correct invoice discount reporting and give printable quotations a professional,
standard corporate color system while preserving SEN branding and A4 print
quality.

## Invoice discount behavior

- Every invoice item will display its calculated line discount.
- The invoice summary discount will equal:
  - the sum of every item `line_discount`; plus
  - the order-level `discount_amount`.
- The gross subtotal remains the sum of item `line_subtotal` values.
- The displayed total must reconcile as:
  `subtotal - total discount + line tax + shipping + service + order tax`.
- Zero-discount lines remain visually clean and display a standard zero amount.
- Existing immutable invoice snapshots remain the source of product and price
  values, so historical documents do not change when current product data
  changes.

## Quotation color and layout

- The earlier burgundy/copper/gold proposal is replaced.
- Use a standard corporate palette:
  - deep navy for the document header and table header;
  - professional blue for labels and key accents;
  - slate gray for secondary information and borders;
  - white and very light blue-gray for content backgrounds.
- Avoid decorative gradients and highly saturated color combinations.
- Maintain strong print contrast, including grayscale legibility.
- Use the approved invoice-style A4 dimensions, spacing, typography, page
  numbering, SEN logo, company contact information, address blocks, item table,
  totals, terms, validity, and signature areas.

## Quotation commercial data

- Use quotation `unit_price`, `line_subtotal`, `discount_amount`, `tax_amount`,
  and `line_total` fields rather than the older target-price-only presentation.
- Show subtotal, item discounts, quotation-level discount, tax, and final quoted
  amount so the arithmetic reconciles.
- Show the stored expiration date as the quotation validity date.
- Preserve the existing five-day default for new quotations and administrator
  override capability.

## Verification

- Add a pure calculation regression test proving that a BDT 338,000 gross
  subtotal with BDT 3,000 line discount displays BDT 3,000 discount and BDT
  335,000 total before other charges.
- Add a document source check for the invoice discount column/summary and the
  quotation navy/slate palette.
- Run focused tests, lint, the production build, and authenticated browser
  inspection of both printable documents.
