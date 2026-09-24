-- Isolated Phase 1 China-to-Bangladesh cargo tracking.
-- No sales, inventory, purchasing, billing or accounting posting.

begin;

create table public.cargo_shipping_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  courier_tracking_number text not null unique,
  goods_summary text not null,
  shipping_method text not null check (shipping_method in ('air','sea','hand_carry')),
  charge_basis text not null check (charge_basis in ('per_kg','per_piece','per_cbm','per_ton','flat')),
  rate numeric(14,2) not null default 0 check (rate >= 0),
  china_warehouse_id uuid references public.warehouses(id) on delete restrict,
  bangladesh_warehouse_id uuid references public.warehouses(id) on delete restrict,
  bangladesh_location_id uuid references public.warehouse_locations(id) on delete restrict,
  current_status text not null default 'requested' check (current_status in (
    'requested','expected_china','received_china','dispatched_china','in_transit',
    'arrived_bangladesh','received_bd_warehouse','ready_for_customer','handed_over',
    'delivered','closed'
  )),
  expected_china_at timestamptz,
  china_received_at timestamptz,
  dispatched_china_at timestamptz,
  arrived_bangladesh_at timestamptz,
  bangladesh_received_at timestamptz,
  ready_for_customer_at timestamptz,
  handed_over_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cargo_shipping_packages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cargo_shipping_jobs(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  description text not null,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit text not null,
  weight numeric(14,3) check (weight is null or weight >= 0),
  dimensions text,
  cbm numeric(14,4) check (cbm is null or cbm >= 0),
  created_at timestamptz not null default now(),
  unique (job_id, sequence_number)
);

create table public.cargo_shipping_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cargo_shipping_jobs(id) on delete restrict,
  status text not null check (status in (
    'requested','expected_china','received_china','dispatched_china','in_transit',
    'arrived_bangladesh','received_bd_warehouse','ready_for_customer','handed_over',
    'delivered','closed'
  )),
  event_at timestamptz not null default now(),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  location_id uuid references public.warehouse_locations(id) on delete restrict,
  note text,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index cargo_shipping_jobs_status_idx on public.cargo_shipping_jobs(current_status, updated_at desc);
create index cargo_shipping_jobs_customer_idx on public.cargo_shipping_jobs(customer_id, created_at desc);
create index cargo_shipping_packages_job_idx on public.cargo_shipping_packages(job_id, sequence_number);
create index cargo_shipping_events_job_idx on public.cargo_shipping_events(job_id, event_at desc, created_at desc);

alter table public.cargo_shipping_jobs enable row level security;
alter table public.cargo_shipping_packages enable row level security;
alter table public.cargo_shipping_events enable row level security;

grant select, insert, update on public.cargo_shipping_jobs to service_role;
grant select, insert on public.cargo_shipping_packages to service_role;
grant select, insert on public.cargo_shipping_events to service_role;

create or replace function public.create_cargo_shipping_job(
  actor_profile_id uuid,
  requested_customer_id uuid,
  requested_tracking_number text,
  requested_goods_summary text,
  requested_shipping_method text,
  requested_charge_basis text,
  requested_rate numeric,
  requested_china_warehouse_id uuid,
  requested_bangladesh_warehouse_id uuid,
  requested_note text,
  requested_packages jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid := gen_random_uuid();
  package_row jsonb;
  package_number integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;
  if not exists (
    select 1 from public.profiles
    where id = requested_customer_id and role = 'customer' and status = 'active'
  ) then raise exception 'Choose an active customer'; end if;
  if nullif(btrim(requested_tracking_number), '') is null then raise exception 'Courier tracking number is required'; end if;
  if nullif(btrim(requested_goods_summary), '') is null then raise exception 'Goods description is required'; end if;
  if requested_shipping_method not in ('air','sea','hand_carry') then raise exception 'Invalid shipping method'; end if;
  if requested_charge_basis not in ('per_kg','per_piece','per_cbm','per_ton','flat') then raise exception 'Invalid charge basis'; end if;
  if coalesce(requested_rate, 0) < 0 then raise exception 'Rate cannot be negative'; end if;
  if jsonb_typeof(requested_packages) <> 'array' or jsonb_array_length(requested_packages) = 0 then
    raise exception 'Add at least one package';
  end if;

  insert into public.cargo_shipping_jobs (
    id, customer_id, courier_tracking_number, goods_summary, shipping_method,
    charge_basis, rate, china_warehouse_id, bangladesh_warehouse_id, note,
    created_by, updated_by
  ) values (
    job_id, requested_customer_id, left(btrim(requested_tracking_number), 160),
    left(btrim(requested_goods_summary), 2000), requested_shipping_method,
    requested_charge_basis, coalesce(requested_rate, 0), requested_china_warehouse_id,
    requested_bangladesh_warehouse_id, nullif(left(btrim(coalesce(requested_note, '')), 3000), ''),
    actor_profile_id, actor_profile_id
  );

  for package_row in select value from jsonb_array_elements(requested_packages) loop
    package_number := package_number + 1;
    if nullif(btrim(package_row->>'description'), '') is null then raise exception 'Package description is required'; end if;
    if coalesce((package_row->>'quantity')::numeric, 0) <= 0 then raise exception 'Package quantity must be greater than zero'; end if;
    if nullif(btrim(package_row->>'unit'), '') is null then raise exception 'Package unit is required'; end if;
    insert into public.cargo_shipping_packages (
      job_id, sequence_number, description, quantity, unit, weight, dimensions, cbm
    ) values (
      job_id, package_number, left(btrim(package_row->>'description'), 1000),
      (package_row->>'quantity')::numeric, left(btrim(package_row->>'unit'), 40),
      nullif(package_row->>'weight', '')::numeric,
      nullif(left(btrim(coalesce(package_row->>'dimensions', '')), 200), ''),
      nullif(package_row->>'cbm', '')::numeric
    );
  end loop;

  insert into public.cargo_shipping_events(job_id, status, note, actor_id)
  values (job_id, 'requested', 'Cargo job created.', actor_profile_id);
  return job_id;
end;
$$;

create or replace function public.advance_cargo_shipping_job(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_status text,
  requested_event_at timestamptz,
  requested_warehouse_id uuid,
  requested_location_id uuid,
  requested_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.cargo_shipping_jobs%rowtype;
  expected_next text;
  event_time timestamptz := coalesce(requested_event_at, now());
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select * into job_row from public.cargo_shipping_jobs
  where id = requested_job_id for update;
  if job_row.id is null then raise exception 'Cargo job not found'; end if;

  expected_next := case job_row.current_status
    when 'requested' then 'expected_china'
    when 'expected_china' then 'received_china'
    when 'received_china' then 'dispatched_china'
    when 'dispatched_china' then 'in_transit'
    when 'in_transit' then 'arrived_bangladesh'
    when 'arrived_bangladesh' then 'received_bd_warehouse'
    when 'received_bd_warehouse' then 'ready_for_customer'
    when 'ready_for_customer' then 'handed_over'
    when 'handed_over' then 'delivered'
    when 'delivered' then 'closed'
    else null
  end;
  if expected_next is null or requested_status <> expected_next then
    raise exception 'Invalid next cargo status';
  end if;

  if requested_location_id is not null and not exists (
    select 1 from public.warehouse_locations
    where id = requested_location_id and warehouse_id = requested_warehouse_id and is_active
  ) then raise exception 'Choose a valid warehouse location'; end if;

  update public.cargo_shipping_jobs set
    current_status = requested_status,
    bangladesh_warehouse_id = case when requested_warehouse_id is not null then requested_warehouse_id else bangladesh_warehouse_id end,
    bangladesh_location_id = case when requested_location_id is not null then requested_location_id else bangladesh_location_id end,
    expected_china_at = case when requested_status = 'expected_china' then event_time else expected_china_at end,
    china_received_at = case when requested_status = 'received_china' then event_time else china_received_at end,
    dispatched_china_at = case when requested_status = 'dispatched_china' then event_time else dispatched_china_at end,
    arrived_bangladesh_at = case when requested_status = 'arrived_bangladesh' then event_time else arrived_bangladesh_at end,
    bangladesh_received_at = case when requested_status = 'received_bd_warehouse' then event_time else bangladesh_received_at end,
    ready_for_customer_at = case when requested_status = 'ready_for_customer' then event_time else ready_for_customer_at end,
    handed_over_at = case when requested_status = 'handed_over' then event_time else handed_over_at end,
    delivered_at = case when requested_status = 'delivered' then event_time else delivered_at end,
    closed_at = case when requested_status = 'closed' then event_time else closed_at end,
    updated_by = actor_profile_id,
    updated_at = now()
  where id = requested_job_id;

  insert into public.cargo_shipping_events(
    job_id, status, event_at, warehouse_id, location_id, note, actor_id
  ) values (
    requested_job_id, requested_status, event_time, requested_warehouse_id,
    requested_location_id, nullif(left(btrim(coalesce(requested_note, '')), 2000), ''), actor_profile_id
  );
end;
$$;

revoke all on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) to service_role;

commit;
