-- Additive daily inventory closing/archive reporting. Existing inventory data is read-only input.

create table if not exists public.inventory_daily_closing_sheets(
  id uuid primary key default gen_random_uuid(),
  root_sheet_id uuid references public.inventory_daily_closing_sheets(id) on delete restrict,
  reference text not null unique,
  inventory_date date not null,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  include_all_products boolean not null default false,
  include_serial_details boolean not null default false,
  status text not null default 'draft' check(status in('draft','finalized','verified')),
  closing_status text not null default 'pending_review' check(closing_status in('verified','pending_review','discrepancy_found','reconciliation_required')),
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  checked_by uuid references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  finalized_at timestamptz,
  verified_at timestamptz,
  closing_time timestamptz,
  physical_count numeric(18,4),
  variance numeric(18,4),
  remarks text,
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_daily_closing_lines(
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.inventory_daily_closing_sheets(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  product_name text not null,
  sku text not null,
  model text,
  opening_qty numeric(18,4) not null default 0,
  stock_in numeric(18,4) not null default 0,
  stock_out numeric(18,4) not null default 0,
  closing_qty numeric(18,4) not null default 0,
  system_closing_qty numeric(18,4) not null default 0,
  unit text not null default 'Pcs',
  remarks text,
  reconciliation_needed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_daily_closing_movement_details(
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.inventory_daily_closing_sheets(id) on delete cascade,
  line_id uuid references public.inventory_daily_closing_lines(id) on delete set null,
  movement_id uuid references public.inventory_movements(id) on delete set null,
  movement_item_id uuid references public.inventory_movement_items(id) on delete set null,
  reference text,
  movement_type text,
  quantity_delta numeric(18,4) not null default 0,
  source_warehouse_id uuid references public.warehouses(id) on delete set null,
  destination_warehouse_id uuid references public.warehouses(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  transaction_at timestamptz,
  product_name text,
  sku text,
  serial_number_id uuid references public.serial_numbers(id) on delete set null,
  sen_serial text,
  manufacturer_serial text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_daily_closing_date_idx on public.inventory_daily_closing_sheets(inventory_date desc);
create index if not exists inventory_daily_closing_warehouse_idx on public.inventory_daily_closing_sheets(warehouse_id,inventory_date desc);
create index if not exists inventory_daily_closing_status_idx on public.inventory_daily_closing_sheets(status,closing_status);
create index if not exists inventory_daily_closing_lines_sheet_idx on public.inventory_daily_closing_lines(sheet_id,product_name);
create index if not exists inventory_daily_closing_movements_sheet_idx on public.inventory_daily_closing_movement_details(sheet_id,transaction_at);

alter table public.inventory_daily_closing_sheets enable row level security;
alter table public.inventory_daily_closing_lines enable row level security;
alter table public.inventory_daily_closing_movement_details enable row level security;

drop policy if exists "authorized staff read daily closing sheets" on public.inventory_daily_closing_sheets;
create policy "authorized staff read daily closing sheets" on public.inventory_daily_closing_sheets
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);
drop policy if exists "authorized staff read daily closing lines" on public.inventory_daily_closing_lines;
create policy "authorized staff read daily closing lines" on public.inventory_daily_closing_lines
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);
drop policy if exists "authorized staff read daily closing movement details" on public.inventory_daily_closing_movement_details;
create policy "authorized staff read daily closing movement details" on public.inventory_daily_closing_movement_details
for select to authenticated using(
  public.is_current_user_admin()
  or public.current_user_has_permission('inventory.daily_closing_view')
  or public.current_user_has_permission('inventory.daily_closing_generate')
  or public.current_user_has_permission('inventory.daily_closing_finalize')
  or public.current_user_has_permission('inventory.daily_closing_verify')
  or public.current_user_has_permission('inventory.daily_closing_print')
  or public.current_user_has_permission('inventory.daily_closing_view_history')
);

grant select on public.inventory_daily_closing_sheets,public.inventory_daily_closing_lines,public.inventory_daily_closing_movement_details to authenticated;
grant all on public.inventory_daily_closing_sheets,public.inventory_daily_closing_lines,public.inventory_daily_closing_movement_details to service_role;

with catalogue(module_key,permission_key,name,description,action,sensitive,position) as (values
  ('inventory','inventory.daily_closing_view','View daily inventory closing sheets','View daily inventory closing sheets','view',false,70),
  ('inventory','inventory.daily_closing_generate','Generate daily inventory closing sheets','Generate and save daily inventory closing drafts','generate',false,80),
  ('inventory','inventory.daily_closing_finalize','Finalize daily inventory closing sheets','Finalize daily inventory closing sheets','finalize',true,90),
  ('inventory','inventory.daily_closing_print','Print daily inventory closing sheets','Print daily inventory closing sheets','print',false,100),
  ('inventory','inventory.daily_closing_verify','Verify daily inventory closing sheets','Verify daily inventory closing sheets','verify',true,110),
  ('inventory','inventory.daily_closing_view_history','View daily inventory closing history','View historical daily inventory closing sheets','view_history',true,120),
  ('inventory','inventory.daily_closing_export_pdf','Export daily inventory closing sheets','Export daily inventory closing sheets to PDF','export_pdf',true,130)
)
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,c.permission_key,c.name,c.description,c.action,c.sensitive,c.position
from catalogue c join public.app_modules m on m.key=c.module_key
on conflict (key) do update set module_id=excluded.module_id,name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order;


