create table public.supplier_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category_type text not null default 'normal' check (category_type = 'normal'),
  parent_id uuid references public.supplier_categories(id) on delete restrict,
  category_level integer not null default 1 check (category_level >= 1),
  code_segment text not null,
  description text,
  image_url text,
  icon text,
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index supplier_categories_root_name_unique
  on public.supplier_categories (lower(name))
  where parent_id is null;
create unique index supplier_categories_parent_name_unique
  on public.supplier_categories (parent_id, lower(name))
  where parent_id is not null;
create index supplier_categories_parent_order_idx
  on public.supplier_categories (parent_id, display_order, name);

create or replace function public.supplier_category_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_level integer;
  normalized_segment text;
begin
  normalized_segment := upper(left(regexp_replace(new.name, '[^[:alnum:]]', '', 'g'), 4));
  if normalized_segment = '' then
    raise exception 'Category name must contain at least one letter or number.';
  end if;
  new.code_segment := normalized_segment;
  new.updated_at := now();

  if new.parent_id is null then
    new.category_level := 1;
    return new;
  end if;

  if new.id is not null and new.parent_id = new.id then
    raise exception 'A supplier category cannot be its own parent.';
  end if;

  select category_level into parent_level
  from public.supplier_categories
  where id = new.parent_id;
  if parent_level is null then
    raise exception 'The selected parent category does not exist.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select id from public.supplier_categories where parent_id = new.id
        union all
        select child.id
        from public.supplier_categories child
        join descendants tree on child.parent_id = tree.id
      )
      select 1 from descendants where id = new.parent_id
    ) then
      raise exception 'Supplier category cycle detected.';
    end if;
  end if;

  new.category_level := parent_level + 1;
  return new;
end;
$$;

create trigger supplier_category_guard
before insert or update of name, parent_id
on public.supplier_categories
for each row execute function public.supplier_category_guard();

create or replace function public.supplier_category_relevel_descendants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  with recursive descendants as (
    select id, new.category_level + 1 as expected_level
    from public.supplier_categories
    where parent_id = new.id
    union all
    select child.id, tree.expected_level + 1
    from public.supplier_categories child
    join descendants tree on child.parent_id = tree.id
  )
  update public.supplier_categories category
  set category_level = tree.expected_level,
      updated_at = now()
  from descendants tree
  where category.id = tree.id
    and category.category_level is distinct from tree.expected_level;
  return null;
end;
$$;

create trigger supplier_category_relevel_descendants
after update of parent_id, category_level
on public.supplier_categories
for each row execute function public.supplier_category_relevel_descendants();

alter table public.suppliers
  add column supplier_category_id uuid references public.supplier_categories(id) on delete restrict,
  add column brand_id uuid references public.brands(id) on delete set null;
create index suppliers_supplier_category_idx on public.suppliers(supplier_category_id);
create index suppliers_brand_idx on public.suppliers(brand_id);

create or replace function public.generate_supplier_code(requested_category_id uuid, requested_preview text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_prefix text;
  candidate text;
  attempt integer := 0;
begin
  if requested_category_id is null then
    raise exception 'A supplier category is required.';
  end if;

  with recursive category_path as (
    select id, parent_id, code_segment, 0 as distance
    from public.supplier_categories
    where id = requested_category_id
    union all
    select parent.id, parent.parent_id, parent.code_segment, path.distance + 1
    from public.supplier_categories parent
    join category_path path on path.parent_id = parent.id
  )
  select string_agg(code_segment, '-' order by distance desc)
    into category_prefix
  from category_path;

  if category_prefix is null or category_prefix = '' then
    raise exception 'The selected supplier category does not exist.';
  end if;

  if requested_preview ~ ('^' || category_prefix || '-[0-9]{5}$')
     and not exists (select 1 from public.suppliers where code = requested_preview) then
    return requested_preview;
  end if;

  loop
    attempt := attempt + 1;
    candidate := category_prefix || '-' || lpad(floor(random() * 100000)::integer::text, 5, '0');
    exit when not exists (select 1 from public.suppliers where code = candidate);
    if attempt >= 100 then
      raise exception 'Unable to generate a unique supplier code.';
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_supplier_code(uuid, text) from public, anon, authenticated;
grant execute on function public.generate_supplier_code(uuid, text) to service_role;

alter table public.supplier_categories enable row level security;
grant select, insert, update, delete on public.supplier_categories to authenticated;

create policy "Authorized staff can view supplier categories"
on public.supplier_categories for select to authenticated
using (
  public.current_user_has_permission('suppliers.view')
  or public.current_user_has_permission('purchasing.view')
);

create policy "Authorized staff can create supplier categories"
on public.supplier_categories for insert to authenticated
with check (public.current_user_has_permission('suppliers.create'));

create policy "Authorized staff can edit supplier categories"
on public.supplier_categories for update to authenticated
using (public.current_user_has_permission('suppliers.edit'))
with check (public.current_user_has_permission('suppliers.edit'));

create policy "Authorized staff can delete supplier categories"
on public.supplier_categories for delete to authenticated
using (public.current_user_has_permission('suppliers.edit'));
