# Dynamic Business Categories Design

## Purpose

Replace SEN's four hardcoded business-category values with a database-driven system that administrators can manage without source changes. The same category record must drive the homepage, catalogue, product pages, product-entry fields, themes, filtering, and compatibility data.

## Chosen architecture

Create a dedicated `business_categories` table because a business domain is not the same object as a hierarchical `product_categories` classification. Add `business_category_fields` for ordered, validated category-specific product fields. Products and product categories reference `business_categories.id`; the existing `sen_business_category` text columns remain temporarily as synchronized compatibility fields so current imports, searches, and historical integrations keep working.

Category-specific values continue to live in `products.specifications` as JSON keyed by the field's stable `field_key`. This avoids duplicating product-value storage while allowing the schema to evolve. Server-side validation uses the selected category's active field definitions and preserves unknown legacy specification keys.

## Data model

### `business_categories`

- `id uuid primary key`
- `name text`, case-insensitive unique among non-archived rows
- `slug text unique`
- `description text`
- `tagline text`
- `theme_color text` validated as `#RRGGBB`
- `icon text` for a short emoji or label
- `image_path text` for an optional managed storage asset
- `is_active boolean`
- `sort_order integer`
- `archived_at timestamptz`
- audit timestamps and profile IDs

### `business_category_fields`

- `id uuid primary key`
- `business_category_id uuid` with cascade deletion
- `field_key text` unique within its category
- `label text`
- `field_type text`: `text`, `textarea`, `number`, `select`, or `boolean`
- `placeholder`, `help_text`, and `unit`
- `options jsonb` for select choices
- `is_required`, `is_filterable`, `use_for_variations`, and `is_active`
- `sort_order integer`
- audit timestamps

### Existing tables

- Add `business_category_id` to `products` and `product_categories`.
- Backfill using normalized existing `sen_business_category` values.
- Remove the four-value check constraints.
- Add foreign keys with `ON DELETE RESTRICT`.
- Add a trigger that writes the linked category name back to the compatibility text columns.
- Seed the four current categories and practical default field schemas.

## Administration

`/admin/categories` gains a Business Categories section with create, edit, activate/deactivate, move up/down, and delete/archive controls. A focused editor manages the category's presentation and its field schema. All mutations require existing product-management permissions, validate on the server, write audit records, and revalidate public/admin paths.

Deletion follows the existing global deletion mode:

- Archive mode deactivates and archives the category so it disappears from normal screens.
- Permanent mode deletes only categories with no product or product-category references; otherwise it explains what must be reassigned.

Ordering uses explicit move controls and integer ordering. This is accessible, works without client-side drag code, and keeps the public ordering deterministic.

## Dynamic product entry

The product form receives active business categories and their active fields from the server. Selecting a category:

1. filters hierarchical product categories to the same business category;
2. renders the selected category's specification controls;
3. seeds variation-attribute rows from fields marked `use_for_variations`;
4. submits `business_category_id` plus a JSON specifications object.

The server re-loads the chosen category and field definitions, rejects inactive or unknown categories, validates required/types/options, and merges validated category values with legacy specification keys. This keeps client code advisory and server validation authoritative.

## Public experience

Homepage category cards query active categories ordered by `sort_order`, include live active/public product counts, and link by stable slug. Catalogue filters accept slugs and join to `business_categories`. Product cards and detail pages receive the linked category record.

Each rendered category scope defines CSS variables such as `--category-color`, `--category-ink`, and mixed surface colors. Components use those variables rather than hardcoded category classes. A contrast utility chooses readable foreground text for the configured color. Missing or archived links use a neutral fallback instead of breaking pages.

## Compatibility and rollout

The migration is additive and backfilled. Existing product URLs do not change. Existing category query values by display name are accepted during transition, but generated links use slugs. Import scripts resolve or create the intended business-category ID and continue writing compatibility text through the trigger.

The release order is migration, server data layer, admin controls, product form, public pages, import/API compatibility, then production audit. The migration must be applied before the Vercel deployment is promoted.

## Verification

- Unit tests cover hex validation, contrast, field normalization, specification validation, and compatibility resolution.
- Migration verification checks seed/backfill/FK/trigger/RLS statements.
- Feature verifier checks no four-category arrays remain in runtime paths.
- Lint and production build must pass.
- Authenticated browser checks cover create/edit/reorder/deactivate/delete validation and dynamic product fields.
- Public browser checks cover homepage card creation, category filtering, theme variables, product count, and product detail rendering.

