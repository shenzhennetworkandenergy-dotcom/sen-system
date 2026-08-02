# Create Quotation Customer Addition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quotation-authorized customer form to Create Quotation and make the new customer immediately available for quotation selection.

**Architecture:** A pure customer-input normalizer supplies bounded values to a new quotation-specific Server Action. The existing server-rendered quotation page displays a collapsible form above the unchanged `QuotationBuilder`; a successful action redirects back so the existing customer query supplies the newly created customer.

**Tech Stack:** Next.js 16 Server Components and Server Actions, TypeScript, Supabase Auth/Postgres, Node test runner, Tailwind CSS.

## Global Constraints

- Preserve existing Create Sale behavior.
- Authorize customer creation with `quotations.create`.
- Create an active customer profile and one default Bangladesh delivery address.
- Keep quotation product, pricing and submission logic unchanged.
- Do not add a database migration.

---

### Task 1: Define customer input behavior

**Files:**
- Create: `lib/customers/basic.ts`
- Create: `tests/quotation-customer-creation.test.mts`

**Interfaces:**
- Produces: `normalizeBasicCustomerInput(input): BasicCustomerInput`

- [ ] **Step 1: Write failing normalization tests**

Test that whitespace is trimmed, email is lowercased, values are bounded, and valid input returns full name, email, phone and address. Test that missing fields and malformed email are rejected.

- [ ] **Step 2: Run the focused test and verify RED**

Run `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/quotation-customer-creation.test.mts` and confirm it fails because `lib/customers/basic.ts` is missing.

- [ ] **Step 3: Implement the pure normalizer**

Create `normalizeBasicCustomerInput` with maximum lengths of 160 for name, 254 for email, 50 for phone and 240 for address. Require every value and validate the normalized email with a conservative single-`@` address pattern.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Run the same command and confirm all normalization assertions pass.

### Task 2: Add the quotation customer action and form

**Files:**
- Modify: `app/admin/quotations/actions.ts`
- Modify: `app/admin/quotations/new/page.tsx`
- Test: `tests/quotation-customer-creation.test.mts`

**Interfaces:**
- Consumes: `normalizeBasicCustomerInput` from Task 1.
- Produces: `createQuotationCustomerAction(form: FormData): Promise<never>`.

- [ ] **Step 1: Add failing page/action acceptance assertions**

Require the Create Quotation page to contain the four named fields and a form bound to `createQuotationCustomerAction`. Require the action to recheck `quotations.create`, create the auth user, update the profile, insert the default address, audit, revalidate and redirect to `/admin/quotations/new`.

- [ ] **Step 2: Run the focused test and verify RED**

Confirm the new acceptance test fails because the form and action do not exist.

- [ ] **Step 3: Implement the Server Action**

Normalize the submitted fields, create and confirm the auth user, update its customer profile, insert a default address, delete the new auth user if a persistence step fails, write the audit record, revalidate the page and redirect with an encoded result message.

- [ ] **Step 4: Render the form**

Import the action into `app/admin/quotations/new/page.tsx` and render the Create Sale-style collapsible form between notices and the quotation builder.

- [ ] **Step 5: Re-run the focused test and verify GREEN**

Confirm the complete focused suite passes.

### Task 3: Verify and release

**Files:**
- Modify only if verification identifies a defect in Tasks 1 or 2.

- [ ] **Step 1: Run offline automated checks**

Run the focused test, `npm run test:standalone`, `npm run test:quotation-document`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 2: Verify authenticated local behavior**

Open `/admin/quotations/new`, expand the customer form, submit a unique test customer, confirm the success notice and verify the new customer is selectable. Remove only that test customer afterward if it was created in the local database.

- [ ] **Step 3: Review and commit**

Run `git diff --check`, inspect the scoped diff, and commit only the design, plan, normalizer, regression test, quotation action and quotation page.

- [ ] **Step 4: Push and deploy**

Push the feature branch and `main`, deploy production to Vercel, run production route/database smoke checks, and confirm the deployment is Ready.

## Self-review

- The plan covers UI, authorization, persistence, rollback, feedback and customer-list refresh.
- Interface names match between tasks.
- No placeholders, unrelated refactors or schema changes are included.
