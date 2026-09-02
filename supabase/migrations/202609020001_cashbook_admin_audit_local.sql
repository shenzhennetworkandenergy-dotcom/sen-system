-- Local validation migration for closed Cashbook Admin audit/edit/approve.

alter table public.cashbook_days
  add column if not exists audit_status text not null default 'OPEN',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_comment text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='cashbook_days_audit_status_check' and conrelid='public.cashbook_days'::regclass) then
    alter table public.cashbook_days add constraint cashbook_days_audit_status_check
      check (audit_status in ('OPEN','PENDING_AUDIT','APPROVED'));
  end if;
end $$;

update public.cashbook_days set audit_status='PENDING_AUDIT'
where is_closed=true and audit_status='OPEN';

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select id,'accounting.audit_cashbook','Audit cashbook days',
  'Review, correct, and approve closed Cashbook days.','audit_cashbook',true,60
from public.app_modules where key='accounting'
on conflict(key) do update set name=excluded.name,description=excluded.description,
  action=excluded.action,is_sensitive=true,is_active=true,sort_order=excluded.sort_order;

create or replace function public.close_cashbook_day(actor_profile_id uuid,requested_business_date date)
returns numeric language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; income_total numeric(18,2); expense_total numeric(18,2);
  final_balance numeric(18,2); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then raise exception 'Business date is required'; end if;
  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(requested_business_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(requested_business_date,public.cashbook_opening_balance_for(requested_business_date),actor_profile_id)
  on conflict(business_date) do nothing;
  select * into day_row from public.cashbook_days where business_date=requested_business_date for update;
  if day_row.is_closed then raise exception 'This cashbook day is already closed'; end if;
  select coalesce(sum(amount) filter(where transaction_type='income'),0),
    coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into income_total,expense_total from public.cashbook_entries where business_date=requested_business_date;
  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days set is_closed=true,closing_balance=final_balance,closed_at=now(),
    closed_by=actor_profile_id,audit_status='PENDING_AUDIT',reviewed_at=null,reviewed_by=null,
    review_comment=null,updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_day_closed','accounting','cashbook_day',
    requested_business_date::text,'Cashbook day closed.',jsonb_build_object('closing_balance',final_balance,'audit_status','PENDING_AUDIT'));
  return final_balance;
end $$;

create or replace function public.edit_pending_cashbook_entry(
  actor_profile_id uuid, requested_entry_id uuid, requested_description_id uuid,
  requested_amount numeric, requested_payment_method text, requested_occurred_at timestamptz,
  requested_remark text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare entry_row public.cashbook_entries%rowtype; day_row public.cashbook_days%rowtype;
  description_row public.cashbook_descriptions%rowtype; journal_row public.journal_entries%rowtype;
  payment_account_id uuid; counter_account_id uuid; normalized_method text:=lower(trim(coalesce(requested_payment_method,'')));
  normalized_remark text:=trim(coalesce(requested_remark,'')); actor_role public.account_role;
  income_total numeric(18,2); expense_total numeric(18,2); final_balance numeric(18,2);
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  if requested_amount is null or requested_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if normalized_method not in ('cash','bank','mfs') then raise exception 'Payment method must be Cash, Bank, or MFS'; end if;
  if char_length(coalesce(normalized_remark,''))>240 then raise exception 'Remark cannot exceed 240 characters'; end if;
  perform public.lock_cashbook_timeline();
  select * into entry_row from public.cashbook_entries where id=requested_entry_id for update;
  if entry_row.id is null then raise exception 'Cashbook entry not found'; end if;
  if entry_row.sale_payment_id is not null then raise exception 'Automated Sales cashbook entries are not editable here'; end if;
  select * into day_row from public.cashbook_days where business_date=entry_row.business_date for update;
  if not day_row.is_closed or day_row.audit_status<>'PENDING_AUDIT' then raise exception 'Only a closed day pending audit can be edited'; end if;
  if requested_occurred_at is null or (requested_occurred_at at time zone 'Asia/Dhaka')::date<>entry_row.business_date then
    raise exception 'Transaction date must match the cashbook date';
  end if;
  select * into description_row from public.cashbook_descriptions where id=requested_description_id and is_active=true;
  if description_row.id is null then raise exception 'Select an active cashbook description'; end if;
  select * into journal_row from public.journal_entries where id=entry_row.journal_entry_id for update;
  if journal_row.id is null or journal_row.status<>'posted' or journal_row.reference_id is distinct from entry_row.id then
    raise exception 'The linked posted Journal is unavailable';
  end if;
  select id into payment_account_id from public.accounting_accounts where code=case normalized_method when 'cash' then '1010' when 'bank' then '1020' else '1030' end and currency='BDT' and is_active=true;
  select id into counter_account_id from public.accounting_accounts where code=case description_row.transaction_type when 'income' then '4000' else '6000' end and currency='BDT' and is_active=true;
  if payment_account_id is null or counter_account_id is null then raise exception 'Required accounting account is unavailable'; end if;
  update public.cashbook_entries set description_id=description_row.id,transaction_type=description_row.transaction_type,
    amount=round(requested_amount,2),payment_method=normalized_method,transaction_at=requested_occurred_at,
    remark=normalized_remark where id=entry_row.id;
  update public.journal_entries set entry_date=entry_row.business_date,description=description_row.name where id=journal_row.id;
  delete from public.journal_lines where journal_entry_id=journal_row.id;
  if description_row.transaction_type='income' then
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit) values
      (journal_row.id,payment_account_id,description_row.name,round(requested_amount,2),0),
      (journal_row.id,counter_account_id,description_row.name,0,round(requested_amount,2));
  else
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit) values
      (journal_row.id,counter_account_id,description_row.name,round(requested_amount,2),0),
      (journal_row.id,payment_account_id,description_row.name,0,round(requested_amount,2));
  end if;
  select coalesce(sum(amount) filter(where transaction_type='income'),0),coalesce(sum(amount) filter(where transaction_type='expense'),0)
    into income_total,expense_total from public.cashbook_entries where business_date=entry_row.business_date;
  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days set closing_balance=final_balance,updated_by=actor_profile_id,updated_at=now() where business_date=entry_row.business_date;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_audit_entry_edited','accounting','cashbook_entry',entry_row.id::text,
    'Pending Cashbook entry and linked Journal synchronized.',jsonb_build_object('amount',entry_row.amount,'journal_entry_id',journal_row.id),
    jsonb_build_object('amount',round(requested_amount,2),'journal_entry_id',journal_row.id));
  return journal_row.id;
end $$;

create or replace function public.add_pending_cashbook_entry(
  actor_profile_id uuid, requested_description_id uuid, requested_amount numeric,
  requested_payment_method text, requested_occurred_at timestamptz, requested_business_date date,
  requested_remark text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; created_id uuid; income_total numeric(18,2); expense_total numeric(18,2);
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  perform public.lock_cashbook_timeline();
  select * into day_row from public.cashbook_days where business_date=requested_business_date for update;
  if day_row.business_date is null or not day_row.is_closed or day_row.audit_status<>'PENDING_AUDIT' then
    raise exception 'Only a closed day pending audit can receive an audit entry';
  end if;
  update public.cashbook_days set is_closed=false,closing_balance=null,closed_at=null,closed_by=null
  where business_date=requested_business_date;
  created_id:=public.create_cashbook_entry(actor_profile_id,requested_description_id,requested_amount,
    requested_payment_method,requested_occurred_at,requested_business_date,coalesce(requested_remark,''));
  select coalesce(sum(amount) filter(where transaction_type='income'),0),coalesce(sum(amount) filter(where transaction_type='expense'),0)
    into income_total,expense_total from public.cashbook_entries where business_date=requested_business_date;
  update public.cashbook_days set is_closed=true,closing_balance=day_row.opening_balance+income_total-expense_total,
    closed_at=day_row.closed_at,closed_by=day_row.closed_by,audit_status='PENDING_AUDIT',updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;
  return created_id;
end $$;

create or replace function public.remove_pending_cashbook_entry(actor_profile_id uuid, requested_entry_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare entry_row public.cashbook_entries%rowtype; day_row public.cashbook_days%rowtype;
  journal_row public.journal_entries%rowtype; actor_role public.account_role;
  income_total numeric(18,2); expense_total numeric(18,2); final_balance numeric(18,2);
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  perform public.lock_cashbook_timeline();
  select * into entry_row from public.cashbook_entries where id=requested_entry_id for update;
  if entry_row.id is null then raise exception 'Cashbook entry not found'; end if;
  if entry_row.sale_payment_id is not null then raise exception 'Automated Sales cashbook entries cannot be removed here'; end if;
  select * into day_row from public.cashbook_days where business_date=entry_row.business_date for update;
  if not day_row.is_closed or day_row.audit_status<>'PENDING_AUDIT' then
    raise exception 'Only a closed day pending audit can be edited';
  end if;
  select * into journal_row from public.journal_entries where id=entry_row.journal_entry_id for update;
  if journal_row.id is null or journal_row.status<>'posted' or journal_row.reference_id is distinct from entry_row.id then
    raise exception 'The linked posted Journal is unavailable';
  end if;
  delete from public.cashbook_entries where id=entry_row.id;
  delete from public.journal_lines where journal_entry_id=journal_row.id;
  delete from public.journal_entries where id=journal_row.id;
  select coalesce(sum(amount) filter(where transaction_type='income'),0),coalesce(sum(amount) filter(where transaction_type='expense'),0)
    into income_total,expense_total from public.cashbook_entries where business_date=entry_row.business_date;
  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days set closing_balance=final_balance,updated_by=actor_profile_id,updated_at=now()
  where business_date=entry_row.business_date;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_audit_entry_removed','accounting','cashbook_entry',entry_row.id::text,
    'Pending Cashbook entry and its linked Journal removed.',jsonb_build_object('amount',entry_row.amount,'journal_entry_id',journal_row.id));
end $$;

create or replace function public.approve_cashbook_audit(actor_profile_id uuid,requested_business_date date,requested_comment text default null)
returns void language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; actor_role public.account_role; normalized_comment text:=nullif(trim(coalesce(requested_comment,'')),'');
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  select * into day_row from public.cashbook_days where business_date=requested_business_date for update;
  if day_row.business_date is null or not day_row.is_closed or day_row.audit_status<>'PENDING_AUDIT' then raise exception 'Only a closed day pending audit can be approved'; end if;
  update public.cashbook_days set audit_status='APPROVED',reviewed_at=now(),reviewed_by=actor_profile_id,
    review_comment=normalized_comment,updated_by=actor_profile_id,updated_at=now() where business_date=requested_business_date and audit_status='PENDING_AUDIT';
  if not found then raise exception 'Only a closed day pending audit can be approved'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_audit_approved','accounting','cashbook_day',requested_business_date::text,
    'Cashbook day audit approved.',jsonb_build_object('audit_status','PENDING_AUDIT'),jsonb_build_object('audit_status','APPROVED'));
end $$;

revoke all on function public.edit_pending_cashbook_entry(uuid,uuid,uuid,numeric,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.add_pending_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) from public,anon,authenticated;
revoke all on function public.remove_pending_cashbook_entry(uuid,uuid) from public,anon,authenticated;
revoke all on function public.approve_cashbook_audit(uuid,date,text) from public,anon,authenticated;
grant execute on function public.edit_pending_cashbook_entry(uuid,uuid,uuid,numeric,text,timestamptz,text) to service_role;
grant execute on function public.add_pending_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) to service_role;
grant execute on function public.remove_pending_cashbook_entry(uuid,uuid) to service_role;
grant execute on function public.approve_cashbook_audit(uuid,date,text) to service_role;
notify pgrst,'reload schema';
