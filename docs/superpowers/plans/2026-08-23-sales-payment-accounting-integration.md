# Sales Payment Accounting Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically post each actually received Sales payment to the existing Quick Cash Book and posted Sales Revenue journal with exact-method traceability, correct Cash/Bank/MFS classification, and duplicate protection.

**Architecture:** Extend the existing PostgreSQL `record_sale_payment` RPC with an idempotent overload that performs the Sales payment, Cash Book entry, journal, and audit write in one transaction. Keep receipt-method normalization shared in a small TypeScript domain module for immediate form/action validation, while PostgreSQL repeats the authoritative validation. Add only focused Sales payment fields and Accounting source display; preserve manual Accounting and unrelated Sales workflows.

**Tech Stack:** Next.js 16.2 App Router and Server Actions, React 19, TypeScript 5, Supabase/PostgreSQL PL/pgSQL, pgTAP, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-23-sales-payment-accounting-integration-design.md`

## Global Constraints

- Reuse `sale_payments`, `cashbook_entries`, `journal_entries`, `journal_lines`, the active `Sales` Cash Book description, and account `4000`.
- New database fields must be additive and nullable for historical rows; do not backfill old Sales payments.
- `record_sale_payment` is the only write boundary for the new integration.
- Credit Sale is not a received payment and must be rejected without any write.
- Advance Payment and Other require an explicit Cash, Bank, or MFS receipt channel.
- Closed Cash Book dates must reject the complete operation without reopening or changing the closed day.
- One operation ID maps to one Sales Payment, one Cash Book entry, and one posted Sales Revenue journal.
- Do not add payment editing, deletion, refund, reversal, or automatic financial reversal.
- Ordinary Sale cancellation must fail while any received payment exists.
- Preserve existing permissions; `sales.record_payment` authorizes the internal Accounting consequence but grants no Accounting access.
- Do not deploy to Vercel.
- Read and follow the installed Next.js guides at `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`.

## File Structure

- Create `lib/sales/payment-accounting.ts`: exact-method and receipt-channel types plus deterministic validation/mapping.
- Create `components/sales/SalePaymentMethodFields.tsx`: conditional method/channel controls and pending-state submit button.
- Create `supabase/migrations/202608230001_sales_payment_accounting_integration.sql`: additive columns, unique source links, idempotent atomic RPC, grants, and cancellation guard.
- Create `supabase/tests/sales_payment_accounting.sql`: transactional database acceptance test for amounts, mappings, idempotency, atomic rollback, dates, references, and cancellation.
- Create `tests/sales-payment-accounting.test.mts`: fast domain and source-contract tests.
- Modify `app/admin/sales/actions.ts`: validate operation/method/channel, call the extended RPC, revalidate Sales and Accounting, and avoid duplicate application audit writes.
- Modify `app/admin/sales/[saleId]/page.tsx`: render the focused payment fields, operation ID, and Accounting trace column.
- Modify `lib/sales/data.ts`: load Cash Book/journal links with Sales payments.
- Modify `lib/accounting/data.ts`: load exact source method and Sales Payment linkage for Cash Book rows.
- Modify `components/accounting/QuickCashbook.tsx`: show exact source method plus ledger channel and automated source identity.
- Modify `scripts/build-native-schema.mjs`: append the new migration to the generated native PostgreSQL schema.
- Regenerate `database/native/schema.sql`: keep hosted and offline schemas aligned.
- Modify `package.json`, `scripts/verify-sales.mjs`, `docs/SALES.md`, and `docs/ACCOUNTING.md`: register verification and document actual behavior.

---

### Task 1: Receipt Method Domain Rules and Sales Form

**Files:**
- Create: `lib/sales/payment-accounting.ts`
- Create: `components/sales/SalePaymentMethodFields.tsx`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Test: `tests/sales-payment-accounting.test.mts`

**Interfaces:**
- Produces: `SalePaymentMethod`, `CashbookReceiptChannel`, `SALE_PAYMENT_METHODS`, `AMBIGUOUS_RECEIPT_METHODS`, and `normalizeSalePaymentReceipt(method, requestedChannel)`.
- Produces: `<SalePaymentMethodFields fieldClass: string>` with form fields named `method` and `receipt_channel` plus the submit button.
- Consumes: existing `recordPaymentAction`, Sales outstanding amount, payment date, reference, note, and a server-generated `operation_id`.

- [ ] **Step 1: Write failing domain and form-contract tests**

Add tests that import `normalizeSalePaymentReceipt` and assert the locked mapping:

```ts
assert.deepEqual(normalizeSalePaymentReceipt("cash", null), { method: "cash", receiptChannel: "cash" });
assert.deepEqual(normalizeSalePaymentReceipt("cash_on_delivery", null), { method: "cash_on_delivery", receiptChannel: "cash" });
assert.deepEqual(normalizeSalePaymentReceipt("mobile_banking", null), { method: "mobile_banking", receiptChannel: "mfs" });
for (const method of ["bank_transfer", "cheque", "card"] as const) {
  assert.deepEqual(normalizeSalePaymentReceipt(method, null), { method, receiptChannel: "bank" });
}
assert.deepEqual(normalizeSalePaymentReceipt("advance_payment", "cash"), {
  method: "advance_payment",
  receiptChannel: "cash",
});
assert.throws(() => normalizeSalePaymentReceipt("credit_sale", null), /not a received payment/i);
assert.throws(() => normalizeSalePaymentReceipt("other", null), /select.*cash.*bank.*mfs/i);
```

Read the component and Sale detail source to require `receipt_channel`, `operation_id`, `useFormStatus`, and an Accounting trace column.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-payment-accounting.test.mts
```

Expected: failure because `lib/sales/payment-accounting.ts` and the new form component do not exist.

- [ ] **Step 3: Implement the pure mapping**

Use these exact domain rules:

```ts
export const SALE_PAYMENT_METHODS = [
  "cash", "bank_transfer", "cheque", "mobile_banking", "card",
  "advance_payment", "cash_on_delivery", "other",
] as const;

export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];
export type CashbookReceiptChannel = "cash" | "bank" | "mfs";
export const AMBIGUOUS_RECEIPT_METHODS = ["advance_payment", "other"] as const;

export function normalizeSalePaymentReceipt(methodValue: unknown, channelValue: unknown): {
  method: SalePaymentMethod;
  receiptChannel: CashbookReceiptChannel;
} {
  const method = String(methodValue ?? "").trim().toLowerCase();
  const channel = String(channelValue ?? "").trim().toLowerCase();
  if (method === "credit_sale") throw new Error("Credit Sale is not a received payment. Record the actual payment method when money is received.");
  if (!SALE_PAYMENT_METHODS.includes(method as SalePaymentMethod)) throw new Error("Select a valid received payment method.");
  if (method === "cash" || method === "cash_on_delivery") return { method: method as SalePaymentMethod, receiptChannel: "cash" };
  if (method === "mobile_banking") return { method, receiptChannel: "mfs" };
  if (method === "bank_transfer" || method === "cheque" || method === "card") return { method, receiptChannel: "bank" };
  if (!(["cash", "bank", "mfs"] as const).includes(channel as CashbookReceiptChannel)) {
    throw new Error("Select the actual Cash, Bank, or MFS receiving channel.");
  }
  return { method: method as SalePaymentMethod, receiptChannel: channel as CashbookReceiptChannel };
}
```

- [ ] **Step 4: Implement the conditional client fields and pending button**

Create a client component using `useState` and `useFormStatus`. Do not render Credit Sale as a received-payment option. Render `receipt_channel` only for Advance Payment or Other, with Cash, Bank, and MFS choices and `required`. Disable the button while pending and change its label to `Recording payment…`.

- [ ] **Step 5: Integrate the form fields into the existing Sale page**

Generate `paymentOperationId = randomUUID()` next to the existing invoice operation ID. Keep amount, date, reference, and note in the existing form; add:

```tsx
<input type="hidden" name="operation_id" value={paymentOperationId} />
<SalePaymentMethodFields fieldClass={field} />
```

Add an Accounting column that shows the linked journal number and abbreviated Cash Book entry ID when present.

- [ ] **Step 6: Run the focused test and confirm GREEN**

Run the Task 1 test command. Expected: all mapping and form-contract tests pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- lib/sales/payment-accounting.ts components/sales/SalePaymentMethodFields.tsx app/admin/sales/[saleId]/page.tsx tests/sales-payment-accounting.test.mts
git commit -m "feat: validate sales receipt channels"
```

### Task 2: Atomic PostgreSQL Payment Posting

**Files:**
- Create: `supabase/migrations/202608230001_sales_payment_accounting_integration.sql`
- Create: `supabase/tests/sales_payment_accounting.sql`
- Modify: `tests/sales-payment-accounting.test.mts`

**Interfaces:**
- Produces: `record_sale_payment(uuid,uuid,numeric,date,text,text,text,uuid,text) returns uuid`.
- Preserves: `record_sale_payment(uuid,uuid,numeric,date,text,text,text) returns uuid` as a wrapper that generates an operation ID and applies only deterministic channel mappings.
- Produces additive columns `sale_payments.operation_id`, `sale_payments.receipt_channel`, `cashbook_entries.sale_payment_id`, and `cashbook_entries.source_payment_method`.
- Produces a cancellation invariant enforced whenever `sales_orders.status` changes to `cancelled`.

- [ ] **Step 1: Add failing migration contract tests**

Read the new migration and assert that it contains:

```ts
assert.match(migration, /add column if not exists operation_id uuid/i);
assert.match(migration, /add column if not exists receipt_channel text/i);
assert.match(migration, /sale_payment_id uuid/i);
assert.match(migration, /source_payment_method text/i);
assert.match(migration, /pg_advisory_xact_lock/i);
assert.match(migration, /reference_type.*'payment'/s);
assert.match(migration, /code='4000'/);
assert.match(migration, /This cashbook date is already closed/i);
assert.match(migration, /cannot be cancelled directly/i);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Expected: failure because the migration is absent.

- [ ] **Step 3: Add backward-compatible schema fields and uniqueness**

The migration must add nullable historical-safe fields and constraints:

```sql
alter table public.sale_payments
  add column if not exists operation_id uuid,
  add column if not exists receipt_channel text;
alter table public.sale_payments
  add constraint sale_payments_receipt_channel_check
  check (receipt_channel is null or receipt_channel in ('cash','bank','mfs'));
create unique index if not exists sale_payments_operation_id_unique
  on public.sale_payments(operation_id) where operation_id is not null;

alter table public.cashbook_entries
  add column if not exists sale_payment_id uuid references public.sale_payments(id) on delete restrict,
  add column if not exists source_payment_method text;
create unique index if not exists cashbook_entries_sale_payment_id_unique
  on public.cashbook_entries(sale_payment_id) where sale_payment_id is not null;
create unique index if not exists journal_entries_payment_reference_unique
  on public.journal_entries(reference_id)
  where reference_type='payment' and reference_id is not null;
```

Guard repeated migration execution by checking `pg_constraint` before adding named check constraints.

- [ ] **Step 4: Implement the nine-argument atomic RPC**

The function must:

1. Call `public.assert_actor_permission(actor_profile_id,'sales.record_payment')`.
2. Reject null operation IDs and obtain `pg_advisory_xact_lock(hashtextextended(operation_id::text,0))`.
3. Normalize the method and derive Cash/Bank/MFS exactly as Task 1 does; reject Credit Sale and ambiguous methods without an explicit valid channel.
4. Check an existing operation ID under lock. Return it only when actor, Sale, rounded amount, effective date, method, channel, reference, and note match; otherwise raise `This payment operation ID was already used with different details`.
5. Lock the Sale and reject missing/cancelled Sales or non-positive amounts.
6. Call `public.lock_cashbook_timeline()` and `public.assert_cashbook_predecessor_closed(effective_date)`, create the day if needed, lock it, and raise `This cashbook date is already closed. Use the authorized accounting correction process.` when closed.
7. Select the existing active income description whose lowercased name is `sales`; never insert another description.
8. Select asset account `1010`, `1020`, or `1030` and revenue account `4000`.
9. Insert `sale_payments`, refresh Sales payment totals, and build the bounded reference using the order, latest generated invoice, customer, and optional payment reference.
10. Insert a posted `journal_entries` row with `reference_type='payment'` and `reference_id=payment_id`, debit the receipt asset account, and credit `4000`.
11. Insert `cashbook_entries` with the linked payment, linked journal, exact source method, existing Sales description, amount, channel, date, and reference remark.
12. Insert one audit event containing the operation, payment, Sale, Cash Book, journal, amount, date, exact method, and channel.
13. Return `payment_id`.

Use current Dhaka time when the effective date is today; otherwise use noon in `Asia/Dhaka` on the effective date.

- [ ] **Step 5: Preserve the legacy RPC and service-role grants**

The seven-argument wrapper calls the extended RPC with `gen_random_uuid()` and a null channel. Fixed mappings continue to work; Credit Sale, Advance Payment, and Other cannot be misclassified. Revoke both signatures from public/anon/authenticated and grant both only to `service_role`.

- [ ] **Step 6: Add the cancellation safeguard**

Create a `before update of status` trigger on `sales_orders` whose function raises exactly this error when `new.status='cancelled'` and a received payment exists:

```text
This sale has received payment and cannot be cancelled directly. The recorded payment must first be reversed/refunded through an authorized payment reversal process.
```

Do not update or delete any financial record in the trigger.

- [ ] **Step 7: Write the transactional pgTAP acceptance test**

Create a BDT 74,000 Sale fixture and verify BDT 20,000, BDT 40,000, and BDT 14,000 separate postings; a separate BDT 74,000 full payment; Cash/Bank/MFS account debits; exact source methods; balanced `4000` credits; payment dates; order/invoice/customer/reference text; same-operation retries; changed-detail rejection; Credit Sale rejection; required channels for Advance Payment/Other; closed-day atomic rollback; and cancellation rejection with unchanged payment/Cash Book/journal counts. Roll back the entire test.

- [ ] **Step 8: Run static and database tests**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-payment-accounting.test.mts
npx supabase db reset
npx supabase test db supabase/tests/sales_payment_accounting.sql
npx supabase test db supabase/tests/minimal_sales.sql
```

Expected: all tests pass. If local Supabase is unavailable, start it with `npm run supabase:start` and rerun; do not point verification at a remote database.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- supabase/migrations/202608230001_sales_payment_accounting_integration.sql supabase/tests/sales_payment_accounting.sql tests/sales-payment-accounting.test.mts
git commit -m "feat: post sales payments atomically to accounting"
```

### Task 3: Server Action, Sales Trace, and Accounting Display

**Files:**
- Modify: `app/admin/sales/actions.ts`
- Modify: `lib/sales/data.ts`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `lib/accounting/data.ts`
- Modify: `components/accounting/QuickCashbook.tsx`
- Modify: `tests/sales-payment-accounting.test.mts`

**Interfaces:**
- Consumes: `normalizeSalePaymentReceipt`, extended `record_sale_payment`, and new source-link fields.
- Produces: Sales payment rows with `accountingEntryId` and `journalEntryNumber`.
- Produces: Cash Book UI rows with `sourcePaymentMethod`, `salePaymentId`, and `journalEntryNumber`.

- [ ] **Step 1: Add failing source integration tests**

Require the Server Action to parse `operation_id`, call `normalizeSalePaymentReceipt`, send `requested_operation_id` and `requested_receipt_channel`, revalidate `/admin/accounting`, and not call the application audit helper for `sale.payment_recorded`. Require Sales and Accounting data queries and UI source labels.

- [ ] **Step 2: Run the focused test and confirm RED**

Expected: source-contract assertions fail.

- [ ] **Step 3: Update `recordPaymentAction`**

Validate the operation ID with the existing `uuid()` helper and normalize method/channel before the RPC. Call:

```ts
db.rpc("record_sale_payment", {
  actor_profile_id: profile.id,
  requested_order_id: saleId,
  requested_amount: amount,
  requested_date: paymentDate,
  requested_method: receipt.method,
  requested_reference: reference,
  requested_note: note,
  requested_operation_id: operationId,
  requested_receipt_channel: receipt.receiptChannel,
});
```

Expand the safe error allowlist to include accounting, cashbook, closed, received, channel, retry, and operation messages. Revalidate `/admin/sales`, the Sale detail, `/account/sales`, and `/admin/accounting` before redirect. Remove the separate `writeAuditLog` call for payment recording because the idempotent database operation owns that audit event.

- [ ] **Step 4: Load and display reverse Accounting links in Sales**

Extend the payment query with the reverse `cashbook_entries` relation and its `journal_entries(entry_number)` relation. Normalize the result in `getSale()` so the page does not depend on PostgREST's object/array relation shape. Render the journal number and abbreviated Cash Book ID in the Accounting column.

- [ ] **Step 5: Load and display exact source methods in Accounting**

Select `source_payment_method`, `sale_payment_id`, and `journal_entries(entry_number)` in `getAccountingDashboard()`. Map them to camel-case properties. In `QuickCashbook`, show automatic entries as `Bank Transfer (Bank)`, `Cheque (Bank)`, `Mobile Banking (MFS)`, and so on; manual rows continue to show Cash, Bank, or MFS. Add a compact `Auto Sales · <journal> · Payment <short id>` trace under the remark.

- [ ] **Step 6: Run focused, Sales, and Cash Book tests**

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-payment-accounting.test.mts tests/accounting-cashbook.test.mts tests/accounting-cashbook-permission.test.mts
npm run test:sales
```

Expected: all pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- app/admin/sales/actions.ts app/admin/sales/[saleId]/page.tsx lib/sales/data.ts lib/accounting/data.ts components/accounting/QuickCashbook.tsx tests/sales-payment-accounting.test.mts
git commit -m "feat: expose sales payment accounting trace"
```

### Task 4: Native Schema, Verification Registration, and Documentation

**Files:**
- Modify: `scripts/build-native-schema.mjs`
- Modify: `database/native/schema.sql`
- Modify: `package.json`
- Modify: `scripts/verify-sales.mjs`
- Modify: `docs/SALES.md`
- Modify: `docs/ACCOUNTING.md`
- Test: `tests/native-schema.test.mts`
- Test: `tests/sales-payment-accounting.test.mts`

**Interfaces:**
- Produces: identical integration schema for Supabase and native PostgreSQL.
- Produces: `npm run test:sales-payment-accounting` for the fast focused suite.

- [ ] **Step 1: Add failing native/schema registration assertions**

Require `scripts/build-native-schema.mjs` to read the new migration, `database/native/schema.sql` to contain the operation/source columns and extended RPC, `package.json` to expose `test:sales-payment-accounting`, and Sales verification to require the integration migration and form component.

- [ ] **Step 2: Run focused and native tests and confirm RED**

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-payment-accounting.test.mts tests/native-schema.test.mts
```

- [ ] **Step 3: Append the migration in the native schema generator**

Add a URL for `202608230001_sales_payment_accounting_integration.sql`, include it in the `Promise.all`, and append its trimmed contents after the stock-out quantity migration and before native service grants.

- [ ] **Step 4: Regenerate the native schema**

Run:

```powershell
npm run native:schema
```

Inspect the generated diff to ensure it preserves the workspace's current stock-out/native schema content and adds the Sales payment integration exactly once.

- [ ] **Step 5: Register focused verification and update static Sales checks**

Add:

```json
"test:sales-payment-accounting": "node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-payment-accounting.test.mts"
```

Update `scripts/verify-sales.mjs` to require the integration migration, conditional payment fields, `requested_operation_id`, `requested_receipt_channel`, and `/admin/accounting` revalidation.

- [ ] **Step 6: Document implemented behavior**

Update `docs/SALES.md` and `docs/ACCOUNTING.md` with atomic posting, exact method versus receipt channel, operation ID idempotency, closed-day rejection, no historical backfill, cancellation guard, and the explicit absence of refund/reversal behavior.

- [ ] **Step 7: Run Task 4 tests and confirm GREEN**

Run the Task 4 test command plus `npm run test:sales-payment-accounting` and `npm run test:accounting-cashbook`.

- [ ] **Step 8: Commit Task 4**

```powershell
git add -- scripts/build-native-schema.mjs database/native/schema.sql package.json package-lock.json scripts/verify-sales.mjs docs/SALES.md docs/ACCOUNTING.md tests/native-schema.test.mts tests/sales-payment-accounting.test.mts
git commit -m "docs: verify sales payment accounting integration"
```

### Task 5: Full Local Verification and Browser Review

**Files:**
- Modify only files already in scope when verification exposes a regression.

**Interfaces:**
- Consumes the completed feature and local Supabase/native schema.
- Produces verified local code and a running local review URL; no deployment.

- [ ] **Step 1: Run focused and neighboring automated suites**

```powershell
npm run test:sales-payment-accounting
npm run test:sales
npm run test:accounting-cashbook
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/accounting-cashbook-permission.test.mts tests/accounting-cashbook-print.test.mts tests/native-schema.test.mts
npx supabase test db supabase/tests/sales_payment_accounting.sql
npx supabase test db supabase/tests/minimal_sales.sql
```

- [ ] **Step 2: Run repository quality gates**

```powershell
npm run lint
npm run build
```

Expected: no new TypeScript, ESLint, or build errors. If an unrelated pre-existing failure remains, capture the exact command and evidence rather than claiming success.

- [ ] **Step 3: Start the local application**

Run `npm run dev` in a persistent terminal session. Record the actual URL emitted by Next.js, normally `http://localhost:3000`.

- [ ] **Step 4: Perform focused browser review**

Using local data only, verify:

- Record Payment has no Credit Sale option.
- Advance Payment and Other require the actual Cash/Bank/MFS channel.
- A partial payment appears once in Sales and the selected-date Daily Cash Statement.
- The Cash Book row shows exact method, ledger channel, reference, journal number, and payment identity.
- A retry/double submission does not create a second record.
- A closed date shows the approved clear error and no records change.
- A paid Sale cannot be cancelled and no financial row is deleted or reversed.
- Manual Cash Book entries still work.

- [ ] **Step 5: Review the final diff and workspace safety**

Run `git status --short`, `git diff --check`, and scoped diffs. Confirm no unrelated dirty files were staged or overwritten and no deployment files/settings were changed.

- [ ] **Step 6: Commit verification-only fixes if needed**

Stage only in-scope files and use:

```powershell
git commit -m "test: verify sales payment accounting integration"
```

Do not create an empty commit when no fix is needed.
