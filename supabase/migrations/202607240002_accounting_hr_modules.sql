-- Accounting and HR foundations integrated with the SEN platform.
create sequence if not exists public.journal_entry_number_seq start 1;
create sequence if not exists public.employee_number_seq start 1;

create table public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-Z.-]{2,20}$'),
  name text not null check (char_length(name) between 2 and 160),
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  parent_id uuid references public.accounting_accounts(id) on delete restrict,
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null unique,
  entry_date date not null default current_date,
  description text not null check (char_length(description) between 2 and 500),
  reference_type text check (reference_type in ('manual','sale','purchase','payment','payroll','adjustment')),
  reference_id uuid,
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  posted_by uuid references public.profiles(id) on delete restrict,
  posted_at timestamptz,
  reversal_of uuid references public.journal_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  description text,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index accounting_accounts_parent_idx on public.accounting_accounts(parent_id);
create index journal_entries_date_idx on public.journal_entries(entry_date desc);
create index journal_entries_reference_idx on public.journal_entries(reference_type,reference_id);
create index journal_lines_entry_idx on public.journal_lines(journal_entry_id);
create index journal_lines_account_idx on public.journal_lines(account_id);

create table public.hr_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null unique check (char_length(name) between 2 and 120),
  manager_profile_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_employee_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  employee_number text not null unique,
  department_id uuid references public.hr_departments(id) on delete set null,
  job_title text not null check (char_length(job_title) between 2 and 120),
  employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','intern')),
  employment_status text not null default 'active' check (employment_status in ('active','probation','on_leave','terminated')),
  hire_date date not null,
  termination_date date,
  work_location_id uuid references public.work_locations(id) on delete set null,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  base_salary numeric(18,2) check (base_salary is null or base_salary >= 0),
  salary_currency text not null default 'BDT' check (salary_currency ~ '^[A-Z]{3}$'),
  emergency_contact_name text,
  emergency_contact_phone text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (termination_date is null or termination_date >= hire_date)
);

create table public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  leave_type text not null check (leave_type in ('annual','sick','unpaid','parental','other')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.hr_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present','absent','remote','leave','holiday')),
  notes text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_record_id,work_date),
  check (check_out is null or check_in is null or check_out >= check_in)
);

create index hr_employee_department_idx on public.hr_employee_records(department_id);
create index hr_leave_employee_dates_idx on public.hr_leave_requests(employee_record_id,start_date,end_date);
create index hr_attendance_date_idx on public.hr_attendance(work_date desc);

insert into public.accounting_accounts(code,name,account_type,currency)
values
 ('1000','Cash and bank','asset','BDT'),
 ('1100','Accounts receivable','asset','BDT'),
 ('1200','Inventory','asset','BDT'),
 ('2000','Accounts payable','liability','BDT'),
 ('3000','Owner equity','equity','BDT'),
 ('4000','Sales revenue','revenue','BDT'),
 ('5000','Cost of goods sold','expense','BDT'),
 ('6000','Operating expenses','expense','BDT'),
 ('6100','Payroll expense','expense','BDT')
on conflict(code) do nothing;

create or replace function public.next_journal_entry_number() returns text
language sql security definer set search_path=public
as $$ select 'JE-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.journal_entry_number_seq')::text,6,'0') $$;

create or replace function public.next_employee_number() returns text
language sql security definer set search_path=public
as $$ select 'SEN-'||lpad(nextval('public.employee_number_seq')::text,6,'0') $$;

create or replace function public.create_journal_entry(actor_profile_id uuid,requested_date date,requested_description text,requested_reference_type text,requested_reference_id uuid,requested_currency text,requested_lines jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare entry_id uuid:=gen_random_uuid(); actor_role public.account_role; debit_total numeric; credit_total numeric; item jsonb;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  select role into actor_role from public.profiles where id=actor_profile_id and status='active';
  if jsonb_typeof(requested_lines)<>'array' or jsonb_array_length(requested_lines)<2 then raise exception 'At least two journal lines are required'; end if;
  select coalesce(sum((value->>'debit')::numeric),0),coalesce(sum((value->>'credit')::numeric),0)
    into debit_total,credit_total from jsonb_array_elements(requested_lines);
  if debit_total<=0 or debit_total<>credit_total then raise exception 'Journal debits and credits must be equal and greater than zero'; end if;
  insert into public.journal_entries(id,entry_number,entry_date,description,reference_type,reference_id,currency,created_by)
  values(entry_id,public.next_journal_entry_number(),coalesce(requested_date,current_date),left(trim(requested_description),500),coalesce(requested_reference_type,'manual'),requested_reference_id,upper(coalesce(requested_currency,'BDT')),actor_profile_id);
  for item in select value from jsonb_array_elements(requested_lines) loop
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values(entry_id,(item->>'account_id')::uuid,nullif(left(trim(item->>'description'),500),''),coalesce((item->>'debit')::numeric,0),coalesce((item->>'credit')::numeric,0));
  end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.journal_created','accounting','journal_entry',entry_id::text,'Draft journal entry created.',jsonb_build_object('debit',debit_total,'credit',credit_total));
  return entry_id;
end $$;

create or replace function public.post_journal_entry(actor_profile_id uuid,requested_entry_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare entry_row public.journal_entries%rowtype; actor_role public.account_role; debit_total numeric; credit_total numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.approve_entry');
  select * into entry_row from public.journal_entries where id=requested_entry_id for update;
  if entry_row.id is null or entry_row.status<>'draft' then raise exception 'Only a draft journal can be posted'; end if;
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into debit_total,credit_total from public.journal_lines where journal_entry_id=requested_entry_id;
  if debit_total<=0 or debit_total<>credit_total then raise exception 'Journal is not balanced'; end if;
  update public.journal_entries set status='posted',posted_by=actor_profile_id,posted_at=now(),updated_at=now() where id=requested_entry_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.journal_posted','accounting','journal_entry',requested_entry_id::text,'Journal entry posted.',jsonb_build_object('total',debit_total));
end $$;

create or replace function public.create_hr_employee(actor_profile_id uuid,requested_profile_id uuid,requested_department_id uuid,requested_job_title text,requested_employment_type text,requested_hire_date date,requested_work_location_id uuid,requested_manager_profile_id uuid,requested_base_salary numeric,requested_currency text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare record_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'hr.manage_employees');
  if not exists(select 1 from public.profiles where id=requested_profile_id and role in('employee','admin') and status='active') then raise exception 'An active staff profile is required'; end if;
  insert into public.hr_employee_records(id,profile_id,employee_number,department_id,job_title,employment_type,hire_date,work_location_id,manager_profile_id,base_salary,salary_currency,created_by,updated_by)
  values(record_id,requested_profile_id,public.next_employee_number(),requested_department_id,left(trim(requested_job_title),120),requested_employment_type,requested_hire_date,requested_work_location_id,requested_manager_profile_id,requested_base_salary,upper(coalesce(requested_currency,'BDT')),actor_profile_id,actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,requested_profile_id,'hr.employee_created','hr','employee_record',record_id::text,'HR employee record created.',jsonb_build_object('profile_id',requested_profile_id,'job_title',requested_job_title));
  return record_id;
end $$;

create or replace function public.review_leave_request(actor_profile_id uuid,requested_leave_id uuid,requested_decision text,requested_note text)
returns void language plpgsql security definer set search_path=public
as $$
declare leave_row public.hr_leave_requests%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'hr.manage_leave');
  if requested_decision not in('approved','rejected') then raise exception 'Invalid leave decision'; end if;
  select * into leave_row from public.hr_leave_requests where id=requested_leave_id for update;
  if leave_row.id is null or leave_row.status<>'pending' then raise exception 'Only pending leave can be reviewed'; end if;
  update public.hr_leave_requests set status=requested_decision,reviewed_by=actor_profile_id,reviewed_at=now(),review_note=nullif(left(trim(requested_note),1000),''),updated_at=now() where id=requested_leave_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'hr.leave_'||requested_decision,'hr','leave_request',requested_leave_id::text,'Leave request reviewed.',jsonb_build_object('decision',requested_decision));
end $$;

do $$ declare table_name text; begin foreach table_name in array array[
 'accounting_accounts','journal_entries','journal_lines','hr_departments','hr_employee_records','hr_leave_requests','hr_attendance'
] loop execute format('alter table public.%I enable row level security',table_name); end loop; end $$;

create policy "accounting staff read accounts" on public.accounting_accounts for select to authenticated using(public.current_user_has_permission('accounting.view'));
create policy "accounting staff read journals" on public.journal_entries for select to authenticated using(public.current_user_has_permission('accounting.view'));
create policy "accounting staff read lines" on public.journal_lines for select to authenticated using(public.current_user_has_permission('accounting.view'));
create policy "hr staff read departments" on public.hr_departments for select to authenticated using(public.current_user_has_permission('hr.view'));
create policy "hr staff read employees" on public.hr_employee_records for select to authenticated using(public.current_user_has_permission('hr.view') or profile_id=auth.uid());
create policy "hr staff or owner read leave" on public.hr_leave_requests for select to authenticated using(public.current_user_has_permission('hr.view') or exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));
create policy "hr staff or owner read attendance" on public.hr_attendance for select to authenticated using(public.current_user_has_permission('hr.view') or exists(select 1 from public.hr_employee_records e where e.id=employee_record_id and e.profile_id=auth.uid()));

update public.app_modules set is_implemented=true where key in('accounting','hr');

revoke all on function public.create_journal_entry(uuid,date,text,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.post_journal_entry(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_hr_employee(uuid,uuid,uuid,text,text,date,uuid,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.review_leave_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_journal_entry(uuid,date,text,text,uuid,text,jsonb),public.post_journal_entry(uuid,uuid),public.create_hr_employee(uuid,uuid,uuid,text,text,date,uuid,uuid,numeric,text),public.review_leave_request(uuid,uuid,text,text) to service_role;
grant select on public.accounting_accounts,public.journal_entries,public.journal_lines,public.hr_departments,public.hr_employee_records,public.hr_leave_requests,public.hr_attendance to authenticated,service_role;
grant all on public.accounting_accounts,public.journal_entries,public.journal_lines,public.hr_departments,public.hr_employee_records,public.hr_leave_requests,public.hr_attendance to service_role;
