# Dynamic Business Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SEN business categories, themes, homepage modules, and product-specific fields fully database-driven while preserving existing data and integrations.

**Architecture:** Add normalized `business_categories` and `business_category_fields` tables, link existing products/classifications by UUID, and retain synchronized compatibility text during migration. Server components query category records; small client editors handle interactive form rows; server actions perform authoritative validation.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript 5, Supabase/PostgreSQL, Tailwind CSS 4, Node's built-in test runner.

## Global Constraints

- New categories must require no source-code changes to appear and function.
- Category colors must be validated `#RRGGBB` values and produce readable contrast.
- Existing product URLs, data, and text-based integrations must remain operational.
- All mutations must enforce existing permissions, audit changes, and honor global deletion mode.
- Do not add a drag-and-drop, color, icon, or form-schema dependency.
- Dynamic category values are validated server-side; client validation is convenience only.
- Follow the local Next.js 16.2.12 documentation for server/client boundaries and mutations.

---

### Task 1: Category domain validation

**Files:**
- Create: `lib/catalog/business-category-domain.ts`
- Test: `tests/business-category-domain.test.mts`

**Interfaces:**
- Produces: `normalizeThemeColor(value): string`, `contrastColor(hex): "#ffffff" | "#10152f"`, `normalizeFieldDefinitions(input): CategoryFieldDefinition[]`, and `validateCategorySpecifications(fields, input): Record<string, string | number | boolean>`.

- [ ] **Step 1: Write failing tests**

Cover lowercase hex normalization, invalid color rejection, white/ink contrast at dark/light boundaries, stable field-key normalization, select-option enforcement, number coercion, required-field rejection, and preservation-free output.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/business-category-domain.test.mts`

Expected: FAIL because `lib/catalog/business-category-domain.ts` does not exist.

- [ ] **Step 3: Implement the pure domain functions**

Use a strict `/^#[0-9A-F]{6}$/` normalized representation, WCAG relative luminance for contrast, a maximum of 40 fields and 100 select options, and typed errors safe to display in admin forms.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 command and expect all assertions to pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add business category domain validation`

### Task 2: Additive database migration and compatibility

**Files:**
- Create: `supabase/migrations/202607300001_dynamic_business_categories.sql`
- Create: `scripts/verify-business-category-migration.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `business_categories`, `business_category_fields`, `products.business_category_id`, `product_categories.business_category_id`, sync triggers, indexes, RLS, and seeded field schemas.

- [ ] **Step 1: Write the failing migration verifier**

The verifier reads the migration and checks executable statements for both tables, four seed rows, backfills, dropped legacy checks, restrictive FKs, synchronization triggers, unique/order indexes, RLS enablement, and admin-only mutation policies.

- [ ] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-business-category-migration.mjs`

Expected: FAIL because the migration is missing.

- [ ] **Step 3: Write the idempotent transaction migration**

Seed Networking `#0D6EFD`, Medical Equipment `#28A745`, Energy `#FD7E14`, and Others `#6F42C1`; seed the requested example fields. Use explicit backfill and fail the transaction if a product cannot resolve a category.

- [ ] **Step 4: Run verifier and existing inventory tests**

Run: `node scripts/verify-business-category-migration.mjs && npm run test:inventory`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add dynamic business category schema`

### Task 3: Server data layer and theme variables

**Files:**
- Create: `lib/catalog/business-categories.ts`
- Replace: `lib/catalog/themes.ts`
- Modify: `types/category.ts`
- Test: `tests/business-category-theme.test.mts`

**Interfaces:**
- Produces: `BusinessCategory`, `BusinessCategoryField`, `getBusinessCategories(options)`, `getBusinessCategory(identifier)`, `categoryStyle(category)`, and `fallbackBusinessCategory`.

- [ ] **Step 1: Write failing tests**

Assert that a database category becomes a serializable view model, CSS variables contain the configured primary/readable foreground colors, and null input gets a neutral fallback.

- [ ] **Step 2: Run tests and verify RED**

Run both business-category test files; expect missing exports.

- [ ] **Step 3: Implement server queries and pure style mapping**

Keep Supabase calls in a `server-only` module and pure theme helpers in a client-safe module. Report query failures with stable user-safe errors.

- [ ] **Step 4: Run tests and verify GREEN**

Run both business-category test files and expect PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add category data and dynamic themes`

### Task 4: Admin CRUD, activation, ordering, and deletion validation

**Files:**
- Create: `app/admin/categories/business-category-actions.ts`
- Create: `components/inventory/BusinessCategoryEditor.tsx`
- Modify: `app/admin/categories/page.tsx`
- Modify: `lib/deletion/archive.ts` only if its entity union requires the new type
- Test: `tests/business-category-actions.test.mts`

**Interfaces:**
- Consumes: domain normalizers and Supabase category tables.
- Produces: `createBusinessCategoryAction`, `updateBusinessCategoryAction`, `moveBusinessCategoryAction`, `toggleBusinessCategoryAction`, and `deleteBusinessCategoryAction`.

- [ ] **Step 1: Write failing action-policy tests**

Exercise pure payload parsing and deletion-decision helpers for invalid colors, duplicate field keys, inactive edits, archive mode, permanent unused deletion, and permanent in-use rejection.

- [ ] **Step 2: Run tests and verify RED**

Run the action-policy test and expect missing helper exports.

- [ ] **Step 3: Implement actions and editor**

The editor exposes name, slug, description, tagline, color picker plus hex input, icon, active status, order, and ordered field rows. Mutations authorize, validate, write audit records, revalidate `/`, `/products`, `/admin/categories`, and redirect with safe messages.

- [ ] **Step 4: Run focused tests, lint affected files, and verify GREEN**

Run category tests and `npx eslint app/admin/categories components/inventory/BusinessCategoryEditor.tsx lib/catalog`.

- [ ] **Step 5: Commit**

Commit message: `feat: add business category administration`

### Task 5: Dynamic product form and server validation

**Files:**
- Create: `components/inventory/CategorySpecificationFields.tsx`
- Modify: `components/inventory/ProductForm.tsx`
- Modify: `components/inventory/ProductAttributeFields.tsx`
- Modify: `components/inventory/InlineCategoryField.tsx`
- Modify: `lib/inventory/products.ts`
- Modify: `app/admin/products/actions.ts`
- Test: `tests/product-category-specifications.test.mts`

**Interfaces:**
- Consumes: active categories with fields.
- Produces: product submissions with `business_category_id`, category-filtered classification options, validated `specifications`, and suggested variation rows.

- [ ] **Step 1: Write failing tests**

Assert selected-category lookup, required-field validation, typed specification conversion, invalid select rejection, safe legacy-key merge, and variation suggestions.

- [ ] **Step 2: Run tests and verify RED**

Run the product-category specification test and expect missing helpers.

- [ ] **Step 3: Implement dynamic controls and authoritative save logic**

Replace the hardcoded business-category select. Render fields from selected category state, store existing values, merge non-schema legacy keys, and load the category in `saveProduct` before RPC. Update the RPC in the migration or an additional migration to persist both category ID and synchronized text.

- [ ] **Step 4: Run product tests and inventory verifiers**

Run focused tests, `npm run test:variable-products`, and `npm run test:inventory`.

- [ ] **Step 5: Commit**

Commit message: `feat: make product fields category driven`

### Task 6: Dynamic homepage and public catalogue

**Files:**
- Modify: `components/home/BusinessCategories.tsx`
- Modify: `components/home/homeData.ts`
- Modify: `lib/catalog/products.ts`
- Modify: `app/products/page.tsx`
- Modify: `app/products/[slug]/page.tsx`
- Modify: `components/catalog/ProductCard.tsx`
- Modify: `app/globals.css`
- Test: `tests/public-business-categories.test.mts`

**Interfaces:**
- Produces: ordered homepage cards with live counts, slug catalogue filtering, database-driven category navigation, and CSS-variable themes.

- [ ] **Step 1: Write failing public view-model tests**

Assert active-only ordering, count mapping, slug URL generation, old display-name filter resolution, and configured style variables.

- [ ] **Step 2: Run tests and verify RED**

Run the public-category test and expect missing view-model functions.

- [ ] **Step 3: Implement server-rendered dynamic views**

Keep category fetching server-side. Make grids use `auto-fit`, show image or icon when available, bind labels/buttons/cards to category CSS variables, and preserve accessible contrast and reduced-motion behavior.

- [ ] **Step 4: Run tests, lint, and production build**

Run category tests, `npm run lint`, and `npm run build`.

- [ ] **Step 5: Commit**

Commit message: `feat: render categories dynamically across catalogue`

### Task 7: API, importer, and legacy-runtime cleanup

**Files:**
- Modify: `app/api/admin/catalog/categories/route.ts`
- Modify: `app/api/products/search/route.ts`
- Modify: `app/request-quote/page.tsx`
- Modify: `scripts/import-woocommerce-products.mjs`
- Modify: `app/admin/products/actions.ts` bulk-import path
- Create: `scripts/verify-dynamic-business-categories.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: ID/slug-aware API payloads and imports, with no runtime four-value whitelist.

- [ ] **Step 1: Write a failing behavioral verifier**

Run source modules where possible and assert importer/category resolvers use database mappings. Scan runtime files only for forbidden hardcoded four-category arrays.

- [ ] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-dynamic-business-categories.mjs`

Expected: FAIL and list remaining runtime hardcoding.

- [ ] **Step 3: Update all consumers**

Resolve categories by UUID or normalized slug/name, return category metadata in search responses, and use the neutral active fallback only when an imported source category is unknown.

- [ ] **Step 4: Run full feature verification**

Run all new tests/verifiers plus existing chatbot, variable-product, inventory, and commerce checks.

- [ ] **Step 5: Commit**

Commit message: `refactor: remove hardcoded business categories`

### Task 8: Feature acceptance and migration application

**Files:**
- Modify: `docs/CUSTOMER_COMMERCE.md`
- Create: `docs/DYNAMIC_BUSINESS_CATEGORIES.md`

**Interfaces:**
- Produces: administrator guidance and a verified deployed database schema.

- [ ] **Step 1: Document operations and rollback**

Document create/edit/reorder/deactivate/delete behavior, field types, theme contrast, product reassignment, compatibility columns, and additive rollback constraints.

- [ ] **Step 2: Run clean verification**

Run `npm run lint`, all category tests, relevant existing module tests, and `npm run build`.

- [ ] **Step 3: Apply the migration to linked Supabase**

Use the project-link configuration or production database connection without logging secrets. Verify schema rows, backfill counts, and zero unresolved products with read-only SQL.

- [ ] **Step 4: Perform local browser acceptance**

Check create/edit/reorder/theme/product field/product save/homepage/catalogue/detail scenarios, including mobile widths and invalid deletion.

- [ ] **Step 5: Commit**

Commit message: `docs: document dynamic category operations`

