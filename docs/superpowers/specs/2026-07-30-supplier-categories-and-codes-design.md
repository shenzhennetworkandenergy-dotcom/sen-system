# Supplier Categories and Automatic Codes Design

## Scope

Extend the existing supplier master without changing purchasing, inventory, authentication, permissions, or existing supplier codes. Remove four obsolete fields from supplier-facing screens: country ISO code, payment terms, lead time, and tax/registration.

## Category hierarchy

Create a dedicated `supplier_categories` hierarchy. Categories may have unlimited depth. Every category has a name, the currently supported `normal` category type, optional parent, database-derived level, description, image URL, icon, active status, display order, and a normalized four-character code segment.

The database rejects self-parenting and ancestor cycles. Level is derived from the selected parent and is never trusted from the browser. Existing categories can be edited and re-parented; descendant levels are recalculated.

## Supplier relationship and codes

Each supplier can select one category node and one optional product brand. Selecting a category implicitly selects its complete root-to-node path.

Before creating a supplier, the form displays a code preview composed of the first four alphanumeric characters of every category path segment, uppercased, followed by a five-digit number. The server validates the selected category and generates the authoritative unique code. A collision causes another suffix to be generated.

Existing supplier codes remain unchanged. Changing a saved supplier's category or brand does not silently change its code. An administrator may explicitly regenerate the code from the saved category.

## Compatibility

The removed database columns remain in place with safe defaults because purchase-order code still reads payment terms and existing records may contain legacy data. New supplier forms no longer collect or display those fields. Existing supplier records remain valid; category and brand relations are nullable.

## UI

The supplier list gains a Supplier Categories action and category/brand columns. The supplier form uses an indented path selector that supports arbitrary hierarchy depth, an optional brand selector, a read-only generated-code preview, and the remaining supplier contact, country, currency, address, and notes fields.

The category manager lists the hierarchy in display order and supports creating and editing normal categories. Parent selection shows full paths and prevents choosing the category itself or any descendant.

Selecting a category opens its detail page. The page preserves category editing and direct-child navigation, and also lists every supplier assigned directly to that category with its code, brand, contact, country, status, and supplier-detail link. Suppliers assigned to descendant categories remain visible from those descendant category pages rather than being mixed into the parent directory.

## Security and auditing

Viewing uses `suppliers.view`; category creation uses `suppliers.create`; category editing and supplier-code regeneration use `suppliers.edit`. Database RLS follows the same permissions. All category changes, supplier creation/update, and explicit code regeneration are written to the existing audit log.

## Verification

Automated tests cover code-segment normalization, arbitrary-depth paths, five-digit suffixes, category changes regenerating previews, and cycle-safe hierarchy rules. Static verification covers routes, migration objects, form field removal, and permission guards. Full purchasing tests, lint, build, and local Supabase migration verification are required before handoff.
