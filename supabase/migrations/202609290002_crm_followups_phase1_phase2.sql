-- CRM customer follow-up management, phases 1 and 2.
-- Additive only: existing CRM companies, contacts, leads and activities remain authoritative.

alter table public.crm_leads
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists do_not_contact_reason text,
  add column if not exists do_not_contact_at timestamptz,
  add column if not exists do_not_contact_by uuid references public.profiles(id) on delete set null;

alter table public.crm_activities
  drop constraint if exists crm_activities_activity_type_check;
alter table public.crm_activities
  add constraint crm_activities_activity_type_check check (
    activity_type in ('note','call','email','meeting','follow_up','whatsapp','customer_reply','quotation_discussion','other','rescheduled','completed','cancelled')
  ),
  add column if not exists communication_channel text check (communication_channel is null or communication_channel in ('whatsapp','phone','email','messenger','wechat','other')),
  add column if not exists direction text check (direction is null or direction in ('inbound','outbound','internal')),
  add column if not exists outcome text,
  add column if not exists customer_response text,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists next_instruction text,
  add column if not exists previous_due_at timestamptz;

create table public.crm_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  status text not null default 'active' check (status in ('active','waiting_customer','completed','cancelled','do_not_contact')),
  reason text not null check (reason in ('price_follow_up','quotation_follow_up','purchase_decision','product_availability','technical_clarification','payment_discussion','sample_follow_up','general_follow_up','customer_callback','other')),
  reason_details text,
  instruction text not null check (char_length(trim(instruction)) between 2 and 2000),
  interest_summary text,
  conversation_summary text,
  preferred_channel text not null check (preferred_channel in ('whatsapp','phone','email','messenger','wechat','other')),
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  manual_review boolean not null default false,
  completed_at timestamptz,
  cancelled_at timestamptz,
  completion_outcome text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('active','waiting_customer') or next_follow_up_at is not null),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

alter table public.crm_activities
  add column if not exists followup_id uuid references public.crm_followups(id) on delete set null;

create unique index crm_followups_one_open_per_lead_idx
  on public.crm_followups(lead_id) where status in ('active','waiting_customer');
create index crm_followups_queue_idx on public.crm_followups(status,next_follow_up_at,priority);
create index crm_followups_assignee_queue_idx on public.crm_followups(assigned_to,status,next_follow_up_at);
create index crm_followups_lead_history_idx on public.crm_followups(lead_id,created_at desc);
create index crm_activities_followup_idx on public.crm_activities(followup_id,created_at desc);

create trigger crm_followups_touch_updated_at before update on public.crm_followups
for each row execute function public.crm_touch_updated_at();

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.position
from public.app_modules m
cross join (values
  ('crm.followups_view','View CRM follow-ups','View assigned CRM follow-up queues and history.','followups_view',false,60),
  ('crm.followups_create','Create CRM follow-ups','Schedule follow-ups for accessible CRM leads.','followups_create',false,70),
  ('crm.followups_edit','Edit CRM follow-ups','Edit and reschedule accessible follow-ups.','followups_edit',false,80),
  ('crm.followups_complete','Complete CRM follow-ups','Record outcomes and complete accessible follow-ups.','followups_complete',false,90),
  ('crm.followups_assign','Assign CRM follow-ups','Assign follow-ups to another active staff member.','followups_assign',true,100),
  ('crm.followups_view_all','View all CRM follow-ups','View follow-ups regardless of ownership.','followups_view_all',true,110)
) as v(key,name,description,action,sensitive,position)
where m.key='crm'
on conflict(key) do update set name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order,is_active=true;

create or replace function public.crm_followup_actor_can_access(
  requested_actor_id uuid,
  requested_assigned_to uuid,
  requested_created_by uuid,
  requested_permission text
) returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=requested_actor_id and p.status='active' and (
      p.role='admin' or (
        p.role='employee'
        and exists(select 1 from public.effective_permissions_for_profile(requested_actor_id) where permission_key=requested_permission)
        and (
          requested_assigned_to=requested_actor_id
          or requested_created_by=requested_actor_id
          or exists(select 1 from public.effective_permissions_for_profile(requested_actor_id) where permission_key='crm.followups_view_all')
        )
      )
    )
  );
$$;

create or replace function public.create_crm_followup(
  actor_profile_id uuid,
  requested_lead_id uuid,
  requested_reason text,
  requested_reason_details text,
  requested_instruction text,
  requested_interest_summary text,
  requested_conversation_summary text,
  requested_channel text,
  requested_assigned_to uuid,
  requested_priority text,
  requested_last_contact_at timestamptz,
  requested_next_follow_up_at timestamptz,
  requested_status text,
  requested_manual_review boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  followup_id uuid:=gen_random_uuid(); lead_row public.crm_leads%rowtype; actor_role public.account_role; resolved_assignee uuid;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.followups_create');
  select * into lead_row from public.crm_leads where id=requested_lead_id for update;
  if lead_row.id is null then raise exception 'CRM lead not found'; end if;
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin')
    and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='crm.followups_view_all')
    and actor_profile_id is distinct from lead_row.assigned_to
    and actor_profile_id is distinct from lead_row.created_by
  then raise exception 'Follow-up access is limited to assigned CRM leads'; end if;
  if lead_row.do_not_contact then raise exception 'Do not contact is enabled for this lead'; end if;
  if requested_reason not in ('price_follow_up','quotation_follow_up','purchase_decision','product_availability','technical_clarification','payment_discussion','sample_follow_up','general_follow_up','customer_callback','other') then raise exception 'Invalid follow-up reason'; end if;
  if requested_channel not in ('whatsapp','phone','email','messenger','wechat','other') then raise exception 'Invalid communication channel'; end if;
  if requested_priority not in ('low','normal','high','urgent') then raise exception 'Invalid follow-up priority'; end if;
  if requested_status not in ('active','waiting_customer') then raise exception 'Invalid active follow-up status'; end if;
  if requested_next_follow_up_at is null then raise exception 'Next follow-up date is required'; end if;
  if char_length(trim(coalesce(requested_instruction,'')))<2 then raise exception 'Follow-up instruction is required'; end if;
  resolved_assignee:=coalesce(requested_assigned_to,lead_row.assigned_to,actor_profile_id);
  if not exists(select 1 from public.profiles where id=resolved_assignee and role in('admin','employee') and status='active') then raise exception 'Follow-up assignee must be active staff'; end if;
  if resolved_assignee<>actor_profile_id and not exists(select 1 from public.profiles where id=actor_profile_id and role='admin') and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='crm.followups_assign') then raise exception 'Follow-up assignment permission is required'; end if;
  if exists(select 1 from public.crm_followups where lead_id=requested_lead_id and status in ('active','waiting_customer')) then raise exception 'This lead already has an active follow-up'; end if;

  insert into public.crm_followups(id,lead_id,company_id,contact_id,status,reason,reason_details,instruction,interest_summary,conversation_summary,preferred_channel,assigned_to,priority,last_contact_at,next_follow_up_at,manual_review,created_by,updated_by)
  values(followup_id,lead_row.id,lead_row.company_id,lead_row.contact_id,requested_status,requested_reason,nullif(left(trim(coalesce(requested_reason_details,'')),500),''),left(trim(requested_instruction),2000),nullif(left(trim(coalesce(requested_interest_summary,'')),1000),''),nullif(left(trim(coalesce(requested_conversation_summary,'')),2000),''),requested_channel,resolved_assignee,requested_priority,requested_last_contact_at,requested_next_follow_up_at,coalesce(requested_manual_review,false),actor_profile_id,actor_profile_id);

  insert into public.crm_activities(lead_id,company_id,contact_id,followup_id,activity_type,subject,details,due_at,next_follow_up_at,next_instruction,communication_channel,direction,actor_profile_id)
  values(lead_row.id,lead_row.company_id,lead_row.contact_id,followup_id,'follow_up','Follow-up scheduled',nullif(left(trim(coalesce(requested_conversation_summary,'')),3000),''),requested_next_follow_up_at,requested_next_follow_up_at,left(trim(requested_instruction),2000),requested_channel,'internal',actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,resolved_assignee,'crm.followup_created','crm','crm_followup',followup_id::text,'CRM follow-up created.',jsonb_build_object('lead_id',lead_row.id,'assigned_to',resolved_assignee,'next_follow_up_at',requested_next_follow_up_at));
  return followup_id;
end $$;

create or replace function public.update_crm_followup(
  actor_profile_id uuid,
  requested_followup_id uuid,
  requested_reason text,
  requested_reason_details text,
  requested_instruction text,
  requested_interest_summary text,
  requested_conversation_summary text,
  requested_channel text,
  requested_assigned_to uuid,
  requested_priority text,
  requested_status text,
  requested_manual_review boolean
) returns void language plpgsql security definer set search_path='' as $$
declare row_record public.crm_followups%rowtype; actor_role public.account_role; resolved_assignee uuid;
begin
  select * into row_record from public.crm_followups where id=requested_followup_id for update;
  if row_record.id is null then raise exception 'CRM follow-up not found'; end if;
  if not public.crm_followup_actor_can_access(actor_profile_id,row_record.assigned_to,row_record.created_by,'crm.followups_edit') then raise exception 'Follow-up edit permission denied'; end if;
  if row_record.status not in ('active','waiting_customer') then raise exception 'Only an active follow-up can be edited'; end if;
  if exists(select 1 from public.crm_leads where id=row_record.lead_id and do_not_contact) then raise exception 'Do not contact is enabled for this lead'; end if;
  if requested_reason not in ('price_follow_up','quotation_follow_up','purchase_decision','product_availability','technical_clarification','payment_discussion','sample_follow_up','general_follow_up','customer_callback','other') then raise exception 'Invalid follow-up reason'; end if;
  if requested_channel not in ('whatsapp','phone','email','messenger','wechat','other') then raise exception 'Invalid communication channel'; end if;
  if requested_priority not in ('low','normal','high','urgent') then raise exception 'Invalid follow-up priority'; end if;
  if requested_status not in ('active','waiting_customer') then raise exception 'Invalid active follow-up status'; end if;
  if char_length(trim(coalesce(requested_instruction,'')))<2 then raise exception 'Follow-up instruction is required'; end if;
  resolved_assignee:=coalesce(requested_assigned_to,row_record.assigned_to,actor_profile_id);
  if not exists(select 1 from public.profiles where id=resolved_assignee and role in('admin','employee') and status='active') then raise exception 'Follow-up assignee must be active staff'; end if;
  if resolved_assignee is distinct from row_record.assigned_to and not exists(select 1 from public.profiles where id=actor_profile_id and role='admin') and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='crm.followups_assign') then raise exception 'Follow-up assignment permission is required'; end if;
  update public.crm_followups set reason=requested_reason,reason_details=nullif(left(trim(coalesce(requested_reason_details,'')),500),''),instruction=left(trim(requested_instruction),2000),interest_summary=nullif(left(trim(coalesce(requested_interest_summary,'')),1000),''),conversation_summary=nullif(left(trim(coalesce(requested_conversation_summary,'')),2000),''),preferred_channel=requested_channel,assigned_to=resolved_assignee,priority=requested_priority,status=requested_status,manual_review=coalesce(requested_manual_review,false),updated_by=actor_profile_id where id=requested_followup_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,resolved_assignee,'crm.followup_updated','crm','crm_followup',requested_followup_id::text,'CRM follow-up updated.',jsonb_build_object('assigned_to',row_record.assigned_to,'status',row_record.status),jsonb_build_object('assigned_to',resolved_assignee,'status',requested_status));
end $$;

create or replace function public.reschedule_crm_followup(
  actor_profile_id uuid,
  requested_followup_id uuid,
  requested_next_follow_up_at timestamptz,
  requested_reason text,
  requested_instruction text
) returns void language plpgsql security definer set search_path='' as $$
declare row_record public.crm_followups%rowtype; actor_role public.account_role;
begin
  select * into row_record from public.crm_followups where id=requested_followup_id for update;
  if row_record.id is null then raise exception 'CRM follow-up not found'; end if;
  if not public.crm_followup_actor_can_access(actor_profile_id,row_record.assigned_to,row_record.created_by,'crm.followups_edit') then raise exception 'Follow-up reschedule permission denied'; end if;
  if row_record.status not in ('active','waiting_customer') then raise exception 'Only an active follow-up can be rescheduled'; end if;
  if exists(select 1 from public.crm_leads where id=row_record.lead_id and do_not_contact) then raise exception 'Do not contact is enabled for this lead'; end if;
  if requested_next_follow_up_at is null then raise exception 'New follow-up date is required'; end if;
  if char_length(trim(coalesce(requested_reason,'')))<2 then raise exception 'Reschedule reason is required'; end if;
  if char_length(trim(coalesce(requested_instruction,'')))<2 then raise exception 'Follow-up instruction is required'; end if;
  update public.crm_followups set next_follow_up_at=requested_next_follow_up_at,instruction=left(trim(requested_instruction),2000),updated_by=actor_profile_id where id=requested_followup_id;
  insert into public.crm_activities(lead_id,company_id,contact_id,followup_id,activity_type,subject,details,due_at,previous_due_at,next_follow_up_at,next_instruction,communication_channel,direction,actor_profile_id)
  values(row_record.lead_id,row_record.company_id,row_record.contact_id,row_record.id,'rescheduled','Follow-up rescheduled',left(trim(requested_reason),2000),requested_next_follow_up_at,row_record.next_follow_up_at,requested_next_follow_up_at,left(trim(requested_instruction),2000),row_record.preferred_channel,'internal',actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,row_record.assigned_to,'crm.followup_rescheduled','crm','crm_followup',row_record.id::text,'CRM follow-up rescheduled.',jsonb_build_object('next_follow_up_at',row_record.next_follow_up_at),jsonb_build_object('next_follow_up_at',requested_next_follow_up_at,'reason',requested_reason));
end $$;

create or replace function public.complete_crm_followup(
  actor_profile_id uuid,
  requested_followup_id uuid,
  requested_outcome text,
  requested_summary text,
  requested_channel text,
  requested_customer_response text,
  requested_schedule_next boolean,
  requested_next_follow_up_at timestamptz,
  requested_next_reason text,
  requested_next_instruction text,
  requested_next_priority text
) returns uuid language plpgsql security definer set search_path='' as $$
declare row_record public.crm_followups%rowtype; actor_role public.account_role; next_id uuid;
begin
  select * into row_record from public.crm_followups where id=requested_followup_id for update;
  if row_record.id is null then raise exception 'CRM follow-up not found'; end if;
  if not public.crm_followup_actor_can_access(actor_profile_id,row_record.assigned_to,row_record.created_by,'crm.followups_complete') then raise exception 'Follow-up completion permission denied'; end if;
  if row_record.status not in ('active','waiting_customer') then raise exception 'Only an active follow-up can be completed'; end if;
  if char_length(trim(coalesce(requested_outcome,'')))<2 then raise exception 'Follow-up outcome is required'; end if;
  if char_length(trim(coalesce(requested_summary,'')))<2 then raise exception 'Follow-up summary is required'; end if;
  if requested_channel not in ('whatsapp','phone','email','messenger','wechat','other') then raise exception 'Invalid communication channel'; end if;
  if coalesce(requested_schedule_next,false) and (requested_next_follow_up_at is null or char_length(trim(coalesce(requested_next_instruction,'')))<2) then raise exception 'Next follow-up date and instruction are required'; end if;
  if coalesce(requested_schedule_next,false) and requested_next_reason not in ('price_follow_up','quotation_follow_up','purchase_decision','product_availability','technical_clarification','payment_discussion','sample_follow_up','general_follow_up','customer_callback','other') then raise exception 'Invalid next follow-up reason'; end if;
  if coalesce(requested_schedule_next,false) and requested_next_priority not in ('low','normal','high','urgent') then raise exception 'Invalid next follow-up priority'; end if;
  update public.crm_followups set status='completed',completed_at=now(),last_contact_at=now(),completion_outcome=left(trim(requested_outcome),1000),conversation_summary=left(trim(requested_summary),2000),updated_by=actor_profile_id where id=row_record.id;
  insert into public.crm_activities(lead_id,company_id,contact_id,followup_id,activity_type,subject,details,completed_at,communication_channel,direction,outcome,customer_response,next_follow_up_at,next_instruction,actor_profile_id)
  values(row_record.lead_id,row_record.company_id,row_record.contact_id,row_record.id,'completed','Follow-up completed',left(trim(requested_summary),3000),now(),requested_channel,'outbound',left(trim(requested_outcome),1000),nullif(left(trim(coalesce(requested_customer_response,'')),2000),''),case when requested_schedule_next then requested_next_follow_up_at end,case when requested_schedule_next then left(trim(requested_next_instruction),2000) end,actor_profile_id);
  if coalesce(requested_schedule_next,false) then
    next_id:=gen_random_uuid();
    insert into public.crm_followups(id,lead_id,company_id,contact_id,status,reason,instruction,interest_summary,conversation_summary,preferred_channel,assigned_to,priority,last_contact_at,next_follow_up_at,created_by,updated_by)
    values(next_id,row_record.lead_id,row_record.company_id,row_record.contact_id,'active',requested_next_reason,left(trim(requested_next_instruction),2000),row_record.interest_summary,left(trim(requested_summary),2000),requested_channel,row_record.assigned_to,requested_next_priority,now(),requested_next_follow_up_at,actor_profile_id,actor_profile_id);
  end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,row_record.assigned_to,'crm.followup_completed','crm','crm_followup',row_record.id::text,'CRM follow-up completed.',jsonb_build_object('outcome',requested_outcome,'next_followup_id',next_id));
  return next_id;
end $$;

create or replace function public.cancel_crm_followup(
  actor_profile_id uuid,
  requested_followup_id uuid,
  requested_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare row_record public.crm_followups%rowtype; actor_role public.account_role;
begin
  select * into row_record from public.crm_followups where id=requested_followup_id for update;
  if row_record.id is null then raise exception 'CRM follow-up not found'; end if;
  if not public.crm_followup_actor_can_access(actor_profile_id,row_record.assigned_to,row_record.created_by,'crm.followups_edit') then raise exception 'Follow-up cancellation permission denied'; end if;
  if row_record.status not in ('active','waiting_customer') then raise exception 'Only an active follow-up can be cancelled'; end if;
  if char_length(trim(coalesce(requested_reason,'')))<2 then raise exception 'Cancellation reason is required'; end if;
  update public.crm_followups set status='cancelled',cancelled_at=now(),updated_by=actor_profile_id where id=row_record.id;
  insert into public.crm_activities(lead_id,company_id,contact_id,followup_id,activity_type,subject,details,completed_at,communication_channel,direction,actor_profile_id)
  values(row_record.lead_id,row_record.company_id,row_record.contact_id,row_record.id,'cancelled','Follow-up cancelled',left(trim(requested_reason),2000),now(),row_record.preferred_channel,'internal',actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,row_record.assigned_to,'crm.followup_cancelled','crm','crm_followup',row_record.id::text,'CRM follow-up cancelled.',jsonb_build_object('reason',requested_reason));
end $$;

create or replace function public.record_crm_followup_activity(
  actor_profile_id uuid,
  requested_followup_id uuid,
  requested_activity_type text,
  requested_channel text,
  requested_direction text,
  requested_summary text,
  requested_outcome text,
  requested_customer_response text
) returns uuid language plpgsql security definer set search_path='' as $$
declare row_record public.crm_followups%rowtype; activity_id uuid:=gen_random_uuid(); actor_role public.account_role;
begin
  select * into row_record from public.crm_followups where id=requested_followup_id;
  if row_record.id is null then raise exception 'CRM follow-up not found'; end if;
  if not public.crm_followup_actor_can_access(actor_profile_id,row_record.assigned_to,row_record.created_by,'crm.followups_edit') then raise exception 'Follow-up activity permission denied'; end if;
  if requested_activity_type not in ('note','call','email','meeting','follow_up','whatsapp','customer_reply','quotation_discussion','other') then raise exception 'Invalid activity type'; end if;
  if requested_channel not in ('whatsapp','phone','email','messenger','wechat','other') then raise exception 'Invalid communication channel'; end if;
  if requested_direction not in ('inbound','outbound','internal') then raise exception 'Invalid activity direction'; end if;
  if char_length(trim(coalesce(requested_summary,'')))<2 then raise exception 'Activity summary is required'; end if;
  insert into public.crm_activities(id,lead_id,company_id,contact_id,followup_id,activity_type,subject,details,completed_at,communication_channel,direction,outcome,customer_response,actor_profile_id)
  values(activity_id,row_record.lead_id,row_record.company_id,row_record.contact_id,row_record.id,requested_activity_type,left(trim(requested_summary),200),left(trim(requested_summary),3000),now(),requested_channel,requested_direction,nullif(left(trim(coalesce(requested_outcome,'')),1000),''),nullif(left(trim(coalesce(requested_customer_response,'')),2000),''),actor_profile_id);
  update public.crm_followups set last_contact_at=case when requested_direction in ('inbound','outbound') then now() else last_contact_at end,conversation_summary=left(trim(requested_summary),2000),updated_by=actor_profile_id where id=row_record.id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,row_record.assigned_to,'crm.followup_activity_recorded','crm','crm_activity',activity_id::text,'CRM follow-up activity recorded.',jsonb_build_object('followup_id',row_record.id,'type',requested_activity_type));
  return activity_id;
end $$;

create or replace function public.set_crm_lead_do_not_contact(
  actor_profile_id uuid,
  requested_lead_id uuid,
  requested_enabled boolean,
  requested_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare lead_row public.crm_leads%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'crm.followups_edit');
  select * into lead_row from public.crm_leads where id=requested_lead_id for update;
  if lead_row.id is null then raise exception 'CRM lead not found'; end if;
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin')
    and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='crm.followups_view_all')
    and actor_profile_id is distinct from lead_row.assigned_to
    and actor_profile_id is distinct from lead_row.created_by
  then raise exception 'Follow-up access is limited to assigned CRM leads'; end if;
  if coalesce(requested_enabled,false) and char_length(trim(coalesce(requested_reason,'')))<2 then raise exception 'Do not contact reason is required'; end if;
  update public.crm_leads set do_not_contact=coalesce(requested_enabled,false),do_not_contact_reason=case when requested_enabled then left(trim(requested_reason),1000) end,do_not_contact_at=case when requested_enabled then now() end,do_not_contact_by=case when requested_enabled then actor_profile_id end,updated_by=actor_profile_id where id=requested_lead_id;
  if requested_enabled then
    update public.crm_followups set status='do_not_contact',updated_by=actor_profile_id where lead_id=requested_lead_id and status in ('active','waiting_customer');
  end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,lead_row.assigned_to,'crm.do_not_contact_changed','crm','crm_lead',lead_row.id::text,'CRM contact restriction changed.',jsonb_build_object('enabled',lead_row.do_not_contact,'reason',lead_row.do_not_contact_reason),jsonb_build_object('enabled',requested_enabled,'reason',requested_reason));
end $$;

alter table public.crm_followups enable row level security;
create policy "authorized staff read CRM followups" on public.crm_followups for select to authenticated
using (
  public.is_current_user_admin()
  or (
    public.current_user_has_permission('crm.followups_view')
    and (assigned_to=auth.uid() or created_by=auth.uid() or public.current_user_has_permission('crm.followups_view_all'))
  )
);

revoke all on function public.crm_followup_actor_can_access(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.create_crm_followup(uuid,uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,text,boolean) from public,anon,authenticated;
revoke all on function public.update_crm_followup(uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.reschedule_crm_followup(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.complete_crm_followup(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text) from public,anon,authenticated;
revoke all on function public.cancel_crm_followup(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.record_crm_followup_activity(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.set_crm_lead_do_not_contact(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.crm_followup_actor_can_access(uuid,uuid,uuid,text) to service_role;
grant execute on function public.create_crm_followup(uuid,uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,text,boolean) to service_role;
grant execute on function public.update_crm_followup(uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean) to service_role;
grant execute on function public.reschedule_crm_followup(uuid,uuid,timestamptz,text,text) to service_role;
grant execute on function public.complete_crm_followup(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text) to service_role;
grant execute on function public.cancel_crm_followup(uuid,uuid,text) to service_role;
grant execute on function public.record_crm_followup_activity(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.set_crm_lead_do_not_contact(uuid,uuid,boolean,text) to service_role;
grant select on public.crm_followups to authenticated,service_role;
grant all on public.crm_followups to service_role;

comment on table public.crm_followups is 'Permanent operational CRM follow-up state. Detailed chronological interactions remain in crm_activities.';
comment on column public.crm_followups.status is 'Workflow state. Due, overdue and upcoming are derived from next_follow_up_at in Asia/Dhaka to prevent stale status data.';
