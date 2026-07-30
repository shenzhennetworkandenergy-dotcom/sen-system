begin;

create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  tagline text,
  theme_color text not null default '#0D6EFD'
    check (theme_color ~ '^#[0-9A-F]{6}$'),
  icon text,
  image_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_categories_active_name_unique
  on public.business_categories (lower(name))
  where archived_at is null;
create index if not exists business_categories_display_order_idx
  on public.business_categories (is_active desc, sort_order, name);

create table if not exists public.business_category_fields (
  id uuid primary key default gen_random_uuid(),
  business_category_id uuid not null
    references public.business_categories(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  label text not null,
  field_type text not null
    check (field_type in ('text','textarea','number','select','boolean')),
  placeholder text,
  help_text text,
  unit text,
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  is_required boolean not null default false,
  is_filterable boolean not null default false,
  use_for_variations boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_category_id, field_key)
);

create index if not exists business_category_fields_display_order_idx
  on public.business_category_fields
  (business_category_id, is_active desc, sort_order, label);

insert into public.business_categories
  (name, slug, description, tagline, theme_color, icon, sort_order)
values
  (
    'Networking',
    'networking',
    'Servers, switches, routers, optical systems and enterprise infrastructure.',
    'Connected infrastructure engineered for speed and resilience.',
    '#0D6EFD',
    '⌘',
    10
  ),
  (
    'Medical Equipment',
    'medical-equipment',
    'Clinical, diagnostic and healthcare technology for professional environments.',
    'Clinical technology presented with clarity, safety and trust.',
    '#28A745',
    '✚',
    20
  ),
  (
    'Energy',
    'energy',
    'Power, battery, automation and energy-efficiency systems.',
    'Power, automation and efficiency for demanding operations.',
    '#FD7E14',
    'ϟ',
    30
  ),
  (
    'Others',
    'others',
    'Specialist products and global sourcing for unique requirements.',
    'Industrial sourcing and specialist materials for unique projects.',
    '#6F42C1',
    '◆',
    40
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  tagline = excluded.tagline,
  icon = coalesce(public.business_categories.icon, excluded.icon),
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.business_category_fields
  (business_category_id, field_key, label, field_type, unit, options,
   is_required, is_filterable, use_for_variations, sort_order)
select c.id, f.field_key, f.label, f.field_type, f.unit, f.options,
       f.is_required, f.is_filterable, f.use_for_variations, f.sort_order
from public.business_categories c
join (
  values
    ('networking','ports','Ports','number',null,'[]'::jsonb,false,true,false,10),
    ('networking','throughput','Throughput','number','Gbps','[]'::jsonb,false,true,false,20),
    ('networking','interface','Interface','text',null,'[]'::jsonb,false,true,false,30),
    ('networking','firmware_version','Firmware Version','text',null,'[]'::jsonb,false,false,false,40),
    ('networking','rack_size','Rack Size','select',null,'["1U","2U","3U","4U","Desktop"]'::jsonb,false,true,false,50),
    ('medical-equipment','manufacturer','Manufacturer','text',null,'[]'::jsonb,false,true,false,10),
    ('medical-equipment','medical_certification','Medical Certification','text',null,'[]'::jsonb,false,true,false,20),
    ('medical-equipment','voltage','Voltage','number','V','[]'::jsonb,false,true,false,30),
    ('energy','capacity','Capacity','text',null,'[]'::jsonb,false,true,true,10),
    ('energy','voltage','Voltage','number','V','[]'::jsonb,false,true,false,20),
    ('energy','current','Current','number','A','[]'::jsonb,false,true,false,30),
    ('energy','battery_type','Battery Type','text',null,'[]'::jsonb,false,true,true,40),
    ('energy','efficiency','Efficiency','number','%','[]'::jsonb,false,true,false,50),
    ('energy','power_rating','Power Rating','number','W','[]'::jsonb,false,true,false,60)
) as f(category_slug,field_key,label,field_type,unit,options,is_required,is_filterable,use_for_variations,sort_order)
  on c.slug = f.category_slug
on conflict (business_category_id, field_key) do nothing;

alter table public.products
  add column if not exists business_category_id uuid;
alter table public.product_categories
  add column if not exists business_category_id uuid;

alter table public.products
  drop constraint if exists products_sen_business_category_check;
alter table public.product_categories
  drop constraint if exists product_categories_sen_business_category_check;

update public.products p
set business_category_id = c.id
from public.business_categories c
where p.business_category_id is null
  and lower(c.name) = lower(coalesce(p.sen_business_category, 'Others'));

update public.product_categories pc
set business_category_id = c.id
from public.business_categories c
where pc.business_category_id is null
  and lower(c.name) = lower(coalesce(pc.sen_business_category, 'Others'));

do $$
begin
  if exists (
    select 1 from public.products where business_category_id is null
  ) then
    raise exception 'Every product must resolve to a business category';
  end if;
  if exists (
    select 1 from public.product_categories where business_category_id is null
  ) then
    raise exception 'Every product category must resolve to a business category';
  end if;
end
$$;

alter table public.products
  alter column business_category_id set not null;
alter table public.product_categories
  alter column business_category_id set not null;

alter table public.products
  add constraint products_business_category_id_fkey
  foreign key (business_category_id)
  references public.business_categories(id) on delete restrict;
alter table public.product_categories
  add constraint product_categories_business_category_id_fkey
  foreign key (business_category_id)
  references public.business_categories(id) on delete restrict;

create index if not exists products_business_category_id_idx
  on public.products (business_category_id);
create index if not exists product_categories_business_category_id_idx
  on public.product_categories (business_category_id);

create or replace function public.sync_business_category_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_id uuid;
  resolved_name text;
begin
  resolved_id := new.business_category_id;
  if resolved_id is null then
    select c.id
      into resolved_id
      from public.business_categories c
     where c.archived_at is null
       and lower(c.name) = lower(coalesce(new.sen_business_category, 'Others'))
     order by c.is_active desc, c.sort_order, c.name
     limit 1;
  end if;

  select c.name
    into resolved_name
    from public.business_categories c
   where c.id = resolved_id
     and c.archived_at is null;

  if resolved_name is null then
    raise exception 'A valid business category is required';
  end if;

  new.business_category_id := resolved_id;
  new.sen_business_category := resolved_name;
  return new;
end
$$;

drop trigger if exists sync_products_business_category_name on public.products;
create trigger sync_products_business_category_name
before insert or update of business_category_id, sen_business_category
on public.products
for each row execute function public.sync_business_category_name();

drop trigger if exists sync_product_categories_business_category_name
on public.product_categories;
create trigger sync_product_categories_business_category_name
before insert or update of business_category_id, sen_business_category
on public.product_categories
for each row execute function public.sync_business_category_name();

create or replace function public.validate_product_category_business_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_business_category_id uuid;
  classification_business_category_id uuid;
begin
  select business_category_id into product_business_category_id
  from public.products where id = new.product_id;
  select business_category_id into classification_business_category_id
  from public.product_categories where id = new.category_id;
  if product_business_category_id is distinct from classification_business_category_id then
    raise exception 'Product classification must use the selected business category';
  end if;
  return new;
end
$$;

drop trigger if exists validate_product_category_business_match
on public.product_category_assignments;
create trigger validate_product_category_business_match
before insert or update on public.product_category_assignments
for each row execute function public.validate_product_category_business_match();

alter table public.business_categories enable row level security;
alter table public.business_category_fields enable row level security;

create policy "authorized staff read business categories"
on public.business_categories for select to authenticated
using (
  public.current_user_has_permission('products.view')
  or public.current_user_has_permission('products.edit')
);

create policy "authorized staff create business categories"
on public.business_categories for insert to authenticated
with check (
  public.current_user_has_permission('products.create')
  or public.current_user_has_permission('products.edit')
);

create policy "authorized staff edit business categories"
on public.business_categories for update to authenticated
using (public.current_user_has_permission('products.edit'))
with check (public.current_user_has_permission('products.edit'));

create policy "authorized staff delete business categories"
on public.business_categories for delete to authenticated
using (public.current_user_has_permission('products.edit'));

create policy "authorized staff read business category fields"
on public.business_category_fields for select to authenticated
using (
  public.current_user_has_permission('products.view')
  or public.current_user_has_permission('products.edit')
);

create policy "authorized staff manage business category fields"
on public.business_category_fields for all to authenticated
using (public.current_user_has_permission('products.edit'))
with check (public.current_user_has_permission('products.edit'));

create or replace function public.admin_save_business_category(
  actor_profile_id uuid,
  requested_category_id uuid,
  requested_category jsonb,
  requested_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  required_permission text;
begin
  required_permission := case
    when requested_category_id is null then 'products.create'
    else 'products.edit'
  end;
  if not exists (
    select 1
    from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key = required_permission
  ) then
    raise exception 'Permission denied';
  end if;
  if jsonb_typeof(requested_category) <> 'object'
     or jsonb_typeof(requested_fields) <> 'array' then
    raise exception 'Invalid business category data';
  end if;

  if requested_category_id is null then
    insert into public.business_categories (
      name, slug, description, tagline, theme_color, icon, image_path,
      is_active, sort_order, created_by, updated_by
    )
    values (
      requested_category->>'name',
      requested_category->>'slug',
      requested_category->>'description',
      requested_category->>'tagline',
      requested_category->>'theme_color',
      requested_category->>'icon',
      requested_category->>'image_path',
      coalesce((requested_category->>'is_active')::boolean, true),
      coalesce((requested_category->>'sort_order')::integer, 0),
      actor_profile_id,
      actor_profile_id
    )
    returning id into saved_id;
  else
    update public.business_categories
       set name = requested_category->>'name',
           slug = requested_category->>'slug',
           description = requested_category->>'description',
           tagline = requested_category->>'tagline',
           theme_color = requested_category->>'theme_color',
           icon = requested_category->>'icon',
           image_path = requested_category->>'image_path',
           is_active = coalesce((requested_category->>'is_active')::boolean, true),
           sort_order = coalesce((requested_category->>'sort_order')::integer, 0),
           updated_by = actor_profile_id,
           updated_at = now()
     where id = requested_category_id
       and archived_at is null
     returning id into saved_id;
    if saved_id is null then
      raise exception 'Business category not found';
    end if;
  end if;

  delete from public.business_category_fields
   where business_category_id = saved_id;

  insert into public.business_category_fields (
    business_category_id, field_key, label, field_type, placeholder,
    help_text, unit, options, is_required, is_filterable,
    use_for_variations, is_active, sort_order
  )
  select
    saved_id, field_key, label, field_type, placeholder, help_text, unit,
    coalesce(options, '[]'::jsonb), is_required, is_filterable,
    use_for_variations, is_active, sort_order
  from jsonb_to_recordset(requested_fields) as field_rows(
    field_key text,
    label text,
    field_type text,
    placeholder text,
    help_text text,
    unit text,
    options jsonb,
    is_required boolean,
    is_filterable boolean,
    use_for_variations boolean,
    is_active boolean,
    sort_order integer
  );

  return saved_id;
end
$$;

create or replace function public.admin_move_business_category(
  actor_profile_id uuid,
  requested_category_id uuid,
  requested_direction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order integer;
  neighbor_id uuid;
  neighbor_order integer;
begin
  if requested_direction not in ('up','down') then
    raise exception 'Invalid move direction';
  end if;
  if not exists (
    select 1
    from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key = 'products.edit'
  ) then
    raise exception 'Permission denied';
  end if;

  with ranked as (
    select id, row_number() over (order by sort_order, name, id)::integer * 10 as position
    from public.business_categories
    where archived_at is null
  )
  update public.business_categories category
     set sort_order = ranked.position
    from ranked
   where category.id = ranked.id;

  select sort_order into current_order
  from public.business_categories
  where id = requested_category_id and archived_at is null
  for update;
  if current_order is null then raise exception 'Business category not found'; end if;

  if requested_direction = 'up' then
    select id, sort_order into neighbor_id, neighbor_order
    from public.business_categories
    where archived_at is null and sort_order < current_order
    order by sort_order desc limit 1 for update;
  else
    select id, sort_order into neighbor_id, neighbor_order
    from public.business_categories
    where archived_at is null and sort_order > current_order
    order by sort_order limit 1 for update;
  end if;

  if neighbor_id is not null then
    update public.business_categories
       set sort_order = case
         when id = requested_category_id then neighbor_order
         when id = neighbor_id then current_order
       end,
       updated_by = actor_profile_id,
       updated_at = now()
     where id in (requested_category_id, neighbor_id);
  end if;
end
$$;

commit;
