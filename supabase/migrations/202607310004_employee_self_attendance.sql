-- Employee self-service attendance clocking.
-- Existing manual, CSV, correction, system, and device/fingerprint/camera
-- ingestion remain compatible; this only adds a distinct self-service source.

do $$
declare
  source_constraint text;
begin
  select c.conname into source_constraint
  from pg_constraint c
  where c.conrelid = 'public.hr_attendance'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%source%';

  if source_constraint is not null then
    execute format(
      'alter table public.hr_attendance drop constraint %I',
      source_constraint
    );
  end if;
end $$;

alter table public.hr_attendance
  add constraint hr_attendance_source_check
  check (source in (
    'manual','csv','device','correction','system','self_service'
  ));

create or replace function public.hr_record_self_attendance(
  actor_profile_id uuid,
  requested_event text,
  requested_timezone text default null
) returns table (
  attendance_id uuid,
  event_at timestamptz,
  event_timezone text,
  event_type text,
  work_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  employee public.hr_employee_records%rowtype;
  current_attendance public.hr_attendance%rowtype;
  location_timezone text;
  schedule_timezone text;
  v_schedule_start time;
  v_schedule_end time;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  check_in_difference integer;
  check_out_difference integer;
  recorded_at timestamptz := clock_timestamp();
  resolved_timezone text;
  resolved_work_date date;
  result_id uuid;
begin
  if requested_event not in ('check_in', 'check_out') then
    raise exception 'Attendance event must be check in or check out';
  end if;

  if nullif(trim(requested_timezone), '') is not null
     and not exists (
       select 1 from pg_timezone_names
       where name = trim(requested_timezone)
     ) then
    raise exception 'The automatically detected timezone is invalid';
  end if;

  select employee_row.*
  into employee
  from public.hr_employee_records employee_row
  join public.profiles profile on profile.id = employee_row.profile_id
  where employee_row.profile_id = actor_profile_id
    and employee_row.archived_at is null
    and employee_row.employment_status in ('active', 'probation')
    and profile.role = 'employee'
    and profile.status = 'active'
    and profile.archived_at is null;

  if employee.id is null then
    raise exception 'An active employee HR record is required to record attendance';
  end if;

  select location.timezone into location_timezone
  from public.work_locations location
  where location.id = employee.work_location_id;

  resolved_timezone := coalesce(
    nullif(trim(location_timezone), ''),
    nullif(trim(requested_timezone), ''),
    'Asia/Dhaka'
  );
  if not exists (
    select 1 from pg_timezone_names where name = resolved_timezone
  ) then
    raise exception 'The employee work-location timezone is invalid';
  end if;

  resolved_work_date := (recorded_at at time zone resolved_timezone)::date;

  select schedule.timezone, schedule.workday_start, schedule.workday_end
  into schedule_timezone, v_schedule_start, v_schedule_end
  from public.hr_employee_work_schedules schedule
  where schedule.employee_record_id = employee.id
    and schedule.weekday =
      extract(dow from resolved_work_date)::integer;

  if schedule_timezone is not null then
    resolved_timezone := schedule_timezone;
    resolved_work_date := (recorded_at at time zone resolved_timezone)::date;
  end if;

  select
    coalesce(schedule.workday_start, settings.workday_start),
    coalesce(schedule.workday_end, settings.workday_end)
  into v_schedule_start, v_schedule_end
  from public.hr_settings settings
  left join public.hr_employee_work_schedules schedule
    on schedule.employee_record_id = employee.id
   and schedule.weekday = extract(dow from resolved_work_date)::integer
  limit 1;

  v_scheduled_start_at :=
    (resolved_work_date + v_schedule_start) at time zone resolved_timezone;
  v_scheduled_end_at :=
    (
      resolved_work_date
      + case when v_schedule_end <= v_schedule_start then 1 else 0 end
      + v_schedule_end
    ) at time zone resolved_timezone;

  perform pg_advisory_xact_lock(
    hashtextextended(employee.id::text || ':' || resolved_work_date::text, 0)
  );

  select *
  into current_attendance
  from public.hr_attendance
  where employee_record_id = employee.id
    and hr_attendance.work_date = resolved_work_date
  for update;

  if requested_event = 'check_in' then
    if current_attendance.check_in is not null then
      raise exception 'You have already checked in today';
    end if;
    if current_attendance.id is not null
       and current_attendance.status not in (
         'present','late','half_day','remote','overtime','holiday_overtime'
       ) then
      raise exception 'Today''s attendance status does not allow check in';
    end if;

    check_in_difference :=
      round(extract(epoch from (recorded_at - v_scheduled_start_at)) / 60)::integer;

    if current_attendance.id is null then
      insert into public.hr_attendance (
        employee_record_id, work_date, status, check_in, source, recorded_by,
        timezone, scheduled_start_at, scheduled_end_at,
        check_in_variance_minutes, minutes_late
      ) values (
        employee.id, resolved_work_date, 'present', recorded_at,
        'self_service', actor_profile_id, resolved_timezone,
        v_scheduled_start_at, v_scheduled_end_at, check_in_difference,
        greatest(check_in_difference, 0)
      )
      returning id into result_id;
    else
      update public.hr_attendance
      set
        check_in = recorded_at,
        source = 'self_service',
        recorded_by = actor_profile_id,
        timezone = resolved_timezone,
        scheduled_start_at = v_scheduled_start_at,
        scheduled_end_at = v_scheduled_end_at,
        check_in_variance_minutes = check_in_difference,
        minutes_late = greatest(check_in_difference, 0),
        updated_at = recorded_at
      where id = current_attendance.id
      returning id into result_id;
    end if;
  else
    if current_attendance.id is null
       or current_attendance.check_in is null then
      raise exception 'Check in before checking out';
    end if;
    if current_attendance.check_out is not null then
      raise exception 'You have already checked out today';
    end if;

    check_out_difference :=
      round(extract(epoch from (recorded_at - v_scheduled_end_at)) / 60)::integer;

    update public.hr_attendance
    set
      check_out = recorded_at,
      source = 'self_service',
      recorded_by = actor_profile_id,
      timezone = resolved_timezone,
      scheduled_start_at = v_scheduled_start_at,
      scheduled_end_at = v_scheduled_end_at,
      check_out_variance_minutes = check_out_difference,
      updated_at = recorded_at
    where id = current_attendance.id
    returning id into result_id;
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, module, entity_type, entity_id,
    description, new_values
  ) values (
    actor_profile_id, 'employee',
    'hr.attendance.self_' || requested_event, 'hr', 'attendance',
    result_id::text,
    case when requested_event = 'check_in'
      then 'Employee checked in.'
      else 'Employee checked out.'
    end,
    jsonb_build_object(
      'event', requested_event,
      'eventAt', recorded_at,
      'timezone', resolved_timezone,
      'workDate', resolved_work_date,
      'source', 'self_service'
    )
  );

  return query select
    result_id, recorded_at, resolved_timezone, requested_event,
    resolved_work_date;
end $$;

revoke all on function public.hr_record_self_attendance(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.hr_record_self_attendance(uuid,text,text)
  to service_role;
