-- capture_serial_event previously used untyped records. PostgreSQL raises
-- "record is not assigned yet" when an employee has a valid workplace and the
-- warehouse fallback record is therefore never populated. Typed row variables
-- keep both branches safe while preserving the existing event data.

create or replace function public.capture_serial_event(
  requested_serial_id uuid,
  requested_movement_id uuid,
  requested_status_id uuid,
  requested_event_type text,
  actor_profile_id uuid,
  requested_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  assignment public.work_locations%rowtype;
  warehouse_record public.warehouses%rowtype;
  event_id uuid:=gen_random_uuid();
  actor_role public.account_role;
begin
  select role into actor_role
  from public.profiles
  where id=actor_profile_id and status='active';
  if actor_role is null then raise exception 'Active actor required'; end if;

  select locations.* into assignment
  from public.profile_work_locations assignments
  join public.work_locations locations on locations.id=assignments.work_location_id
  where assignments.profile_id=actor_profile_id
    and assignments.is_primary
    and assignments.is_active
    and locations.is_active
  order by assignments.assigned_at desc
  limit 1;
  if actor_role='employee' and assignment.id is null then
    raise exception 'A verified primary workplace is required';
  end if;

  if assignment.id is null and requested_serial_id is not null then
    select warehouses.* into warehouse_record
    from public.serial_numbers serials
    join public.warehouses warehouses on warehouses.id=serials.warehouse_id
    where serials.id=requested_serial_id;
  end if;

  insert into public.serial_tracking_events(
    id,serial_number_id,movement_id,tracking_status_id,event_type,actor_profile_id,
    workplace_id,workplace_name_snapshot,address_snapshot,city_snapshot,country_snapshot,
    latitude_snapshot,longitude_snapshot,location_source,note
  ) values(
    event_id,requested_serial_id,requested_movement_id,requested_status_id,requested_event_type,
    actor_profile_id,assignment.id,coalesce(assignment.name,warehouse_record.name),
    coalesce(assignment.address_line,warehouse_record.address),assignment.city,
    coalesce(assignment.country_code,warehouse_record.country_name),assignment.latitude,
    assignment.longitude,case when assignment.id is not null then 'profile_work_location' else 'warehouse' end,
    left(requested_note,1000)
  );
  return event_id;
end $$;
revoke all on function public.capture_serial_event(uuid,uuid,uuid,text,uuid,text)
from public,anon,authenticated;
grant execute on function public.capture_serial_event(uuid,uuid,uuid,text,uuid,text)
to service_role;
