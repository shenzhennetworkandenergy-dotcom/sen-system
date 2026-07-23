# Inventory Modernization Phase 3

Phase 3 completes the offline operational frontend on top of the existing catalogue, inventory, orders, shipments, permissions, and audit foundations.

## Product identity and automatic SKU

New products derive an authoritative SKU from active brand and model: `SEN-[BRAND]-[MODEL]`. The browser previews the value, while the server normalizes and validates it before saving. Active brand/model duplicates are detected during entry and blocked by the database trigger. Existing SKUs remain unchanged during ordinary edits; an authorized regeneration is explicit and never changes issued physical-unit serials or historical order snapshots.

## Existing-model stock receiving

The Product Operations panel links directly to `/admin/products/[productId]/stock/add`. A receipt selects warehouse, quantity, condition, reason, references, notes, and optional manufacturer serials. `phase3_receive_serialized_stock` performs one transaction: validation, generation batch, SEN serials, balance update, movement item, unit status/history, tracking snapshots, and audit entry. Any invalid row rolls back the complete receipt.

## Serial Operations Centre

The Inventory page exposes generation/receiving, scan/search, printing/reprinting, regeneration, batch history, full serial list, and CSV export before summary cards. Regeneration continues to use the established eligibility rules and immutable serial history. Labels use the existing barcode, QR, and SEN logo pipeline.

## Product images

Add/Edit Product visibly accepts one main image and multiple gallery images. Files are validated server-side (JPG/PNG/WebP, up to 10 MB), stored under randomized paths in the existing private `product-media` bucket, and recorded with public image purpose, alt text, main-image uniqueness, and ordering metadata. Product detail supports upload, alt-text editing, main-image selection, and removal. Internal PDFs remain documents and never enter the public gallery.

## Foreground employee delivery location

`/employee/shipments/[shipmentId]/location` provides explicit Start, Pause, Stop, and Record once controls. Browser geolocation starts only after the employee presses Start and grants permission. Updates are throttled to no more than one per minute and are associated only with the active shipment session. Closing the page stops the browser watcher; no background surveillance is claimed.

Customers poll their own safe shipment projection every 45 seconds while viewing tracking. Fresh means under three minutes, recent under fifteen minutes, and older data is labelled last recorded location. Customer routes never expose employee profile data.

## Offline verification

Apply migrations only to disposable local Supabase, then run all project verification scripts, TypeScript, lint, and production build. Test product creation, duplicate detection, atomic stock receipt, serial pages, image upload, location consent/session controls, customer freshness labels, and all Phase 1/2 regressions locally. GitHub, hosted Supabase, and Vercel remain deferred until explicit approval.

The rollback-only database acceptance test is `supabase/tests/phase3_frontend_completion.sql`. It proves active brand/model duplicate rejection, atomic serialized receipt, balance and serial state updates, order/shipment setup, and the complete start/record/pause/resume/stop location-session lifecycle without retaining any test data. Migration `202607220006_phase3_location_function_repair.sql` safely repairs an ambiguous PostgreSQL argument/column reference discovered by that transactional test.

Migration `202607220007_backfill_legacy_serial_product_models.sql` makes pre-Phase-1 serialized catalogue records operational by deriving missing model identifiers from their existing protected SKUs (or manufacturer part number as a fallback). It does not rewrite existing SKUs, issued serials, or historical snapshots.
