# Inventory

`inventory_balances` stores precise on-hand, reserved, incoming, damaged, and unavailable quantities by warehouse and product/variation. Available quantity is generated consistently by PostgreSQL. `deriveStockStatus` centralizes in-stock, low-stock, out-of-stock, and backorder presentation.

All operational mutations go through `admin_adjust_inventory` or `admin_transfer_inventory`. These fixed-search-path, service-role-only RPCs verify the actor's effective permission, validate the product/variation relationship, enforce adjustment direction, reject invalid or negative results, keep serialized-unit counts aligned, update balances atomically, create movement/items, and record an audit event. Transfers lock balance rows in UUID order; the server reports deadlock or serialization failures for manual review and never retries a movement automatically. Browser clients cannot directly write balances or movements.

Composite foreign keys enforce product/variation and warehouse/location consistency for balances, movement items, reservations, serials, and product media. The hardening migration must pass its read-only preflight before production application.

Implemented operations are opening/manual adjustments and direct confirmed internal transfers. Purchase receipts, reservations, sale allocation, returns, damage, and corrections have schema support for future modules but no fake workflow. CSV export requires `inventory.export`, escapes spreadsheet-formula prefixes, and is bounded to 5,000 products and 10,000 balances per file.

Required view/write permissions are `inventory.view`, `inventory.adjust_stock`, and `inventory.transfer`. Import remains a documented next subphase.

## Individually serialized units

Phase 1 adds pre-receipt SEN serial generation, optional manufacturer serials, immutable issued identifiers, controlled expected-unit regeneration, Code 128/QR labels, scan/search, unit history, tracking events, workplace snapshots, and atomic serialized receipt/adjustment/transfer RPCs. See `docs/SERIALIZED_INVENTORY_PHASE_1.md` for the exact invariants and deployment matrix.
