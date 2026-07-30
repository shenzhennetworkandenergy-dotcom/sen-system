# Create Sale Product Search Implementation Plan

> **For agentic workers:** Execute each task test-first and keep all unrelated working-tree changes untouched.

**Goal:** Replace the Create Sale product dropdown with an immediate, row-level searchable product picker.

**Architecture:** Keep the existing server-side product loading and sale payload unchanged. Add a small pure matching helper for product name, SKU, and model searches, then render an accessible client-side combobox in each sale row.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Node test runner.

## Global constraints

- Read the installed Next.js documentation before changing Next.js behavior.
- Do not change the sale action, stock calculations, variation handling, discounts, or totals.
- Do not touch the unrelated supplier and purchasing changes in the working tree.
- Search must be partial, case-insensitive, immediate, and limited to 10 results.

---

### Task 1: Product matching

**Files:**
- Create: `lib/sales/product-search.ts`
- Test: `tests/sale-product-search.test.mts`

1. Add failing tests for partial product-name, SKU, and model matching.
2. Add failing tests for case-insensitive matching, blank searches, and the 10-result limit.
3. Run the focused test and confirm it fails because the matcher does not exist.
4. Implement the smallest pure matching helper.
5. Run the focused test and confirm it passes.

### Task 2: Row-level searchable picker

**Files:**
- Create: `components/sales/SaleProductPicker.tsx`
- Modify: `components/sales/SaleBuilder.tsx`
- Test: `scripts/verify-sale-product-search.mjs`

1. Add a failing source regression check for the searchable combobox and removal of the detached search/native select.
2. Run the check and confirm it fails.
3. Implement the product picker with a searchable input, related-results panel, product details, click selection, Escape handling, and no-results feedback.
4. Connect selection to the existing row price, variation, and inventory behavior.
5. Run the source regression check and matcher tests.

### Task 3: Full verification

1. Run focused linting on all changed implementation and verification files.
2. Run TypeScript checking.
3. Run the existing sales tests.
4. Run the production build.
5. Verify the Create Sale interaction in a signed-in browser if the local application is available.
6. Review the final diff and commit only the files belonging to this feature.
