-- SEN Work Scheduler V1: isolated operational assignments only.
insert into public.app_modules(key,name,description,icon_key,sort_order,is_active,is_implemented)
values ('work_scheduler','Work Scheduler','Employee work and duty assignments.','calendar',175,true,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,icon_key=excluded.icon_key,sort_order=excluded.sort_order,is_active=true,is_implemented=true;

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order,is_active)
select id,'work_scheduler.manage','Manage Work Scheduler','Create schedules, view assignments and reassign occurrences.','manage',true,10,true
from public.app_modules where key='work_scheduler'
on conflict (key) do update set module_id=excluded.module_id,name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=true,is_active=true;

create table if not exists public.work_scheduler_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 4000),
  work_type text not null default 'GENERAL' check (work_type in ('GENERAL','CUSTOMER_FOLLOW_UP','PRODUCT_DELIVERY','PROJECT_SITE_VISIT','OTHER')),
  customer_label text check (length(customer_label) <= 200),
  product_label text check (length(product_label) <= 200),
  site_label text check (length(site_label) <= 200),
  reference_label text check (length(reference_label) <= 200),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_scheduler_schedules (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_scheduler_items(id) on delete cascade,
  schedule_type text not null check (schedule_type in ('ONE_TIME','DAILY','WEEKLY','SELECTED_WEEKDAYS')),
  start_date date not null,
  end_date date not null,
  weekdays smallint[] not null default '{}',
  timezone text not null default 'Asia/Dhaka',
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (schedule_type <> 'ONE_TIME' or end_date = start_date),
  check (schedule_type <> 'SELECTED_WEEKDAYS' or cardinality(weekdays) > 0),
  check (schedule_type = 'SELECTED_WEEKDAYS' or cardinality(weekdays) = 0),
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists public.work_scheduler_rotation_members (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.work_scheduler_schedules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  position smallint not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (schedule_id, position),
  unique (schedule_id, profile_id)
);

create table if not exists public.work_scheduler_assignments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_scheduler_items(id) on delete restrict,
  schedule_id uuid not null references public.work_scheduler_schedules(id) on delete restrict,
  occurrence_date date not null,
  scheduled_profile_id uuid not null references public.profiles(id) on delete restrict,
  effective_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','UNABLE_TO_COMPLETE')),
  report_note text check (length(report_note) <= 2000),
  reported_at timestamptz,
  reassigned_by uuid references public.profiles(id) on delete restrict,
  reassignment_note text check (length(reassignment_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, occurrence_date)
);

create index if not exists work_scheduler_assignments_employee_date_idx on public.work_scheduler_assignments(effective_profile_id, occurrence_date, status);
create index if not exists work_scheduler_assignments_date_idx on public.work_scheduler_assignments(occurrence_date, status);
create index if not exists work_scheduler_schedules_active_idx on public.work_scheduler_schedules(is_active, start_date, end_date);
create index if not exists work_scheduler_rotation_schedule_idx on public.work_scheduler_rotation_members(schedule_id, position);
create index if not exists work_scheduler_items_active_idx on public.work_scheduler_items(is_active, created_at desc);
create index if not exists work_scheduler_items_title_idx on public.work_scheduler_items using gin(to_tsvector('simple', title));

alter table public.work_scheduler_items enable row level security;
alter table public.work_scheduler_schedules enable row level security;
alter table public.work_scheduler_rotation_members enable row level security;
alter table public.work_scheduler_assignments enable row level security;

drop policy if exists "work scheduler admin items" on public.work_scheduler_items;
create policy "work scheduler admin items" on public.work_scheduler_items for all to authenticated using (public.current_user_has_permission('work_scheduler.manage')) with check (public.current_user_has_permission('work_scheduler.manage'));
drop policy if exists "work scheduler admin schedules" on public.work_scheduler_schedules;
create policy "work scheduler admin schedules" on public.work_scheduler_schedules for all to authenticated using (public.current_user_has_permission('work_scheduler.manage')) with check (public.current_user_has_permission('work_scheduler.manage'));
drop policy if exists "work scheduler admin rotation" on public.work_scheduler_rotation_members;
create policy "work scheduler admin rotation" on public.work_scheduler_rotation_members for all to authenticated using (public.current_user_has_permission('work_scheduler.manage')) with check (public.current_user_has_permission('work_scheduler.manage'));
drop policy if exists "work scheduler assignment read" on public.work_scheduler_assignments;
create policy "work scheduler assignment read" on public.work_scheduler_assignments for select to authenticated using (effective_profile_id = auth.uid() or public.current_user_has_permission('work_scheduler.manage'));
drop policy if exists "work scheduler assignment report" on public.work_scheduler_assignments;
create policy "work scheduler assignment report" on public.work_scheduler_assignments for update to authenticated using (effective_profile_id = auth.uid() and status = 'PENDING') with check (effective_profile_id = auth.uid() and status in ('COMPLETED','UNABLE_TO_COMPLETE'));

grant select,insert,update on public.work_scheduler_items to authenticated;
grant select,insert,update on public.work_scheduler_schedules to authenticated;
grant select,insert,update,delete on public.work_scheduler_rotation_members to authenticated;
grant select,update on public.work_scheduler_assignments to authenticated;
grant all on public.work_scheduler_items,public.work_scheduler_schedules,public.work_scheduler_rotation_members,public.work_scheduler_assignments to service_role;

notify pgrst, 'reload schema';
