# Production Product Gallery Upload Design

## Problem

The admin product forms currently send image bytes through Next.js Server Actions. Next.js limits Server Action request bodies to 1 MB by default, while the UI allows images up to 10 MB. The deployed Vercel application also has a fixed 4.5 MB function request-body limit. A gallery submission can exceed either limit before the application upload code runs.

## Chosen design

Existing products will use a client-side gallery uploader backed by short-lived Supabase signed upload URLs:

1. The authenticated admin selects up to 10 JPG, PNG, or WebP images, each no larger than 10 MB.
2. A small Server Action verifies `products.manage_media`, validates the product and image metadata, creates a unique storage path, and returns a signed upload token.
3. The browser uploads each original file directly to the existing private `product-media` bucket. Images are sent sequentially so the UI can show clear per-file progress and avoid bursts of large requests.
4. A second small Server Action verifies that the stored object exists and matches the authorized path, MIME type, and size. It then creates the `product_media` row, updates the main-image state when required, writes the audit log, and refreshes catalogue paths.
5. If finalization fails, the uncommitted storage object is removed. The UI reports the failed filename without hiding successful uploads.

The product create/edit form will no longer submit image bytes with the product record. It will clearly direct staff to save the product first and then use the gallery uploader on the product page. This keeps all production uploads on the safe direct-storage path.

## Validation and safety

- Allowed types: JPEG, PNG, WebP.
- Maximum size: 10 MB per image.
- Maximum selection: 10 images per batch.
- The server generates all paths; clients cannot choose arbitrary storage locations.
- Signed upload tokens are issued only after permission and product checks.
- Finalization checks the uploaded object before database insertion.
- Main-image uniqueness is preserved by demoting the previous main image before inserting the new one.
- Original image bytes are retained; no quality-reducing compression is performed.

## Verification

- Unit tests cover metadata validation, path construction, and upload limits.
- A source-level regression check ensures the gallery uses signed direct uploads and product forms no longer post image bytes through Server Actions.
- Type checking, linting, the production build, and the existing inventory verification suite must pass.
