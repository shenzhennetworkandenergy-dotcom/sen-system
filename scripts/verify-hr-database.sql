\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor_id uuid;
  v_target_profile_id uuid;
  v_department_id uuid;
  v_team_id uuid;
  v_designation_id uuid;
  v_employee_id uuid;
  v_attendance_id uuid;
  v_leave_type_id uuid;
  v_leave_request_id uuid;
  test_suffix text := right(txid_current()::text, 8);
  audit_count integer;
  notification_count integer;
begin
  select id into v_actor_id
  from public.profiles
  where role = 'admin' and status = 'active'
  order by created_at
  limit 1;

  if v_actor_id is null then
    raise exception 'HR database smoke test requires one active administrator profile';
  end if;

  select p.id into v_target_profile_id
  from public.profiles p
    where p.id <> v_actor_id
    and not exists (
      select 1
      from public.hr_employee_records employee
      where employee.profile_id = p.id
    )
  order by p.created_at
  limit 1;

  if v_target_profile_id is null then
    raise exception 'HR database smoke test requires one profile without an HR employee record';
  end if;

  insert into public.hr_departments(code, name, created_by)
  values ('T' || test_suffix, 'Temporary HR verification', v_actor_id)
  returning id into v_department_id;

  insert into public.hr_teams(department_id, code, name, created_by)
  values (v_department_id, 'TM' || test_suffix, 'Temporary verification team', v_actor_id)
  returning id into v_team_id;

  insert into public.hr_designations(department_id, code, name, created_by)
  values (v_department_id, 'DS' || test_suffix, 'Temporary verifier', v_actor_id)
  returning id into v_designation_id;

  v_employee_id := public.hr_upsert_employee(
    v_actor_id,
    null,
    v_target_profile_id,
    v_department_id,
    v_team_id,
    v_designation_id,
    'HR verification employee',
    'full_time',
    'active',
    current_date,
    null,
    null,
    25000.00,
    'BDT',
    'Verification contact',
    '+8801000000000'
  );

  if v_employee_id is null then
    raise exception 'Employee creation returned no identifier';
  end if;

  v_attendance_id := public.hr_record_attendance(
    v_actor_id,
    v_employee_id,
    current_date,
    'present',
    current_date + time '09:00',
    current_date + time '17:00',
    'Rollback-only HR verification',
    'manual'
  );

  if v_attendance_id is null then
    raise exception 'Attendance creation returned no identifier';
  end if;

  select id into v_leave_type_id
  from public.hr_leave_types
  where code = 'ANNUAL'
  limit 1;

  insert into public.hr_leave_balances(
    employee_record_id,
    leave_type_id,
    leave_year,
    allocated_days,
    updated_by
  )
  values (v_employee_id, v_leave_type_id, extract(year from current_date)::integer, 5, v_actor_id);

  insert into public.hr_leave_requests(
    employee_record_id,
    leave_type,
    leave_type_id,
    start_date,
    end_date,
    requested_days,
    reason,
    submitted_by
  )
  values (
    v_employee_id,
    'annual',
    v_leave_type_id,
    current_date + 1,
    current_date + 1,
    1,
    'Rollback-only HR verification',
    v_target_profile_id
  )
  returning id into v_leave_request_id;

  perform public.hr_review_leave(
    v_actor_id,
    v_leave_request_id,
    'approved',
    'Rollback-only HR verification'
  );

  if not exists (
    select 1
    from public.hr_leave_requests
    where id = v_leave_request_id and status = 'approved'
  ) then
    raise exception 'Leave approval did not persist the approved status';
  end if;

  if not exists (
    select 1
    from public.hr_leave_balances balance
    where balance.employee_record_id = v_employee_id
      and balance.leave_type_id = v_leave_type_id
      and balance.used_days = 1
  ) then
    raise exception 'Leave approval did not update the leave balance';
  end if;

  select count(*) into audit_count
  from public.audit_logs log
  where log.actor_id = v_actor_id
    and log.module = 'hr'
    and log.entity_id = v_employee_id::text;

  if audit_count < 1 then
    raise exception 'Employee operation did not create an HR audit entry';
  end if;

  select count(*) into notification_count
  from public.customer_notifications notification
  where notification.profile_id = v_target_profile_id
    and notification.entity_type = 'hr_leave_request'
    and notification.entity_id = v_leave_request_id;

  if notification_count <> 1 then
    raise exception 'Leave approval did not create exactly one employee notification';
  end if;

  perform public.hr_archive_employee(v_actor_id, v_employee_id, false);

  if not exists (
    select 1
    from public.hr_employee_records employee
    where employee.id = v_employee_id
      and employee.archived_at is not null
      and employee.employment_status = 'terminated'
  ) then
    raise exception 'Employee archive workflow did not complete';
  end if;

  raise notice 'HR_DATABASE_SMOKE_TEST_PASSED employee=% attendance=% leave=% audits=% notifications=%',
    v_employee_id, v_attendance_id, v_leave_request_id, audit_count, notification_count;
end
$$;

rollback;
