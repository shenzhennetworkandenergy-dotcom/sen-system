# Product Discovery and Chat Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair admin product thumbnails, expose featured-state filtering, render all live featured products on the homepage, and make the floating chat taller and more information-dense.

**Architecture:** Keep database access in the existing server-only catalogue and inventory modules. Add a small pure helper module for deterministic image selection and featured-filter normalization, then consume it from the admin loader. Convert the homepage featured section into an async Server Component backed by the public product loader, while limiting chat changes to scoped CSS.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Supabase, Tailwind CSS and global CSS, Node test runner.

## Global Constraints

- Preserve the floating chat desktop width at `24rem`.
- Homepage featured products must be active, public-catalogue-visible, and featured.
- Do not add a database migration or modify stored product/media data.
- Do not change chatbot behavior, permissions, or unrelated product workflows.

---

### Task 1: Product-list image fallback and featured filter normalization

**Files:**
- Create: `lib/inventory/product-list-view.ts`
- Create: `tests/product-home-chat-improvements.test.mts`
- Modify: `lib/inventory/products.ts`

**Interfaces:**
- Produces: `normalizeFeaturedFilter(value: string | undefined): boolean | null`.
- Produces: `pickProductListImage<T extends ProductListImage>(images: T[], productId: string): T | null`.
- Consumed by: `getProductList` for query filtering and thumbnail selection.

- [ ] **Step 1: Write failing unit tests**

```ts
test("product-list thumbnails prefer the primary image and fall back to the first image", () => {
  assert.equal(pickProductListImage(images, "product-a")?.storage_path, "primary.jpg");
  assert.equal(pickProductListImage(fallbackImages, "product-a")?.storage_path, "first.jpg");
});

test("featured filter accepts only supported states", () => {
  assert.equal(normalizeFeaturedFilter("featured"), true);
  assert.equal(normalizeFeaturedFilter("not_featured"), false);
  assert.equal(normalizeFeaturedFilter("anything"), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: FAIL because `lib/inventory/product-list-view.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers and connect the loader**

```ts
export function normalizeFeaturedFilter(value?: string) {
  if (value === "featured") return true;
  if (value === "not_featured") return false;
  return null;
}
```

Update `getProductList` to query parent image rows ordered by `is_primary` and `sort_order`, select through `pickProductListImage`, and apply `.eq("featured", featuredFilter)` when normalization returns a boolean.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: PASS.

### Task 2: Admin featured-state filter

**Files:**
- Modify: `app/admin/products/page.tsx`
- Modify: `lib/inventory/products.ts`
- Modify: `tests/product-home-chat-improvements.test.mts`

**Interfaces:**
- Consumes: `ProductListParams.featured` and `normalizeFeaturedFilter`.
- Produces: a `featured` query parameter preserved by `productListPageHref`.

- [ ] **Step 1: Add a failing integration contract test**

Add assertions that generated pagination retains `featured=featured` and the admin page exposes the three featured-state options.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: FAIL because the filter is not rendered or preserved.

- [ ] **Step 3: Add the featured select and pagination support**

Add `featured?: string` to `ProductListParams`, include it in `productListPageHref`, and render the select with `featured` and `not_featured` values.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: PASS.

### Task 3: Dynamic homepage featured products

**Files:**
- Modify: `lib/catalog/products.ts`
- Modify: `components/home/FeaturedProducts.tsx`
- Modify: `tests/product-home-chat-improvements.test.mts`

**Interfaces:**
- Adds: `CatalogueParams.featuredOnly?: boolean`.
- Consumes: `getPublicProducts({ featuredOnly: true })` from the async homepage Server Component.

- [ ] **Step 1: Add a failing homepage behavior contract test**

Verify the homepage component loads featured products dynamically and the catalogue loader applies `featured = true` without the four-item hard-coded array.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: FAIL because the homepage still renders static products.

- [ ] **Step 3: Implement live featured-product rendering**

Make `FeaturedProducts` async, load all active/public featured rows through `getPublicProducts`, render the existing cards with live signed images and metadata, and return `null` for an empty result.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: PASS.

### Task 4: Taller compact chat

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/product-home-chat-improvements.test.mts`

**Interfaces:**
- Preserves: `.sen-messenger-window` width contract.
- Produces: explicit responsive height plus compact chat-specific typography and spacing.

- [ ] **Step 1: Add a failing CSS behavior contract test**

Assert the messenger keeps `width: min(24rem, ...)`, has an explicit responsive `height`, and uses a bubble font size below the existing `.9rem`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: FAIL because the messenger only has a maximum height and uses the larger text scale.

- [ ] **Step 3: Update scoped chat CSS**

Set the desktop messenger height to `min(46rem, calc(100vh - 6.5rem))`, keep its current width, compact the header/messages/bubbles/options/composer, and retain the mobile viewport cap.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-home-chat-improvements.test.mts`

Expected: PASS.

### Task 5: Full verification and release

**Files:**
- Verify only.

**Interfaces:**
- Consumes: the completed implementation.
- Produces: a clean, tested deployment candidate.

- [ ] **Step 1: Run the full automated checks**

Run: `npm run test:standalone`, `npm run test:inventory`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

- [ ] **Step 2: Run a local production server and smoke tests**

Run: `npm run start -- --port 3000`, then `npm run test:production-routes` and visually verify homepage, admin product filters/thumbnails, and chat at desktop and mobile sizes.

- [ ] **Step 3: Commit and push the feature branch**

```bash
git add app components lib tests docs
git commit -m "fix: improve product discovery and chat layout"
git push -u origin codex/product-home-chat-improvements
```

- [ ] **Step 4: Deploy and verify production**

Run `npx vercel deploy --prod --yes`, inspect the deployment, repeat production route/database checks, and verify the public homepage and chat against `https://sen-system.vercel.app`.

