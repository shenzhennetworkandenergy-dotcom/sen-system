# Product Discovery and Chat Improvements Design

## Goal

Repair product thumbnails in the admin product list, display every featured public product on the homepage, let administrators filter products by featured state, and make the floating chat taller and denser without changing its width or behavior.

## Confirmed root cause

The public catalogue loads every public product image and falls back from the primary image to the first available image. The admin product list queries only rows with `is_primary = true`. Production HTML confirms the affected products have usable public images, so the admin-only primary-image restriction creates the blank thumbnail.

## Product image behavior

- Load parent-level image rows for each product, ordered by primary state and saved sort order.
- Select the primary image when one exists.
- Otherwise select the first available product image.
- Continue using signed `product-media` URLs and the existing placeholder when signing fails or no image exists.
- Do not change uploads, media permissions, product records, or storage data.

## Featured product behavior

- A homepage featured product must satisfy all three existing publication rules: `status = active`, `public_catalogue_visible = true`, and `featured = true`.
- Load the complete featured set in updated-first order rather than the current four hard-coded server examples.
- Render every returned featured product with its live name, slug, brand/category label, and resolved product image.
- Hide the featured section when no published featured products exist; never show invented fallback products.

## Admin featured filter

- Add a Featured state select to `/admin/products` with `All featured states`, `Featured only`, and `Not featured`.
- Normalize only the two supported values. Invalid URL values behave as the unfiltered state.
- Apply the selected database filter before pagination.
- Preserve the selected featured filter while moving between result pages.

## Chat layout

- Keep the desktop width at the existing `24rem` maximum.
- Give the floating messenger an explicit tall responsive height capped by the viewport.
- Reduce message, product-option, composer, and supporting text sizes and padding slightly.
- Preserve mobile fit, scrolling, tabs, form behavior, accessibility labels, and reduced-motion behavior.

## Error handling and scope

- Existing data-load errors continue to use the current route error handling.
- Failed image signing produces the existing placeholder rather than a broken image.
- No database migration or destructive data update is required.
- No unrelated product, catalogue, chatbot, permission, or navigation behavior changes.

## Verification

- Unit tests cover primary-image preference, non-primary fallback, isolation between products, and featured-filter normalization.
- Integration checks cover admin pagination/filter wiring, homepage dynamic featured loading, and chat sizing contracts.
- Run the complete standalone suite, inventory verification, lint, TypeScript, production build, local route smoke tests, and visual checks at desktop and mobile sizes before deployment.

