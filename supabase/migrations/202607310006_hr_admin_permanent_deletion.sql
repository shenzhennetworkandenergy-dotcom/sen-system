-- Permanent HR record deletion guarded by the administrator deletion switch.

create or replace function public.admin_delete_hr_attendance(
  actor_profile_id uuid,
  requested_attendance_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  matching_count integer;
  actor_role public.account_role;
  permanent_deletion_enabled boolean;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if coalesce(array_length(requested_attendance_ids, 1), 0) = 0
     or array_length(requested_attendance_ids, 1) > 100 then
    raise exception 'Select between 1 and 100 attendance records';
  end if;

  select coalesce(value ->> 'permanent_deletion_enabled' = 'true', false)
  into permanent_deletion_enabled
  from public.system_settings
  where key = 'admin_deletion';

  if not coalesce(permanent_deletion_enabled, false) then
    raise exception 'Permanent Deletion Mode is disabled';
  end if;

  select count(*) into matching_count
  from public.hr_attendance
  where id = any(requested_attendance_ids);

  if matching_count <> cardinality(requested_attendance_ids) then
    raise exception 'One or more attendance records were not found';
  end if;

  update public.hr_attendance_correction_requests
  set attendance_id = null,
      updated_at = now()
  where attendance_id = any(requested_attendance_ids);

  delete from public.hr_attendance
  where id = any(requested_attendance_ids);
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    raise exception 'No matching attendance records were found';
  end if;

  select role into actor_role
  from public.profiles
  where id = actor_profile_id;

  insert into public.audit_logs(
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, old_values
  ) values (
    actor_profile_id,
    actor_role,
    'hr.attendance_deleted_permanently',
    'hr',
    'attendance_batch',
    requested_attendance_ids[1]::text,
    deleted_count || ' attendance record(s) permanently deleted.',
    jsonb_build_object(
      'attendance_ids', to_jsonb(requested_attendance_ids),
      'deleted_count', deleted_count
    )
  );

  return deleted_count;
end;
$$;

revoke all on function public.admin_delete_hr_attendance(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.admin_delete_hr_attendance(uuid, uuid[])
to service_role;
