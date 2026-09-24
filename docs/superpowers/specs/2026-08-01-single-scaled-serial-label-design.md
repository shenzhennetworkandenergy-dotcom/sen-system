# Single Scaled SEN Serial Label Design

Date: 2026-08-01
Status: Approved by the user's explicit requirements and standing instruction to proceed without confirmation.

## Goal

The serial-label page must render exactly one SEN label per print job. Every visual element must shrink or grow uniformly so it remains inside the physical width and height selected by the user.

## Confirmed root causes

1. Batch and product print selections query up to 500 serial records, and the page maps every result into the preview. Selecting a size therefore renders the entire batch instead of one label.
2. The physical label has dynamic millimetre dimensions, but its logo, text, barcode, QR code, gaps and padding use fixed pixel sizes. At 50 x 30 mm their combined height exceeds the label and the overflow rule clips the lower content.

## Selected approach

Use one compact master canvas with a fixed 70 x 42 mm design coordinate system. For every saved label size, calculate a uniform scale from the available physical width and height, reserve a 0.75 mm safe inset on every edge, and center the scaled canvas inside the exact label boundary. The master canvas keeps the existing SEN logo, brand, product, model, barcode, SEN serial, QR code, manufacturer serial, condition and status.

The print query will request at most one matching serial. The page will also defensively select only the first returned record before generating barcode and QR assets. This gives screen preview and the print dialog one label and one physical print page.

## Alternatives considered

1. Container-query font and image sizes: rejected because independent scaling rules can distort the label and are harder to keep consistent in printer rendering.
2. Separate templates for small, medium and large labels: rejected because arbitrary administrator-created dimensions would create gaps between presets and increase maintenance.
3. Keep all labels in the document and hide all but one on screen: rejected because the print dialog could still produce a multi-label job, contrary to the requested one-label workflow.

## Data flow

1. The user opens an existing single, batch or product print action.
2. The existing chooser requires a saved physical size.
3. After `Use this size`, the database query returns at most one matching serial.
4. A pure layout helper calculates scale and centering offsets from the selected width and height.
5. The page renders one exact-size label containing a transformed master canvas.
6. `window.print()` opens a document with exactly one `@page` matching that label size.

## Error handling and security

- Existing `serials.print` and admin-only size-management checks remain unchanged.
- Existing invalid selection, invalid size and empty-result messages remain unchanged.
- Non-finite or non-positive dimensions are rejected by the layout helper, although stored dimensions are already constrained by the database.
- No database migration or permission change is required.

## Verification

- Unit tests prove a 50 x 30 mm label and the minimum 10 x 10 mm label scale within their safe boundaries.
- Unit tests prove multiple serial rows produce exactly one printable record.
- The focused suite must fail before implementation and pass afterward.
- Full standalone tests, lint, type-check and production build must pass.
- Authenticated local browser verification checks that `Use this size` renders one label, that its master canvas is scaled and centered, and that the dynamic print page remains the chosen physical size.
- After push and deployment, production route, database and deployment-health checks must pass.

## Self-review

- No placeholders or unresolved decisions remain.
- The design changes only label rendering and record count.
- Exact outer dimensions, permissions and size-management behavior remain unchanged.
