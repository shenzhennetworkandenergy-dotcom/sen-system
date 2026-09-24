# Approved Quotation to Sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-safe, review-first, atomic, one-to-one conversion from a customer-accepted quotation into the existing draft Sales workflow.

**Architecture:** Preserve the Session 5 production lineage and extend the existing quotation status field, metadata, audit trail, permission catalogue, Sales form, and `converted_order_id` relationship. A dedicated database function locks and validates the quotation, calls the existing draft Sale creator, links both records, and records audit atomically; selection and prefill remain read-only and reuse `SaleBuilder`.

**Tech Stack:** Next.js 16.2 App Router and Server Actions, React 19, TypeScript 5, Supabase/PostgreSQL PL/pgSQL, Node test runner, ESLint 9, existing native PostgreSQL schema pipeline.

**Spec:** `docs/superpowers/specs/2026-08-23-quotation-to-sale-design.md`

## Global Constraints

- Base implementation on the committed line containing `317b76a`, `8910880`, `3c8e831`, `3868c29`, `4f8a334`, and `d8d53d9`.
- Preserve inline quotation customer creation, immediate selection, shared customer type-ahead, `quotations.view_own`, creator ownership enforcement, and independent quotation permissions.
- Work in a clean isolated worktree. Do not copy, edit, stage, commit, merge, or deploy unrelated dirty files from the primary workspace.
- Read relevant Next.js 16 guides under `node_modules/next/dist/docs/` before changing Server Actions, forms, pages, or routes.
- Keep internal `approved`/`rejected` separate from customer `accepted`/`declined`.
- Search and import are read-only. They must not create a Sale, invoice, reservation, Stock Out request, inventory movement, or other mutation.
- Conversion creates one draft Sale only. Confirmation, invoice finalization, Stock Out, Inventory, Accounting, Shipment, and manual Create Sale remain authoritative and unchanged.
- Reuse `quotation_requests.converted_order_id`; do not add a duplicate Sales-side quotation foreign key.
- Do not deploy. Stop after complete local verification and provide a local review URL.

## File Responsibility Map

- `lib/quotations/workflow.ts` — pure state, expiry, eligibility, and status-presentation rules.
- `lib/quotations/sale-conversion-types.ts` — safe types shared with `SaleBuilder`.
- `lib/quotations/sale-conversion.ts` — server-only eligible search/prefill loader with visibility scope.
- `lib/sales/create-draft-input.ts` — shared manual/conversion draft Sale parsing.
- `supabase/migrations/202608230004_quotation_to_sale.sql` — additive schema, permissions, transitions, search, notifications, and conversion RPC.
- `app/admin/sales/from-quotation/` — selection page and authorized type-ahead action.
- `components/sales/QuotationTypeahead.tsx` — debounced accessible selector.
- `components/sales/SourceQuotationSummary.tsx` — read-only source terms.
- `scripts/verify-quotation-to-sale-database.mjs` — database rollback, side-effect, and concurrency verification.
- `tests/quotation-to-sale-*.test.mts` — focused pure/static regression coverage.

---

### Task 1: Create and Verify the Isolated Session 5 Base

**Files:**
- Read: `docs/superpowers/specs/2026-08-23-quotation-to-sale-design.md`
- Read: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
- Read: `node_modules/next/dist/docs/01-app/02-guides/forms.md`
- Read: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- Read: `node_modules/next/dist/docs/01-app/02-guides/data-security.md`

**Interfaces:**
- Consumes: committed HEAD containing `d8d53d9` and the approved spec/plan.
- Produces: clean `codex/quotation-to-sale-integration` worktree.

- [ ] **Step 1: Invoke `superpowers:using-git-worktrees` and verify ancestry**

Confirm `4f8a33437e17c347d46b07882e3076ad23fda22f` and `d8d53d9` are ancestors of HEAD, and the tracking branch has no commits absent from HEAD.

- [ ] **Step 2: Create the isolated worktree**

Create it under the repository’s approved worktree directory from the plan commit. Do not use the dirty primary directory as the implementation source.

- [ ] **Step 3: Prove Session 5 files are present**

Run `git status --short` and `git ls-files` for `CustomerTypeahead.tsx`, `QuotationBuilder.tsx`, both quotation access files, and `202608230003_quotation_view_own.sql`. Expected: clean tree and all paths tracked.

- [ ] **Step 4: Run preservation tests**

Run:

```powershell
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/customer-typeahead.test.mts tests/quotation-customer-creation.test.mts tests/quotation-own-access.test.mts
```

Expected: 10 tests pass.

### Task 2: Define Quotation Business-State Policy Test-First

**Files:**
- Create: `lib/quotations/workflow.ts`
- Create: `tests/quotation-to-sale-workflow.test.mts`

**Interfaces:**
- Produces: `QuotationBusinessStatus`, `quotationStatusMeta`, `isQuotationExpired`, `canTransitionQuotation`, `isQuotationSaleEligible`, `isQuotationImmutable`.

- [ ] **Step 1: Write failing state-policy tests**

```ts
assert.equal(canTransitionQuotation("draft", "approve"), true);
assert.equal(canTransitionQuotation("approved", "issue"), true);
assert.equal(canTransitionQuotation("quoted", "accept"), true);
assert.equal(canTransitionQuotation("quoted", "decline"), true);
assert.equal(canTransitionQuotation("accepted", "convert"), true);
assert.equal(canTransitionQuotation("approved", "convert"), false);
assert.equal(canTransitionQuotation("rejected", "convert"), false);
assert.equal(canTransitionQuotation("declined", "convert"), false);
assert.equal(canTransitionQuotation("converted_to_sale", "convert"), false);
assert.equal(isQuotationSaleEligible({status:"accepted", expirationDate:"2026-08-24", convertedOrderId:null}, "2026-08-23"), true);
assert.equal(isQuotationSaleEligible({status:"accepted", expirationDate:"2026-08-22", convertedOrderId:null}, "2026-08-23"), false);
assert.equal(isQuotationImmutable("accepted"), true);
```

Also assert badge labels/colors for Draft, Issued, Accepted, Rejected by Customer, Expired, Converted to Sale, and legacy Converted to Invoice.

- [ ] **Step 2: Run and verify failure**

Run the new test. Expected: FAIL because the policy file is absent.

- [ ] **Step 3: Implement the transition table**

```ts
const transitionSources = {
  approve: new Set(["draft", "reviewing", "quoted"]),
  reject: new Set(["draft", "reviewing", "approved", "quoted"]),
  issue: new Set(["approved"]),
  accept: new Set(["quoted"]),
  decline: new Set(["quoted"]),
  convert: new Set(["accepted"]),
} as const;
```

The `quoted` approval source is a compatibility path for existing pre-feature records. Date-only expiry blocks acceptance and conversion when `expirationDate < today`.

- [ ] **Step 4: Run tests and commit**

```powershell
git add lib/quotations/workflow.ts tests/quotation-to-sale-workflow.test.mts
git commit -m "feat: define quotation business workflow"
```

### Task 3: Add Backward-Compatible Database State and Atomic Conversion

**Files:**
- Create: `supabase/migrations/202608230004_quotation_to_sale.sql`
- Create: `tests/quotation-to-sale-migration.test.mts`

**Interfaces:**
- Consumes: `create_minimal_sale`, effective permissions, quotation items, audit log, `converted_order_id`.
- Produces: metadata/statuses, permissions, `transition_quotation_business_status`, `search_eligible_quotations_for_sale`, `create_sale_from_quotation`.

- [ ] **Step 1: Write a failing additive-migration contract**

Assert metadata columns, both permission keys, `FOR UPDATE`, `create_minimal_sale`, `converted_to_sale`, service-role-only grants, and absence of quotation deletes, product/inventory updates, confirmation, and invoice finalization calls.

- [ ] **Step 2: Run and verify failure**

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Add metadata/status/permission/notification SQL**

Add `draft` and `converted_to_sale` while retaining every legacy status. Add nullable `issued_at/by`, `customer_accepted_at/by`, `customer_declined_at/by`, and `customer_decline_reason`. Insert:

```sql
('quotations.record_customer_outcome','Record customer quotation outcome','Record customer acceptance or rejection with actor, date and reason.','record_customer_outcome',true,45),
('quotations.convert_to_sale','Create Sales from Quotations','Create one linked draft Sale from an accepted quotation.','convert_to_sale',true,72)
```

Allow notification types for issued, accepted, declined, and converted-to-sale. Draft creation/internal approval must not send a misleading customer acceptance notice.

- [ ] **Step 4: Implement atomic transitions**

Create:

```sql
public.transition_quotation_business_status(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_transition text,
  requested_reason text default null
) returns text
```

Lock the row; enforce transition-specific permission and broad/own visibility; validate source state/expiry; require a decline reason; update matching metadata; insert one audit row in the same transaction.

- [ ] **Step 5: Implement bounded eligible search**

Create `search_eligible_quotations_for_sale(actor_profile_id, requested_query, requested_limit default 20)` returning ID, reference, safe customer fields, total/currency/expiry. Require both permissions, own/all scope, `accepted`, unexpired, unconverted; search reference/name/company/email; exact reference first; cap at 20.

- [ ] **Step 6: Implement atomic conversion**

Use this signature:

```sql
public.create_sale_from_quotation(
  actor_profile_id uuid,
  requested_quotation_id uuid,
  requested_customer_id uuid,
  requested_address_id uuid,
  requested_address jsonb,
  requested_billing_address_id uuid,
  requested_billing_address jsonb,
  requested_warehouse_id uuid,
  requested_source text,
  requested_expected_delivery_date date,
  requested_discount numeric,
  requested_shipping numeric,
  requested_service numeric,
  requested_tax numeric,
  requested_internal_notes text,
  requested_customer_notes text,
  requested_items jsonb,
  requested_adjustments jsonb
) returns jsonb
```

Order: assert both permissions; lock quote; enforce own/all access; return existing linked Sale on retry; require accepted/unexpired/active matching customer/catalogue items; validate source quotation item IDs; compare reviewed price/discount with accepted baselines; require existing Sales change permissions only for edits; validate added lines against catalogue; call `create_minimal_sale`; record quotation origin in order events; link/status/audit; return Sale ID/number. Never call confirmation, reservation, invoice, Stock Out, payment, inventory, or shipment functions.

- [ ] **Step 7: Run contract tests and commit**

```powershell
git add supabase/migrations/202608230004_quotation_to_sale.sql tests/quotation-to-sale-migration.test.mts
git commit -m "feat: add atomic quotation sale conversion"
```

### Task 4: Wire Controlled Quotation Outcomes and Status UI

**Files:**
- Modify: `app/admin/quotations/actions.ts`
- Modify: `app/admin/quotations/workflow-actions.ts`
- Modify: `app/admin/quotations/[id]/manage/page.tsx`
- Modify: `app/admin/quotations/page.tsx`
- Modify: `components/quotations/QuotationOperations.tsx`
- Create: `components/quotations/QuotationStatusBadge.tsx`
- Create: `tests/quotation-to-sale-actions.test.mts`
- Create: `tests/quotation-status-ui.test.mts`

**Interfaces:**
- Consumes: policy and transition RPC.
- Produces: dedicated approve/reject/issue/accept/decline actions and status badges.

- [ ] **Step 1: Write failing action/UI tests**

Assert staff creation uses draft; generic update cannot manufacture accepted/declined/converted states; dedicated actions call the transition RPC; decline requires a reason; UI capabilities use `record_customer_outcome`, `convert_to_sale`, and `sales.create`; list uses the status badge component.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Change only staff quotation creation status to draft**

Preserve Session 5 `createQuotationCustomerAction`, `useActionState`, immediate local option insertion, and shared `CustomerTypeahead` behavior.

- [ ] **Step 4: Export dedicated actions**

Export `approveQuotationAction`, `rejectQuotationAction`, `issueQuotationAction`, `acceptQuotationAction`, and `declineQuotationAction`. Each route guard and `quotationForUpdate` applies permission/creator scope before the transition RPC. Decline reason is 1–2000 characters.

- [ ] **Step 5: Enforce immutability and render state-aware controls**

Block details/generic status mutation for terminal immutable states. Show only transitions valid now. For eligible accepted quotes, link to `/admin/sales/new?quotation=<id>`. Retain old converted invoice links for legacy rows.

- [ ] **Step 6: Run focused plus Session 5 tests and commit**

```powershell
git add app/admin/quotations components/quotations tests/quotation-to-sale-actions.test.mts tests/quotation-status-ui.test.mts
git commit -m "feat: record quotation customer outcomes"
```

### Task 5: Add Authorized Eligible Search and Prefill Data

**Files:**
- Create: `lib/quotations/sale-conversion-types.ts`
- Create: `lib/quotations/sale-conversion.ts`
- Create: `app/admin/sales/from-quotation/actions.ts`
- Create: `app/admin/sales/from-quotation/page.tsx`
- Create: `components/sales/QuotationTypeahead.tsx`
- Create: `tests/quotation-to-sale-search.test.mts`

**Interfaces:**
- Produces: `EligibleQuotationOption`, `QuotationSaleInitial`, `searchEligibleQuotationsAction`, `loadQuotationSaleInitial`.

- [ ] **Step 1: Write failing search/scope tests**

Require both permissions in page/action, 20-result cap, reference/name/company/email search, own creator filtering in prefill, and accepted/non-expired/unconverted predicates.

- [ ] **Step 2: Define safe types**

```ts
export type QuotationSaleInitialLine = {
  quotationItemId: string; productId: string; variationId: string | null;
  quantity: number; unitPrice: number; lineDiscount: number; lineTax: number;
};
export type QuotationSaleInitial = {
  quotationId: string; reference: string; customerId: string;
  billingAddressId: string | null; shippingAddressId: string | null;
  expectedDeliveryDate: string | null; discountAmount: number; taxAmount: number;
  customerNotes: string | null; internalNotes: string | null;
  paymentTerms: string | null; deliveryInformation: string | null;
  termsAndConditions: string | null; lines: QuotationSaleInitialLine[];
};
```

- [ ] **Step 3: Implement the server-only loader**

Query only selected safe fields; add `.eq("created_by", actor.id)` under own scope; require accepted/unexpired/unconverted; perform no mutation.

- [ ] **Step 4: Implement the 250 ms debounced type-ahead**

After two characters call the authorized action, show reference first plus customer/company/total, and navigate to `/admin/sales/new?quotation=<id>`. Return safe messages, never raw DB errors.

- [ ] **Step 5: Run tests and commit**

```powershell
git add lib/quotations/sale-conversion-types.ts lib/quotations/sale-conversion.ts app/admin/sales/from-quotation components/sales/QuotationTypeahead.tsx tests/quotation-to-sale-search.test.mts
git commit -m "feat: search accepted quotations for sales"
```

### Task 6: Share Draft Sale Parsing and Add Conversion Action

**Files:**
- Create: `lib/sales/create-draft-input.ts`
- Modify: `app/admin/sales/actions.ts`
- Create: `tests/quotation-to-sale-input.test.mts`

**Interfaces:**
- Produces: `parseDraftSaleInput`, unchanged `createSaleAction`, `createSaleFromQuotationAction`.

- [ ] **Step 1: Write failing parser tests**

Cover UUIDs, whole quantities, line tax/discount, source quotation item IDs, money, addresses, header adjustments, empty items, and invalid/negative input.

- [ ] **Step 2: Extract current manual normalization**

Use the helper from `createSaleAction` without changing its RPC arguments or permission behavior. Add optional `source_quotation_item_id` and parsed `line_tax`.

- [ ] **Step 3: Add conversion action**

Require all `sales.create` and `quotations.convert_to_sale`; parse the same form; validate quote UUID; reapply creator visibility before RPC; call `create_sale_from_quotation`; redirect retries to the returned existing Sale. Do not add a non-atomic application conversion audit.

- [ ] **Step 4: Run parser/Sales tests and commit**

```powershell
git add lib/sales/create-draft-input.ts app/admin/sales/actions.ts tests/quotation-to-sale-input.test.mts
git commit -m "feat: submit quotation sourced draft sales"
```

### Task 7: Prefill Existing SaleBuilder Without Changing Manual Sales

**Files:**
- Modify: `app/admin/sales/new/page.tsx`
- Modify: `app/admin/sales/page.tsx`
- Modify: `components/sales/SaleBuilder.tsx`
- Modify: `components/customers/CustomerTypeahead.tsx`
- Create: `components/sales/SourceQuotationSummary.tsx`
- Create: `tests/quotation-to-sale-prefill.test.mts`

**Interfaces:**
- Consumes: `QuotationSaleInitial` and conversion action.
- Produces: optional `initialQuotation` prop; manual call without it is unchanged.

- [ ] **Step 1: Write failing prefill/manual regression tests**

Assert exact customer/product/variation/quantity/price/discount/tax/header/date prefill, quote price baseline, read-only terms, conversion action in quote mode, manual action otherwise, and no import-time mutation calls.

- [ ] **Step 2: Extend CustomerTypeahead compatibly**

Add `locked?: boolean` default false. Locked renders selected label and hidden ID without changing search or Session 5 quick-create behavior when absent.

- [ ] **Step 3: Initialize SaleBuilder from quotation**

Use lazy state initializers. Set quote unit price as baseline, include source item ID, preserve line discount/tax, default adjustment reason to `Approved quotation <reference>`, and render line tax only in quote mode. Customer is locked; normal product/quantity/commercial controls remain.

- [ ] **Step 4: Authorize quotation mode in existing new-Sale page**

Always require `sales.create`; with `searchParams.quotation`, additionally require `quotations.convert_to_sale`, load prefill, hide new-customer form, show source summary, and pass initial data.

- [ ] **Step 5: Add separate Sales entry**

Keep **Create Sale** unchanged. Add **Create Sale from Quotation** only for admin or an employee with both permissions.

- [ ] **Step 6: Run focused, Session 5, and manual Sales tests; commit**

```powershell
git add app/admin/sales components/sales components/customers/CustomerTypeahead.tsx tests/quotation-to-sale-prefill.test.mts
git commit -m "feat: prefill existing sale form from quotations"
```

### Task 8: Complete Bidirectional Traceability

**Files:**
- Modify: `lib/sales/data.ts`
- Modify: `app/admin/sales/[saleId]/page.tsx`
- Modify: `app/admin/quotations/[id]/manage/page.tsx`
- Modify: `components/quotations/QuotationOperations.tsx`
- Create: `tests/quotation-to-sale-traceability.test.mts`

**Interfaces:**
- Produces: `getSale(...).sourceQuotation` and linked Sale number, using only `converted_order_id`.

- [ ] **Step 1: Write failing traceability tests**

Assert Sales reverse query by `converted_order_id`, `Source Quotation`, `Converted Sale`, and absence of a `sales_orders.source_quotation_id` migration.

- [ ] **Step 2: Add authorized reverse/forward queries and compact links**

Sales links to quotation manage; quotation links to Sales; legacy invoice link remains only when present. Do not expose internal source data through customer routes.

- [ ] **Step 3: Run and commit**

```powershell
git add lib/sales/data.ts app/admin/sales/[saleId]/page.tsx app/admin/quotations/[id]/manage/page.tsx components/quotations/QuotationOperations.tsx tests/quotation-to-sale-traceability.test.mts
git commit -m "feat: trace quotation sale relationships"
```

### Task 9: Verify Database Atomicity, Permissions, Side Effects, and Concurrency

**Files:**
- Create: `scripts/verify-quotation-to-sale-database.mjs`
- Modify: `package.json`
- Create: `supabase/tests/quotation_to_sale.sql`

**Interfaces:**
- Produces: `npm run test:quotation-to-sale-database`.

- [ ] **Step 1: Write the local-only verifier**

Refuse non-local URLs. Seed isolated actors/customer/product/warehouse/address/quotes. Assert draft/approved/internal-rejected/customer-declined/expired denial; accepted success; own-scope and permission denial; exact commercial transfer; catalogue price not substituted; zero reservation/invoice/Stock Out/inventory changes; invalid-item rollback; two concurrent calls returning one Sale; one link/audit; manual create still unlinked.

- [ ] **Step 2: Verify disposable local database**

Run `supabase status`; continue only for localhost/127.0.0.1. Never reset/push a linked or remote project.

- [ ] **Step 3: Apply locally, run, fix only feature defects, rerun**

Do not alter downstream Inventory/Invoice/Stock Out/Accounting/Shipment functions to make this pass.

- [ ] **Step 4: Commit**

```powershell
git add scripts/verify-quotation-to-sale-database.mjs supabase/tests/quotation_to_sale.sql package.json
git commit -m "test: verify quotation sale atomicity"
```

### Task 10: Add Feature-Relevant Native Schema Parity Only

**Files:**
- Modify: `scripts/build-native-schema.mjs`
- Modify: `database/native/schema.sql`
- Modify: `database/native/seed.sql`
- Create: `tests/quotation-to-sale-native-schema.test.mts`

**Interfaces:**
- Consumes: tracked View Own and new conversion migrations.
- Produces: native ownership/conversion schema and permissions.

- [ ] **Step 1: Write failing parity tests**

Require builder references to both migrations; native schema contains `created_by`, `quotations.view_own`, outcome metadata, `quotations.convert_to_sale`, and `create_sale_from_quotation`; native seed contains both new permissions.

- [ ] **Step 2: Add only the two feature-relevant migrations**

Preserve existing builder entries and apply View Own before conversion. Do not stage or commit unrelated dirty migrations. If a missing pre-existing builder dependency is required only to run a local parity check, copy it into the isolated worktree as an unstaged test fixture, verify its checksum against the primary workspace source, and remove it after the check.

- [ ] **Step 3: Update generated artifacts additively and inspect diff**

Place migration SQL before native grants. Prove no Purchase, Inventory, HR, Accounting, Shipment, or other unrelated schema changes are added.

- [ ] **Step 4: Run native tests**

Run `npm run test:native` and the focused parity test. If local runtime needs existing untracked dependencies, use them only as unstaged test fixtures and prove none enter the commit.

- [ ] **Step 5: Commit**

```powershell
git add scripts/build-native-schema.mjs database/native/schema.sql database/native/seed.sql tests/quotation-to-sale-native-schema.test.mts
git commit -m "chore: align quotation conversion schemas"
```

### Task 11: Complete Local Regression and Open Review Server

**Files:**
- Modify only when a failing check demonstrates a quotation-to-sale defect.

**Interfaces:**
- Produces: verified local commit, test report, local URL; no deployment.

- [ ] **Step 1: Invoke `superpowers:verification-before-completion`**

- [ ] **Step 2: Run focused and preservation suites**

Run all quotation-to-sale tests/database verifier, Session 5 tests, quotation document, Sales, product search, line editing, stock confirmation/finalization/release, and shipment tests.

- [ ] **Step 3: Run compiler, lint, standalone, release, and build gates**

```powershell
npx tsc --noEmit
npm run lint
npm run test:standalone
npm run test:release
npm run build
```

Every command must exit 0. A pre-existing failure that cannot be fixed without unrelated scope is a blocker, not a pass.

- [ ] **Step 4: Review isolation**

Run `git status --short`, `git diff --check`, and diff the plan-base commit to HEAD. Only plan/spec, Quotation, Sales, focused schema, and focused tests may appear.

- [ ] **Step 5: Invoke `superpowers:requesting-code-review`**

Resolve every critical/high finding and rerun affected/full gates.

- [ ] **Step 6: Start local review server**

Start Next.js from the isolated worktree on `127.0.0.1` using an available port. Verify login, quotation list/manage/print, Sales list/manual create, selection, prefill, and linked draft Sale routes. Keep it running and report the exact URL.

- [ ] **Step 7: Stop before deployment**

Report synchronized base, implementation, schema/permissions, changed files, all results, commit, local URL, known issues, and confirm production Vercel/Supabase were untouched.
