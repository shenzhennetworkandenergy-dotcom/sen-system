# Business Card OCR / Scan Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-local multilingual business-card OCR assistant to the one authoritative Add Customer form shared by Create Sale and Create Quotation, with mandatory review, explicit apply/save, and duplicate warnings.

**Architecture:** A shared controlled Add Customer component owns the optional OCR assistant while existing route-specific server actions retain permissions and audit identity. Browser-only preprocessing and a provider-neutral Tesseract.js adapter are dynamically imported after scan intent; parsing, confidence, apply behavior, and duplicate scoring are pure modules with direct tests. The existing `profiles`, authentication user, and `customer_addresses` records remain authoritative and no schema is added.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript, Node test runner, Tesseract.js 7, a lazy browser worker for card-edge detection/perspective correction, and the existing Supabase/PostgreSQL customer services.

**Spec:** `docs/superpowers/specs/2026-08-28-business-card-ocr-design.md`

## Global Constraints

- Keep card images and raw OCR text in browser memory; never upload them.
- Do not call a third-party OCR or AI API.
- Load Tesseract.js, the preprocessing worker, and language data only after the user starts OCR.
- Use `eng`, `ben`, and `chi_sim` recognition models.
- Never call customer creation from OCR, review, or Apply.
- Reuse `normalizeBasicCustomerInput` and `createBasicCustomerRecord`.
- Retain `sales.create` and `quotations.create` server permission guards.
- Do not change the database schema, production configuration, or production data.
- Do not alter the existing `CustomerTypeahead` behavior.
- Leave designation and website reviewable but non-persisted.

## File Structure

- Create `lib/customer-ocr/types.ts` — provider-neutral OCR/review contracts.
- Create `lib/customer-ocr/parser.ts` — deterministic multilingual extraction and confidence rules.
- Create `lib/customer-ocr/duplicates.ts` — pure identifier normalization and duplicate scoring.
- Create `lib/customer-ocr/image-validation.ts` — browser-independent file limits and validation.
- Create `lib/customer-ocr/preprocess.ts` — browser-only canvas/worker preprocessing.
- Create `lib/customer-ocr/providers/tesseract-browser.ts` — lazy browser Tesseract provider.
- Create `components/customers/BusinessCardOcrAssistant.tsx` — upload, paste, scan, preview, review, and Apply UI.
- Create `components/customers/AddCustomerForm.tsx` — shared authoritative form used by both workflows.
- Create `lib/customers/duplicates-server.ts` — guarded-record query input used by pre-save checks.
- Create `app/api/admin/customers/duplicates/route.ts` — permission-guarded first-party duplicate preflight endpoint.
- Modify `lib/customers/basic.ts` — optional existing address/profile fields and shared action-state types.
- Modify `lib/customers/create-basic.ts` — persist existing alternate phone, city, country, and country-code columns.
- Modify `app/admin/sales/actions.ts` — keep Sales permission/audit while returning shared form state.
- Modify `app/admin/quotations/actions.ts` — keep Quotation permission/audit while returning shared form state.
- Modify `app/admin/sales/new/page.tsx` — render the shared Add Customer component.
- Modify `components/quotations/QuotationBuilder.tsx` — render the same shared component and retain automatic selection.
- Modify `package.json` and `package-lock.json` — add pinned local OCR/preprocessing dependencies.
- Create `tests/business-card-ocr.test.mts` — parser, validation, apply, and duplicate behavior.
- Modify `tests/quotation-customer-creation.test.mts` — expanded customer normalization contract.
- Create `tests/business-card-ocr-workflows.test.mts` — pure workflow-state integration checks.
- Create `tests/fixtures/business-cards/` files — safe English, Bangla, Chinese, rotated, poor, missing, and multiple-phone cards.

---

### Task 1: OCR contracts, validation, and duplicate scoring

**Files:**
- Create: `lib/customer-ocr/types.ts`
- Create: `lib/customer-ocr/image-validation.ts`
- Create: `lib/customer-ocr/duplicates.ts`
- Test: `tests/business-card-ocr.test.mts`

**Interfaces:**
- Produces: `BusinessCardFieldKey`, `ReviewedBusinessCard`, `OcrLine`, `DuplicateCandidate`, `validateBusinessCardImage`, `scoreCustomerDuplicate`.
- Consumes: `CustomerSearchOption` from `lib/customers/search.ts`.

- [ ] **Step 1: Write failing behavior tests**

Add literal cases proving that supported image types and size limits are bounded,
phone/company/email identifiers normalize independently, and exact identifiers
produce explicit match reasons:

```ts
test("duplicate scoring finds normalized email phone and company identifiers", () => {
  const match = scoreCustomerDuplicate(
    { email: " AMINA@EXAMPLE.COM ", phone: "+880 1711-000001", companyName: "Tex Rise Engineering" },
    { id: "customer-1", full_name: "Amina", email: "amina@example.com", phone: "01711000001", company_name: "tex rise engineering" },
  );
  assert.deepEqual(match?.reasons, ["email", "phone", "company"]);
  assert.equal(match?.blocksCreation, true);
});

test("image validation rejects unsupported and oversized card images", () => {
  assert.equal(validateBusinessCardImage({ type: "image/png", size: 1024 }).ok, true);
  assert.match(validateBusinessCardImage({ type: "application/pdf", size: 1024 }).message, /image/i);
  assert.match(validateBusinessCardImage({ type: "image/jpeg", size: 13 * 1024 * 1024 }).message, /12 MB/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-card-ocr.test.mts
```

Expected: FAIL because the OCR domain modules do not exist.

- [ ] **Step 3: Implement minimal contracts and pure rules**

Define the ten review keys, confidence status, OCR line shape, normalized customer
input shape, and duplicate result shape. Accept JPEG, PNG, WebP, HEIC/HEIF when
the browser supplies an image MIME type, and SVG test fixtures; cap input at 12
MB. Normalize phone identifiers to digits and compare Bangladesh `0` and `880`
prefix variants without fuzzy substring matches. Treat exact email as blocking,
and exact phone/company as warning reasons.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 command and expect all Task 1 cases to pass.

- [ ] **Step 5: Refactor names and rerun**

Keep the files browser/server neutral and free of React, database clients, and
Tesseract imports. Re-run the focused test.

### Task 2: Multilingual structured parser and confidence classification

**Files:**
- Modify: `lib/customer-ocr/types.ts`
- Create: `lib/customer-ocr/parser.ts`
- Modify: `tests/business-card-ocr.test.mts`

**Interfaces:**
- Consumes: `OcrLine[]` with literal text and confidence values.
- Produces: `parseBusinessCardOcr(lines): ReviewedBusinessCard`.

- [ ] **Step 1: Add failing parser cases**

Use hand-authored OCR lines for English, Bangla, and Chinese. Assert literal
field values rather than values generated by parser helpers:

```ts
test("extracts a Bangla contact and two phone numbers for review", () => {
  const result = parseBusinessCardOcr([
    { text: "তানভীর আহমেদ", confidence: 91 },
    { text: "বিক্রয় ব্যবস্থাপক", confidence: 86 },
    { text: "সেন ইঞ্জিনিয়ারিং লিমিটেড", confidence: 88 },
    { text: "মোবাইল: +880 1711 000001", confidence: 94 },
    { text: "ফোন: +880 2 55000000", confidence: 89 },
    { text: "tanvir@example.com", confidence: 97 },
    { text: "ঢাকা, বাংলাদেশ", confidence: 84 },
  ]);
  assert.equal(result.contactName.value, "তানভীর আহমেদ");
  assert.equal(result.designation.value, "বিক্রয় ব্যবস্থাপক");
  assert.equal(result.mobileNumber.value, "+880 1711 000001");
  assert.equal(result.alternatePhone.value, "+880 2 55000000");
  assert.equal(result.city.value, "ঢাকা");
  assert.equal(result.country.value, "বাংলাদেশ");
});
```

Add equivalent clear English and Simplified Chinese cards, then missing-field,
multiple-phone, conflicting-email, and low-confidence cases.

- [ ] **Step 2: Run and verify RED**

Run the focused OCR test. Expected: FAIL because `parseBusinessCardOcr` is absent.

- [ ] **Step 3: Implement deterministic extraction**

Extract emails, URLs, and telephone candidates first. Use multilingual label and
title dictionaries, organization suffixes, line order, and address/country/city
context for remaining fields. Aggregate source confidence, retain source text,
mark values below 75 as `low`, and mark fields with competing plausible values
as `ambiguous`. Return all ten fields even when empty.

- [ ] **Step 4: Run and verify GREEN**

Run the focused OCR test and expect all language, missing, ambiguity, and phone
cases to pass.

- [ ] **Step 5: Refactor with tests green**

Split only reusable private classifiers inside `parser.ts`; do not add a
language-detection service or probabilistic model.

### Task 3: Extend existing customer input using existing columns only

**Files:**
- Modify: `lib/customers/basic.ts`
- Modify: `lib/customers/create-basic.ts`
- Modify: `tests/quotation-customer-creation.test.mts`
- Modify: `tests/business-card-ocr.test.mts`

**Interfaces:**
- Extends: `BasicCustomerInput` with `alternatePhone`, `city`, `country`, and `countryCode`.
- Produces: `basicCustomerInputFromForm(form)` and shared `BasicCustomerActionState`.

- [ ] **Step 1: Write failing normalization cases**

Assert that optional existing fields are trimmed/bounded, country code is upper
case, legacy callers default to `Not specified`, `Bangladesh`, and `BD`, and the
four existing required fields remain required.

- [ ] **Step 2: Run and verify RED**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/quotation-customer-creation.test.mts tests/business-card-ocr.test.mts
```

Expected: FAIL because the normalized output lacks the new existing-column fields.

- [ ] **Step 3: Implement minimal normalization and persistence**

Update `normalizeBasicCustomerInput` and add one FormData adapter so both route
actions stop duplicating field extraction. Update the existing profile write to
set `country`, and the existing address insert to set `alternate_phone`, `city`,
and `country_code`. Do not touch migrations or CRM tables.

- [ ] **Step 4: Run and verify GREEN**

Run the Task 3 command and expect all existing and added customer cases to pass.

### Task 4: Permission-guarded server duplicate lookup and pre-save gate

**Files:**
- Create: `lib/customers/duplicates-server.ts`
- Create: `app/admin/customers/actions.ts`
- Modify: `app/admin/sales/actions.ts`
- Modify: `app/admin/quotations/actions.ts`
- Modify: `tests/business-card-ocr-workflows.test.mts`

**Interfaces:**
- Produces: `findPossibleCustomers(input): Promise<DuplicateCandidate[]>`.
- Produces: `checkCustomerDuplicatesAction(workflow, input)` guarded by the
  workflow create permission.
- Route actions return `BasicCustomerActionState` with `status`, `message`,
  `customer`, and `duplicates`.

- [ ] **Step 1: Write failing workflow-state tests**

Test a pure `customerCreationDecision` helper with literal duplicate candidates:
exact email returns `duplicate` and cannot override, company/phone requires an
explicit override, and no matches allows the existing create service call.

- [ ] **Step 2: Run and verify RED**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-card-ocr-workflows.test.mts
```

Expected: FAIL because the decision helper and shared state do not exist.

- [ ] **Step 3: Implement the duplicate service and guarded action**

Query active customer profiles only, using bounded exact/case-insensitive email,
normalized phone candidates, and exact normalized company comparison. Union and
score safe summary rows through the pure duplicate module. The preflight action
accepts only bounded reviewed identifiers and repeats `sales.create` or
`quotations.create` based on a strict workflow union.

- [ ] **Step 4: Integrate both existing save actions**

Keep the route-specific permission checks and audit action/module values. Before
calling `createBasicCustomerRecord`, return duplicate state unless the allowed
phone/company warning was explicitly confirmed. Exact email remains blocked by
the existing authentication identity rule. Return success/error state instead
of creating from any OCR action.

- [ ] **Step 5: Run and verify GREEN**

Run the Task 4 test plus `tests/quotation-customer-creation.test.mts` and expect
all cases to pass.

### Task 5: Browser preprocessing and provider abstraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/customer-ocr/preprocess.ts`
- Create: `lib/customer-ocr/providers/tesseract-browser.ts`
- Modify: `tests/business-card-ocr.test.mts`

**Interfaces:**
- Produces: `preprocessBusinessCard(blob, rotation): Promise<ProcessedBusinessCard>`.
- Produces: `createTesseractBusinessCardProvider(): Promise<BusinessCardOcrProvider>`.

- [ ] **Step 1: Add failing pure geometry and validation tests**

Test literal corner ordering, rotation dimension changes, confidence threshold
for accepting a detected quadrilateral, and safe original-image fallback.

- [ ] **Step 2: Run and verify RED**

Run the focused OCR test and expect missing preprocessing helpers.

- [ ] **Step 3: Install pinned lazy dependencies**

Run:

```text
npm install --save-exact tesseract.js@7.0.0
```

Do not add eager imports to a page, layout, Sales component, or Quotation component.

- [ ] **Step 4: Implement preprocessing**

Use Canvas for decode, scale, rotation, contrast, grayscale, and a white border.
Dynamically start a browser worker only inside the scan path, use contrast edges
to find a large reliable four-corner card, and apply a bounded quadrilateral warp.
If the worker times out or the contour confidence is below the literal tested threshold,
return the enhanced uncropped canvas and a warning.

- [ ] **Step 5: Implement Tesseract provider**

Dynamically import Tesseract.js inside the provider factory, create one worker
with `['eng', 'ben', 'chi_sim']`, request block output, use sparse-text and
automatic rotation options, flatten word/line confidence, parse through
`parseBusinessCardOcr`, and always terminate the worker in `finally`.

- [ ] **Step 6: Run focused tests, typecheck, and build**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-card-ocr.test.mts
npx tsc --noEmit
npm run build
```

Expected: all exit 0. If bundling exposes browser-only modules to the server
graph, move the dynamic import boundary deeper rather than disabling type safety.

### Task 6: Mandatory Review → Apply OCR UI

**Files:**
- Create: `components/customers/BusinessCardOcrAssistant.tsx`
- Create: `lib/customer-ocr/apply.ts`
- Modify: `tests/business-card-ocr-workflows.test.mts`

**Interfaces:**
- Consumes: `CustomerFormValues` and `onApply(reviewedValues)`.
- Produces: upload/paste/capture intake, preprocessing preview, editable review,
  confidence warnings, and an explicit Apply event.

- [ ] **Step 1: Write failing reducer/apply tests**

Test the observable state machine as pure transitions: selecting an image cannot
reach applied/saved state; recognition always enters review; edits replace the
review value; Apply maps compatible fields only; designation/website are omitted;
and applying over different non-empty manual values requires confirmation.

- [ ] **Step 2: Run and verify RED**

Run the workflow test and expect missing apply/state functions.

- [ ] **Step 3: Implement the pure apply mapping**

Map company, contact name, email, mobile, alternate phone, address, city, and
country/country code. Return conflicts instead of overwriting different non-empty
manual values. Never accept an action function or perform a fetch.

- [ ] **Step 4: Implement the assistant UI**

Add accessible buttons labelled exactly **Upload / Paste Business Card** and
**Scan Business Card**. Support file picker, focused paste events,
`navigator.clipboard.read()` with a safe fallback, and a separate camera input
with `capture="environment"`. Revoke object URLs and stop/release image resources.

Render processed preview, reset/use-original/rotate controls, progress with
`aria-live`, all ten review inputs, confidence text, the persistence limitation
on designation/website, and **Apply to Customer Form**. Do not render or import a
Save Customer action inside the assistant.

- [ ] **Step 5: Run and verify GREEN**

Run the workflow and OCR tests, then `npx tsc --noEmit`.

### Task 7: One shared Add Customer form in Sales and Quotations

**Files:**
- Create: `components/customers/AddCustomerForm.tsx`
- Modify: `app/admin/sales/new/page.tsx`
- Modify: `components/quotations/QuotationBuilder.tsx`
- Modify: `tests/business-card-ocr-workflows.test.mts`
- Modify: `tests/quotation-customer-creation.test.mts`

**Interfaces:**
- Consumes: route server action, workflow, existing customer options, optional
  `onCustomerResolved`.
- Produces: the sole Add Customer UI and explicit `Save Customer` submit.

- [ ] **Step 1: Add failing shared-workflow tests**

Test the pure form reducer for manual entry, OCR apply, duplicate warning,
explicit company/phone override, exact-email block, successful reset, and
Quotation customer callback. Keep OCR unused in at least one complete manual
case.

- [ ] **Step 2: Run and verify RED**

Run both workflow/customer test files and expect missing shared-form behavior.

- [ ] **Step 3: Implement the controlled shared form**

Use `useActionState` with the shared state contract. Render all current required
fields plus existing-column optional fields. Mount the optional OCR assistant
inside the form panel. On Apply, set controlled inputs only after conflict
confirmation, run the first-party duplicate preflight, and show safe matches.

On Save, submit the authoritative form action. Render **Possible existing
customer found**, matching reasons, safe customer summaries, and an explicit
override only for phone/company warnings. Call the optional Quotation callback
when an existing/new customer is resolved. Sales retains its existing search
below the form and refreshes its server options after successful creation.

- [ ] **Step 4: Replace both inline forms with the shared component**

Sales passes `createBasicCustomerAction`, `workflow="sales"`, and loaded customer
options. Quotation passes `createQuotationCustomerAction`,
`workflow="quotations"`, existing options, and its existing selection callback.
Do not edit `CustomerTypeahead` or Sales/Quotation creation forms.

- [ ] **Step 5: Run and verify GREEN**

Run:

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-card-ocr-workflows.test.mts tests/quotation-customer-creation.test.mts tests/customer-typeahead.test.mts tests/sale-builder-role-visibility.test.mts
npx tsc --noEmit
```

Expected: all pass with the prior customer search and role-visibility behavior.

### Task 8: Safe multilingual card fixtures and actual browser OCR verification

**Files:**
- Create: `tests/fixtures/business-cards/english-clear.svg`
- Create: `tests/fixtures/business-cards/bangla.svg`
- Create: `tests/fixtures/business-cards/chinese.svg`
- Create: `tests/fixtures/business-cards/rotated.svg`
- Create: `tests/fixtures/business-cards/poor-partial.svg`
- Create: `tests/fixtures/business-cards/missing-fields.svg`
- Create: `tests/fixtures/business-cards/multiple-phones.svg`
- Create: `docs/BUSINESS_CARD_OCR_LOCAL_TESTING.md`

**Interfaces:**
- Produces: non-production test cards containing fictional names, domains, and
  phone numbers; local UAT instructions.

- [ ] **Step 1: Create safe fixtures**

Use `example.com`/`.example` email and web domains, reserved-looking fictional
numbers, and no real person or business data. Include visible labels in each
script and controlled blur/crop/rotation transforms for the negative fixtures.

- [ ] **Step 2: Start the isolated local application**

Use only the local native PostgreSQL/PostgREST or local Supabase environment.
Create a dedicated local test account with the minimum Sales and Quotation create
permissions. Do not copy production secrets into the worktree.

- [ ] **Step 3: Run the browser matrix**

For each fixture, record observed extraction and confidence. Verify upload,
keyboard paste, Clipboard API paste where supported, camera-input semantics,
rotation, original fallback, review edits, Apply, duplicate warning, and explicit
Save. Verify both workflow routes and one manual OCR-unused creation.

- [ ] **Step 4: Document exact UAT access**

Record the localhost URL, safe username/password, permissions, route-by-route
steps, fixture paths, clipboard instructions, and physical-device caveat. Do not
include production credentials or secrets.

### Task 9: Full verification and local UAT gate

**Files:**
- Modify only files required by failures reproduced with a new failing test.

- [ ] **Step 1: Run focused behavior suites**

```text
node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-card-ocr.test.mts tests/business-card-ocr-workflows.test.mts tests/quotation-customer-creation.test.mts tests/customer-typeahead.test.mts tests/sale-builder-role-visibility.test.mts
```

- [ ] **Step 2: Run all standalone tests**

```text
npm run test:standalone
```

- [ ] **Step 3: Run relevant Sales checks**

```text
npm run test:sales
```

- [ ] **Step 4: Run lint, typecheck, and production build locally**

```text
npm run lint
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Inspect final scope and privacy boundary**

Run `git diff --check`, inspect `git status --short`, confirm no migration or
unrelated ERP file changed, and confirm no image/raw-OCR network request exists.

- [ ] **Step 6: Stop at local UAT**

Report implementation, changed files, OCR/provider architecture, privacy, local
test evidence, URL, safe credentials, permissions, detailed user steps, and
known limitations. Leave `codex/business-card-ocr` local and do not push, merge,
deploy, migrate, or modify production.
