-- Cargo Tracking Phase 3: employee-specific view and operational action permissions.

begin;

insert into public.app_modules (
  key, name, description, icon_key, sort_order, is_active, is_implemented
) values (
  'cargo', 'Cargo Tracking', 'China to Bangladesh cargo tracking operations.', 'shipments', 105, true, true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  is_implemented = excluded.is_implemented;

with catalogue(permission_key, name, description, action, sensitive, position) as (values
  ('cargo.view', 'View cargo tracking', 'View cargo jobs, packages, labels, and event history.', 'view', false, 10),
  ('cargo.create', 'Create cargo jobs', 'Create new cargo jobs and packages.', 'create', true, 20),
  ('cargo.china_receive', 'Confirm China receipt', 'Confirm China warehouse receipt and receiving-stage updates.', 'china_receive', true, 30),
  ('cargo.china_dispatch', 'Manage China dispatch', 'Confirm China dispatch and in-transit updates.', 'china_dispatch', true, 40),
  ('cargo.bd_receive', 'Confirm Bangladesh receipt', 'Confirm Bangladesh arrival and warehouse receipt.', 'bd_receive', true, 50),
  ('cargo.assign_location', 'Assign cargo location', 'Assign Bangladesh warehouse rack or storage locations.', 'assign_location', true, 60),
  ('cargo.mark_ready', 'Mark cargo ready', 'Verify packages are ready for customer collection.', 'mark_ready', true, 70),
  ('cargo.handover', 'Handover cargo', 'Verify handover and delivery actions.', 'handover', true, 80),
  ('cargo.close', 'Close cargo jobs', 'Close delivered cargo jobs.', 'close', true, 90)
)
insert into public.permissions(module_id, key, name, description, action, is_sensitive, sort_order)
select module.id, catalogue.permission_key, catalogue.name, catalogue.description,
  catalogue.action, catalogue.sensitive, catalogue.position
from catalogue
join public.app_modules module on module.key = 'cargo'
on conflict (key) do update set
  module_id = excluded.module_id,
  name = excluded.name,
  description = excluded.description,
  action = excluded.action,
  is_sensitive = excluded.is_sensitive,
  sort_order = excluded.sort_order,
  is_active = true;

create or replace function public.cargo_actor_has_permission(
  actor_profile_id uuid,
  requested_permission_key text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.effective_permissions_for_profile(actor_profile_id)
    where permission_key = requested_permission_key
  );
$$;

revoke all on function public.cargo_actor_has_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.cargo_actor_has_permission(uuid,text) to service_role;

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
  if not public.cargo_actor_has_permission(actor_profile_id, 'cargo.create') then
    raise exception 'Permission denied';
  end if;
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
  required_permission text;
  event_time timestamptz := coalesce(requested_event_at, now());
  effective_warehouse_id uuid;
begin
  required_permission := case
    when requested_status in ('expected_china', 'received_china') then 'cargo.china_receive'
    when requested_status in ('dispatched_china', 'in_transit') then 'cargo.china_dispatch'
    when requested_status in ('arrived_bangladesh', 'received_bd_warehouse') then 'cargo.bd_receive'
    when requested_status = 'ready_for_customer' then 'cargo.mark_ready'
    when requested_status in ('handed_over', 'delivered') then 'cargo.handover'
    when requested_status = 'closed' then 'cargo.close'
    else null
  end;
  if required_permission is null or not public.cargo_actor_has_permission(actor_profile_id, required_permission) then
    raise exception 'Permission denied';
  end if;

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
    where id = effective_warehouse_id and is_active and upper(btrim(country_code)) = 'BD'
  ) then raise exception 'Bangladesh destination must be an active BD warehouse'; end if;
  if requested_location_id is not null and not exists (
    select 1 from public.warehouse_locations
    where id = requested_location_id and warehouse_id = effective_warehouse_id and is_active
  ) then raise exception 'Choose an active location belonging to the selected Bangladesh warehouse'; end if;

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

  insert into public.cargo_shipping_events(job_id, status, event_at, warehouse_id, location_id, note, actor_id)
  values (requested_job_id, requested_status, event_time, requested_warehouse_id, requested_location_id,
    nullif(left(btrim(coalesce(requested_note, '')), 2000), ''), actor_profile_id);
end;
$$;

create or replace function public.verify_cargo_package_china_receive(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_package_id uuid,
  requested_event_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  package_row public.cargo_shipping_packages%rowtype;
  job_status text;
begin
  if not public.cargo_actor_has_permission(actor_profile_id, 'cargo.china_receive') then
    raise exception 'Permission denied';
  end if;
  select current_status into job_status from public.cargo_shipping_jobs
  where id = requested_job_id for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('expected_china', 'received_china') then
    raise exception 'Package China receipt is available only during the China receiving stage';
  end if;
  select * into package_row from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.china_received_at is not null then raise exception 'Package China receipt is already verified'; end if;
  update public.cargo_shipping_packages
  set china_received_at = coalesce(requested_event_at, now()), china_received_by = actor_profile_id
  where id = requested_package_id;
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
  if not public.cargo_actor_has_permission(actor_profile_id, 'cargo.assign_location') then
    raise exception 'Permission denied';
  end if;
  select current_status, bangladesh_warehouse_id into job_status, job_warehouse_id
  from public.cargo_shipping_jobs where id = requested_job_id for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('arrived_bangladesh', 'received_bd_warehouse', 'ready_for_customer') then
    raise exception 'Package location can be assigned only after Bangladesh arrival';
  end if;
  if job_warehouse_id is null or not exists (
    select 1 from public.warehouses
    where id = job_warehouse_id and is_active and upper(btrim(country_code)) = 'BD'
  ) then raise exception 'Choose an active Bangladesh destination first'; end if;
  select * into package_row from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.handed_over_at is not null then raise exception 'Handed-over packages cannot be moved'; end if;
  if not exists (
    select 1 from public.warehouse_locations
    where id = requested_location_id and warehouse_id = job_warehouse_id and is_active
  ) then raise exception 'Choose an active location belonging to the selected Bangladesh warehouse'; end if;
  update public.cargo_shipping_packages set warehouse_location_id = requested_location_id
  where id = requested_package_id;
  update public.cargo_shipping_jobs
  set bangladesh_location_id = requested_location_id, updated_by = actor_profile_id, updated_at = now()
  where id = requested_job_id;
end;
$$;

create or replace function public.verify_cargo_package_ready(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_package_id uuid,
  requested_event_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  package_row public.cargo_shipping_packages%rowtype;
  job_status text;
begin
  if not public.cargo_actor_has_permission(actor_profile_id, 'cargo.mark_ready') then
    raise exception 'Permission denied';
  end if;
  select current_status into job_status from public.cargo_shipping_jobs
  where id = requested_job_id for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('received_bd_warehouse', 'ready_for_customer') then
    raise exception 'Package readiness is available only after Bangladesh warehouse receipt';
  end if;
  select * into package_row from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.china_received_at is null then raise exception 'Verify China receipt first'; end if;
  if package_row.warehouse_location_id is null then raise exception 'Assign a Bangladesh warehouse location first'; end if;
  if package_row.ready_verified_at is not null then raise exception 'Package readiness is already verified'; end if;
  update public.cargo_shipping_packages
  set ready_verified_at = coalesce(requested_event_at, now()), ready_verified_by = actor_profile_id
  where id = requested_package_id;
end;
$$;

create or replace function public.verify_cargo_job_handover(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_recipient text,
  requested_reference text,
  requested_event_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.cargo_shipping_jobs%rowtype;
  event_time timestamptz := coalesce(requested_event_at, now());
begin
  if not public.cargo_actor_has_permission(actor_profile_id, 'cargo.handover') then
    raise exception 'Permission denied';
  end if;
  if nullif(btrim(requested_recipient), '') is null then raise exception 'Handover recipient is required'; end if;
  select * into job_row from public.cargo_shipping_jobs
  where id = requested_job_id for update;
  if job_row.id is null then raise exception 'Cargo job not found'; end if;
  if job_row.current_status <> 'ready_for_customer' then raise exception 'Cargo job is not ready for handover'; end if;
  if job_row.handover_verified_at is not null then raise exception 'Cargo handover is already verified'; end if;
  perform 1 from public.cargo_shipping_packages where job_id = requested_job_id for update;
  if exists (
    select 1 from public.cargo_shipping_packages
    where job_id = requested_job_id and ready_verified_at is null
  ) then raise exception 'Verify every package as ready first'; end if;
  if exists (
    select 1 from public.cargo_shipping_packages
    where job_id = requested_job_id and handed_over_at is not null
  ) then raise exception 'A package in this cargo job is already handed over'; end if;
  update public.cargo_shipping_packages
  set handed_over_at = event_time, handed_over_by = actor_profile_id
  where job_id = requested_job_id;
  update public.cargo_shipping_jobs
  set current_status = 'handed_over', handed_over_at = event_time,
    handover_verified_at = event_time, handover_verified_by = actor_profile_id,
    handover_recipient = left(btrim(requested_recipient), 200),
    handover_reference = nullif(left(btrim(coalesce(requested_reference, '')), 200), ''),
    updated_by = actor_profile_id, updated_at = now()
  where id = requested_job_id;
  insert into public.cargo_shipping_events(job_id, status, event_at, note, actor_id)
  values (
    requested_job_id, 'handed_over', event_time,
    'Verified handover to ' || left(btrim(requested_recipient), 200) ||
      case when nullif(btrim(coalesce(requested_reference, '')), '') is null
        then '' else ' · Reference ' || left(btrim(requested_reference), 200) end,
    actor_profile_id
  );
end;
$$;

revoke all on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_cargo_package_china_receive(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.verify_cargo_package_ready(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.verify_cargo_job_handover(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.advance_cargo_shipping_job(uuid,uuid,text,timestamptz,uuid,uuid,text) to service_role;
grant execute on function public.verify_cargo_package_china_receive(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.verify_cargo_package_ready(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.verify_cargo_job_handover(uuid,uuid,text,text,timestamptz) to service_role;

commit;
