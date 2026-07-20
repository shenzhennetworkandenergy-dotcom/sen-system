# Warehouses

Warehouses have unique codes, names, ISO country codes, country names, addresses, active states, and optional internal locations/bins. The design supports China, Bangladesh, and future facilities without hardcoded operational rows.

`/admin/warehouses` requires `warehouses.view`; creation requires `warehouses.create`; adding locations requires `warehouses.manage_locations`. Detail pages show bounded real balances. Transfers require distinct source/destination warehouses and sufficient available stock, and they create one traceable confirmed movement.

Shipment, customs, receiving, and purchasing lifecycles remain planned modules.
