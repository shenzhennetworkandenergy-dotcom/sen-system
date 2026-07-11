# Product Content and Homepage Data

## Data source

Homepage featured products are read through `lib/data/products.ts`, which uses a centralized server Supabase client from `lib/supabase/server.ts`. Presentational cards do not query Supabase directly.

## Products schema

The migration `supabase/migrations/202607110001_create_products.sql` creates `public.products` with only catalogue-foundation fields: slug, name, descriptions, brand, model, category slug, image metadata, featured/published flags, display order and timestamps.

## Featured product query

`getFeaturedProducts()` returns published and featured products ordered by `display_order`, with a safe homepage limit. It returns an explicit source state: `supabase`, `empty` or `unavailable`.

## Demo and empty states

If Supabase is unavailable or public environment variables are missing, the homepage displays clearly marked demo category examples. If Supabase is reachable but has no published featured rows, the UI shows an empty state and does not pretend demo products are live database inventory.

## Sample data

`supabase/migrations/202607110002_seed_sample_products.sql` is optional sample/demo content. It contains no prices, stock claims or authorization claims. Replace it with verified SEN product records before production catalogue launch.

## Image strategy

Local abstract SVG visuals live under `public/images/home/`. They are locally generated technical category compositions, not manufacturer photos and not exact stock/product evidence.

## Supabase Storage recommendation

Recommended bucket: `product-images`.

Recommended convention: `products/{category_slug}/{product_slug}/{image-role}-{width}x{height}.webp`.

Recommended dimensions: 1600×1000 for hero/detail images, 1200×750 for cards, and 800×800 for square thumbnails.

Allowed formats: WebP preferred, PNG for transparent diagrams, JPEG for photography where licensed. Store the public URL or storage path in `products.image_url`; store descriptive alt text in `products.image_alt`.

Bucket policy direction: public read for published product images, private/admin-only writes. Do not allow anonymous upload, update or delete.

## Manual migration steps

1. Review the SQL migrations in `supabase/migrations/`.
2. Apply `202607110001_create_products.sql` to the Supabase project.
3. Optionally apply `202607110002_seed_sample_products.sql` for marked demo records.
4. Replace sample rows with verified SEN product content before using the catalogue commercially.
