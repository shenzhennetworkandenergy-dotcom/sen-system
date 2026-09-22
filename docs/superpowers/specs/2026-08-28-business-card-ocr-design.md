# Business Card OCR / Scan Assistant Design

## Status

Approved for local implementation on 2026-08-28. Production deployment, merging,
pushing, production migrations, and production data changes are outside this work.

## Goal

Add a privacy-preserving business-card input assistant to the authoritative Add
Customer workflow used by Create Sale and Create Quotation. The assistant may
prepare values, but it never creates a customer or bypasses the existing Save
Customer action.

## Existing Architecture

The repository currently has one authoritative customer creation path and two UI
shells:

- `lib/customers/basic.ts` normalizes the customer fields used by both workflows.
- `lib/customers/create-basic.ts` creates the existing authentication user,
  `profiles` row, and default `customer_addresses` row.
- `app/admin/sales/actions.ts` guards customer creation with `sales.create`.
- `app/admin/quotations/actions.ts` guards customer creation with
  `quotations.create`.
- Create Sale renders an inline Add Customer form above `SaleBuilder`.
- Create Quotation renders a second inline Add Customer form inside
  `QuotationBuilder`.
- Both creation routes reuse the same normalization and database service.
- Existing customer selection is provided by `CustomerTypeahead` and the
  customer options loaded by each creation page.

The OCR work will consolidate only the duplicated form UI into one shared
component. It will keep the authoritative customer model, normalization,
creation service, permissions, audit behavior, and customer search.

## Constraints

- No database schema change.
- No separate OCR customer model, storage table, or shadow customer workflow.
- No image upload to the SEN server or to any third party.
- No extracted text sent to a third-party OCR or AI provider.
- No automatic save, merge, overwrite, or duplicate resolution.
- No unrelated ERP refactor.
- Normal Sales and Quotation page loading must not eagerly load OCR runtime or
  language models.
- The existing manual Add Customer path must continue working when OCR is never
  opened.

## Considered Approaches

### Browser-local Tesseract.js with lazy image preprocessing — selected

Recognition runs in a browser Web Worker after the user chooses or pastes an
image. Tesseract.js is dynamically imported only when scanning begins and loads
English (`eng`), Bangla (`ben`), and Simplified Chinese (`chi_sim`) models. The
image and raw OCR output remain in browser memory. Image preprocessing is also
lazy and client-only.

This is the selected design because it satisfies the privacy requirement and
keeps OCR provider concerns outside Sales, Quotations, and customer persistence.
The trade-offs are a larger first-scan download, slower recognition on low-power
devices, and lower accuracy than a specialized managed business-card API.

### First-party server Tesseract — rejected

This would avoid third-party OCR but would upload personal card images to the
application server, increase serverless memory and cold-start cost, and make
local/offline operation less predictable.

### Cloud OCR/business-card API — rejected

Managed providers may improve structured extraction, but they would receive the
card image and customer information. This conflicts with the approved privacy
boundary.

## Component Boundaries

### Shared Add Customer component

`components/customers/AddCustomerForm.tsx` will be the single Add Customer UI
used by both Create Sale and Create Quotation. It owns editable form state and
renders the optional OCR assistant. It receives the workflow context and an
optional callback used by Quotation to select a newly created or existing
customer. Sales continues to expose its existing customer search below the form.

The component uses the existing route-specific server actions so each workflow
retains its own permission guard and audit action. Both actions will use one
shared serializable action-state contract.

### OCR domain

Focused modules under `lib/customer-ocr/` will define:

- provider-neutral OCR result and reviewed-field types;
- parsing and confidence/ambiguity rules;
- country and phone normalization helpers;
- a browser-only Tesseract.js provider;
- a browser-only preprocessing adapter;
- duplicate-match scoring that can be reused by the client warning and server
  pre-save check.

Sales and Quotations depend only on the shared Add Customer component and action
state. They do not import Tesseract.js or preprocessing code.

### Provider interface

The OCR UI calls a small provider interface:

```ts
type OcrProgress = { stage: string; progress: number };

interface BusinessCardOcrProvider {
  recognize(
    image: Blob,
    options: { onProgress?: (progress: OcrProgress) => void },
  ): Promise<BusinessCardOcrResult>;
}
```

The first implementation dynamically imports Tesseract.js. A future local or
approved provider can implement the same interface without changing either
customer workflow.

## Image Intake and Preprocessing

The shared assistant provides two visible actions:

- **Upload / Paste Business Card** accepts an image file, supports a focused
  paste target, and uses `navigator.clipboard.read()` when the browser grants
  image clipboard access.
- **Scan Business Card** uses a separate `input type="file"` with
  `accept="image/*"` and `capture="environment"`, allowing supported mobile and
  tablet browsers to open the rear camera.

Images are validated in the browser before decoding. Unsupported types,
oversized files, and decode failures produce recoverable messages without
altering the customer form.

Preprocessing is lazy and best-effort:

1. Decode the image and honor browser-supported EXIF orientation.
2. Downscale very large inputs while preserving enough text resolution.
3. Detect a high-confidence rectangular card boundary from edges.
4. Crop and apply a perspective transform only when a reliable four-corner
   contour is found; otherwise keep the original image.
5. Offer rotate-left and rotate-right controls and allow the user to return to
   the original image.
6. Apply contrast normalization, grayscale, light sharpening, and a white
   border for OCR.
7. Ask Tesseract to use automatic rotation and sparse-text segmentation suited
   to business-card layouts.

Automatic crop/perspective correction must never destroy the only copy. The UI
always retains the original in memory and shows the processed preview before
recognition. A partial or poor-quality image may continue with a warning.

## Recognition and Structured Extraction

The Tesseract worker loads `eng`, `ben`, and `chi_sim` together and requests
block/word output so each recognized line has confidence data. Parsing is kept
separate from recognition and uses deterministic rules:

- email and website syntax;
- labelled and unlabelled telephone patterns, preserving multiple numbers;
- English, Bangla, and Chinese contact labels;
- business suffixes and line position for company candidates;
- title/designation keyword dictionaries;
- country/city dictionaries and address-line context;
- candidate count and source-word confidence to mark ambiguity.

The parser returns every supported review field:

- Company / Organization Name
- Contact Person Name
- Designation / Job Title
- Mobile Number
- Alternate Phone Number
- Email Address
- Website
- Full Address
- City
- Country

Each field includes a normalized value, confidence score, source text, and an
`ok`, `low`, or `ambiguous` status. Empty fields remain visible in review.

## Review and Apply Workflow

Recognition always opens **Review Extracted Information**. Every value is an
editable input. Low-confidence and ambiguous values receive visible text and
color cues; confidence is supplementary and never treated as correctness.

**Apply to Customer Form** copies only reviewed values into the authoritative
Add Customer form and does not submit it. Existing typed form values are not
silently overwritten: if applying would replace a non-empty different value,
the user receives a confirmation choice.

The current persistence model supports name, company, email, primary phone,
alternate phone, full address, city, profile country, and address country code.
The shared form will expose these existing columns without a migration.
Designation and website remain available in review for correction/copying but
are labelled **not stored by the current customer form**. They will not create
CRM company/contact records or be inserted into unrelated fields.

After applying, the user must explicitly choose **Save Customer**. The normal
manual path remains available without opening the OCR assistant.

## Duplicate Protection

Duplicate detection uses the existing `profiles` customer records; it does not
create an OCR index or table. A permission-guarded server helper compares:

- normalized email (exact, case-insensitive);
- normalized phone digits (exact after formatting removal);
- normalized company name (exact, case-insensitive).

The duplicate check runs after reviewed OCR data is applied and again in the
existing Save Customer server action to cover stale results and manual edits.
Only normalized identifiers are sent to the first-party SEN server; images and
raw OCR text remain in the browser.

When matches exist, the UI shows **Possible existing customer found**, the safe
customer summary, and the matching reasons. Quotation can select the existing
customer directly through its existing typeahead state. Sales instructs the
user to select the shown customer in its existing search. An exact email match
cannot be overridden because authentication email identity is unique. A
company-only or phone-only match may be overridden only through an explicit
**Save new customer anyway** confirmation. No records are merged or overwritten.

## Permissions and Security

- The Sales create action continues to call `requirePermission("sales.create")`.
- The Quotation create action continues to call
  `requirePermission("quotations.create")`.
- Duplicate lookup repeats the matching workflow permission on every request.
- All server input is normalized and bounded; browser values are untrusted.
- Only safe customer summary fields needed for review are returned.
- Images, object URLs, canvases, OCR blocks, and previews are released when the
  assistant is reset or unmounted.
- No OCR secrets or public API keys are introduced.

## Error Handling

- Unsupported clipboard APIs show instructions for keyboard paste or upload.
- Denied clipboard/camera access leaves upload and manual entry available.
- A preprocessing failure falls back to the original image.
- An OCR initialization/network/model failure leaves the image preview and
  manual form available with a retry action.
- Missing fields are normal results, not fatal errors.
- Low-confidence results never bypass review.
- Customer validation and creation errors continue through the shared action
  state without exposing server internals.

## Testing Strategy

### Automated domain tests

- English, Bangla, and Chinese structured parsing.
- Missing fields and partial/poor OCR text.
- Multiple phone number ordering.
- Confidence and ambiguity classification.
- Country/address normalization.
- Duplicate scoring by email, phone, and company.
- Image validation and pure preprocessing geometry helpers.

### Component and integration tests

- One shared Add Customer component is rendered by both Create Sale and Create
  Quotation.
- OCR modules are dynamically imported and absent from the normal eager path.
- Upload, paste, clipboard fallback, and camera capture controls are present and
  accessible.
- Review precedes Apply; Apply precedes explicit Save.
- OCR never invokes a create action.
- Quotation still selects a created customer.
- Sales and Quotation permission guards remain in their server actions.
- Manual Add Customer works with OCR unused.
- Existing `CustomerTypeahead` behavior remains unchanged.

### Browser/local verification

Use safe generated or synthetic business cards for:

1. Clear English card.
2. Bangla card.
3. Simplified Chinese card.
4. 90-degree rotated card.
5. Partial/poor-quality card.
6. Missing fields.
7. Multiple phone numbers.
8. Existing-customer duplicate warning and existing-customer review.
9. Create Sale → Add Customer → OCR.
10. Create Quotation → Add Customer → OCR.
11. Manual Add Customer without opening OCR.

The full standalone suite, relevant Sales and Quotation checks, lint, and
production build must pass locally. Camera capture is verified through control
semantics on desktop and documented for physical mobile/tablet UAT because a
desktop browser cannot prove the operating system camera chooser.

## Privacy and Retention

Card images and raw recognition data exist only in browser memory for the open
page. They are not written to application storage, logs, database tables, or
third-party OCR services. Tesseract runtime/language files may be downloaded
after the user starts a scan, but those requests contain no card image or
extracted customer data. Reviewed fields reach the SEN server only for duplicate
checking and the user's explicit Save Customer action.

## Known Limitations

- Tesseract accuracy varies with fonts, lighting, print quality, and mixed
  scripts; review remains mandatory.
- Chinese handwriting and stylized logos are not expected to be reliable.
- Automatic card-edge and perspective detection is best-effort and falls back
  safely when confidence is insufficient.
- Designation and website cannot be persisted without expanding the existing
  authoritative customer model, which this change intentionally does not do.
- Clipboard image read support depends on browser permissions and secure-context
  rules.
- The camera chooser and rear-camera hint depend on the mobile operating system
  and browser.
