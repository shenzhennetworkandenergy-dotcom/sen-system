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
  schedule_is_working boolean;
  v_schedule_start time;
  v_schedule_end time;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  check_in_difference integer;
  check_out_difference integer;
  recorded_at timestamptz := clock_timestamp();
  resolved_timezone text;
  resolved_work_date date;
  candidate_work_date date;
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
    'Asia/Dhaka'
  );
  if not exists (
    select 1 from pg_timezone_names where name = resolved_timezone
  ) then
    raise exception 'The employee work-location timezone is invalid';
  end if;

  resolved_work_date := (recorded_at at time zone resolved_timezone)::date;

  select
    schedule.timezone, schedule.is_working,
    schedule.workday_start, schedule.workday_end
  into
    schedule_timezone, schedule_is_working,
    v_schedule_start, v_schedule_end
  from public.hr_employee_work_schedules schedule
  where schedule.employee_record_id = employee.id
    and schedule.weekday =
      extract(dow from resolved_work_date)::integer;

  if schedule_timezone is not null then
    resolved_timezone := schedule_timezone;
    resolved_work_date := (recorded_at at time zone resolved_timezone)::date;
  end if;

  select
    schedule.is_working,
    coalesce(schedule.workday_start, settings.workday_start),
    coalesce(schedule.workday_end, settings.workday_end)
  into schedule_is_working, v_schedule_start, v_schedule_end
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

  if requested_event = 'check_in' and schedule_is_working is false then
    raise exception 'Today is configured as a non-working day';
  end if;

  if requested_event = 'check_out' then
    select attendance.work_date
    into candidate_work_date
    from public.hr_attendance attendance
    where attendance.employee_record_id = employee.id
      and attendance.check_in is not null
      and attendance.check_out is null
      and attendance.work_date between resolved_work_date - 1 and resolved_work_date
    order by attendance.work_date desc
    limit 1;
    resolved_work_date := coalesce(candidate_work_date, resolved_work_date);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(employee.id::text || ':' || resolved_work_date::text, 0)
  );

  select *
  into current_attendance
  from public.hr_attendance
  where employee_record_id = employee.id
    and hr_attendance.work_date = resolved_work_date
  for update;

  if current_attendance.id is not null then
    resolved_timezone := current_attendance.timezone;
    v_scheduled_start_at := coalesce(
      current_attendance.scheduled_start_at,
      v_scheduled_start_at
    );
    v_scheduled_end_at := coalesce(
      current_attendance.scheduled_end_at,
      v_scheduled_end_at
    );
  end if;

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
      'browserTimezone', nullif(trim(requested_timezone), ''),
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

create or replace function public.hr_apply_device_attendance_event(
  requested_employee_id uuid,
  requested_event_type text,
  requested_occurred_at timestamptz,
  requested_timezone text,
  requested_start_time time,
  requested_end_time time,
  requested_late_grace integer default 0
) returns table (
  attendance_id uuid,
  applied_work_date date,
  applied_timezone text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attendance public.hr_attendance%rowtype;
  candidate_work_date date;
  resolved_work_date date;
  resolved_timezone text := nullif(trim(requested_timezone), '');
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  resulting_check_in timestamptz;
  resulting_check_out timestamptz;
  check_in_difference integer;
  check_out_difference integer;
  resulting_status text;
  result_id uuid;
begin
  if requested_event_type not in ('check_in', 'check_out') then
    raise exception 'Device attendance event is invalid';
  end if;
  if requested_occurred_at is null then
    raise exception 'Device attendance timestamp is required';
  end if;
  if resolved_timezone is null
     or not exists (
       select 1 from pg_timezone_names where name = resolved_timezone
     ) then
    raise exception 'Device attendance timezone is invalid';
  end if;
  if not exists (
    select 1 from public.hr_employee_records employee
    where employee.id = requested_employee_id
      and employee.archived_at is null
  ) then
    raise exception 'Device employee record was not found';
  end if;

  resolved_work_date :=
    (requested_occurred_at at time zone resolved_timezone)::date;

  if requested_event_type = 'check_out' then
    select attendance.work_date
    into candidate_work_date
    from public.hr_attendance attendance
    where attendance.employee_record_id = requested_employee_id
      and attendance.check_in is not null
      and attendance.check_out is null
      and attendance.work_date between resolved_work_date - 1 and resolved_work_date
    order by attendance.work_date desc
    limit 1;
    resolved_work_date := coalesce(candidate_work_date, resolved_work_date);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      requested_employee_id::text || ':' || resolved_work_date::text,
      0
    )
  );

  select *
  into current_attendance
  from public.hr_attendance attendance
  where attendance.employee_record_id = requested_employee_id
    and attendance.work_date = resolved_work_date
  for update;

  if current_attendance.id is not null then
    resolved_timezone := current_attendance.timezone;
  end if;
  v_scheduled_start_at := coalesce(
    current_attendance.scheduled_start_at,
    (resolved_work_date + requested_start_time) at time zone resolved_timezone
  );
  v_scheduled_end_at := coalesce(
    current_attendance.scheduled_end_at,
    (
      resolved_work_date
      + case when requested_end_time <= requested_start_time then 1 else 0 end
      + requested_end_time
    ) at time zone resolved_timezone
  );

  resulting_check_in := current_attendance.check_in;
  resulting_check_out := current_attendance.check_out;
  if requested_event_type = 'check_in' then
    resulting_check_in := case
      when resulting_check_in is null
        or requested_occurred_at < resulting_check_in
      then requested_occurred_at
      else resulting_check_in
    end;
  else
    resulting_check_out := case
      when resulting_check_out is null
        or requested_occurred_at > resulting_check_out
      then requested_occurred_at
      else resulting_check_out
    end;
  end if;

  if resulting_check_in is not null
     and resulting_check_out is not null
     and resulting_check_out < resulting_check_in then
    raise exception 'Device check-out cannot be before check-in';
  end if;

  check_in_difference := case
    when resulting_check_in is null then null
    else round(
      extract(epoch from (resulting_check_in - v_scheduled_start_at)) / 60
    )::integer
  end;
  check_out_difference := case
    when resulting_check_out is null then null
    else round(
      extract(epoch from (resulting_check_out - v_scheduled_end_at)) / 60
    )::integer
  end;
  resulting_status := case
    when current_attendance.status in ('overtime', 'holiday_overtime')
      then current_attendance.status
    when coalesce(check_in_difference, 0)
      > greatest(coalesce(requested_late_grace, 0), 0)
      then 'late'
    else 'present'
  end;

  insert into public.hr_attendance (
    employee_record_id, work_date, status, check_in, check_out, source,
    timezone, scheduled_start_at, scheduled_end_at,
    check_in_variance_minutes, check_out_variance_minutes, minutes_late
  ) values (
    requested_employee_id, resolved_work_date, resulting_status,
    resulting_check_in, resulting_check_out, 'device', resolved_timezone,
    v_scheduled_start_at, v_scheduled_end_at, check_in_difference,
    check_out_difference, greatest(coalesce(check_in_difference, 0), 0)
  )
  on conflict (employee_record_id, work_date) do update set
    status = excluded.status,
    check_in = excluded.check_in,
    check_out = excluded.check_out,
    source = excluded.source,
    timezone = excluded.timezone,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    check_in_variance_minutes = excluded.check_in_variance_minutes,
    check_out_variance_minutes = excluded.check_out_variance_minutes,
    minutes_late = excluded.minutes_late,
    updated_at = clock_timestamp()
  returning id into result_id;

  return query select result_id, resolved_work_date, resolved_timezone;
end $$;

revoke all on function public.hr_apply_device_attendance_event(
  uuid,text,timestamptz,text,time,time,integer
) from public, anon, authenticated;
grant execute on function public.hr_apply_device_attendance_event(
  uuid,text,timestamptz,text,time,time,integer
) to service_role;
