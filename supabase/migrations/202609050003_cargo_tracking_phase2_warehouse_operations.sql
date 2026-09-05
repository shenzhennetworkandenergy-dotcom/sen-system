-- Cargo Tracking Phase 2: isolated warehouse operations and package labels.

begin;

alter table public.cargo_shipping_jobs
  add column internal_cargo_id text generated always as (
    'CGO-' || upper(substr(md5(id::text), 1, 10))
  ) stored,
  add column handover_verified_at timestamptz,
  add column handover_verified_by uuid references public.profiles(id) on delete restrict,
  add column handover_recipient text,
  add column handover_reference text;

alter table public.cargo_shipping_packages
  add column package_identifier text generated always as (
    'CGO-' || upper(substr(md5(job_id::text), 1, 10)) || '-P' || lpad(sequence_number::text, 2, '0')
  ) stored,
  add column warehouse_location_id uuid references public.warehouse_locations(id) on delete restrict,
  add column china_received_at timestamptz,
  add column china_received_by uuid references public.profiles(id) on delete restrict,
  add column ready_verified_at timestamptz,
  add column ready_verified_by uuid references public.profiles(id) on delete restrict,
  add column handed_over_at timestamptz,
  add column handed_over_by uuid references public.profiles(id) on delete restrict;

create unique index cargo_shipping_jobs_internal_cargo_id_uidx
  on public.cargo_shipping_jobs(internal_cargo_id);

create unique index cargo_shipping_packages_identifier_uidx
  on public.cargo_shipping_packages(package_identifier);

create index cargo_shipping_packages_location_idx
  on public.cargo_shipping_packages(warehouse_location_id)
  where warehouse_location_id is not null;

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
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select current_status into job_status
  from public.cargo_shipping_jobs
  where id = requested_job_id
  for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('expected_china', 'received_china') then
    raise exception 'Package China receipt is available only during the China receiving stage';
  end if;

  select * into package_row
  from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id
  for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.china_received_at is not null then raise exception 'Package China receipt is already verified'; end if;

  update public.cargo_shipping_packages
  set china_received_at = coalesce(requested_event_at, now()),
      china_received_by = actor_profile_id
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
  location_warehouse_id uuid;
  job_status text;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select current_status into job_status
  from public.cargo_shipping_jobs
  where id = requested_job_id
  for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('arrived_bangladesh', 'received_bd_warehouse', 'ready_for_customer') then
    raise exception 'Package location can be assigned only after Bangladesh arrival';
  end if;

  select * into package_row
  from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id
  for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.handed_over_at is not null then raise exception 'Handed-over packages cannot be moved'; end if;

  select warehouse_id into location_warehouse_id
  from public.warehouse_locations
  where id = requested_location_id and is_active;
  if location_warehouse_id is null then raise exception 'Choose an active warehouse location'; end if;

  update public.cargo_shipping_packages
  set warehouse_location_id = requested_location_id
  where id = requested_package_id;

  update public.cargo_shipping_jobs
  set bangladesh_warehouse_id = location_warehouse_id,
      bangladesh_location_id = requested_location_id,
      updated_by = actor_profile_id,
      updated_at = now()
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
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select current_status into job_status
  from public.cargo_shipping_jobs
  where id = requested_job_id
  for update;
  if job_status is null then raise exception 'Cargo job not found'; end if;
  if job_status not in ('received_bd_warehouse', 'ready_for_customer') then
    raise exception 'Package readiness is available only after Bangladesh warehouse receipt';
  end if;

  select * into package_row
  from public.cargo_shipping_packages
  where id = requested_package_id and job_id = requested_job_id
  for update;
  if package_row.id is null then raise exception 'Cargo package not found'; end if;
  if package_row.china_received_at is null then raise exception 'Verify China receipt first'; end if;
  if package_row.warehouse_location_id is null then raise exception 'Assign a Bangladesh warehouse location first'; end if;
  if package_row.ready_verified_at is not null then raise exception 'Package readiness is already verified'; end if;

  update public.cargo_shipping_packages
  set ready_verified_at = coalesce(requested_event_at, now()),
      ready_verified_by = actor_profile_id
  where id = requested_package_id;
end;
$$;

create or replace function public.validate_cargo_phase2_status_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_status = 'ready_for_customer' and old.current_status = 'received_bd_warehouse' then
    if exists (
      select 1 from public.cargo_shipping_packages
      where job_id = new.id and ready_verified_at is null
    ) then raise exception 'Verify every package as ready first'; end if;
  end if;

  if new.current_status = 'handed_over' and old.current_status = 'ready_for_customer' then
    if new.handover_verified_at is null or exists (
      select 1 from public.cargo_shipping_packages
      where job_id = new.id and handed_over_at is null
    ) then raise exception 'Use verified cargo handover'; end if;
  end if;
  return new;
end;
$$;

create trigger validate_cargo_phase2_status_update_trigger
before update of current_status on public.cargo_shipping_jobs
for each row execute function public.validate_cargo_phase2_status_update();

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
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;
  if nullif(btrim(requested_recipient), '') is null then raise exception 'Handover recipient is required'; end if;

  select * into job_row
  from public.cargo_shipping_jobs
  where id = requested_job_id
  for update;
  if job_row.id is null then raise exception 'Cargo job not found'; end if;
  if job_row.current_status <> 'ready_for_customer' then raise exception 'Cargo job is not ready for handover'; end if;
  if job_row.handover_verified_at is not null then raise exception 'Cargo handover is already verified'; end if;

  perform 1 from public.cargo_shipping_packages
  where job_id = requested_job_id
  for update;

  if exists (
    select 1 from public.cargo_shipping_packages
    where job_id = requested_job_id and ready_verified_at is null
  ) then raise exception 'Verify every package as ready first'; end if;
  if exists (
    select 1 from public.cargo_shipping_packages
    where job_id = requested_job_id and handed_over_at is not null
  ) then raise exception 'A package in this cargo job is already handed over'; end if;

  update public.cargo_shipping_packages
  set handed_over_at = event_time,
      handed_over_by = actor_profile_id
  where job_id = requested_job_id;

  update public.cargo_shipping_jobs
  set current_status = 'handed_over',
      handed_over_at = event_time,
      handover_verified_at = event_time,
      handover_verified_by = actor_profile_id,
      handover_recipient = left(btrim(requested_recipient), 200),
      handover_reference = nullif(left(btrim(coalesce(requested_reference, '')), 200), ''),
      updated_by = actor_profile_id,
      updated_at = now()
  where id = requested_job_id;

  insert into public.cargo_shipping_events(job_id, status, event_at, note, actor_id)
  values (
    requested_job_id,
    'handed_over',
    event_time,
    'Verified handover to ' || left(btrim(requested_recipient), 200) ||
      case when nullif(btrim(coalesce(requested_reference, '')), '') is null
        then '' else ' · Reference ' || left(btrim(requested_reference), 200) end,
    actor_profile_id
  );
end;
$$;

revoke all on function public.verify_cargo_package_china_receive(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.verify_cargo_package_ready(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.verify_cargo_job_handover(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.verify_cargo_package_china_receive(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.assign_cargo_package_location(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.verify_cargo_package_ready(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.verify_cargo_job_handover(uuid,uuid,text,text,timestamptz) to service_role;

commit;
