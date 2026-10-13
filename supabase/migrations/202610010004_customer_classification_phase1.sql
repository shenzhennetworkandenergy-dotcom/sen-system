create table if not exists public.customer_business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_business_categories_name_check check (char_length(trim(name)) between 2 and 120),
  constraint customer_business_categories_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.customer_classifications (
  customer_profile_id uuid primary key references public.profiles(id) on delete cascade,
  district_code text,
  updated_at timestamptz not null default now(),
  constraint customer_classifications_district_check check (district_code is null or district_code in (
    'barguna','barishal','bhola','jhalokati','patuakhali','pirojpur',
    'bandarban','brahmanbaria','chandpur','chattogram','cumilla','cox-s-bazar','feni','khagrachhari','lakshmipur','noakhali','rangamati',
    'dha','faridpur','gazipur','gopalganj','kishoreganj','madaripur','manikganj','munshiganj','narayanganj','narsingdi','rajbari','shariatpur','tangail',
    'bagerhat','chuadanga','jashore','jhenaidah','khulna','kushtia','magura','meherpur','narail','satkhira',
    'jamalpur','mymensingh','netrokona','sherpur',
    'bogura','chapainawabganj','joypurhat','naogaon','natore','pabna','rajshahi','sirajganj',
    'dinajpur','gaibandha','kurigram','lalmonirhat','nilphamari','panchagarh','rng','thakurgaon',
    'habiganj','moulvibazar','sunamganj','sylhet'
  ))
);

create table if not exists public.customer_business_category_assignments (
  customer_profile_id uuid not null references public.profiles(id) on delete cascade,
  customer_business_category_id uuid not null references public.customer_business_categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (customer_profile_id, customer_business_category_id)
);

create index if not exists customer_classifications_district_idx on public.customer_classifications(district_code);
create index if not exists customer_business_category_assignments_category_idx on public.customer_business_category_assignments(customer_business_category_id);

insert into public.customer_business_categories (name, slug)
values
  ('Networking', 'networking'),
  ('Energy', 'energy'),
  ('Medical Equipment', 'medical-equipment'),
  ('Commercial Equipment', 'commercial-equipment'),
  ('Garments', 'garments'),
  ('Industrial Automation', 'industrial-automation'),
  ('Industrial Components', 'industrial-components'),
  ('Semiconductor', 'semiconductor')
on conflict (slug) do nothing;

alter table public.customer_business_categories enable row level security;
alter table public.customer_classifications enable row level security;
alter table public.customer_business_category_assignments enable row level security;

drop policy if exists "admins read customer classification categories" on public.customer_business_categories;
create policy "admins read customer classification categories" on public.customer_business_categories
  for select to authenticated using (public.is_current_user_admin());
drop policy if exists "admins manage customer classification categories" on public.customer_business_categories;
create policy "admins manage customer classification categories" on public.customer_business_categories
  for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists "admins read customer classifications" on public.customer_classifications;
create policy "admins read customer classifications" on public.customer_classifications
  for select to authenticated using (public.is_current_user_admin());
drop policy if exists "admins manage customer classifications" on public.customer_classifications;
create policy "admins manage customer classifications" on public.customer_classifications
  for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists "admins read customer category assignments" on public.customer_business_category_assignments;
create policy "admins read customer category assignments" on public.customer_business_category_assignments
  for select to authenticated using (public.is_current_user_admin());
drop policy if exists "admins manage customer category assignments" on public.customer_business_category_assignments;
create policy "admins manage customer category assignments" on public.customer_business_category_assignments
  for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

grant select on public.customer_business_categories to authenticated;
grant select, insert, update, delete on public.customer_classifications to authenticated;
grant select, insert, delete on public.customer_business_category_assignments to authenticated;
grant select on public.customer_business_categories to service_role;
grant select, insert, update, delete on public.customer_classifications to service_role;
grant select, insert, delete on public.customer_business_category_assignments to service_role;

notify pgrst, 'reload schema';
