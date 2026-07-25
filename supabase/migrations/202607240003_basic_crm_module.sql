-- Basic CRM integrated with existing profiles, permissions and audit history.

create sequence public.crm_lead_number_seq start 1;

create table public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 180),
  legal_name text,
  customer_profile_id uuid unique references public.profiles(id) on delete set null,
  industry text,
  website_url text,
  email text,
  phone text,
  country_code text,
  country_name text,
  address text,
  status text not null default 'active' check (status in ('active','inactive','prospect')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.crm_companies(id) on delete set null,
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 160),
  job_title text,
  email text,
  phone text,
  preferred_contact_method text not null default 'email'
    check (preferred_contact_method in ('email','phone','whatsapp','other')),
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null or profile_id is not null)
);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  lead_number text not null unique,
  title text not null check (char_length(title) between 2 and 200),
  company_id uuid references public.crm_companies(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  description text,
  source text not null default 'other'
    check (source in ('website','referral','phone','email','social','event','existing_customer','other')),
  status text not null default 'new'
    check (status in ('new','contacted','qualified','proposal','won','lost')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  estimated_value numeric(18,2) not null default 0 check (estimated_value >= 0),
  currency char(3) not null default 'BDT',
  expected_close_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  activity_type text not null
    check (activity_type in ('note','call','email','meeting','follow_up')),
  subject text not null check (char_length(subject) between 2 and 200),
  details text,
  due_at timestamptz,
  completed_at timestamptz,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (lead_id is not null or company_id is not null or contact_id is not null)
);

create index crm_companies_status_name_idx on public.crm_companies(status,name);
create index crm_contacts_company_idx on public.crm_contacts(company_id,full_name);
create index crm_leads_status_created_idx on public.crm_leads(status,created_at desc);
create index crm_leads_assigned_idx on public.crm_leads(assigned_to,status);
create index crm_activities_lead_idx on public.crm_activities(lead_id,created_at desc);
create index crm_activities_company_idx on public.crm_activities(company_id,created_at desc);

create or replace function public.crm_touch_updated_at() returns trigger
language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end $$;

create trigger crm_companies_touch_updated_at before update on public.crm_companies
for each row execute function public.crm_touch_updated_at();
create trigger crm_contacts_touch_updated_at before update on public.crm_contacts
for each row execute function public.crm_touch_updated_at();
create trigger crm_leads_touch_updated_at before update on public.crm_leads
for each row execute function public.crm_touch_updated_at();

create or replace function public.next_crm_lead_number() returns text
language sql volatile security definer set search_path='' as $$
  select 'LEAD-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.crm_lead_number_seq')::text,5,'0');
$$;

create or replace function public.create_crm_company(
  actor_profile_id uuid,
  requested_name text,
  requested_legal_name text,
  requested_customer_profile_id uuid,
  requested_industry text,
  requested_website_url text,
  requested_email text,
  requested_phone text,
  requested_country_code text,
  requested_country_name text,
  requested_address text,
  requested_status text,
  requested_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
declare company_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_name,'')))<2 then raise exception 'Company name is required'; end if;
  if coalesce(requested_status,'active') not in('active','inactive','prospect') then raise exception 'Invalid company status'; end if;
  if requested_customer_profile_id is not null and not exists(
    select 1 from public.profiles where id=requested_customer_profile_id and role='customer'
  ) then raise exception 'Linked account must be a customer profile'; end if;
  insert into public.crm_companies(
    id,name,legal_name,customer_profile_id,industry,website_url,email,phone,country_code,country_name,
    address,status,notes,created_by,updated_by
  ) values (
    company_id,left(trim(requested_name),180),nullif(left(trim(requested_legal_name),180),''),
    requested_customer_profile_id,nullif(left(trim(requested_industry),120),''),
    nullif(left(trim(requested_website_url),300),''),nullif(left(trim(requested_email),200),''),
    nullif(left(trim(requested_phone),60),''),nullif(upper(left(trim(requested_country_code),2)),''),
    nullif(left(trim(requested_country_name),100),''),nullif(left(trim(requested_address),600),''),
    coalesce(requested_status,'active'),nullif(left(trim(requested_notes),2000),''),
    actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.company_created','crm','crm_company',company_id::text,
    'CRM company created.',jsonb_build_object('name',requested_name));
  return company_id;
end $$;

create or replace function public.create_crm_contact(
  actor_profile_id uuid,
  requested_company_id uuid,
  requested_profile_id uuid,
  requested_full_name text,
  requested_job_title text,
  requested_email text,
  requested_phone text,
  requested_preferred_method text,
  requested_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
declare contact_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_full_name,'')))<2 then raise exception 'Contact name is required'; end if;
  if requested_company_id is not null and not exists(select 1 from public.crm_companies where id=requested_company_id) then raise exception 'CRM company not found'; end if;
  if requested_profile_id is not null and not exists(select 1 from public.profiles where id=requested_profile_id) then raise exception 'Profile not found'; end if;
  if nullif(trim(coalesce(requested_email,'')),'') is null and nullif(trim(coalesce(requested_phone,'')),'') is null and requested_profile_id is null then
    raise exception 'Contact email, phone or linked profile is required';
  end if;
  if coalesce(requested_preferred_method,'email') not in('email','phone','whatsapp','other') then raise exception 'Invalid contact method'; end if;
  insert into public.crm_contacts(
    id,company_id,profile_id,full_name,job_title,email,phone,preferred_contact_method,notes,created_by,updated_by
  ) values (
    contact_id,requested_company_id,requested_profile_id,left(trim(requested_full_name),160),
    nullif(left(trim(requested_job_title),120),''),nullif(left(trim(requested_email),200),''),
    nullif(left(trim(requested_phone),60),''),coalesce(requested_preferred_method,'email'),
    nullif(left(trim(requested_notes),2000),''),actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.contact_created','crm','crm_contact',contact_id::text,
    'CRM contact created.',jsonb_build_object('name',requested_full_name,'company_id',requested_company_id));
  return contact_id;
end $$;

create or replace function public.create_crm_lead(
  actor_profile_id uuid,
  requested_title text,
  requested_company_id uuid,
  requested_contact_id uuid,
  requested_description text,
  requested_source text,
  requested_priority text,
  requested_estimated_value numeric,
  requested_currency text,
  requested_expected_close_date date,
  requested_assigned_to uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare lead_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.create');
  if char_length(trim(coalesce(requested_title,'')))<2 then raise exception 'Lead title is required'; end if;
  if requested_company_id is not null and not exists(select 1 from public.crm_companies where id=requested_company_id) then raise exception 'CRM company not found'; end if;
  if requested_contact_id is not null and not exists(select 1 from public.crm_contacts where id=requested_contact_id) then raise exception 'CRM contact not found'; end if;
  if requested_company_id is null and requested_contact_id is null then raise exception 'A company or contact is required'; end if;
  if coalesce(requested_source,'other') not in('website','referral','phone','email','social','event','existing_customer','other') then raise exception 'Invalid lead source'; end if;
  if coalesce(requested_priority,'medium') not in('low','medium','high','urgent') then raise exception 'Invalid lead priority'; end if;
  if coalesce(requested_estimated_value,0)<0 then raise exception 'Estimated value cannot be negative'; end if;
  if requested_assigned_to is not null and not exists(
    select 1 from public.profiles where id=requested_assigned_to and role in('employee','admin') and status='active'
  ) then raise exception 'Lead assignee must be an active staff profile'; end if;
  insert into public.crm_leads(
    id,lead_number,title,company_id,contact_id,description,source,priority,estimated_value,currency,
    expected_close_date,assigned_to,created_by,updated_by
  ) values (
    lead_id,public.next_crm_lead_number(),left(trim(requested_title),200),requested_company_id,requested_contact_id,
    nullif(left(trim(requested_description),3000),''),coalesce(requested_source,'other'),
    coalesce(requested_priority,'medium'),coalesce(requested_estimated_value,0),
    upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),requested_expected_close_date,
    requested_assigned_to,actor_profile_id,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,requested_assigned_to,'crm.lead_created','crm','crm_lead',lead_id::text,
    'CRM lead created.',jsonb_build_object('title',requested_title,'value',requested_estimated_value));
  return lead_id;
end $$;

create or replace function public.update_crm_lead_status(
  actor_profile_id uuid,
  requested_lead_id uuid,
  requested_status text,
  requested_lost_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare lead_row public.crm_leads%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.edit');
  if requested_status not in('new','contacted','qualified','proposal','won','lost') then raise exception 'Invalid lead status'; end if;
  select * into lead_row from public.crm_leads where id=requested_lead_id for update;
  if lead_row.id is null then raise exception 'CRM lead not found'; end if;
  if requested_status='lost' and nullif(trim(coalesce(requested_lost_reason,'')),'') is null then raise exception 'Lost reason is required'; end if;
  update public.crm_leads set
    status=requested_status,lost_reason=case when requested_status='lost' then left(trim(requested_lost_reason),1000) else null end,
    won_at=case when requested_status='won' then coalesce(won_at,now()) else null end,
    lost_at=case when requested_status='lost' then coalesce(lost_at,now()) else null end,
    updated_by=actor_profile_id
  where id=requested_lead_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,lead_row.assigned_to,'crm.lead_status_changed','crm','crm_lead',requested_lead_id::text,
    'CRM lead status changed.',jsonb_build_object('status',lead_row.status),jsonb_build_object('status',requested_status));
end $$;

create or replace function public.create_crm_activity(
  actor_profile_id uuid,
  requested_lead_id uuid,
  requested_company_id uuid,
  requested_contact_id uuid,
  requested_activity_type text,
  requested_subject text,
  requested_details text,
  requested_due_at timestamptz,
  requested_completed boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare activity_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.edit');
  if requested_lead_id is null and requested_company_id is null and requested_contact_id is null then raise exception 'Activity must belong to a CRM record'; end if;
  if requested_activity_type not in('note','call','email','meeting','follow_up') then raise exception 'Invalid activity type'; end if;
  if char_length(trim(coalesce(requested_subject,'')))<2 then raise exception 'Activity subject is required'; end if;
  insert into public.crm_activities(
    id,lead_id,company_id,contact_id,activity_type,subject,details,due_at,completed_at,actor_profile_id
  ) values (
    activity_id,requested_lead_id,requested_company_id,requested_contact_id,requested_activity_type,
    left(trim(requested_subject),200),nullif(left(trim(requested_details),3000),''),
    requested_due_at,case when requested_completed then now() else null end,actor_profile_id
  );
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'crm.activity_created','crm','crm_activity',activity_id::text,
    'CRM activity recorded.',jsonb_build_object('lead_id',requested_lead_id,'type',requested_activity_type));
  return activity_id;
end $$;

do $$ declare table_name text; begin
  foreach table_name in array array['crm_companies','crm_contacts','crm_leads','crm_activities']
  loop execute format('alter table public.%I enable row level security',table_name); end loop;
end $$;

create policy "authorized staff read CRM companies" on public.crm_companies for select to authenticated
using(public.current_user_has_permission('crm.view'));
create policy "authorized staff read CRM contacts" on public.crm_contacts for select to authenticated
using(public.current_user_has_permission('crm.view'));
create policy "authorized staff read CRM leads" on public.crm_leads for select to authenticated
using(public.current_user_has_permission('crm.view'));
create policy "authorized staff read CRM activities" on public.crm_activities for select to authenticated
using(public.current_user_has_permission('crm.view'));

update public.app_modules set is_implemented=true where key='crm';

revoke all on function public.next_crm_lead_number() from public,anon,authenticated;
revoke all on function public.create_crm_company(uuid,text,text,uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_crm_contact(uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.create_crm_lead(uuid,text,uuid,uuid,text,text,text,numeric,text,date,uuid) from public,anon,authenticated;
revoke all on function public.update_crm_lead_status(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.create_crm_activity(uuid,uuid,uuid,uuid,text,text,text,timestamptz,boolean) from public,anon,authenticated;

grant execute on function public.create_crm_company(uuid,text,text,uuid,text,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.create_crm_contact(uuid,uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.create_crm_lead(uuid,text,uuid,uuid,text,text,text,numeric,text,date,uuid) to service_role;
grant execute on function public.update_crm_lead_status(uuid,uuid,text,text) to service_role;
grant execute on function public.create_crm_activity(uuid,uuid,uuid,uuid,text,text,text,timestamptz,boolean) to service_role;

grant select on public.crm_companies,public.crm_contacts,public.crm_leads,public.crm_activities
to authenticated,service_role;
grant all on public.crm_companies,public.crm_contacts,public.crm_leads,public.crm_activities
to service_role;
grant usage,select on sequence public.crm_lead_number_seq to service_role;
