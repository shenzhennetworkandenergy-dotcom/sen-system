# Invoice-Style Quotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give printable quotations the approved invoice's A4 sizing and content density, a distinct burgundy/copper/gold theme, SEN company information, and an editable five-day default validity.

**Architecture:** Keep the approved invoice untouched. Add a pure quotation-validity helper consumed by the create form, server action, and printable quotation; then rebuild the quotation page around its existing database record with invoice-style pagination and quotation-specific totals and terms.

**Tech Stack:** Next.js 16.2.12 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase, Node test runner.

## Global Constraints

- Use a fixed A4 portrait page (`210mm × 297mm`) with zero browser print margins.
- Keep the approved invoice implementation unchanged.
- Use the official SEN logo and existing Dhaka address, phone/WhatsApp, website, and email.
- Use a burgundy, copper, and warm-gold quotation theme, not the invoice blue/cyan or challan green theme.
- Default new quotations to five calendar days of validity while preserving administrator overrides.
- Never display internal quotation notes in the customer-facing document.
- Use eight product items per printed page.
- Do not add a database migration.

---

### Task 1: Quotation validity behavior

**Files:**
- Create: `lib/quotations/validity.ts`
- Create: `tests/quotation-validity.test.mts`
- Modify: `app/admin/quotations/new/page.tsx`
- Modify: `app/admin/quotations/actions.ts`

**Interfaces:**
- Produces: `addCalendarDays(date: string, days: number): string`
- Produces: `defaultQuotationExpirationDate(issueDate?: string): string`
- Produces: `resolveQuotationExpirationDate(expirationDate: string | null | undefined, createdAt: string): string`

- [ ] **Step 1: Write the failing validity tests**

```ts
assert.equal(defaultQuotationExpirationDate("2026-07-30"), "2026-08-04");
assert.equal(defaultQuotationExpirationDate("2026-12-29"), "2027-01-03");
assert.equal(resolveQuotationExpirationDate("2026-08-15", "2026-07-30T04:00:00Z"), "2026-08-15");
assert.equal(resolveQuotationExpirationDate(null, "2026-07-30T04:00:00Z"), "2026-08-04");
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/quotation-validity.test.mts
```

Expected: failure because `lib/quotations/validity.ts` does not exist.

- [ ] **Step 3: Implement the pure date helper**

Use UTC date arithmetic on an ISO `YYYY-MM-DD` date so month and year rollover remain stable:

```ts
export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export const defaultQuotationExpirationDate = (issueDate = new Date().toISOString().slice(0, 10)) =>
  addCalendarDays(issueDate, 5);

export const resolveQuotationExpirationDate = (expirationDate: string | null | undefined, createdAt: string) =>
  expirationDate || defaultQuotationExpirationDate(createdAt.slice(0, 10));
```

- [ ] **Step 4: Apply the helper at both creation boundaries**

Set the Create Quotation form's expiration input `defaultValue` to `defaultQuotationExpirationDate()`. In `createQuotationAction`, store the submitted value or `defaultQuotationExpirationDate()` when blank.

- [ ] **Step 5: Run the focused test**

Expected: four tests pass with zero failures.

### Task 2: Printable A4 quotation

**Files:**
- Modify: `app/admin/quotations/[id]/page.tsx`
- Create: `scripts/verify-quotation-document.mjs`

**Interfaces:**
- Consumes: `resolveQuotationExpirationDate(expirationDate, createdAt)`
- Consumes: existing `PrintDocumentButton`, `money`, and quotation database fields.

- [ ] **Step 1: Add a failing executable regression check**

The script must run against the repository and fail unless the quotation renderer exposes these customer-visible contracts:

- fixed `min-h-[297mm] w-[210mm]`
- `@page { size: A4 portrait; margin: 0; }`
- `PAGE_SIZE = 8`
- `QUOTATION`, `Valid until`, `Quotation for`
- SEN Dhaka address, phone, website, and email
- `Unit price`, `Total quoted amount`
- payment terms, delivery information, terms and conditions
- authorized signature and customer acceptance
- no `internal_notes` in the printable query

Run:

```powershell
node scripts/verify-quotation-document.mjs
```

Expected: failure against the current web-card renderer.

- [ ] **Step 2: Expand the printable quotation query**

Select:

```text
id,reference,status,subject,company_name,customer_tax_identification_number,
required_by,expiration_date,created_at,subtotal,discount_amount,tax_amount,
total_amount,currency,payment_terms,delivery_information,terms_and_conditions,
customer_notes,billing_address_snapshot,
profiles!quotation_requests_profile_id_fkey(full_name,email,phone,company_name),
quotation_request_items(id,product_name_snapshot,sku_snapshot,
description_snapshot,quantity,target_price,unit_price,line_total)
```

Do not select `internal_notes`.

- [ ] **Step 3: Build the invoice-sized quotation pages**

Paginate at eight items. Repeat a burgundy/copper/gold header and product table on every A4 page. Display customer and subject information only on page one; totals, commercial terms, notes, signatures, and footer details on the final page.

- [ ] **Step 4: Format commercial data safely**

Use stored totals when available and fall back to item calculations for legacy records. Use stored unit/line totals with `target_price × quantity` fallbacks. Resolve a missing expiration date with `resolveQuotationExpirationDate`.

- [ ] **Step 5: Add customer-specific print naming**

Pass `${customerName} - ${reference}` to `PrintDocumentButton`.

- [ ] **Step 6: Run the quotation regression and validity tests**

Expected: both commands exit successfully with no warnings.

### Task 3: Verification and publication

**Files:**
- Verify all files changed by Tasks 1 and 2.

- [ ] **Step 1: Run focused linting**

```powershell
npx eslint app/admin/quotations/[id]/page.tsx app/admin/quotations/new/page.tsx app/admin/quotations/actions.ts lib/quotations/validity.ts tests/quotation-validity.test.mts scripts/verify-quotation-document.mjs
```

- [ ] **Step 2: Run TypeScript and existing workflows**

```powershell
npx tsc --noEmit --allowImportingTsExtensions
npm run test:sales
```

- [ ] **Step 3: Run the production build**

```powershell
npm run build
```

- [ ] **Step 4: Verify in a signed-in browser**

Open `/admin/quotations/new` and confirm the expiration field defaults to five days from the current issue date. Open an existing `/admin/quotations/[id]`, confirm A4 sizing, the burgundy/copper/gold theme, SEN information, item pricing, totals, validity, and print controls, and check browser logs for warnings/errors.

- [ ] **Step 5: Review the diff and publish only feature files**

Commit only the spec, plan, validity helper/test, quotation form/action, printable quotation, and verification script. Push a clean branch based on current `origin/main`, create a pull request, wait for Vercel, merge, and confirm the production deployment succeeds.
