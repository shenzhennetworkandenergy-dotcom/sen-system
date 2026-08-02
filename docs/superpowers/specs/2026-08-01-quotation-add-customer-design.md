# Create Quotation Customer Addition Design

Date: 2026-08-01
Status: Approved by the user's explicit request, screenshot, and standing instruction to proceed without confirmation.

## Goal

Add the same standalone **Add a new customer** capability from Create Sale to Create Quotation. After a customer is added, the quotation page must reload with a clear result message and the new active customer available in the existing customer selector.

## Current behavior

- Create Sale shows a collapsible form for full name, email, phone and full address.
- Create Quotation only loads existing customers and its builder requires a selected customer.
- The quotation creation action contains an inaccessible fallback for new-customer fields, but the builder does not render those fields.

## Selected design

Render a collapsible customer form above `QuotationBuilder`, matching the Create Sale layout and copy. Submit it to a new quotation-specific Server Action that requires `quotations.create`, validates and normalizes the four fields, creates the authenticated customer and active profile, creates a default Bangladesh delivery address, audits the operation, refreshes `/admin/quotations/new`, and redirects back with a success or safe error message.

A small pure normalizer will provide bounded, testable input behavior for name, email, phone and address. If profile or address persistence fails after the authentication user is created, the action deletes that newly created authentication user so a partial customer is not left behind.

## Alternatives considered

1. Reuse the Sales Server Action: rejected because it authorizes with `sales.create`, which would incorrectly block employees who can create quotations but cannot create sales.
2. Add inline customer fields inside `QuotationBuilder` and create the customer together with the quotation: rejected because it does not match the requested Create Sale interaction and makes quotation submission state more complex.
3. Refactor both sale and quotation pages to a shared component and action: rejected because it would change unrelated sale code and increase regression risk for this small request.

## Security and failure handling

- The Server Action rechecks `quotations.create`; visibility alone is not authorization.
- Fields are trimmed, length-limited, and email is lowercased and validated.
- Database and authentication errors are not exposed verbatim.
- A failed profile or address write removes the just-created authentication user.
- Success and failure redirect only to the fixed Create Quotation route.

## Verification

- Test valid normalization and required/invalid fields.
- Test that Create Quotation exposes the four-field customer form and wires it to a quotation-authorized action.
- Confirm the focused test fails before implementation and passes afterward.
- Run all standalone tests, quotation verification, lint, TypeScript and production build.
- Verify locally that adding a customer shows success and the customer appears in the selector.
- Push to GitHub main, deploy to Vercel, and run production route/database checks.

## Self-review

- The design changes only Create Quotation and its customer creation support.
- No database schema or permission catalogue change is required.
- No placeholders or ambiguous success criteria remain.
