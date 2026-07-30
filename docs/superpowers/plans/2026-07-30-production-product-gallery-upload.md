# Production Product Gallery Upload Implementation Plan

**Goal:** Make product gallery uploads reliable on Vercel without reducing image quality.

**Architecture:** Keep authorization and metadata writes in small Server Actions, but upload original image bytes directly from the browser to Supabase Storage with a short-lived signed token. Verify the stored object before inserting `product_media`.

**Tech stack:** Next.js 16 Server Actions, React 19, Supabase Storage, TypeScript, Node test runner.

---

### Task 1: Define and test media validation

**Files:**
- Create: `lib/inventory/product-media.ts`
- Create: `tests/product-media-upload.test.mts`

1. Write failing tests for allowed MIME types, 10 MB limit, sanitized names, extensions, and product-scoped paths.
2. Run the focused test and confirm it fails because the helper does not exist.
3. Implement the smallest pure validation/path helpers.
4. Run the focused test and confirm it passes.

### Task 2: Add signed-upload Server Actions

**Files:**
- Modify: `app/admin/products/actions.ts`
- Modify: `scripts/verify-inventory-admin-controls.mjs`

1. Add a failing source-level regression check for signed upload preparation/finalization.
2. Add an action that verifies permission and product existence, validates metadata, generates the storage path, and calls `createSignedUploadUrl`.
3. Add an action that verifies the stored object and metadata, maintains main-image uniqueness, inserts `product_media`, audits, revalidates, and cleans up on failure.
4. Run the regression check.

### Task 3: Replace the production-unsafe gallery form

**Files:**
- Create: `components/inventory/ProductGalleryUploader.tsx`
- Modify: `app/admin/products/[id]/page.tsx`
- Modify: `components/inventory/ProductForm.tsx`

1. Add a failing source-level check that the gallery uploader uses `uploadToSignedUrl` and accepts multiple images.
2. Build a client uploader with type/size/count validation, sequential uploads, per-file status, purpose selection, alt text, and clear completion feedback.
3. Replace the Server Action file form on the product page with the uploader.
4. Remove image file inputs from the main product form and direct staff to the post-save gallery section.
5. Run the focused check.

### Task 4: Verify the complete repair

**Files:**
- Modify: `package.json`

1. Add a focused `test:product-media-upload` script.
2. Run the unit and source-level gallery tests.
3. Run TypeScript, lint, the existing inventory admin verification, and the production build.
4. Start the production build locally and verify the signed-upload UI renders on an authenticated product page when credentials are available.
5. Confirm no unrelated worktree changes were overwritten.
