-- Cargo Tracking Phase 2 corrections: country-aware warehouses, canonical units, and location integrity.

begin;

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
  requested_packages jsonb,
  requested_carrier_id uuid,
  requested_carrier_reference text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
  package_row jsonb;
  package_unit text;
begin
  if requested_china_warehouse_id is not null and not exists (
    select 1 from public.warehouses
    where id = requested_china_warehouse_id
      and is_active
      and upper(btrim(country_code)) = 'CN'
  ) then
    raise exception 'China warehouse must be an active CN warehouse';
  end if;

  if requested_bangladesh_warehouse_id is not null and not exists (
    select 1 from public.warehouses
    where id = requested_bangladesh_warehouse_id
      and is_active
      and upper(btrim(country_code)) = 'BD'
  ) then
    raise exception 'Bangladesh destination must be an active BD warehouse';
  end if;

  if requested_carrier_id is not null and not exists (
    select 1 from public.purchase_carriers
    where id = requested_carrier_id and status = 'active'
  ) then
    raise exception 'Choose an active carrier';
  end if;

  if jsonb_typeof(requested_packages) = 'array' then
    for package_row in select value from jsonb_array_elements(requested_packages) loop
      package_unit := btrim(coalesce(package_row->>'unit', ''));
      if package_unit = '' then raise exception 'Package unit is required'; end if;
      if package_unit not in ('Piece','Carton','Box','Wooden Box','Pallet','Bag/Sack','Roll','Set') then
        raise exception 'Choose a valid package unit';
      end if;
    end loop;
  end if;

  job_id := public.create_cargo_shipping_job(
    actor_profile_id,
    requested_customer_id,
    requested_tracking_number,
    requested_goods_summary,
    requested_shipping_method,
    requested_charge_basis,
    requested_rate,
    requested_china_warehouse_id,
    requested_bangladesh_warehouse_id,
    requested_note,
    requested_packages
  );

  update public.cargo_shipping_jobs
  set carrier_id = requested_carrier_id,
      carrier_reference = nullif(left(btrim(coalesce(requested_carrier_reference, '')), 200), '')
  where id = job_id;

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
  effective_warehouse_id uuid;
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

  effective_warehouse_id := coalesce(requested_warehouse_id, job_row.bangladesh_warehouse_id);
  if requested_status = 'received_bd_warehouse' and effective_warehouse_id is null then
    raise exception 'Choose a Bangladesh warehouse';
  end if;
  if effective_warehouse_id is not null and not exists (
    select 1 from public.warehouses
    where id = effective_warehouse_id
      and is_active
      and upper(btrim(country_code)) = 'BD'
  ) then
    raise exception 'Bangladesh destination must be an active BD warehouse';
  end if;
  if requested_location_id is not null and not exists (
    select 1 from public.warehouse_locations
    where id = requested_location_id
      and warehouse_id = effective_warehouse_id
      and is_active
  ) then
    raise exception 'Choose an active location belonging to the selected Bangladesh warehouse';
  end if;

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

create or replace function public.assign_cargo_package_location(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_package_id uuid,
  requested_location_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  package_row public.cargo_shipping_packages%rowtype;
  job_status text;
  job_warehouse_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select current_status, bangladesh_warehouse_id into job_status, job_warehouse_id
  from public.cargo_shipping_jobs
  where id = requested_job_id
  for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('arrived_bangladesh', 'received_bd_warehouse', 'ready_for_customer') then
    raise exception 'Package location can be assigned only after Bangladesh arrival';
  end if;
  if job_warehouse_id is null or not exists (
    select 1 from public.warehouses
    where id = job_warehouse_id
      and is_active
      and upper(btrim(country_code)) = 'BD'
  ) then
    raise exception 'Choose an active Bangladesh destination first';
  end if;

  select * into package_row
  from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id
  for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.handed_over_at is not null then raise exception 'Handed-over packages cannot be moved'; end if;

  if not exists (
    select 1 from public.warehouse_locations
    where id = requested_location_id
      and warehouse_id = job_warehouse_id
      and is_active
  ) then
    raise exception 'Choose an active location belonging to the selected Bangladesh warehouse';
  end if;

  update public.cargo_shipping_packages
  set warehouse_location_id = requested_location_id
  where id = requested_package_id;

  update public.cargo_shipping_jobs
  set bangladesh_location_id = requested_location_id,
      updated_by = actor_profile_id,
      updated_at = now()
  where id = requested_job_id;
end;
$$;

revoke execute on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb) from service_role;
revoke all on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb,uuid,text) from public, anon, authenticated;
revoke all on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb,uuid,text) to service_role;
grant execute on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) to service_role;
grant execute on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) to service_role;

commit;
