# Inventory standardization and guarded administration

The existing SEN test catalogue is normalized by migration `202607220008_inventory_standardization_admin_controls.sql`. It makes BDT the catalogue currency, completes brand, model, SKU, category, descriptions, specifications, warranty, origin and default-warehouse information, and corrects the Cisco Nexus record. Existing stock is preserved.

Ten serial-tracked catalogue products receive one clearly labelled refurbished demonstration unit only when they have neither stock nor a serial record. These units exist to validate current warehouse, serial lifecycle, movement and availability screens. Re-running the migration does not create duplicate units.

Inventory summary cards open a filtered detail route showing product status, price, quantities, current warehouse/location, variation count and serial status. The product and serial records remain the source of truth.

Permanent deletion is deliberately guarded:

- Products can be deleted only when no stock, movement, reservation, order, variation or serial history exists. Operational products must be archived.
- Brands and attributes can be deleted only while unused.
- User deletion is blocked for the current administrator, the final active administrator and accounts whose protected business history prevents deletion. Such accounts should be disabled.

Supabase passwords are never retrievable. Administrators can review safe Auth and profile information and set a temporary password, but the value is never stored in an audit log.

Run `npm run test:inventory-admin-controls`, lint, TypeScript and the production build before review. Apply and test the migration locally before any hosted deployment.
