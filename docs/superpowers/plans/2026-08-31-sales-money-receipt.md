# Sales Money Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, immutable, permission-controlled Money Receipt for each existing successful Sales payment, with exactly zero or one receipt per payment and browser Print/Save as PDF support.

**Architecture:** Keep `sale_payments` and `record_sale_payment` unchanged. Add a separate `sale_money_receipts` table and an idempotent security-definer RPC that snapshots one payment’s data and historical summary once; expose it through a row-specific Server Action and a dedicated printable route. Reuse the existing SEN document styling and print button while enforcing the existing all/own Sales scope plus one new `sales.money_receipt` permission.

**Tech Stack:** Next.js 16.2 App Router, React 19 Server Components/Server Actions, Supabase/PostgreSQL and the native PostgreSQL schema overlay, TypeScript/Node test runner, existing Tailwind/CSS and `PrintDocumentButton`.

**Spec:** `docs/superpowers/specs/2026-08-31-sales-money-receipt-design.md`

**Execution status:** Implemented and locally verified. See the SDD ledger at
`.superpowers/sdd/2026-08-31-sales-money-receipt/progress.md` for the command
record and the pre-existing type/build limitations.

All six task headings and the controller verification below are complete; the
checkbox text is retained as the original execution checklist and the ledger
is the authoritative command-by-command record.

## Global Constraints

- One successfully recorded Sales Payment maps to zero or one Money Receipt; recording a payment never auto-generates a receipt.
- Receipt generation uses the exact saved payment amount, date, method, reference, and received-by identity; no duplicate payment-entry form is permitted.
- `payment_id` is unique in the receipt relation; retries, refreshes, double-clicks, and concurrent requests return the same receipt and number.
- Receipt generation is document-only and must not create payments, accounting entries, ledger changes, receivable changes, sale-total changes, inventory/stock/shipment changes, invoice changes, or challan changes.
- Existing Record Payment behavior and frozen modules remain unchanged; only additive receipt files, permission data, linkage, and the minimal payment-row hook may change.
- Receipt snapshots preserve the payment’s historical summary using `created_at ASC, id ASC`, and keep internal notes private.
- Every Server Action and receipt route must validate active authentication, `sales.money_receipt`, and the existing broad/own Sale access scope; UI hiding is not security.
- Use no new runtime dependency; use the existing SEN logo/document styling and browser Print/Save as PDF.
- Local/test only: do not deploy, push, merge, run production migrations, change production environment variables, or modify production credentials.
- Preserve all unrelated dirty-worktree changes. The sandbox’s `.git` directory is read-only; do not attempt unsafe branch/commit workarounds.

## File map

| File | Responsibility |
| --- | --- |
| `lib/sales/money-receipt.ts` | Pure receipt-history contracts/calculation and snapshot validation helpers. |
| `lib/sales/money-receipt-access.ts` | Pure employee/admin broad-versus-own Sale scope decisions reused by the new action and route. |
| `tests/sales-money-receipt.test.mts` | Unit and static regression coverage for history, access, migration, route/action, and frozen payment-form invariants. |
| `supabase/migrations/202608310001_sales_money_receipts.sql` | Additive permission, sequence, receipt table, immutable trigger, RLS, amount-words helper, and idempotent generation RPC. |
| `supabase/tests/sales_money_receipt.sql` | Transactional PostgreSQL acceptance tests for optional generation, mapping, history, idempotency, permissions, and side-effect boundaries. |
| `scripts/build-native-schema.mjs` | Include the new migration in the native schema overlay list. |
| `database/native/schema.sql` | Regenerated native schema artifact containing the receipt migration. |
| `database/native/seed.sql` | Include the catalogue permission for fresh native installs (templates remain unchanged). |
| `lib/sales/data.ts` | Load lightweight receipt metadata with each sale’s existing payment rows. |
| `app/admin/sales/actions.ts` | Add only the row-bound receipt-generation Server Action with auth/scope checks and the new RPC call. |
| `app/admin/sales/[saleId]/page.tsx` | Add only the receipt column/actions to the existing payment table; leave the Record Payment form unchanged. |
| `components/sales/MoneyReceiptAction.tsx` | Small pending-state client button for the row-specific Server Action. |
| `app/admin/sales/[saleId]/payments/[paymentId]/receipt/page.tsx` | Authenticated, scoped receipt lookup route. |
| `components/sales/MoneyReceiptDocument.tsx` | SEN-styled A4 Money Receipt presentation and print controls. |
| `scripts/verify-sales-money-receipt.mjs` | Static safety/structure verifier for the isolated feature. |
| `scripts/verify-sales-money-receipt-database.mjs` | Explicit loopback-only runner for the rollback-only PostgreSQL acceptance fixture. |
| `package.json` | Register the focused verifier without changing existing scripts’ behavior. |

---

### Task 1: Pure history and access contracts (TDD) — complete

**Files:**
- Create: `lib/sales/money-receipt.ts`
- Create: `lib/sales/money-receipt-access.ts`
- Test: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- `calculateMoneyReceiptHistory(input: { saleTotal: number | string; paymentId: string; payments: Array<{ id: string; amount: number | string; status: string; created_at: string }> }): { previouslyPaid: number; thisPayment: number; totalPaid: number; remaining: number; status: "PARTIAL PAYMENT" | "FULL PAYMENT" }`.
- `resolveSalesViewScope(role: string, permissions: ReadonlySet<string>): "own" | "all" | null`.
- `canAccessSale(scope: "own" | "all" | null, actorId: string, createdBy: string | null): boolean`.
- `MoneyReceiptSnapshot` has required `receipt_number`, `receipt_date`, `generated_at`, `sale`, `customer`, `address`, `payment`, `summary`, and `amount_in_words` fields; `assertReceiptSnapshotShape(value: unknown): asserts value is MoneyReceiptSnapshot` validates those fields for route-side immutable JSON rendering.

- [ ] **Step 1: Write failing unit tests.** Add tests that require three received payments to produce `0/50,000/50,000`, `50,000/30,000/80,000`, and `80,000/20,000/100,000` histories; ignore refunded/voided rows; use `created_at` then `id` for ties; floor remaining at zero; and return full status at equality. Add access tests for admin, broad employee, own employee, wrong creator, and missing permission. Add snapshot-shape tests that reject missing payment/summary fields and accept a complete immutable snapshot.
- [ ] **Step 2: Run the focused test and verify RED.** Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-money-receipt.test.mts`; it must fail because the new modules are absent.
- [ ] **Step 3: Implement the smallest pure helpers.** Use integer cents for deterministic two-decimal arithmetic; sort only a copied array by `created_at`, then `id`; include only `status === "received"`; throw a clear error when the requested payment is missing or not received; and keep snapshot validation free of database/UI imports.
- [ ] **Step 4: Run the focused test and verify GREEN.** Re-run the exact command and confirm all history/access/snapshot assertions pass.
- [ ] **Step 5: Record the task in the local SDD ledger.** Because `.git` is read-only, record the changed paths and test output without attempting a commit.

**Acceptance:** The helpers are independently testable, have no side effects, and establish the exact names/types consumed by the SQL/application tasks.

### Task 2: Additive PostgreSQL receipt model and RPC (TDD) — complete

Execution note: this database task may be implemented in two reviewed passes
(migration/RPC first, then the transactional SQL acceptance fixture) while
keeping the interfaces and acceptance criteria below unchanged.

**Files:**
- Create: `supabase/migrations/202608310001_sales_money_receipts.sql`
- Create: `supabase/tests/sales_money_receipt.sql`
- Modify: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- SQL function `public.next_sale_money_receipt_number() returns text` emits `SEN-MR-YYYYMMDD-00001`-style values using `sale_money_receipt_number_seq`.
- SQL function `public.generate_sale_money_receipt(actor_profile_id uuid, requested_payment_id uuid) returns uuid`.
- Table `public.sale_money_receipts(payment_id uuid unique, order_id uuid, receipt_number text unique, receipt_date date, snapshot jsonb, generated_by uuid, created_at timestamptz)`.
- Snapshot keys are `receipt_number`, `receipt_date`, `generated_at`, `sale`, `customer`, `address`, `payment`, `summary`, and `amount_in_words`; internal notes are absent.

- [ ] **Step 1: Extend the failing static tests first.** Assert the migration path is present and contains the exact table/foreign-key/unique payment relation, sequence/function names, immutable trigger, permission key, RLS/grants, auth/scope checks, `ON CONFLICT (payment_id)`, `created_at`/`id` history ordering, amount-words function, and absence of `record_sale_payment`, `cashbook_entries`, inventory mutation, invoice generation, and challan generation calls in the receipt RPC. Assert the SQL acceptance test path exists.
- [ ] **Step 2: Run the focused test and verify RED.** Run the same Node test; migration assertions must fail before the migration exists.
- [ ] **Step 3: Write the additive migration.** Seed `sales.money_receipt` as one sensitive active permission under the existing Sales module without template backfill. Create the sequence and exact `SEN-MR-YYYYMMDD-` number function. Create `sale_money_receipts` with `payment_id NOT NULL REFERENCES sale_payments(id) ON DELETE RESTRICT`, `order_id`/profile FKs, unique payment/number constraints, a JSON-object check, and indexes. Add a trigger rejecting updates/deletes. Enable RLS; allow only authorized, correctly scoped staff reads; grant the generation RPC only to `service_role` and no browser insert/update/delete rights.
- [ ] **Step 4: Implement the security-definer RPC transaction.** Lock the parent sale before the payment to match the payment-recording lock order; validate the active actor, `sales.money_receipt`, sale broad/own scope, payment ownership, and `received` status. Return an existing receipt before rejecting a payment that was later refunded. For a new receipt, select the latest active invoice number if present, use the order billing snapshot or shipping fallback, read the current customer/receiver profile once, sum preceding received payments by `(created_at,id)`, compute summary/status, generate BDT/non-BDT amount words, insert one snapshot with `ON CONFLICT (payment_id) DO NOTHING`, re-read the winning row, and write one safe receipt audit event only on insertion. Do not call or update any financial/inventory/document generator.
- [ ] **Step 5: Add the transactional SQL acceptance test.** Within `BEGIN … ROLLBACK`, create random admin/employee/customer/sale fixtures and saved payment rows, generate only the first and third receipts before explicitly generating the middle one, assert the middle payment remains receipt-free until requested, verify exact saved fields/customer/invoice/amount-words mapping, assert `0/50k/50k` and `80k/20k/100k` summaries, reopen the first after the later payment and assert unchanged snapshot, call generation repeatedly and from concurrent-safe duplicate paths, verify one row/number/audit, assert a non-received payment is rejected, and assert receipt generation leaves payment/cashbook/journal/inventory counts unchanged. Exercise an employee with the permission and own-sale scope, then deny the permission and assert rejection; test a wrong creator/sale scope rejection.
  The rollback fixture uses isolated pre-existing payment rows for the side-effect comparison; the real `record_sale_payment` RPC was separately exercised in the disposable local UI flow before receipt generation.
  Six concurrent local RPC callers were also run against one payment and converged on one receipt row, number, and audit event.
- [ ] **Step 6: Run static tests and, when the disposable local PostgreSQL is available, run the SQL test.** Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/sales-money-receipt.test.mts`; run `npm run test:sales-money-receipt:db` with `SALES_MONEY_RECEIPT_TEST_DATABASE_URL` set to a loopback, test-named database (or an equivalent local Supabase DB command), never a production database.
- [ ] **Step 7: Record the task in the local SDD ledger** with commands/results and changed paths; do not commit through the read-only `.git` directory.

**Acceptance:** A payment can exist without a receipt; only an existing successful payment can create one; all receipt values are immutable and one-to-one; the RPC has no accounting/inventory/invoice/challan side effects.

### Task 3: Native schema and migration verification — complete

**Files:**
- Modify: `scripts/build-native-schema.mjs` (migration URL/read/append list only)
- Modify: `database/native/schema.sql` (generated output only)
- Modify: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- `npm run native:schema` regenerates `database/native/schema.sql` with the receipt sequence/table/functions/permission/RLS after the existing 20260823 overlays.

- [ ] **Step 1: Add failing native assertions.** Assert the builder references `202608310001_sales_money_receipts.sql` and the generated schema contains `sale_money_receipts`, `payment_id`, `sales.money_receipt`, `generate_sale_money_receipt`, and the sequence number function.
- [ ] **Step 2: Run the focused test and verify RED.** The new native assertions must fail before the builder is changed.
- [ ] **Step 3: Make the minimal builder edit and regenerate.** Add one URL, one `readFile` result, one Promise entry, and one appended migration segment; run `npm run native:schema`. Add the same catalogue permission row to the native seed because fresh native installs load seed data after the schema overlay. Do not hand-edit unrelated generated sections.
- [ ] **Step 4: Run focused native/static checks.** Re-run the Node test and `npm run test:native`; inspect the generated diff to confirm only the new migration overlay is attributable to this task.
- [ ] **Step 5: Record the task in the local SDD ledger** with the generated-file audit.

**Acceptance:** Fresh native installs receive the same receipt model and permission without changing existing overlays.

### Task 4: Server action, sale data, and payment-row action — complete

**Files:**
- Modify: `lib/sales/data.ts` (receipt metadata query/map only)
- Modify: `app/admin/sales/actions.ts` (new action only)
- Modify: `app/admin/sales/[saleId]/page.tsx` (receipt column/links only)
- Create: `components/sales/MoneyReceiptAction.tsx`
- Modify: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- `generateMoneyReceiptAction(saleId: string, paymentId: string, form: FormData): Promise<never>` calls only `generate_sale_money_receipt` and redirects to `/admin/sales/${saleId}/payments/${paymentId}/receipt`.
- `getSale(...).payments[n].moneyReceipt` is `null | { id: string; payment_id: string; receipt_number: string; receipt_date: string; created_at: string }`.
- `MoneyReceiptAction` accepts `{ action: (form: FormData) => void | Promise<void>; label: string }` and renders a pending-safe button without collecting payment fields.

- [ ] **Step 1: Add failing static/integration-shape assertions.** Assert the action requires `sales.money_receipt`, loads and verifies the requested sale scope, passes only actor/payment IDs to the new RPC, revalidates the sale, and never calls `record_sale_payment` or accounting/inventory functions. Assert `getSale` queries receipt metadata by payment IDs. Assert the existing Record Payment form still contains its original field names and action. Assert the payment table has a row-specific receipt column and no receipt form fields for amount/date/method/reference.
- [ ] **Step 2: Run the focused test and verify RED.** Run the Node test and confirm the new action/data/UI assertions fail.
- [ ] **Step 3: Add the data mapping.** Query `sale_money_receipts` by the loaded payment IDs, assert errors like other `getSale` queries, and merge metadata by `payment.id` without changing payment ordering or accounting links.
- [ ] **Step 4: Add the Server Action.** Use `requirePermission("sales.money_receipt")`, load only `id,created_by` for `saleId`, apply `resolveSalesViewScope`/`canAccessSale`, call the new RPC with the authenticated profile and payment ID, handle safe errors, revalidate the sale path, and redirect. Do not parse or accept amount/date/method/reference from the form.
- [ ] **Step 5: Add the row UI.** Keep the existing payment form markup/submission untouched. Add one receipt cell: a row-bound Generate form when `moneyReceipt` is absent and the actor has the feature permission, otherwise View Money Receipt/Print access for the existing receipt. Use the small pending button; never expose internal notes.
- [ ] **Step 6: Run focused tests and typecheck the touched modules.** Run the Node test and `npx tsc --noEmit`; resolve only errors caused by this feature.
- [ ] **Step 7: Record the task in the local SDD ledger** with the exact changed-file audit.

**Acceptance:** Existing payment recording is byte-for-byte behaviorally preserved; each row’s optional action is tied to its own payment ID and is permission/scope protected on the server.

### Task 5: Printable receipt route and SEN document — complete

**Files:**
- Create: `app/admin/sales/[saleId]/payments/[paymentId]/receipt/page.tsx`
- Create: `components/sales/MoneyReceiptDocument.tsx`
- Modify: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- The route accepts Next 16 promise params `{ saleId: string; paymentId: string }`, requires `sales.money_receipt`, verifies the payment belongs to the sale and the caller’s broad/own scope, loads only the immutable receipt snapshot, and calls `notFound()` for missing/mismatched/unauthorized records.
- `MoneyReceiptDocument` receives a validated receipt record plus a sale-back link and renders a server-only A4 document with `PrintDocumentButton`.

- [ ] **Step 1: Add failing route/document assertions.** Require promise params, active auth/feature/sale-scope checks, payment/sale matching, snapshot-only rendering, the official logo, `MONEY RECEIPT`, customer/payment/summary/status/signature sections, `PrintDocumentButton`, A4 print CSS, and absence of internal-note/accounting/inventory/payment mutation tokens.
- [ ] **Step 2: Run the focused test and verify RED.** The route/component assertions must fail before the files exist.
- [ ] **Step 3: Implement the scoped route.** Call `connection()` as existing dynamic pages do, use the existing permission/session helpers and new scope helper, query receipt by `payment_id` and `order_id`, validate the snapshot, and render the standalone document so dashboard chrome cannot change the A4 print geometry. Do not recompute totals from current payments.
- [ ] **Step 4: Implement the isolated document component.** Reuse `siteConfig` logo/name, the established SEN address/contact literals, `money`, `label`, and date formatting; render exact saved payment fields, invoice reference only when snapshotted, amount words, historical summary/status, and signature blocks. Use `PrintDocumentButton` with a sanitized receipt-number filename and print-only CSS.
- [ ] **Step 5: Run focused tests, `npx tsc --noEmit`, and a local production build if dependencies are ready.** Fix only receipt-route/type/layout defects.
- [ ] **Step 6: Record the task in the local SDD ledger** with route and print verification evidence.

**Acceptance:** A known receipt URL cannot reveal a document without authentication, permission, and Sale scope; the printed document is a professional immutable snapshot and has no financial side effects.

### Task 6: Focused verifier, documentation, and local review setup — complete

**Files:**
- Create: `scripts/verify-sales-money-receipt.mjs`
- Modify: `package.json` (one focused script entry; preserve existing formatting/entries)
- Modify: `docs/SALES.md` (append a concise receipt route/behavior paragraph only)
- Modify: `tests/sales-money-receipt.test.mts`

**Interfaces:**
- `npm run test:sales-money-receipt` runs the focused static/unit verifier and exits nonzero on missing isolation/security tokens.

- [ ] **Step 1: Add failing verifier assertions.** Require all created migration/domain/action/route/component/test files; assert optional zero-or-one language, unique payment linkage, permission guards, no duplicate payment fields, historical snapshot labels, print infrastructure, and no production/deployment credential changes. Add the package script assertion.
- [ ] **Step 2: Run the verifier and verify RED.** Run `node scripts/verify-sales-money-receipt.mjs`; it must fail until the feature files exist.
- [ ] **Step 3: Implement the verifier and register it.** Read files using the project’s existing verifier pattern and assert exact feature tokens/forbidden side-effect tokens; add the focused static/unit command and the explicitly opt-in, loopback-only database fixture command to `package.json`.
- [ ] **Step 4: Append the Sales documentation.** Document the optional payment→receipt route, one-to-one/idempotency rule, historical snapshot rule, permission key, and browser Print/Save PDF behavior without rewriting existing Sales text.
- [ ] **Step 5: Run the focused verifier and all focused tests.** Run `npm run test:sales-money-receipt`, `npm run test:sales`, `npm run test:sales-payment-accounting`, and `npm run test:native`.
- [ ] **Step 6: Prepare the disposable local review account without repository credentials.** Use the existing native local profile/credential mechanism on the disposable review database only. If no suitable admin exists, create a clearly named local-only profile through the existing operator script and set a temporary password via `SEN_NEW_PASSWORD`; never write the plaintext password to source or alter a production account.
- [ ] **Step 7: Record the task in the local SDD ledger** with the local URL/account setup status and no-deployment confirmation.

**Acceptance:** A reviewer can run one focused command, see the safety boundaries, and receive local-only test access without any production mutation.

### Final verification (controller) — complete with noted pre-existing build blockers

- [ ] Inspect `git status --short` and `git diff --` file by file. Keep only feature-related edits; preserve all pre-existing unrelated changes and list them separately.
- [ ] Run `npm run test:sales-money-receipt`, `npm run test:sales`, `npm run test:sales-payment-accounting`, `npm run test:native`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` locally. Record pre-existing failures separately from receipt failures.
- [ ] Apply/run `supabase/tests/sales_money_receipt.sql` only against the disposable local/native database and perform browser checks at the local URL: login, existing sale, partial payment, optional receipt generation, print/save PDF, second/final payment, old receipt history, duplicate clicks, staff permission on/off, and direct URL denial.
- [ ] Confirm invoice/challan pages, accounting counts/links, inventory/stock/shipment state, and the original Record Payment form are unchanged by receipt generation.
- [ ] Do not deploy, push, merge, run production migrations, change production environment variables, or modify production credentials.
- [ ] Report exact changed files, migration, permission, mapping, numbering, idempotency, test/build results, local URL/temporary credentials, limitations, and the explicit status `NOT DEPLOYED TO PRODUCTION — WAITING FOR USER FINAL APPROVAL`.
