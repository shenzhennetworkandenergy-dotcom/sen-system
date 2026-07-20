-- Phase 3B: granular employee permissions and activity auditing.
-- Additive only. Apply after 202607170001_phase_3a_auth_foundation.sql.

do $$ begin
  create type public.permission_effect as enum ('allow', 'deny');
exception when duplicate_object then null;
end $$;

create table if not exists public.app_modules (
  id uuid primary key default gen_random_uuid(),
  key text unique not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  icon_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_implemented boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.app_modules(id) on delete restrict,
  key text unique not null check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  action text not null,
  is_sensitive boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_default boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists permission_templates_one_active_default_idx
  on public.permission_templates (is_default) where is_default and is_active;

create table if not exists public.permission_template_items (
  template_id uuid not null references public.permission_templates(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, permission_id)
);

create table if not exists public.profile_permission_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.permission_templates(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true
);

create unique index if not exists profile_permission_templates_one_active_idx
  on public.profile_permission_templates (profile_id) where is_active;

create table if not exists public.profile_permission_overrides (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect public.permission_effect not null,
  reason text,
  assigned_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

alter table public.audit_logs add column if not exists actor_role public.account_role;
alter table public.audit_logs add column if not exists module text;
alter table public.audit_logs add column if not exists entity_type text;
alter table public.audit_logs add column if not exists entity_id text;
alter table public.audit_logs add column if not exists description text;
alter table public.audit_logs add column if not exists old_values jsonb;
alter table public.audit_logs add column if not exists new_values jsonb;

create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_module_idx on public.audit_logs(module);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists profile_permission_overrides_profile_idx on public.profile_permission_overrides(profile_id) where is_active;
create index if not exists permission_template_items_permission_idx on public.permission_template_items(permission_id);

insert into public.app_modules (key, name, description, icon_key, sort_order, is_implemented) values
  ('dashboard','Dashboard','Employee workspace overview.','dashboard',10,true),
  ('users','Users and Accounts','Account administration.','users',20,true),
  ('employees','Employees','Employee profiles and access.','employees',30,true),
  ('activity','Activity and Audit','Safe account activity timelines.','activity',40,true),
  ('crm','CRM','Future customer relationship management.','crm',50,false),
  ('products','Products','Future product catalogue administration.','products',60,false),
  ('inventory','Inventory','Future inventory operations.','inventory',70,false),
  ('warehouses','Warehouses','Future warehouse operations.','warehouses',80,false),
  ('serials','Serial Tracking','Future serial-number tracking.','serials',90,false),
  ('shipments','Shipments and Logistics','Future logistics operations.','shipments',100,false),
  ('sales','Sales','Future sales operations.','sales',110,false),
  ('quotations','Quotations','Future quotation operations.','quotations',120,false),
  ('purchasing','Purchasing','Future purchasing operations.','purchasing',130,false),
  ('suppliers','Suppliers','Future supplier management.','suppliers',140,false),
  ('accounting','Accounting','Future accounting operations.','accounting',150,false),
  ('hr','HR','Future human-resources operations.','hr',160,false),
  ('manufacturing','Manufacturing','Future manufacturing operations.','manufacturing',170,false),
  ('projects','Projects','Future project operations.','projects',180,false),
  ('support','Support','Future support operations.','support',190,false),
  ('reports','Reports','Future reporting.','reports',200,false),
  ('ai','AI Assistant','Future assisted workflows.','ai',210,false),
  ('settings','Settings','Future system configuration.','settings',220,false)
on conflict (key) do update set name=excluded.name, description=excluded.description, icon_key=excluded.icon_key, sort_order=excluded.sort_order, is_implemented=excluded.is_implemented;

with catalogue(module_key, permission_key, name, action, sensitive, position) as (values
('dashboard','dashboard.view','View dashboard','view',false,10),
('users','users.view','View users','view',true,10),('users','users.view_detail','View user details','view_detail',true,20),('users','users.change_role','Change account roles','change_role',true,30),('users','users.change_status','Change account status','change_status',true,40),('users','users.manage_permissions','Manage user permissions','manage_permissions',true,50),('users','users.view_activity','View user activity','view_activity',true,60),
('employees','employees.view','View employees','view',false,10),('employees','employees.view_detail','View employee details','view_detail',false,20),('employees','employees.edit_profile','Edit employee profiles','edit_profile',true,30),('employees','employees.view_permissions','View employee permissions','view_permissions',true,40),('employees','employees.manage_permissions','Manage employee permissions','manage_permissions',true,50),('employees','employees.view_activity','View employee activity','view_activity',true,60),
('activity','activity.view_own','View own activity','view_own',false,10),('activity','activity.view_team','View team activity','view_team',true,20),('activity','activity.view_all','View all activity','view_all',true,30),('activity','activity.export','Export activity','export',true,40),
('crm','crm.view','View CRM','view',false,10),('crm','crm.create','Create CRM records','create',false,20),('crm','crm.edit','Edit CRM records','edit',false,30),('crm','crm.delete','Delete CRM records','delete',true,40),('crm','crm.export','Export CRM records','export',true,50),
('products','products.view','View products','view',false,10),('products','products.create','Create products','create',false,20),('products','products.edit','Edit products','edit',false,30),('products','products.archive','Archive products','archive',true,40),('products','products.import','Import products','import',true,50),('products','products.export','Export products','export',true,60),
('inventory','inventory.view','View inventory','view',false,10),('inventory','inventory.receive','Receive inventory','receive',false,20),('inventory','inventory.adjust_stock','Adjust stock','adjust_stock',true,30),('inventory','inventory.transfer','Transfer inventory','transfer',true,40),('inventory','inventory.count','Count inventory','count',false,50),('inventory','inventory.export','Export inventory','export',true,60),
('warehouses','warehouses.view','View warehouses','view',false,10),('warehouses','warehouses.create','Create warehouses','create',true,20),('warehouses','warehouses.edit','Edit warehouses','edit',true,30),('warehouses','warehouses.manage_locations','Manage locations','manage_locations',true,40),
('serials','serials.view','View serials','view',false,10),('serials','serials.assign','Assign serials','assign',true,20),('serials','serials.receive','Receive serials','receive',false,30),('serials','serials.trace','Trace serials','trace',false,40),('serials','serials.correct','Correct serials','correct',true,50),
('shipments','shipments.view','View shipments','view',false,10),('shipments','shipments.create','Create shipments','create',false,20),('shipments','shipments.edit','Edit shipments','edit',false,30),('shipments','shipments.update_status','Update shipment status','update_status',true,40),('shipments','shipments.confirm_china_dispatch','Confirm China dispatch','confirm_china_dispatch',true,50),('shipments','shipments.confirm_bangladesh_receipt','Confirm Bangladesh receipt','confirm_bangladesh_receipt',true,60),('shipments','shipments.export','Export shipments','export',true,70),
('sales','sales.view','View sales','view',false,10),('sales','sales.create','Create sales','create',false,20),('sales','sales.edit','Edit sales','edit',false,30),('sales','sales.approve','Approve sales','approve',true,40),('sales','sales.cancel','Cancel sales','cancel',true,50),('sales','sales.export','Export sales','export',true,60),
('quotations','quotations.view','View quotations','view',false,10),('quotations','quotations.create','Create quotations','create',false,20),('quotations','quotations.edit','Edit quotations','edit',false,30),('quotations','quotations.approve','Approve quotations','approve',true,40),('quotations','quotations.send','Send quotations','send',true,50),('quotations','quotations.export','Export quotations','export',true,60),
('purchasing','purchasing.view','View purchasing','view',false,10),('purchasing','purchasing.create','Create purchases','create',false,20),('purchasing','purchasing.edit','Edit purchases','edit',false,30),('purchasing','purchasing.approve','Approve purchases','approve',true,40),('purchasing','purchasing.receive','Receive purchases','receive',true,50),('purchasing','purchasing.cancel','Cancel purchases','cancel',true,60),('purchasing','purchasing.export','Export purchasing','export',true,70),
('suppliers','suppliers.view','View suppliers','view',false,10),('suppliers','suppliers.create','Create suppliers','create',false,20),('suppliers','suppliers.edit','Edit suppliers','edit',false,30),('suppliers','suppliers.archive','Archive suppliers','archive',true,40),
('accounting','accounting.view','View accounting','view',true,10),('accounting','accounting.create_entry','Create accounting entries','create_entry',true,20),('accounting','accounting.edit_entry','Edit accounting entries','edit_entry',true,30),('accounting','accounting.approve_entry','Approve accounting entries','approve_entry',true,40),('accounting','accounting.export','Export accounting','export',true,50),
('hr','hr.view','View HR','view',true,10),('hr','hr.manage_employees','Manage employees','manage_employees',true,20),('hr','hr.view_attendance','View attendance','view_attendance',true,30),('hr','hr.manage_attendance','Manage attendance','manage_attendance',true,40),('hr','hr.view_leave','View leave','view_leave',true,50),('hr','hr.manage_leave','Manage leave','manage_leave',true,60),('hr','hr.view_payroll','View payroll','view_payroll',true,70),('hr','hr.manage_payroll','Manage payroll','manage_payroll',true,80),
('manufacturing','manufacturing.view','View manufacturing','view',false,10),('manufacturing','manufacturing.create','Create manufacturing orders','create',false,20),('manufacturing','manufacturing.edit','Edit manufacturing orders','edit',false,30),('manufacturing','manufacturing.approve','Approve manufacturing orders','approve',true,40),
('projects','projects.view','View projects','view',false,10),('projects','projects.create','Create projects','create',false,20),('projects','projects.edit','Edit projects','edit',false,30),('projects','projects.assign','Assign projects','assign',true,40),('projects','projects.close','Close projects','close',true,50),
('support','support.view','View support','view',false,10),('support','support.create','Create support records','create',false,20),('support','support.assign','Assign support records','assign',true,30),('support','support.update','Update support records','update',false,40),('support','support.close','Close support records','close',true,50),
('reports','reports.view','View reports','view',true,10),('reports','reports.export','Export reports','export',true,20),
('ai','ai.use','Use AI assistant','use',true,10),
('settings','settings.view','View settings','view',true,10),('settings','settings.manage_company','Manage company settings','manage_company',true,20),('settings','settings.manage_integrations','Manage integrations','manage_integrations',true,30),('settings','settings.manage_security','Manage security settings','manage_security',true,40)
)
insert into public.permissions (module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,c.permission_key,c.name,c.name,c.action,c.sensitive,c.position from catalogue c join public.app_modules m on m.key=c.module_key
on conflict (key) do update set module_id=excluded.module_id,name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order;

insert into public.permission_templates (key,name,description,is_default,is_system,is_active)
values ('standard_employee','Standard Employee','Conservative baseline access for every active employee.',true,true,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,is_default=true,is_system=true,is_active=true;

insert into public.permission_template_items(template_id,permission_id)
select t.id,p.id from public.permission_templates t cross join public.permissions p
where t.key='standard_employee' and p.key in ('dashboard.view','activity.view_own')
on conflict do nothing;

create or replace function public.is_current_user_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active');
$$;

create or replace function public.effective_permissions_for_profile(requested_profile_id uuid)
returns table(permission_key text) language sql stable security definer set search_path = '' as $$
  with target as (select role,status from public.profiles where id=requested_profile_id and (auth.uid()=requested_profile_id or public.is_current_user_admin() or auth.role()='service_role'))
  select p.key from public.permissions p,target t where t.status='active' and t.role='admin' and p.is_active
  union
  select p.key
  from public.permissions p
  cross join target t
  left join public.profile_permission_overrides o on o.profile_id=requested_profile_id and o.permission_id=p.id and o.is_active
  where t.status='active' and t.role='employee' and p.is_active and o.effect is distinct from 'deny'::public.permission_effect
    and (o.effect='allow'::public.permission_effect or (o.effect is null and exists(
      select 1 from public.profile_permission_templates a
      join public.permission_templates pt on pt.id=a.template_id and pt.is_active
      join public.permission_template_items i on i.template_id=pt.id and i.permission_id=p.id
      where a.profile_id=requested_profile_id and a.is_active
    )));
$$;

create or replace function public.current_user_has_permission(requested_permission_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.effective_permissions_for_profile(auth.uid()) where permission_key=requested_permission_key);
$$;

revoke all on function public.effective_permissions_for_profile(uuid) from public,anon;
grant execute on function public.effective_permissions_for_profile(uuid) to authenticated,service_role;
revoke all on function public.current_user_has_permission(text) from public,anon;
grant execute on function public.current_user_has_permission(text) to authenticated,service_role;
revoke all on function public.is_current_user_admin() from public,anon;
grant execute on function public.is_current_user_admin() to authenticated,service_role;

create or replace function public.protect_profile_access_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Role and status may only be changed through authorized account administration';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_access_fields on public.profiles;
create trigger protect_profile_access_fields before update on public.profiles for each row execute function public.protect_profile_access_fields();

create or replace function public.admin_update_profile_access(
  actor_profile_id uuid,
  target_profile_id uuid,
  requested_role text,
  requested_status text,
  requested_template_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_record public.profiles%rowtype;
  target_record public.profiles%rowtype;
  selected_template_id uuid;
  active_admin_count integer;
begin
  select * into actor_record from public.profiles where id=actor_profile_id for update;
  select * into target_record from public.profiles where id=target_profile_id for update;
  if actor_record.id is null or actor_record.role <> 'admin' or actor_record.status <> 'active' then raise exception 'Active administrator required'; end if;
  if target_record.id is null then raise exception 'Target profile not found'; end if;
  if requested_role not in ('customer','employee','admin') or requested_status not in ('active','suspended','disabled') then raise exception 'Invalid role or status'; end if;
  if actor_profile_id=target_profile_id and (requested_role<>target_record.role::text or requested_status<>target_record.status::text) then raise exception 'Administrators cannot change their own role or status'; end if;
  if target_record.role='admin' and target_record.status='active' and (requested_role<>'admin' or requested_status<>'active') then
    select count(*) into active_admin_count from public.profiles where role='admin' and status='active';
    if active_admin_count<=1 then raise exception 'Cannot remove or suspend the final active admin'; end if;
  end if;
  if requested_role='employee' then
    select id into selected_template_id from public.permission_templates
      where id=coalesce(requested_template_id,(select id from public.permission_templates where is_default and is_active limit 1)) and is_active;
    if selected_template_id is null then raise exception 'An active employee permission template is required'; end if;
    update public.profile_permission_templates set is_active=false where profile_id=target_profile_id and is_active;
    insert into public.profile_permission_templates(profile_id,template_id,assigned_by,is_active)
      values(target_profile_id,selected_template_id,actor_profile_id,true);
  else
    update public.profile_permission_templates set is_active=false where profile_id=target_profile_id and is_active;
    update public.profile_permission_overrides set is_active=false,updated_at=now() where profile_id=target_profile_id and is_active;
  end if;
  update public.profiles set role=requested_role::public.account_role,status=requested_status::public.account_status,updated_at=now() where id=target_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_record.role,target_profile_id,'account.access_changed','users','profile',target_profile_id::text,'Account role or status changed.',
    jsonb_build_object('role',target_record.role,'status',target_record.status),jsonb_build_object('role',requested_role,'status',requested_status,'template_id',selected_template_id));
end;
$$;

create or replace function public.admin_set_profile_permissions(
  actor_profile_id uuid,
  target_profile_id uuid,
  requested_template_id uuid,
  allowed_permission_keys text[] default '{}',
  denied_permission_keys text[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare actor_record public.profiles%rowtype; target_record public.profiles%rowtype; valid_count integer; requested_count integer;
begin
  select * into actor_record from public.profiles where id=actor_profile_id;
  select * into target_record from public.profiles where id=target_profile_id for update;
  if actor_record.id is null or actor_record.role<>'admin' or actor_record.status<>'active' then raise exception 'Active administrator required'; end if;
  if actor_profile_id=target_profile_id then raise exception 'Administrators cannot edit their own permissions'; end if;
  if target_record.id is null or target_record.role<>'employee' then raise exception 'Permissions can only be assigned to employees'; end if;
  if not exists(select 1 from public.permission_templates where id=requested_template_id and is_active) then raise exception 'Active template required'; end if;
  if allowed_permission_keys && denied_permission_keys then raise exception 'A permission cannot be both allowed and denied'; end if;
  requested_count:=coalesce(array_length(allowed_permission_keys,1),0)+coalesce(array_length(denied_permission_keys,1),0);
  select count(*) into valid_count from public.permissions where is_active and key=any(allowed_permission_keys||denied_permission_keys);
  if valid_count<>requested_count then raise exception 'One or more permission keys are invalid or duplicated'; end if;
  update public.profile_permission_templates set is_active=false where profile_id=target_profile_id and is_active;
  insert into public.profile_permission_templates(profile_id,template_id,assigned_by,is_active) values(target_profile_id,requested_template_id,actor_profile_id,true);
  update public.profile_permission_overrides set is_active=false,updated_at=now() where profile_id=target_profile_id and is_active;
  insert into public.profile_permission_overrides(profile_id,permission_id,effect,assigned_by,is_active)
    select target_profile_id,id,'allow'::public.permission_effect,actor_profile_id,true from public.permissions where key=any(allowed_permission_keys)
    on conflict(profile_id,permission_id) do update set effect='allow',assigned_by=excluded.assigned_by,is_active=true,updated_at=now();
  insert into public.profile_permission_overrides(profile_id,permission_id,effect,assigned_by,is_active)
    select target_profile_id,id,'deny'::public.permission_effect,actor_profile_id,true from public.permissions where key=any(denied_permission_keys)
    on conflict(profile_id,permission_id) do update set effect='deny',assigned_by=excluded.assigned_by,is_active=true,updated_at=now();
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_record.role,target_profile_id,'permissions.overrides_updated','permissions','profile',target_profile_id::text,'Employee permission template and overrides updated.',
      jsonb_build_object('template_id',requested_template_id,'allowed',allowed_permission_keys,'denied',denied_permission_keys));
end;
$$;

revoke all on function public.admin_update_profile_access(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_profile_access(uuid,uuid,text,text,uuid) to service_role;
revoke all on function public.admin_set_profile_permissions(uuid,uuid,uuid,text[],text[]) from public,anon,authenticated;
grant execute on function public.admin_set_profile_permissions(uuid,uuid,uuid,text[],text[]) to service_role;

alter table public.app_modules enable row level security;
alter table public.permissions enable row level security;
alter table public.permission_templates enable row level security;
alter table public.permission_template_items enable row level security;
alter table public.profile_permission_templates enable row level security;
alter table public.profile_permission_overrides enable row level security;

create policy "staff read modules" on public.app_modules for select to authenticated using (public.is_current_user_admin() or public.current_user_has_permission('dashboard.view'));
create policy "staff read permissions" on public.permissions for select to authenticated using (public.is_current_user_admin() or public.current_user_has_permission('dashboard.view'));
create policy "staff read templates" on public.permission_templates for select to authenticated using (public.is_current_user_admin() or public.current_user_has_permission('dashboard.view'));
create policy "staff read template items" on public.permission_template_items for select to authenticated using (public.is_current_user_admin() or public.current_user_has_permission('dashboard.view'));
create policy "admin or owner read template assignment" on public.profile_permission_templates for select to authenticated using (public.is_current_user_admin() or profile_id=auth.uid());
create policy "admin or owner read permission overrides" on public.profile_permission_overrides for select to authenticated using (public.is_current_user_admin() or profile_id=auth.uid());
create policy "employee read own audit" on public.audit_logs for select to authenticated using (actor_id=auth.uid() and public.current_user_has_permission('activity.view_own'));

comment on function public.effective_permissions_for_profile(uuid) is 'Inactive denied; active admin all; employee deny override, allow override, template, then denied.';
