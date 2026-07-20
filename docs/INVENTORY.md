# Inventory

`inventory_balances` stores precise on-hand, reserved, incoming, damaged, and unavailable quantities by warehouse and product/variation. Available quantity is generated consistently by PostgreSQL. `deriveStockStatus` centralizes in-stock, low-stock, out-of-stock, and backorder presentation.

All operational mutations go through `admin_adjust_inventory` or `admin_transfer_inventory`. These fixed-search-path, service-role-only RPCs verify the actor's effective permission, reject invalid or negative results, keep serialized-unit counts aligned, update balances atomically, create movement/items, and record an audit event. Browser clients cannot directly write balances or movements.

Implemented operations are opening/manual adjustments and direct confirmed internal transfers. Purchase receipts, reservations, sale allocation, returns, damage, and corrections have schema support for future modules but no fake workflow. CSV export requires `inventory.export`, escapes spreadsheet-formula prefixes, and is bounded to 5,000 products and 10,000 balances per file.

Required view/write permissions are `inventory.view`, `inventory.adjust_stock`, and `inventory.transfer`. Import remains a documented next subphase.
