-- Integrated SEN Human Resources Management.
-- Forward-only extension of the existing profiles/hr_employee_records foundation.

create or replace function public.is_hr_admin()
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and role='admin' and status='active' and archived_at is null
  )
$$;

create or replace function public.assert_hr_admin(actor_profile_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id=actor_profile_id and role='admin' and status='active' and archived_at is null
  ) then raise exception 'Active administrator access is required'; end if;
end $$;

alter table public.hr_employee_records
  add column if not exists team_id uuid,
  add column if not exists designation_id uuid,
  add column if not exists probation_end_date date,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

do $$ declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c join pg_class t on t.oid=c.conrelid
  where t.relname='hr_attendance' and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%status%';
  if constraint_name is not null then
    execute format('alter table public.hr_attendance drop constraint %I',constraint_name);
  end if;
end $$;
alter table public.hr_attendance
  add constraint hr_attendance_status_check
  check (status in ('present','absent','late','half_day','leave','holiday','remote'));
alter table public.hr_attendance
  add column if not exists source text not null default 'manual'
    check (source in ('manual','csv','device','correction','system')),
  add column if not exists minutes_late integer not null default 0 check (minutes_late>=0);

create table public.hr_teams (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.hr_departments(id) on delete restrict,
  code text not null unique check(code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check(char_length(name) between 2 and 120),
  manager_profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id,name)
);

create table public.hr_designations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.hr_departments(id) on delete restrict,
  code text not null unique check(code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check(char_length(name) between 2 and 120),
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_employee_records
  add constraint hr_employee_team_fk foreign key(team_id) references public.hr_teams(id) on delete set null,
  add constraint hr_employee_designation_fk foreign key(designation_id) references public.hr_designations(id) on delete set null;

create table public.hr_employee_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null unique references public.hr_employee_records(id) on delete restrict,
  preferred_name text,
  date_of_birth date,
  gender text check(gender is null or gender in ('female','male','non_binary','prefer_not_to_say')),
  nationality text,
  national_id text,
  passport_number text,
  personal_email text,
  personal_phone text,
  present_address text,
  permanent_address text,
  blood_group text,
  marital_status text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_routing_number text,
  tax_identifier text,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null unique check(char_length(name) between 2 and 120),
  default_days numeric(6,2) not null default 0 check(default_days>=0),
  is_paid boolean not null default true,
  requires_document boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hr_leave_types(code,name,default_days,is_paid)
values ('ANNUAL','Annual leave',20,true),('SICK','Sick leave',10,true),
('UNPAID','Unpaid leave',0,false),('PARENTAL','Parental leave',0,true),('OTHER','Other leave',0,true)
on conflict(code) do nothing;

alter table public.hr_leave_requests
  add column if not exists leave_type_id uuid references public.hr_leave_types(id) on delete restrict,
  add column if not exists requested_days numeric(6,2) check(requested_days is null or requested_days>0),
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
update public.hr_leave_requests r set leave_type_id=t.id
from public.hr_leave_types t where r.leave_type_id is null and t.code=upper(r.leave_type);

create table public.hr_leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  leave_type_id uuid not null references public.hr_leave_types(id) on delete restrict,
  leave_year integer not null check(leave_year between 2000 and 2200),
  allocated_days numeric(6,2) not null default 0 check(allocated_days>=0),
  used_days numeric(6,2) not null default 0 check(used_days>=0),
  adjusted_days numeric(6,2) not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_record_id,leave_type_id,leave_year),
  check(used_days<=allocated_days+adjusted_days)
);

create table public.hr_attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  attendance_id uuid references public.hr_attendance(id) on delete restrict,
  work_date date not null,
  requested_status text not null check(requested_status in ('present','absent','late','half_day','leave','holiday','remote')),
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  reason text not null check(char_length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(requested_check_out is null or requested_check_in is null or requested_check_out>=requested_check_in)
);

create table public.hr_payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  base_salary numeric(18,2) not null default 0 check(base_salary>=0),
  gross_pay numeric(18,2) not null default 0 check(gross_pay>=0),
  deductions numeric(18,2) not null default 0 check(deductions>=0),
  net_pay numeric(18,2) not null default 0 check(net_pay>=0),
  currency text not null default 'BDT' check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check(status in ('draft','approved','paid','cancelled')),
  paid_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_record_id,period_start,period_end),
  check(period_end>=period_start)
);

create table public.hr_payroll_components (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null references public.hr_payroll_records(id) on delete cascade,
  component_type text not null check(component_type in ('earning','deduction')),
  name text not null check(char_length(name) between 2 and 120),
  amount numeric(18,2) not null check(amount>=0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.hr_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  review_period_start date not null,
  review_period_end date not null,
  rating numeric(3,2) not null check(rating between 0 and 5),
  strengths text,
  improvements text,
  summary text,
  status text not null default 'draft' check(status in ('draft','finalized')),
  reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(review_period_end>=review_period_start)
);

create table public.hr_performance_goals (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  title text not null check(char_length(title) between 2 and 160),
  description text,
  target_date date,
  status text not null default 'not_started' check(status in ('not_started','in_progress','completed','cancelled')),
  progress_percent integer not null default 0 check(progress_percent between 0 and 100),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  document_type text not null check(char_length(document_type) between 2 and 80),
  title text not null check(char_length(title) between 2 and 160),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  expires_on date,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.hr_attendance_devices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[A-Z0-9-]{2,40}$'),
  name text not null check(char_length(name) between 2 and 120),
  device_type text not null check(device_type in ('fingerprint','camera','hybrid','gateway','other')),
  vendor text,
  model text,
  serial_number text unique,
  work_location_id uuid references public.work_locations(id) on delete set null,
  api_key_hash text not null unique,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_device_employee_mappings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.hr_attendance_devices(id) on delete cascade,
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  external_employee_id text not null check(char_length(external_employee_id) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(device_id,external_employee_id),
  unique(device_id,employee_record_id)
);

create table public.hr_attendance_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.hr_attendance_devices(id) on delete restrict,
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  event_uid text not null check(char_length(event_uid) between 1 and 160),
  event_type text not null check(event_type in ('check_in','check_out')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  unique(device_id,event_uid)
);

create table public.hr_settings (
  id boolean primary key default true check(id),
  workday_start time not null default '09:00',
  workday_end time not null default '18:00',
  late_grace_minutes integer not null default 15 check(late_grace_minutes between 0 and 240),
  leave_year_start_month integer not null default 1 check(leave_year_start_month between 1 and 12),
  device_ingestion_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.hr_settings(id) values(true) on conflict(id) do nothing;

create index if not exists hr_employee_records_directory_idx on public.hr_employee_records(employment_status,department_id,hire_date desc) where archived_at is null;
create index if not exists hr_attendance_employee_date_idx on public.hr_attendance(employee_record_id,work_date desc);
create index if not exists hr_corrections_status_idx on public.hr_attendance_correction_requests(status,created_at desc);
create index if not exists hr_leave_status_idx on public.hr_leave_requests(status,created_at desc);
create index if not exists hr_payroll_period_idx on public.hr_payroll_records(period_start desc,period_end desc);
create index if not exists hr_events_employee_time_idx on public.hr_attendance_events(employee_record_id,occurred_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-documents','hr-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.hr_upsert_employee(
  actor_profile_id uuid, requested_employee_id uuid, requested_profile_id uuid,
  requested_department_id uuid, requested_team_id uuid, requested_designation_id uuid,
  requested_job_title text, requested_employment_type text, requested_status text,
  requested_hire_date date, requested_work_location_id uuid, requested_manager_profile_id uuid,
  requested_base_salary numeric, requested_currency text,
  requested_emergency_name text, requested_emergency_phone text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare result_id uuid; actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if trim(coalesce(requested_job_title,''))='' then raise exception 'Job title is required'; end if;
  if requested_employee_id is null then
    insert into public.hr_employee_records(
      profile_id,employee_number,department_id,team_id,designation_id,job_title,
      employment_type,employment_status,hire_date,work_location_id,manager_profile_id,
      base_salary,salary_currency,emergency_contact_name,emergency_contact_phone,created_by,updated_by
    ) values (
      requested_profile_id,public.next_employee_number(),requested_department_id,requested_team_id,
      requested_designation_id,left(trim(requested_job_title),120),requested_employment_type,
      requested_status,requested_hire_date,requested_work_location_id,requested_manager_profile_id,
      requested_base_salary,upper(coalesce(requested_currency,'BDT')),
      nullif(trim(requested_emergency_name),''),nullif(trim(requested_emergency_phone),''),
      actor_profile_id,actor_profile_id
    ) returning id into result_id;
  else
    update public.hr_employee_records set
      department_id=requested_department_id,team_id=requested_team_id,designation_id=requested_designation_id,
      job_title=left(trim(requested_job_title),120),employment_type=requested_employment_type,
      employment_status=requested_status,hire_date=requested_hire_date,work_location_id=requested_work_location_id,
      manager_profile_id=requested_manager_profile_id,base_salary=requested_base_salary,
      salary_currency=upper(coalesce(requested_currency,'BDT')),
      emergency_contact_name=nullif(trim(requested_emergency_name),''),
      emergency_contact_phone=nullif(trim(requested_emergency_phone),''),
      updated_by=actor_profile_id,updated_at=now()
    where id=requested_employee_id and archived_at is null returning id into result_id;
  end if;
  if result_id is null then raise exception 'Employee record was not found'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description)
  values(actor_profile_id,actor_role,requested_profile_id,'hr.employee_saved','hr','employee_record',result_id::text,'Employee HR record saved.');
  return result_id;
end $$;

create or replace function public.hr_archive_employee(actor_profile_id uuid,requested_employee_id uuid,requested_restore boolean default false)
returns void language plpgsql security definer set search_path=public
as $$
declare target_profile uuid; actor_role public.account_role;
begin
  perform public.assert_hr_admin(actor_profile_id);
  update public.hr_employee_records set
    archived_at=case when requested_restore then null else now() end,
    archived_by=case when requested_restore then null else actor_profile_id end,
    employment_status=case when requested_restore then 'active' else 'terminated' end,
    updated_by=actor_profile_id,updated_at=now()
  where id=requested_employee_id returning profile_id into target_profile;
  if target_profile is null then raise exception 'Employee record was not found'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description)
  values(actor_profile_id,actor_role,target_profile,case when requested_restore then 'hr.employee_restored' else 'hr.employee_archived' end,'hr','employee_record',requested_employee_id::text,'Employee HR lifecycle changed.');
end $$;

create or replace function public.hr_record_attendance(
  actor_profile_id uuid, requested_employee_id uuid, requested_work_date date,
  requested_status text, requested_check_in timestamptz, requested_check_out timestamptz,
  requested_notes text, requested_source text default 'manual'
) returns uuid language plpgsql security definer set search_path=public
as $$
declare result_id uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  insert into public.hr_attendance(employee_record_id,work_date,status,check_in,check_out,notes,source,recorded_by)
  values(requested_employee_id,requested_work_date,requested_status,requested_check_in,requested_check_out,nullif(trim(requested_notes),''),requested_source,actor_profile_id)
  on conflict(employee_record_id,work_date) do update set status=excluded.status,check_in=excluded.check_in,
    check_out=excluded.check_out,notes=excluded.notes,source=excluded.source,recorded_by=excluded.recorded_by,updated_at=now()
  returning id into result_id;
  return result_id;
end $$;

create or replace function public.hr_review_attendance_correction(actor_profile_id uuid,requested_correction_id uuid,requested_decision text,requested_note text)
returns void language plpgsql security definer set search_path=public
as $$
declare correction public.hr_attendance_correction_requests%rowtype; target_profile uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_decision not in('approved','rejected') then raise exception 'Invalid correction decision'; end if;
  select * into correction from public.hr_attendance_correction_requests where id=requested_correction_id for update;
  if correction.id is null or correction.status<>'pending' then raise exception 'Only pending corrections can be reviewed'; end if;
  if requested_decision='approved' then
    perform public.hr_record_attendance(actor_profile_id,correction.employee_record_id,correction.work_date,
      correction.requested_status,correction.requested_check_in,correction.requested_check_out,
      'Approved attendance correction','correction');
  end if;
  update public.hr_attendance_correction_requests set status=requested_decision,reviewed_by=actor_profile_id,
    reviewed_at=now(),review_note=nullif(trim(requested_note),''),updated_at=now() where id=correction.id;
  select profile_id into target_profile from public.hr_employee_records where id=correction.employee_record_id;
  insert into public.customer_notifications(profile_id,notification_type,title,message,entity_type,entity_id)
  values(target_profile,'system','Attendance correction '||requested_decision,
    'Your attendance correction request was '||requested_decision||'.','hr_attendance_correction',correction.id);
end $$;

create or replace function public.hr_review_leave(actor_profile_id uuid,requested_leave_id uuid,requested_decision text,requested_note text)
returns void language plpgsql security definer set search_path=public
as $$
declare leave_row public.hr_leave_requests%rowtype; target_profile uuid; leave_days numeric(6,2);
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_decision not in('approved','rejected') then raise exception 'Invalid leave decision'; end if;
  select * into leave_row from public.hr_leave_requests where id=requested_leave_id for update;
  if leave_row.id is null or leave_row.status<>'pending' then raise exception 'Only pending leave can be reviewed'; end if;
  leave_days:=coalesce(leave_row.requested_days,(leave_row.end_date-leave_row.start_date+1)::numeric);
  if requested_decision='approved' and leave_row.leave_type_id is not null then
    update public.hr_leave_balances set used_days=used_days+leave_days,updated_by=actor_profile_id,updated_at=now()
    where employee_record_id=leave_row.employee_record_id and leave_type_id=leave_row.leave_type_id
      and leave_year=extract(year from leave_row.start_date)::integer
      and used_days+leave_days<=allocated_days+adjusted_days;
    if not found then raise exception 'Insufficient configured leave balance'; end if;
  end if;
  update public.hr_leave_requests set status=requested_decision,reviewed_by=actor_profile_id,reviewed_at=now(),
    review_note=nullif(trim(requested_note),''),updated_at=now() where id=leave_row.id;
  select profile_id into target_profile from public.hr_employee_records where id=leave_row.employee_record_id;
  insert into public.customer_notifications(profile_id,notification_type,title,message,entity_type,entity_id)
  values(target_profile,'system','Leave request '||requested_decision,
    'Your leave request was '||requested_decision||'.','hr_leave_request',leave_row.id);
end $$;

do $$ declare table_name text;
begin foreach table_name in array array[
  'hr_teams','hr_designations','hr_employee_profiles','hr_leave_types','hr_leave_balances',
  'hr_attendance_correction_requests','hr_payroll_records','hr_payroll_components',
  'hr_performance_reviews','hr_performance_goals','hr_employee_documents',
  'hr_attendance_devices','hr_device_employee_mappings','hr_attendance_events','hr_settings'
] loop execute format('alter table public.%I enable row level security',table_name); end loop; end $$;

create policy "hr admin manages teams" on public.hr_teams for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages designations" on public.hr_designations for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages employee profiles" on public.hr_employee_profiles for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads own profile" on public.hr_employee_profiles for select to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr admin manages leave types" on public.hr_leave_types for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads leave types" on public.hr_leave_types for select to authenticated using(is_active);
create policy "hr admin manages leave balances" on public.hr_leave_balances for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads own balances" on public.hr_leave_balances for select to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr admin manages corrections" on public.hr_attendance_correction_requests for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee manages own corrections" on public.hr_attendance_correction_requests for all to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid())) with check(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()) and status='pending');
create policy "hr admin manages payroll" on public.hr_payroll_records for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages payroll components" on public.hr_payroll_components for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages performance reviews" on public.hr_performance_reviews for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages performance goals" on public.hr_performance_goals for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads own goals" on public.hr_performance_goals for select to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr admin manages documents" on public.hr_employee_documents for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads own documents" on public.hr_employee_documents for select to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()) and archived_at is null);
create policy "hr admin manages devices" on public.hr_attendance_devices for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin manages device mappings" on public.hr_device_employee_mappings for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr admin reads attendance events" on public.hr_attendance_events for select to authenticated using(public.is_hr_admin());
create policy "hr employee reads own attendance events" on public.hr_attendance_events for select to authenticated using(exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr admin manages settings" on public.hr_settings for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());
create policy "hr employee reads settings" on public.hr_settings for select to authenticated using(true);

drop policy if exists "hr staff read departments" on public.hr_departments;
create policy "hr admin reads departments" on public.hr_departments for select to authenticated using(public.is_hr_admin());
drop policy if exists "hr staff read employees" on public.hr_employee_records;
create policy "hr admin or owner reads employees" on public.hr_employee_records for select to authenticated using(public.is_hr_admin() or profile_id=auth.uid());
drop policy if exists "hr staff or owner read leave" on public.hr_leave_requests;
create policy "hr admin or owner reads leave" on public.hr_leave_requests for select to authenticated using(public.is_hr_admin() or exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
drop policy if exists "hr staff or owner read attendance" on public.hr_attendance;
create policy "hr admin or owner reads attendance" on public.hr_attendance for select to authenticated using(public.is_hr_admin() or exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr admin manages attendance" on public.hr_attendance for all to authenticated using(public.is_hr_admin()) with check(public.is_hr_admin());

create policy "hr admins access employee documents" on storage.objects for all to authenticated
using(bucket_id='hr-documents' and public.is_hr_admin())
with check(bucket_id='hr-documents' and public.is_hr_admin());

revoke all on function public.is_hr_admin() from public,anon;
grant execute on function public.is_hr_admin() to authenticated,service_role;
revoke all on function public.assert_hr_admin(uuid) from public,anon,authenticated;
revoke all on function public.hr_upsert_employee(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,date,uuid,uuid,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.hr_archive_employee(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.hr_record_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.hr_review_attendance_correction(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.hr_review_leave(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assert_hr_admin(uuid),public.hr_upsert_employee(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,date,uuid,uuid,numeric,text,text,text),public.hr_archive_employee(uuid,uuid,boolean),public.hr_record_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,text),public.hr_review_attendance_correction(uuid,uuid,text,text),public.hr_review_leave(uuid,uuid,text,text) to service_role;

grant select on public.hr_teams,public.hr_designations,public.hr_employee_profiles,public.hr_leave_types,
  public.hr_leave_balances,public.hr_attendance_correction_requests,public.hr_payroll_records,
  public.hr_payroll_components,public.hr_performance_reviews,public.hr_performance_goals,
  public.hr_employee_documents,public.hr_attendance_devices,public.hr_device_employee_mappings,
  public.hr_attendance_events,public.hr_settings to authenticated,service_role;
grant all on public.hr_teams,public.hr_designations,public.hr_employee_profiles,public.hr_leave_types,
  public.hr_leave_balances,public.hr_attendance_correction_requests,public.hr_payroll_records,
  public.hr_payroll_components,public.hr_performance_reviews,public.hr_performance_goals,
  public.hr_employee_documents,public.hr_attendance_devices,public.hr_device_employee_mappings,
  public.hr_attendance_events,public.hr_settings to service_role;
