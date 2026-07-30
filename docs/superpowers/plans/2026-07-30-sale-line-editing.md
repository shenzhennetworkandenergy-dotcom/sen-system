# Sale Line Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authorized staff to edit quantity, unit price, and percentage or fixed discount on undelivered sale lines without corrupting inventory, payments, fulfilment, or invoice history.

**Architecture:** A pure TypeScript module validates and previews line edits. A single security-definer PostgreSQL function locks and updates the sale, items, reservations, balances, adjustments, totals, and invoice status atomically; a server action re-authorizes the actor and calls it. The sale page renders an inline editor using existing sale data.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL, Node test runner.

## Global Constraints

- Editable fields are exactly quantity, unit price, and percentage or fixed discount.
- Editing remains available until delivery; delivered and cancelled sales are read-only.
- Quantity cannot be below allocated, packed, or shipped quantity.
- Revised total cannot be below net paid amount.
- Every edit requires a reason and audit history.
- Existing invoice snapshots remain immutable.

---

### Task 1: Sale edit validation and totals

**Files:**
- Create: `lib/sales/line-editing.ts`
- Create: `tests/sale-line-editing.test.mts`

**Interfaces:**
- Produces: `normalizeSaleLineEdit`, `calculateEditedLine`, `validateFulfilmentFloor`, and `calculateEditedSaleTotal`

- [ ] Write failing tests for whole quantity, money rounding, percentage and fixed discounts, fulfilment floor, delivered/cancelled state, and paid-total floor.
- [ ] Run and verify failure because the module is absent.
- [ ] Implement minimal pure helpers.
- [ ] Re-run and require zero failures.

### Task 2: Atomic database update

**Files:**
- Create: `supabase/migrations/202607300007_sale_line_editing.sql`
- Create: `supabase/tests/sale_line_editing.sql`

**Interfaces:**
- Produces: `public.update_sale_lines(actor_profile_id uuid, requested_order_id uuid, requested_reason text, requested_items jsonb)`

- [ ] Add the `superseded` document status and revision metadata without changing existing snapshots.
- [ ] Implement permission, state, fulfilment, stock, discount, payment, and stale-input validation.
- [ ] Adjust reservations and balances by the quantity delta.
- [ ] Update item and order totals, record adjustments, supersede generated invoices, and recalculate order status in one transaction.
- [ ] Add SQL integration cases for success and rollback paths.

### Task 3: Server action

**Files:**
- Modify: `app/admin/sales/actions.ts`

**Interfaces:**
- Consumes: `normalizeSaleLineEdit` and `update_sale_lines`
- Produces: `updateSaleLinesAction(saleId, formData)`

- [ ] Parse the submitted JSON and reason.
- [ ] Require sale-edit permission and enforce price/discount permissions based on actual changes.
- [ ] Call the atomic RPC, audit the operation, revalidate sale/order/document routes, and return safe messages.

### Task 4: Inline sale editor

**Files:**
- Create: `components/sales/SaleLineEditor.tsx`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `lib/sales/data.ts`

**Interfaces:**
- Consumes: sale lines, fulfilment counters, active reservations, permissions, and server action
- Produces: edit/cancel/save workflow with live totals

- [ ] Add Edit products and pricing for eligible sales.
- [ ] Render read-only identity plus quantity, unit price, discount type/value, and reason.
- [ ] Show live line and sale totals plus fulfilment floors.
- [ ] Disable fields that the actor cannot change.
- [ ] Show revised-invoice guidance when generated documents exist.

### Task 5: Invoice revision behavior

**Files:**
- Modify: `app/admin/sales/actions.ts`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `app/admin/sales/[saleId]/documents/[documentId]/page.tsx`

- [ ] Display superseded status on historical documents.
- [ ] Offer Generate revised invoice after a financial edit.
- [ ] Preserve every previous document snapshot and number.

### Task 6: Sale editing verification

**Files:**
- Modify: `package.json`

- [ ] Add `test:sale-line-editing`.
- [ ] Run TypeScript sale-line tests and SQL integration checks.
- [ ] Run existing sales tests, lint, and production build.
- [ ] Apply the local migration.
- [ ] Verify editing, validation, totals, and revised-invoice status in an authenticated browser.
