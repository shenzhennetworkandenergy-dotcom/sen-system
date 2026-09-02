-- Add an immutable, permission-protected review state to finalized Cash Book days.

alter table public.cashbook_days
  add column if not exists audit_status text not null default 'OPEN',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_comment text,
  add column if not exists correction_reason text,
  add column if not exists correction_requested_at timestamptz,
  add column if not exists correction_requested_by uuid references public.profiles(id) on delete set null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='cashbook_days_audit_status_check'
      and conrelid='public.cashbook_days'::regclass
  ) then
    alter table public.cashbook_days
      add constraint cashbook_days_audit_status_check
      check (audit_status in ('OPEN','PENDING_AUDIT','CORRECTION_REQUIRED','APPROVED'));
  end if;
end $$;

-- Existing finalized days have not been reviewed by this workflow; do not invent approval.
update public.cashbook_days
set audit_status='PENDING_AUDIT'
where is_closed=true and coalesce(audit_status,'OPEN')='OPEN';

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select module.id,
  'accounting.audit_cashbook',
  'Audit cashbook days',
  'Review finalized Cash Book days and approve or request correction.',
  'audit_cashbook',
  true,
  60
from public.app_modules module
where module.key='accounting'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

create or replace function public.close_cashbook_day(
  actor_profile_id uuid,
  requested_business_date date
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  day_row public.cashbook_days%rowtype;
  income_total numeric(18,2);
  expense_total numeric(18,2);
  final_balance numeric(18,2);
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;

  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(requested_business_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(requested_business_date,public.cashbook_opening_balance_for(requested_business_date),actor_profile_id)
  on conflict(business_date) do nothing;

  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.is_closed then
    raise exception 'This cashbook day is already closed';
  end if;

  select
    coalesce(sum(amount) filter(where transaction_type='income'),0),
    coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into income_total,expense_total
  from public.cashbook_entries
  where business_date=requested_business_date;

  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days
  set is_closed=true,closing_balance=final_balance,closed_at=now(),
      closed_by=actor_profile_id,audit_status='PENDING_AUDIT',
      reviewed_at=null,reviewed_by=null,review_comment=null,
      correction_reason=null,correction_requested_at=null,correction_requested_by=null,
      updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,actor_role,'accounting.cashbook_day_closed','accounting','cashbook_day',
    requested_business_date::text,'Cashbook day closed.',
    jsonb_build_object('opening_balance',day_row.opening_balance,'income',income_total,
      'expense',expense_total,'closing_balance',final_balance)
  );
  return final_balance;
end $$;

create or replace function public.approve_cashbook_audit(
  actor_profile_id uuid,
  requested_business_date date,
  requested_comment text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  day_row public.cashbook_days%rowtype;
  actor_role public.account_role;
  normalized_comment text:=nullif(trim(coalesce(requested_comment,'')),'');
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;
  if char_length(coalesce(normalized_comment,''))>1000 then
    raise exception 'Review comment cannot exceed 1000 characters';
  end if;
  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.business_date is null or not day_row.is_closed then
    raise exception 'Only closed cashbook days can be audited';
  end if;
  if day_row.audit_status is distinct from 'PENDING_AUDIT' then
    raise exception 'Only cashbook days pending audit can be approved';
  end if;

  update public.cashbook_days
  set audit_status='APPROVED',reviewed_at=now(),reviewed_by=actor_profile_id,
      review_comment=normalized_comment,correction_reason=null,
      correction_requested_at=null,correction_requested_by=null,
      updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date
    and is_closed=true and audit_status='PENDING_AUDIT';
  if not found then
    raise exception 'Only cashbook days pending audit can be approved';
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_audit_approved','accounting','cashbook_day',
    requested_business_date::text,'Cashbook day audit approved.',
    jsonb_build_object('audit_status',day_row.audit_status),
    jsonb_build_object('audit_status','APPROVED','review_comment',normalized_comment));
end $$;

create or replace function public.request_cashbook_correction(
  actor_profile_id uuid,
  requested_business_date date,
  requested_reason text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  day_row public.cashbook_days%rowtype;
  actor_role public.account_role;
  normalized_reason text:=nullif(trim(coalesce(requested_reason,'')),'');
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;
  if normalized_reason is null or char_length(normalized_reason)=0 then
    raise exception 'A correction reason is required';
  end if;
  if char_length(normalized_reason)>1000 then
    raise exception 'Correction reason cannot exceed 1000 characters';
  end if;

  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.business_date is null or not day_row.is_closed then
    raise exception 'Only closed cashbook days can be returned for correction';
  end if;
  if day_row.audit_status is distinct from 'PENDING_AUDIT' then
    raise exception 'Only cashbook days pending audit can require correction';
  end if;

  update public.cashbook_days
  set audit_status='CORRECTION_REQUIRED',correction_reason=normalized_reason,
      correction_requested_at=now(),correction_requested_by=actor_profile_id,
      reviewed_at=now(),reviewed_by=actor_profile_id,review_comment=normalized_reason,
      updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date
    and is_closed=true and audit_status='PENDING_AUDIT';
  if not found then
    raise exception 'Only cashbook days pending audit can require correction';
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_correction_requested','accounting','cashbook_day',
    requested_business_date::text,'Cashbook correction requested.',
    jsonb_build_object('audit_status',day_row.audit_status),
    jsonb_build_object('audit_status','CORRECTION_REQUIRED','correction_reason',normalized_reason));
end $$;

revoke all on function public.approve_cashbook_audit(uuid,date,text) from public,anon,authenticated;
revoke all on function public.request_cashbook_correction(uuid,date,text) from public,anon,authenticated;
grant execute on function public.approve_cashbook_audit(uuid,date,text) to service_role;
grant execute on function public.request_cashbook_correction(uuid,date,text) to service_role;

notify pgrst, 'reload schema';
