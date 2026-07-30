# Invoice Discount and Standard Quotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invoice discounts reconcile visibly and replace the printable quotation with a professional navy/slate A4 document.

**Architecture:** Add one pure commercial-document calculation helper so invoices and quotations share explicit line-discount aggregation. Keep both printable routes as authenticated Server Components, use stored invoice snapshots for invoices and a minimal quotation query for quotations, and preserve browser-only printing in the existing print button.

**Tech Stack:** Next.js 16 Server Components, React 19, TypeScript, Supabase, Tailwind CSS, Node test runner.

## Global Constraints

- Invoice total discount equals item line discounts plus the order-level discount.
- Printable quotation colors are deep navy, professional blue, slate gray, white, and light blue-gray.
- Do not use decorative gradients in the quotation.
- Both documents must remain A4 portrait and print legibly in color or grayscale.
- Quotation validity defaults to five calendar days but remains editable by administrators.
- Do not modify historical product prices outside immutable invoice snapshots.

---

### Task 1: Shared discount calculation

**Files:**
- Create: `lib/documents/commercial-totals.ts`
- Create: `tests/document-discounts.test.mts`

**Interfaces:**
- Consumes: item records containing `line_discount` or `discount_amount`.
- Produces: `calculateDocumentDiscounts(items, orderDiscount)` returning `{ lineDiscount, orderDiscount, totalDiscount }`.

- [ ] **Step 1: Write the failing calculation tests**

```ts
test("combines invoice line and order discounts", () => {
  assert.deepEqual(
    calculateDocumentDiscounts(
      [{ line_discount: 3000 }, { line_discount: 0 }],
      500,
    ),
    { lineDiscount: 3000, orderDiscount: 500, totalDiscount: 3500 },
  );
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run:

```bash
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/document-discounts.test.mts
```

Expected: failure because `lib/documents/commercial-totals.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
export function calculateDocumentDiscounts(
  items: Array<Record<string, unknown>>,
  orderDiscount: unknown,
) {
  const lineDiscount = money(items.reduce(
    (sum, item) => sum + Number(item.line_discount ?? item.discount_amount ?? 0),
    0,
  ));
  const normalizedOrderDiscount = money(Number(orderDiscount ?? 0));
  return {
    lineDiscount,
    orderDiscount: normalizedOrderDiscount,
    totalDiscount: money(lineDiscount + normalizedOrderDiscount),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run the Task 1 test command. Expected: all tests pass.

---

### Task 2: Invoice discount presentation

**Files:**
- Modify: `app/admin/sales/[saleId]/documents/[documentId]/page.tsx`

**Interfaces:**
- Consumes: `calculateDocumentDiscounts(snapshot.items, order.discount_amount)`.
- Produces: a Discount item-table column and combined discount summary.

- [ ] **Step 1: Render per-line and combined discounts**

- Calculate discounts once from the snapshot.
- Add a right-aligned Discount column between Unit price and Amount.
- Render `item.line_discount` for every invoice item.
- Replace the summary `order.discount_amount` value with
  `discounts.totalDiscount`.
- Preserve the existing stored total, payments, balance, and immutable snapshot.

- [ ] **Step 2: Run the helper tests**

Run Task 1’s test. Expected: all tests pass.

---

### Task 3: Standard A4 quotation and five-day validity

**Files:**
- Create: `lib/quotations/validity.ts`
- Create: `tests/quotation-validity.test.mts`
- Modify: `app/admin/quotations/new/page.tsx`
- Modify: `app/admin/quotations/actions.ts`
- Replace: `app/admin/quotations/[id]/page.tsx`

**Interfaces:**
- Produces: `defaultQuotationExpiration(issueDate = new Date(), days = 5): string`.
- Consumes: quotation commercial fields, address snapshots, and item pricing.

- [ ] **Step 1: Write failing validity tests**

```ts
test("defaults validity to five calendar days", () => {
  assert.equal(
    defaultQuotationExpiration(new Date("2026-07-30T00:00:00Z")),
    "2026-08-04",
  );
});
```

- [ ] **Step 2: Run the validity test and confirm the missing-module failure**

Run:

```bash
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/quotation-validity.test.mts
```

Expected: failure because the validity helper does not exist.

- [ ] **Step 3: Implement and connect five-day validity**

- Add the pure UTC-safe date helper.
- Set the create form expiration field’s `defaultValue` to the helper result.
- In the server action, use the helper if submitted expiration is empty.
- Keep an explicitly submitted date unchanged.

- [ ] **Step 4: Rebuild the quotation Server Component**

- Query only the needed quotation, customer, address, commercial, and item fields.
- Paginate at eight items per A4 page.
- Use a solid `#0f2747` navy header, `#1d4ed8` accents, slate borders/text,
  and light `#f1f5f9` alternating rows.
- Include SEN logo/contact information, prepared-for and ship-to blocks,
  reference, issue date, valid-until date, item table, line discounts, subtotal,
  combined discount, tax, final quoted amount, payment/delivery terms, customer
  notes, terms and conditions, signatures, page count, and print controls.
- Keep internal notes excluded from the printed document.

- [ ] **Step 5: Run the validity and discount tests**

Run both unit-test files. Expected: all tests pass. Visual color and print
behavior are verified against the real authenticated Server Components in Task
4 rather than by checking source text.

---

### Task 4: Final verification

**Files:**
- Verify all files modified in Tasks 1–3.

- [ ] **Step 1: Run focused lint**

```bash
npx eslint app/admin/sales/[saleId]/documents/[documentId]/page.tsx app/admin/quotations/[id]/page.tsx app/admin/quotations/new/page.tsx app/admin/quotations/actions.ts lib/documents/commercial-totals.ts lib/quotations/validity.ts tests/document-discounts.test.mts tests/quotation-validity.test.mts
```

- [ ] **Step 2: Run document tests**

```bash
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/document-discounts.test.mts tests/quotation-validity.test.mts
```

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

- [ ] **Step 4: Inspect authenticated documents**

Open one discounted invoice and one quotation. Confirm the BDT 3,000 example
reconciles, the quotation is A4 navy/slate without a gradient, validity is
visible, and browser console reports no application errors.

- [ ] **Step 5: Commit only this feature’s files**

Preserve all unrelated HR, deletion-control, product, and settings changes.
