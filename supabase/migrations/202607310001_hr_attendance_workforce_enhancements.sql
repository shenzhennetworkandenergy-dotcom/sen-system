-- Employee schedules, manual overtime statuses, and timezone-aware attendance snapshots.

do $$
declare target record;
begin
  for target in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'hr_attendance'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.hr_attendance drop constraint %I', target.conname);
  end loop;
end $$;

alter table public.hr_attendance
  add constraint hr_attendance_status_check
  check (
    status in (
      'present','absent','late','half_day','leave','holiday','remote',
      'overtime','holiday_overtime'
    )
  );

do $$
declare target record;
begin
  for target in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'hr_attendance_correction_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%requested_status%'
  loop
    execute format(
      'alter table public.hr_attendance_correction_requests drop constraint %I',
      target.conname
    );
  end loop;
end $$;

alter table public.hr_attendance_correction_requests
  add constraint hr_attendance_correction_requested_status_check
  check (
    requested_status in (
      'present','absent','late','half_day','leave','holiday','remote',
      'overtime','holiday_overtime'
    )
  );

create table public.hr_employee_work_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_working boolean not null default true,
  workday_start time not null,
  workday_end time not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_record_id, weekday)
);

create index hr_employee_work_schedules_employee_idx
  on public.hr_employee_work_schedules(employee_record_id, weekday);

alter table public.hr_attendance
  add column if not exists timezone text not null default 'Asia/Dhaka',
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists check_in_variance_minutes integer,
  add column if not exists check_out_variance_minutes integer;

alter table public.hr_attendance
  add constraint hr_attendance_timezone_length_check
  check (char_length(timezone) between 1 and 80);

create or replace function public.hr_replace_employee_schedule(
  actor_profile_id uuid,
  requested_employee_id uuid,
  requested_schedule jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if not exists (
    select 1
    from public.hr_employee_records
    where id = requested_employee_id and archived_at is null
  ) then
    raise exception 'Employee record was not found';
  end if;

  if jsonb_typeof(requested_schedule) <> 'array'
     or jsonb_array_length(requested_schedule) <> 7 then
    raise exception 'Provide one schedule row for every weekday';
  end if;

  if (
    select count(distinct (item->>'weekday')::integer)
    from jsonb_array_elements(requested_schedule) item
  ) <> 7 then
    raise exception 'Schedule weekdays must be unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_schedule) item
    where (item->>'weekday')::integer not between 0 and 6
      or coalesce(item->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(item->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or not exists (
        select 1
        from pg_timezone_names tz
        where tz.name = item->>'timezone'
      )
  ) then
    raise exception 'Schedule row is invalid';
  end if;

  delete from public.hr_employee_work_schedules
  where employee_record_id = requested_employee_id;

  insert into public.hr_employee_work_schedules(
    employee_record_id, weekday, is_working, workday_start, workday_end,
    timezone, created_by, updated_by
  )
  select
    requested_employee_id,
    (item->>'weekday')::smallint,
    coalesce((item->>'isWorking')::boolean, false),
    (item->>'startTime')::time,
    (item->>'endTime')::time,
    item->>'timezone',
    actor_profile_id,
    actor_profile_id
  from jsonb_array_elements(requested_schedule) item;

  select role into actor_role from public.profiles where id = actor_profile_id;
  insert into public.audit_logs(
    actor_id, actor_role, action, module, entity_type, entity_id, description,
    new_values
  ) values (
    actor_profile_id, actor_role, 'hr.employee_schedule_saved', 'hr',
    'employee_record', requested_employee_id::text,
    'Employee weekday work schedule saved.',
    jsonb_build_object('schedule', requested_schedule)
  );
end $$;

drop function if exists public.hr_record_attendance(
  uuid,uuid,date,text,timestamptz,timestamptz,text,text
);

create function public.hr_record_attendance(
  actor_profile_id uuid,
  requested_employee_id uuid,
  requested_work_date date,
  requested_status text,
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  requested_notes text,
  requested_source text default 'manual',
  requested_timezone text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
  attendance_timezone text;
  schedule_start time;
  schedule_end time;
  schedule_start_at timestamptz;
  schedule_end_at timestamptz;
  check_in_difference integer;
  check_out_difference integer;
begin
  perform public.assert_hr_admin(actor_profile_id);

  if requested_status not in (
    'present','absent','late','half_day','leave','holiday','remote',
    'overtime','holiday_overtime'
  ) then
    raise exception 'Attendance status is invalid';
  end if;

  if requested_check_in is not null
     and requested_check_out is not null
     and requested_check_out < requested_check_in then
    raise exception 'Check-out cannot be before check-in';
  end if;

  select
    coalesce(
      nullif(trim(requested_timezone),''),
      schedule.timezone,
      location.timezone,
      'Asia/Dhaka'
    ),
    coalesce(schedule.workday_start, settings.workday_start),
    coalesce(schedule.workday_end, settings.workday_end)
  into attendance_timezone, schedule_start, schedule_end
  from public.hr_employee_records employee
  cross join public.hr_settings settings
  left join public.hr_employee_work_schedules schedule
    on schedule.employee_record_id = employee.id
   and schedule.weekday = extract(dow from requested_work_date)::integer
  left join public.work_locations location
    on location.id = employee.work_location_id
  where employee.id = requested_employee_id
    and employee.archived_at is null;

  if attendance_timezone is null then
    raise exception 'Employee record was not found';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name = attendance_timezone
  ) then
    raise exception 'Attendance timezone is invalid';
  end if;

  schedule_start_at :=
    (requested_work_date + schedule_start) at time zone attendance_timezone;
  schedule_end_at :=
    (
      requested_work_date
      + case when schedule_end <= schedule_start then 1 else 0 end
      + schedule_end
    ) at time zone attendance_timezone;

  check_in_difference := case
    when requested_check_in is null then null
    else round(extract(epoch from (requested_check_in - schedule_start_at)) / 60)::integer
  end;
  check_out_difference := case
    when requested_check_out is null then null
    else round(extract(epoch from (requested_check_out - schedule_end_at)) / 60)::integer
  end;

  insert into public.hr_attendance(
    employee_record_id, work_date, status, check_in, check_out, notes, source,
    recorded_by, timezone, scheduled_start_at, scheduled_end_at,
    check_in_variance_minutes, check_out_variance_minutes, minutes_late
  ) values (
    requested_employee_id, requested_work_date, requested_status,
    requested_check_in, requested_check_out, nullif(trim(requested_notes),''),
    requested_source, actor_profile_id, attendance_timezone, schedule_start_at,
    schedule_end_at, check_in_difference, check_out_difference,
    greatest(coalesce(check_in_difference, 0), 0)
  )
  on conflict(employee_record_id, work_date) do update set
    status = excluded.status,
    check_in = excluded.check_in,
    check_out = excluded.check_out,
    notes = excluded.notes,
    source = excluded.source,
    recorded_by = excluded.recorded_by,
    timezone = excluded.timezone,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    check_in_variance_minutes = excluded.check_in_variance_minutes,
    check_out_variance_minutes = excluded.check_out_variance_minutes,
    minutes_late = excluded.minutes_late,
    updated_at = now()
  returning id into result_id;

  return result_id;
end $$;

alter table public.hr_employee_work_schedules enable row level security;

create policy "hr admin manages employee work schedules"
on public.hr_employee_work_schedules
for all to authenticated
using (public.is_hr_admin())
with check (public.is_hr_admin());

create policy "hr employee reads own work schedule"
on public.hr_employee_work_schedules
for select to authenticated
using (
  exists (
    select 1
    from public.hr_employee_records employee
    where employee.id = employee_record_id
      and employee.profile_id = auth.uid()
  )
);

revoke all on function public.hr_replace_employee_schedule(uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.hr_record_attendance(
  uuid,uuid,date,text,timestamptz,timestamptz,text,text,text
) from public, anon, authenticated;

grant execute on function public.hr_replace_employee_schedule(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.hr_record_attendance(
  uuid,uuid,date,text,timestamptz,timestamptz,text,text,text
) to service_role;

grant select on public.hr_employee_work_schedules to authenticated, service_role;
grant all on public.hr_employee_work_schedules to service_role;

