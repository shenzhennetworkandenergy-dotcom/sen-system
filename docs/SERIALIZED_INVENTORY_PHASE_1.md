# Serialized Inventory Modernization — Phase 1

This phase establishes the product-data and individually serialized-unit foundation. It does not implement purchasing, shipments, sales allocation, customer tracking pages, or automated carrier integrations.

## Identity model

- Every serial-tracked product requires a brand and model number before SEN serials can be generated.
- The database is authoritative for generation. The format is `SEN-[BRAND]-[MODEL]-[DD-MM-YYYY]-[10-DIGIT-UNIQUE-NUMBER]` using the Asia/Dhaka business date and cryptographically secure random bytes.
- Manufacturer serials are optional, normalized for matching, and unique when supplied.
- An issued SEN serial is immutable. Only expected units can be regenerated, a reason is mandatory, and the previous value remains reserved in history.
- Barcode values encode the SEN serial using Code 128. QR values use the versioned payload `SEN:1:<serial>`.

## Unit lifecycle and stock

Expected units can be generated before physical receipt. Serialized receipt, removal, and transfer operations are atomic database RPCs: they validate permissions, product/variation/warehouse relationships, exact unit counts, availability, balances, history, location snapshots, and audit records within one transaction. Non-serialized products retain the existing stock RPCs.

The product, quantity, location, condition, lifecycle status, last movement, generation batch, operator, and timestamps remain traceable for every unit. The scanner searches both SEN and normalized manufacturer serials and accepts manual, keyboard-wedge, or explicitly activated camera input.

## Workplace snapshots

Employees must have an active primary work location before performing sensitive serialized operations. Events copy the workplace name/address/country/coordinates at the time of the action so later edits do not rewrite history. Browser geolocation is not captured automatically.

## Product content and media

Product descriptions accept a bounded rich-text allowlist and are sanitized on write and read. Media is classified by purpose and visibility. Public catalogue queries expose only appropriate product image data; internal documents continue to use private signed storage access.

## Deployment

Apply `202607220001_inventory_serial_phase_1.sql` only after a recoverable backup and review. Run the existing Phase 3B/inventory suites plus `npm run test:inventory-phase1`, lint, and production build. After applying the migration to an approved environment, exercise the authenticated role, RLS, generation, regeneration, receipt, adjustment, transfer, print, export, search, and audit matrix before release.
