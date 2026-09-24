# SEN Serial Label Sizes Design

Date: 2026-08-01
Status: Approved for implementation by the user's detailed requirements and standing instruction to proceed without confirmation.

## Goal

Every operational SEN serial record should provide a print-label action. Printing must first require a saved label size. Administrators can create and delete reusable sizes, while authorized employees can select a saved size and print labels but cannot manage the size catalogue.

## Scope

- Replace the hard-coded 50x30, 60x40 and A4 label presets with reusable database records measured in millimetres.
- Seed 50 x 30 mm and 60 x 40 mm defaults so existing installations remain immediately usable.
- Require a valid saved size before barcode/QR assets and printable labels are rendered.
- Let active administrators create and delete label sizes from the size-selection screen.
- Let employees with `serials.print` select sizes and print, without showing management controls.
- Add print links beside SEN serials on staff-facing serial, order, sales, packing, shipment and serial-search surfaces when the current staff member has `serials.print`.
- Support existing single-serial and batch print links, plus the existing product-level print link.
- Do not expose operational label printing in customer pages.

## Data model

Create `public.serial_label_sizes` with:

- UUID primary key.
- Unique trimmed name.
- Width and height in millimetres, constrained to 10-300 mm.
- Creator profile, created timestamp and updated timestamp.

The table is readable through the existing `serials.print` permission. Writes are performed by authenticated server actions through the service-role client only after an active-admin check. Deletion is a hard delete because sizes are configuration records and labels do not persist a size relationship.

## Print flow

1. A staff print link sends selected serial IDs, a batch ID, or a product ID to `/admin/serials/print` without a size.
2. The page validates the selection and presents saved size cards.
3. Selecting a size reloads the same selection with `size=<uuid>`.
4. Only then are the serials loaded and barcode/QR assets generated.
5. The preview and print CSS use the selected width and height, including a matching dynamic `@page` rule.
6. Invalid or deleted size IDs return to the chooser with a clear error instead of silently choosing another size.

## Size management

The chooser contains an admin-only form for name, width and height. Values are normalized and validated before insertion. Each saved size has an admin-only delete form with an explicit browser confirmation. Server actions re-check the admin role on every request and return clear success/error messages.

## Security and failure handling

- Viewing or printing requires `serials.print`.
- Creating and deleting sizes requires `requireProfile(["admin"])` inside each Server Action.
- Query parameters, UUIDs, dimensions and names are treated as untrusted input.
- Only known selection keys are preserved across actions; arbitrary return URLs are not accepted.
- Database errors are logged server-side and users receive safe messages.
- An empty catalogue tells employees to ask an administrator and gives administrators the create form.

## Alternatives considered

1. Browser-local sizes: rejected because employees and devices would see different lists and the user asked to connect the feature to the main database.
2. Free-text width/height on every print: rejected because it does not provide a reusable list and cannot be centrally deleted.
3. Keep CSS presets and add more classes: rejected because arbitrary administrator-defined sizes cannot be represented safely or maintained without code changes.

## Verification

- Unit tests for normalization, dimension limits and deterministic selection URLs.
- Source-level acceptance tests for database constraints, admin-only mutations, required chooser behavior, dynamic print dimensions and staff print links.
- Local migration, focused tests, full standalone tests, lint and production build.
- Local authenticated browser verification where credentials are available, followed by production migration, deployment and route/database smoke tests.
