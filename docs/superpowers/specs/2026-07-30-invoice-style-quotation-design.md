# Invoice-Style Quotation Design

## Goal

Redesign the printable quotation so its physical size, typography, spacing, pagination, and print behavior match the approved SEN invoice while retaining quotation-specific information and a completely different color identity.

## Visual direction

- Use a fixed A4 portrait page (`210mm × 297mm`) with zero browser print margins.
- Match the invoice's compact, readable typography, content density, table proportions, signature area, footer, and multi-page behavior.
- Do not modify or extract the approved invoice implementation.
- Give quotations a separate burgundy, copper, and warm-gold theme. Do not reuse the invoice's blue/cyan gradient or the delivery challan's green theme.
- Use the official SEN logo and these existing SEN company details:
  - Shenzhen Energy and Networks
  - House- 67, Level-3, Laboratory Road, New Elephant Road (Backside of Multiplan Center), Dhaka- 1205
  - Call/WhatsApp: +8801805226599
  - Website: sen.com.bd
  - Email: szwaqia@vip.163.com

## Quotation content

The first page will contain:

- SEN company header and official logo.
- `QUOTATION`, quotation reference, issue date, valid-until date, and page count when needed.
- Customer name, company, email, phone, billing address, quotation status, and required-by date.
- Quotation subject.

Every page will contain a product table with:

- Item number.
- Product description and SKU.
- Quantity.
- Unit price.
- Line total.

The final page will contain:

- Subtotal.
- Discount.
- Tax.
- Total quoted amount.
- Payment terms.
- Delivery information.
- Terms and conditions.
- Customer-facing notes.
- Authorized-signature and customer-acceptance lines.
- SEN contact footer.

Blank optional commercial sections will be omitted. Internal notes must never appear on the customer-facing quotation.

## Validity behavior

- New quotations default to an expiration date five calendar days after the creation date.
- The default appears in the Create Quotation form so an administrator can change it before saving.
- The server action also applies the five-day default when the submitted expiration date is blank.
- Administrators can continue changing the expiration date from the existing quotation-management form.
- Existing quotations without an expiration date display a calculated valid-until date five calendar days after `created_at`.
- The existing `expiration_date` database column is sufficient; no schema migration is required.

## Pagination and printing

- Use the invoice's eight-item page size.
- Repeat the quotation header and product-table header on every page.
- Show customer information and subject on page one.
- Show totals, terms, notes, and signatures only on the final page.
- Keep print colors exact and remove shadows/backgrounds when printing.
- The download/print title will include the customer name and quotation reference.

## Testing

- Unit tests will cover the five-day default, explicit expiration-date preservation, month/year rollover, and legacy quotation fallback.
- A source regression check will require the fixed A4 layout, quotation color theme, SEN contact details, pagination, totals, validity display, terms, signatures, and editable five-day default.
- Existing quotation, sales, TypeScript, lint, and production-build checks must pass.
- A signed-in browser check will verify the rendered quotation and Create Quotation default when local data is available.

## Out of scope

- The approved invoice implementation will not change.
- No curved image background from the sample will be added.
- No database migration or quotation workflow/status change is required.
