begin;

alter table public.attributes
  add column if not exists scope text not null default 'universal',
  add column if not exists owner_product_id uuid references public.products(id) on delete cascade;

alter table public.attributes drop constraint if exists attributes_name_key;
alter table public.attributes drop constraint if exists attributes_slug_key;
alter table public.attributes drop constraint if exists attributes_scope_check;
alter table public.attributes
  add constraint attributes_scope_check
  check (
    (scope = 'universal' and owner_product_id is null)
    or (scope = 'product' and owner_product_id is not null)
  );

create unique index if not exists attributes_universal_name_unique
  on public.attributes (lower(name)) where scope = 'universal';
create unique index if not exists attributes_universal_slug_unique
  on public.attributes (slug) where scope = 'universal';
create unique index if not exists attributes_product_name_unique
  on public.attributes (owner_product_id, lower(name)) where scope = 'product';
create unique index if not exists attributes_product_slug_unique
  on public.attributes (owner_product_id, slug) where scope = 'product';

commit;
