# Product image database support

The UI supports product records with these fields without requiring a duplicate client or duplicate product structure:

```sql
alter table public.products
  add column if not exists image_url text,
  add column if not exists image_alt text,
  add column if not exists featured boolean not null default false,
  add column if not exists published boolean not null default true,
  add column if not exists display_order integer not null default 0;

create index if not exists products_published_display_order_idx
  on public.products (published, display_order, created_at desc);

create index if not exists products_featured_display_order_idx
  on public.products (featured, published, display_order, created_at desc);
```

If the project already has an equivalent migration, do not duplicate it. Apply only missing columns/indexes. Product cards use `image_url` when present and fall back to category-specific local images through `components/products/productImages.ts`.
