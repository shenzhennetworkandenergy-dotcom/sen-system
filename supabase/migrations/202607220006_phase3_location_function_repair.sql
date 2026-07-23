-- Forward repair for local databases that applied the initial Phase 3 migration.
-- Qualify the session actor column so PostgreSQL does not confuse it with the
-- identically named RPC argument.

create or replace function public.phase3_record_location(
  actor_profile_id uuid,
  requested_session_id uuid,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_accuracy numeric,
  requested_heading numeric,
  requested_speed numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  session_row public.delivery_location_sessions%rowtype;
  update_id uuid:=gen_random_uuid();
begin
  select location_session.* into session_row
    from public.delivery_location_sessions location_session
    where location_session.id=requested_session_id
      and location_session.actor_profile_id=phase3_record_location.actor_profile_id
      and location_session.status='active'
    for update;
  if session_row.id is null then raise exception 'Active location session required'; end if;
  if exists(
    select 1 from public.delivery_location_updates
    where session_id=requested_session_id and recorded_at > now()-interval '55 seconds'
  ) then return null; end if;
  insert into public.delivery_location_updates(
    id,session_id,shipment_id,actor_profile_id,latitude,longitude,
    accuracy,heading,speed
  ) values(
    update_id,session_row.id,session_row.shipment_id,actor_profile_id,
    requested_latitude,requested_longitude,requested_accuracy,
    requested_heading,requested_speed
  );
  update public.delivery_location_sessions
    set last_update_at=now(),updated_at=now() where id=session_row.id;
  update public.shipments
    set latest_location_snapshot=jsonb_build_object(
      'latitude',requested_latitude,
      'longitude',requested_longitude,
      'accuracy',requested_accuracy,
      'recorded_at',now(),
      'source','employee_shared_location'
    ),updated_at=now()
    where id=session_row.shipment_id;
  return update_id;
end $$;

revoke all on function public.phase3_record_location(
  uuid,uuid,numeric,numeric,numeric,numeric,numeric
) from public,anon,authenticated;
grant execute on function public.phase3_record_location(
  uuid,uuid,numeric,numeric,numeric,numeric,numeric
) to service_role;
