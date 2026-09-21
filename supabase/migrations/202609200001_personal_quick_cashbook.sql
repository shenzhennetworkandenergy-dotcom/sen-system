-- Personal Quick Cash Books with data-preserving legacy history.
-- Existing global history is classified deterministically and never guessed.

begin;

lock table public.cashbook_entries, public.cashbook_days in access exclusive mode;

do $$
begin
  if to_regclass('public.cashbook_entries') is null
    or to_regclass('public.cashbook_days') is null
    or to_regclass('public.profiles') is null
  then
    raise exception 'Required cashbook tables or profiles table are missing';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashbook_days' and column_name='business_date')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashbook_entries' and column_name='business_date')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashbook_entries' and column_name='created_by')
  then
    raise exception 'Expected legacy cashbook identity columns are missing';
  end if;
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name in ('cashbook_days','cashbook_entries')
      and column_name in ('cashbook_day_id','cashbook_scope','cashbook_owner_id')
  ) then
    raise exception 'Personal cashbook columns already exist; refusing a partial or repeated conversion';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.cashbook_days'::regclass and conname='cashbook_days_pkey')
    or not exists(select 1 from pg_constraint where conrelid='public.cashbook_entries'::regclass and conname='cashbook_entries_business_date_fkey')
  then
    raise exception 'Expected legacy cashbook constraints are missing';
  end if;
  if exists(
    select 1 from public.cashbook_entries entry
    left join public.cashbook_days day on day.business_date=entry.business_date
    where day.business_date is null
  ) then
    raise exception 'Legacy cashbook entries contain an orphan business date';
  end if;
end $$;

alter table public.cashbook_days
  add column cashbook_day_id uuid,
  add column cashbook_scope text,
  add column cashbook_owner_id uuid;
alter table public.cashbook_entries
  add column cashbook_day_id uuid,
  add column cashbook_scope text,
  add column cashbook_owner_id uuid;

update public.cashbook_days
set cashbook_day_id=gen_random_uuid(),cashbook_scope='LEGACY_GLOBAL',cashbook_owner_id=null;

with day_stats as (
  select day.business_date,
    count(entry.id) as entry_count,
    count(distinct entry.created_by) as distinct_creator_count,
    count(entry.id) filter(where entry.created_by is null or profile.id is null) as invalid_creator_count
  from public.cashbook_days day
  left join public.cashbook_entries entry on entry.business_date=day.business_date
  left join public.profiles profile on profile.id=entry.created_by
  group by day.business_date
), valid_creator_groups as (
  select entry.business_date,entry.created_by
  from public.cashbook_entries entry
  join public.profiles profile on profile.id=entry.created_by
  where entry.created_by is not null
  group by entry.business_date,entry.created_by
), proven_owners as (
  select stats.business_date,creator.created_by as cashbook_owner_id
  from day_stats stats
  join valid_creator_groups creator on creator.business_date=stats.business_date
  where stats.entry_count>0 and stats.invalid_creator_count=0 and stats.distinct_creator_count=1
)
update public.cashbook_days day
set cashbook_scope='LEGACY_ATTRIBUTED',cashbook_owner_id=proven.cashbook_owner_id
from proven_owners proven
where proven.business_date=day.business_date;

update public.cashbook_entries entry
set cashbook_day_id=day.cashbook_day_id,
    cashbook_scope=day.cashbook_scope,
    cashbook_owner_id=day.cashbook_owner_id
from public.cashbook_days day
where day.business_date=entry.business_date;

do $$
begin
  if exists(select 1 from public.cashbook_days where cashbook_day_id is null or cashbook_scope is null)
    or exists(select 1 from public.cashbook_entries where cashbook_day_id is null or cashbook_scope is null)
  then
    raise exception 'Cashbook legacy classification or day linkage is incomplete';
  end if;
  if exists(
    select 1 from public.cashbook_days
    where (cashbook_scope='LEGACY_GLOBAL' and cashbook_owner_id is not null)
       or (cashbook_scope='LEGACY_ATTRIBUTED' and cashbook_owner_id is null)
       or cashbook_scope not in ('LEGACY_GLOBAL','LEGACY_ATTRIBUTED')
  ) then
    raise exception 'Cashbook legacy ownership classification is invalid';
  end if;
  if exists(
    select 1 from public.cashbook_entries entry
    join public.cashbook_days day on day.cashbook_day_id=entry.cashbook_day_id
    where entry.business_date is distinct from day.business_date
       or entry.cashbook_scope is distinct from day.cashbook_scope
       or entry.cashbook_owner_id is distinct from day.cashbook_owner_id
  ) then
    raise exception 'Cashbook entry/day legacy relationship is invalid';
  end if;
end $$;

alter table public.cashbook_entries drop constraint cashbook_entries_business_date_fkey;
alter table public.cashbook_days drop constraint cashbook_days_pkey;

alter table public.cashbook_days
  alter column cashbook_day_id set default gen_random_uuid(),
  alter column cashbook_day_id set not null,
  alter column cashbook_scope set not null,
  add constraint cashbook_days_pkey primary key(cashbook_day_id),
  add constraint cashbook_days_scope_check check(
    (cashbook_scope='LEGACY_GLOBAL' and cashbook_owner_id is null)
    or (cashbook_scope in ('LEGACY_ATTRIBUTED','PERSONAL') and cashbook_owner_id is not null)
  ),
  add constraint cashbook_days_owner_fkey foreign key(cashbook_owner_id)
    references public.profiles(id) on delete restrict;
alter table public.cashbook_entries
  alter column cashbook_day_id set not null,
  alter column cashbook_scope set not null,
  add constraint cashbook_entries_scope_check check(
    (cashbook_scope='LEGACY_GLOBAL' and cashbook_owner_id is null)
    or (cashbook_scope in ('LEGACY_ATTRIBUTED','PERSONAL') and cashbook_owner_id is not null)
  ),
  add constraint cashbook_entries_owner_fkey foreign key(cashbook_owner_id)
    references public.profiles(id) on delete restrict,
  add constraint cashbook_entries_day_fkey foreign key(cashbook_day_id)
    references public.cashbook_days(cashbook_day_id) on delete restrict;

drop index if exists public.cashbook_entries_business_date_idx;
create unique index cashbook_days_legacy_business_date_idx
  on public.cashbook_days(business_date)
  where cashbook_scope in ('LEGACY_GLOBAL','LEGACY_ATTRIBUTED');
create unique index cashbook_days_personal_owner_business_date_idx
  on public.cashbook_days(cashbook_owner_id,business_date)
  where cashbook_scope='PERSONAL';
create index cashbook_entries_day_idx on public.cashbook_entries(cashbook_day_id,transaction_at desc);
create index cashbook_entries_personal_owner_business_date_idx
  on public.cashbook_entries(cashbook_owner_id,business_date desc,transaction_at desc)
  where cashbook_scope='PERSONAL';
create index cashbook_days_business_date_scope_idx
  on public.cashbook_days(business_date desc,cashbook_scope,cashbook_owner_id);

create function public.assert_cashbook_entry_day_consistency()
returns trigger language plpgsql security definer set search_path=public as $$
declare linked_day public.cashbook_days%rowtype;
begin
  select * into linked_day from public.cashbook_days where cashbook_day_id=new.cashbook_day_id;
  if linked_day.cashbook_day_id is null then raise exception 'Cashbook day does not exist'; end if;
  if new.business_date is distinct from linked_day.business_date
    or new.cashbook_scope is distinct from linked_day.cashbook_scope
    or new.cashbook_owner_id is distinct from linked_day.cashbook_owner_id
  then raise exception 'Cashbook entry must match its linked day identity'; end if;
  return new;
end $$;
create trigger cashbook_entries_day_consistency
before insert or update of cashbook_day_id,cashbook_scope,cashbook_owner_id,business_date
on public.cashbook_entries for each row execute function public.assert_cashbook_entry_day_consistency();

drop policy if exists "cashbook days read" on public.cashbook_days;
create policy "cashbook days read" on public.cashbook_days for select to authenticated using(
  (cashbook_scope in ('PERSONAL','LEGACY_ATTRIBUTED') and cashbook_owner_id=auth.uid()
    and (public.current_user_has_permission('accounting.view')
      or public.current_user_has_permission('accounting.manage_cashbook')))
  or public.current_user_has_permission('accounting.audit_cashbook')
);
drop policy if exists "cashbook entries read" on public.cashbook_entries;
create policy "cashbook entries read" on public.cashbook_entries for select to authenticated using(
  (cashbook_scope in ('PERSONAL','LEGACY_ATTRIBUTED') and cashbook_owner_id=auth.uid()
    and (public.current_user_has_permission('accounting.view')
      or public.current_user_has_permission('accounting.manage_cashbook')))
  or public.current_user_has_permission('accounting.audit_cashbook')
);

drop function public.cashbook_opening_balance_for(date);
create function public.cashbook_opening_balance_for(requested_cashbook_owner_id uuid,requested_business_date date)
returns numeric language sql stable security definer set search_path=public as $$
  select (select case when business_date=requested_business_date then opening_balance else closing_balance end
    from public.cashbook_days
    where cashbook_scope='PERSONAL' and cashbook_owner_id=requested_cashbook_owner_id
      and business_date<=requested_business_date
      and (business_date=requested_business_date or is_closed=true)
    order by business_date desc limit 1)::numeric(18,2)
$$;

drop function public.lock_cashbook_timeline();
create function public.lock_cashbook_timeline(requested_cashbook_owner_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if requested_cashbook_owner_id is null then raise exception 'Cashbook owner is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sen.cashbook.timeline:'||requested_cashbook_owner_id::text,20260731));
end $$;

drop function public.assert_cashbook_predecessor_closed(date);
create function public.assert_cashbook_predecessor_closed(requested_cashbook_owner_id uuid,requested_business_date date)
returns void language plpgsql security definer set search_path=public as $$
declare predecessor public.cashbook_days%rowtype;
begin
  select * into predecessor from public.cashbook_days
  where cashbook_scope='PERSONAL' and cashbook_owner_id=requested_cashbook_owner_id
    and business_date<requested_business_date
  order by business_date desc limit 1;
  if predecessor.cashbook_day_id is not null and not predecessor.is_closed then
    raise exception 'Close the previous personal cashbook day before continuing';
  end if;
end $$;

create or replace function public.set_cashbook_opening_balance(actor_profile_id uuid,requested_business_date date,requested_opening_balance numeric)
returns void language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then raise exception 'Business date is required'; end if;
  if requested_opening_balance is null or requested_opening_balance<0 then raise exception 'Opening cash must be zero or greater'; end if;
  perform public.lock_cashbook_timeline(actor_profile_id);
  perform public.assert_cashbook_predecessor_closed(actor_profile_id,requested_business_date);
  insert into public.cashbook_days(cashbook_day_id,cashbook_scope,cashbook_owner_id,business_date,opening_balance,updated_by)
  values(gen_random_uuid(),'PERSONAL',actor_profile_id,requested_business_date,round(requested_opening_balance,2),actor_profile_id)
  on conflict(cashbook_owner_id,business_date) where cashbook_scope='PERSONAL' do nothing;
  select * into day_row from public.cashbook_days
  where cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id and business_date=requested_business_date for update;
  if day_row.is_closed then raise exception 'This personal cashbook day is closed'; end if;
  update public.cashbook_days set opening_balance=round(requested_opening_balance,2),updated_by=actor_profile_id,updated_at=now()
  where cashbook_day_id=day_row.cashbook_day_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_opening_balance_set','accounting','cashbook_day',day_row.cashbook_day_id::text,
    'Personal cashbook opening balance saved.',jsonb_build_object('cashbook_day_id',day_row.cashbook_day_id,'cashbook_owner_id',actor_profile_id,'business_date',requested_business_date,'opening_balance',round(requested_opening_balance,2)));
end $$;

create or replace function public.create_cashbook_entry(actor_profile_id uuid,requested_description_id uuid,requested_amount numeric,requested_payment_method text,requested_occurred_at timestamptz,requested_business_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  cashbook_id uuid:=gen_random_uuid(); journal_id uuid:=gen_random_uuid();
  description_row public.cashbook_descriptions%rowtype; day_row public.cashbook_days%rowtype;
  inherited_opening numeric(18,2); payment_account_id uuid; counter_account_id uuid;
  normalized_method text:=lower(trim(coalesce(requested_payment_method,'')));
  entry_time timestamptz:=requested_occurred_at; entry_date date; actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_amount is null or requested_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if normalized_method not in ('cash','bank','mfs') then raise exception 'Payment method must be Cash, Bank, or MFS'; end if;
  if requested_occurred_at is null or requested_business_date is null then raise exception 'Transaction date and business date are required'; end if;
  entry_date:=(entry_time at time zone 'Asia/Dhaka')::date;
  if entry_date<>requested_business_date then raise exception 'Transaction date must match the selected cashbook date'; end if;
  perform public.lock_cashbook_timeline(actor_profile_id);
  perform public.assert_cashbook_predecessor_closed(actor_profile_id,entry_date);
  select * into day_row from public.cashbook_days where cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id and business_date=entry_date for update;
  if day_row.cashbook_day_id is null then
    inherited_opening:=public.cashbook_opening_balance_for(actor_profile_id,entry_date);
    if inherited_opening is null then raise exception 'Initialize the first personal cashbook opening balance before creating entries'; end if;
    insert into public.cashbook_days(cashbook_day_id,cashbook_scope,cashbook_owner_id,business_date,opening_balance,updated_by)
    values(gen_random_uuid(),'PERSONAL',actor_profile_id,entry_date,inherited_opening,actor_profile_id) returning * into day_row;
  end if;
  if day_row.is_closed then raise exception 'This personal cashbook day is closed'; end if;
  select * into description_row from public.cashbook_descriptions where id=requested_description_id and is_active=true;
  if description_row.id is null then raise exception 'Select an active cashbook description'; end if;
  select id into payment_account_id from public.accounting_accounts
  where code=case normalized_method when 'cash' then '1010' when 'bank' then '1020' else '1030' end and currency='BDT' and is_active=true;
  select id into counter_account_id from public.accounting_accounts
  where code=case description_row.transaction_type when 'income' then '4000' else '6000' end and currency='BDT' and is_active=true;
  if payment_account_id is null or counter_account_id is null then raise exception 'Required accounting account is unavailable'; end if;
  insert into public.journal_entries(id,entry_number,entry_date,description,reference_type,reference_id,status,currency,created_by,posted_by,posted_at)
  values(journal_id,public.next_journal_entry_number(),entry_date,description_row.name,'manual',cashbook_id,'posted','BDT',actor_profile_id,actor_profile_id,now());
  if description_row.transaction_type='income' then
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit) values
      (journal_id,payment_account_id,description_row.name,requested_amount,0),(journal_id,counter_account_id,description_row.name,0,requested_amount);
  else
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit) values
      (journal_id,counter_account_id,description_row.name,requested_amount,0),(journal_id,payment_account_id,description_row.name,0,requested_amount);
  end if;
  insert into public.cashbook_entries(id,cashbook_day_id,cashbook_scope,cashbook_owner_id,description_id,transaction_type,amount,payment_method,transaction_at,business_date,journal_entry_id,created_by)
  values(cashbook_id,day_row.cashbook_day_id,'PERSONAL',actor_profile_id,description_row.id,description_row.transaction_type,round(requested_amount,2),normalized_method,entry_time,entry_date,journal_id,actor_profile_id);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_entry_created','accounting','cashbook_entry',cashbook_id::text,'Personal cashbook entry created and posted.',
    jsonb_build_object('cashbook_day_id',day_row.cashbook_day_id,'cashbook_owner_id',actor_profile_id,'transaction_type',description_row.transaction_type,'amount',round(requested_amount,2),'payment_method',normalized_method,'journal_entry_id',journal_id));
  return cashbook_id;
end $$;

create or replace function public.close_cashbook_day(actor_profile_id uuid,requested_business_date date)
returns numeric language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; inherited_opening numeric(18,2); income_total numeric(18,2); expense_total numeric(18,2); final_balance numeric(18,2); actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then raise exception 'Business date is required'; end if;
  perform public.lock_cashbook_timeline(actor_profile_id);
  perform public.assert_cashbook_predecessor_closed(actor_profile_id,requested_business_date);
  select * into day_row from public.cashbook_days where cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id and business_date=requested_business_date for update;
  if day_row.cashbook_day_id is null then
    inherited_opening:=public.cashbook_opening_balance_for(actor_profile_id,requested_business_date);
    if inherited_opening is null then raise exception 'Initialize the first personal cashbook opening balance before closing the day'; end if;
    insert into public.cashbook_days(cashbook_day_id,cashbook_scope,cashbook_owner_id,business_date,opening_balance,updated_by)
    values(gen_random_uuid(),'PERSONAL',actor_profile_id,requested_business_date,inherited_opening,actor_profile_id) returning * into day_row;
  end if;
  if day_row.is_closed then raise exception 'This personal cashbook day is already closed'; end if;
  select coalesce(sum(amount) filter(where transaction_type='income'),0),coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into income_total,expense_total from public.cashbook_entries
  where cashbook_day_id=day_row.cashbook_day_id and cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id;
  final_balance:=day_row.opening_balance+income_total-expense_total;
  update public.cashbook_days set is_closed=true,closing_balance=final_balance,closed_at=now(),closed_by=actor_profile_id,
    audit_status='PENDING_AUDIT',reviewed_at=null,reviewed_by=null,review_comment=null,correction_reason=null,
    correction_requested_at=null,correction_requested_by=null,updated_by=actor_profile_id,updated_at=now()
  where cashbook_day_id=day_row.cashbook_day_id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_day_closed','accounting','cashbook_day',day_row.cashbook_day_id::text,'Personal cashbook day closed.',
    jsonb_build_object('cashbook_day_id',day_row.cashbook_day_id,'cashbook_owner_id',actor_profile_id,'business_date',requested_business_date,'opening_balance',day_row.opening_balance,'income',income_total,'expense',expense_total,'closing_balance',final_balance));
  return final_balance;
end $$;

create or replace function public.record_sale_payment(actor_profile_id uuid,requested_order_id uuid,requested_amount numeric,requested_date date,requested_method text,requested_reference text,requested_note text,requested_operation_id uuid,requested_receipt_channel text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  payment_id uuid:=extensions.gen_random_uuid(); journal_id uuid:=extensions.gen_random_uuid(); cashbook_id uuid:=extensions.gen_random_uuid();
  sale public.sales_orders%rowtype; existing_payment public.sale_payments%rowtype; sales_description public.cashbook_descriptions%rowtype; day_row public.cashbook_days%rowtype;
  actor_role public.account_role; normalized_method text:=lower(trim(coalesce(requested_method,''))); normalized_channel text:=lower(trim(coalesce(requested_receipt_channel,'')));
  normalized_reference text:=nullif(left(trim(coalesce(requested_reference,'')),200),''); normalized_note text:=nullif(left(trim(coalesce(requested_note,'')),1000),'');
  normalized_amount numeric(18,2):=round(requested_amount,2); effective_date date:=coalesce(requested_date,current_date); inherited_opening numeric(18,2);
  payment_account_id uuid; revenue_account_id uuid; invoice_number text; customer_name text; entry_reference text; entry_time timestamptz;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.record_payment');
  if requested_operation_id is null then raise exception 'A valid payment operation ID is required'; end if;
  if requested_amount is null or requested_amount<=0 or normalized_amount<=0 then raise exception 'Payment amount must be positive'; end if;
  if normalized_method='credit_sale' then raise exception 'Credit Sale is not a received payment. Record the actual payment method when money is received.';
  elsif normalized_method in ('cash','cash_on_delivery') then normalized_channel:='cash';
  elsif normalized_method='mobile_banking' then normalized_channel:='mfs';
  elsif normalized_method in ('bank_transfer','cheque','card') then normalized_channel:='bank';
  elsif normalized_method in ('advance_payment','other') then if normalized_channel not in ('cash','bank','mfs') then raise exception 'Select the actual Cash, Bank, or MFS receiving channel'; end if;
  else raise exception 'Invalid received payment method'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select * into existing_payment from public.sale_payments where operation_id=requested_operation_id;
  if existing_payment.id is not null then
    if existing_payment.received_by is distinct from actor_profile_id or existing_payment.order_id is distinct from requested_order_id
      or round(existing_payment.amount,2) is distinct from normalized_amount or existing_payment.payment_date is distinct from effective_date
      or existing_payment.method is distinct from normalized_method or existing_payment.receipt_channel is distinct from normalized_channel
      or existing_payment.reference_number is distinct from normalized_reference or existing_payment.internal_note is distinct from normalized_note
    then raise exception 'This payment operation ID was already used with different details'; end if;
    if not exists(select 1 from public.cashbook_entries where sale_payment_id=existing_payment.id and cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id)
    then raise exception 'This payment operation is missing its linked personal Accounting transaction'; end if;
    return existing_payment.id;
  end if;
  select * into sale from public.sales_orders where id=requested_order_id for update;
  if sale.id is null or sale.status='cancelled' then raise exception 'Sale is not eligible for payment'; end if;
  perform public.lock_cashbook_timeline(actor_profile_id);
  perform public.assert_cashbook_predecessor_closed(actor_profile_id,effective_date);
  select * into day_row from public.cashbook_days where cashbook_scope='PERSONAL' and cashbook_owner_id=actor_profile_id and business_date=effective_date for update;
  if day_row.cashbook_day_id is null then
    inherited_opening:=public.cashbook_opening_balance_for(actor_profile_id,effective_date);
    if inherited_opening is null then raise exception 'Initialize the first personal cashbook opening balance before recording Sales payments'; end if;
    insert into public.cashbook_days(cashbook_day_id,cashbook_scope,cashbook_owner_id,business_date,opening_balance,updated_by)
    values(extensions.gen_random_uuid(),'PERSONAL',actor_profile_id,effective_date,inherited_opening,actor_profile_id) returning * into day_row;
  end if;
  if day_row.is_closed then raise exception 'This personal cashbook date is already closed. Use the authorized accounting correction process.'; end if;
  select * into sales_description from public.cashbook_descriptions where lower(trim(name))='sales' and transaction_type='income' and is_active=true order by created_at limit 1;
  if sales_description.id is null then raise exception 'The active Sales income description is unavailable in Accounting'; end if;
  select id into payment_account_id from public.accounting_accounts where code=case normalized_channel when 'cash' then '1010' when 'bank' then '1020' else '1030' end and currency='BDT' and is_active=true;
  select id into revenue_account_id from public.accounting_accounts where code='4000' and currency='BDT' and is_active=true;
  if payment_account_id is null or revenue_account_id is null then raise exception 'Required Sales payment accounting account is unavailable'; end if;
  insert into public.sale_payments(id,order_id,amount,payment_date,method,reference_number,internal_note,received_by,operation_id,receipt_channel)
  values(payment_id,sale.id,normalized_amount,effective_date,normalized_method,normalized_reference,normalized_note,actor_profile_id,requested_operation_id,normalized_channel);
  perform public.refresh_sale_payment_totals(sale.id);
  select document_number into invoice_number from public.sale_documents where order_id=sale.id and document_type='invoice' and status='generated' order by revision_number desc,created_at desc limit 1;
  select coalesce(nullif(trim(profile.full_name),''),nullif(trim(profile.company_name),''),nullif(trim(profile.email),''),'Customer') into customer_name from public.profiles profile where profile.id=sale.customer_profile_id;
  entry_reference:=concat_ws(' — ','Sales Payment',sale.order_number,invoice_number,customer_name,case when normalized_reference is null then null else 'Ref: '||normalized_reference end);
  if effective_date=(pg_catalog.clock_timestamp() at time zone 'Asia/Dhaka')::date then entry_time:=pg_catalog.clock_timestamp();
  else entry_time:=(effective_date::timestamp+time '12:00') at time zone 'Asia/Dhaka'; end if;
  insert into public.journal_entries(id,entry_number,entry_date,description,reference_type,reference_id,status,currency,created_by,posted_by,posted_at)
  values(journal_id,public.next_journal_entry_number(),effective_date,left(entry_reference,500),'payment',payment_id,'posted','BDT',actor_profile_id,actor_profile_id,pg_catalog.clock_timestamp());
  insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit) values
    (journal_id,payment_account_id,left(entry_reference,500),normalized_amount,0),(journal_id,revenue_account_id,left(entry_reference,500),0,normalized_amount);
  insert into public.cashbook_entries(id,cashbook_day_id,cashbook_scope,cashbook_owner_id,description_id,transaction_type,amount,payment_method,transaction_at,business_date,journal_entry_id,created_by,remark,sale_payment_id,source_payment_method)
  values(cashbook_id,day_row.cashbook_day_id,'PERSONAL',actor_profile_id,sales_description.id,'income',normalized_amount,normalized_channel,entry_time,effective_date,journal_id,actor_profile_id,left(entry_reference,240),payment_id,normalized_method);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,sale.customer_profile_id,'sales.payment_accounting_posted','sales','sale_payment',payment_id::text,'Sales payment recorded and posted to a personal cashbook.',
    jsonb_build_object('operation_id',requested_operation_id,'sales_order_id',sale.id,'cashbook_entry_id',cashbook_id,'cashbook_day_id',day_row.cashbook_day_id,'cashbook_owner_id',actor_profile_id,'journal_entry_id',journal_id,'amount',normalized_amount,'payment_date',effective_date,'payment_method',normalized_method,'receipt_channel',normalized_channel));
  return payment_id;
end $$;

drop function public.approve_cashbook_audit(uuid,date,text);
create function public.approve_cashbook_audit(actor_profile_id uuid,requested_cashbook_day_id uuid,requested_comment text default null)
returns void language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; actor_role public.account_role; normalized_comment text:=nullif(trim(coalesce(requested_comment,'')),'');
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  if requested_cashbook_day_id is null then raise exception 'Cashbook day is required'; end if;
  if char_length(coalesce(normalized_comment,''))>1000 then raise exception 'Review comment cannot exceed 1000 characters'; end if;
  select * into day_row from public.cashbook_days where cashbook_day_id=requested_cashbook_day_id for update;
  if day_row.cashbook_day_id is null or not day_row.is_closed then raise exception 'Only closed cashbook days can be audited'; end if;
  if day_row.audit_status is distinct from 'PENDING_AUDIT' then raise exception 'Only cashbook days pending audit can be approved'; end if;
  update public.cashbook_days set audit_status='APPROVED',reviewed_at=now(),reviewed_by=actor_profile_id,review_comment=normalized_comment,
    correction_reason=null,correction_requested_at=null,correction_requested_by=null,updated_by=actor_profile_id,updated_at=now()
  where cashbook_day_id=requested_cashbook_day_id and is_closed=true and audit_status='PENDING_AUDIT';
  if not found then raise exception 'Only cashbook days pending audit can be approved'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_audit_approved','accounting','cashbook_day',requested_cashbook_day_id::text,'Cashbook day audit approved.',
    jsonb_build_object('audit_status',day_row.audit_status),jsonb_build_object('cashbook_day_id',requested_cashbook_day_id,'cashbook_scope',day_row.cashbook_scope,'cashbook_owner_id',day_row.cashbook_owner_id,'business_date',day_row.business_date,'audit_status','APPROVED','review_comment',normalized_comment));
end $$;

drop function public.request_cashbook_correction(uuid,date,text);
create function public.request_cashbook_correction(actor_profile_id uuid,requested_cashbook_day_id uuid,requested_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare day_row public.cashbook_days%rowtype; actor_role public.account_role; normalized_reason text:=nullif(trim(coalesce(requested_reason,'')),'');
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.audit_cashbook');
  if requested_cashbook_day_id is null then raise exception 'Cashbook day is required'; end if;
  if normalized_reason is null or char_length(normalized_reason)=0 then raise exception 'A correction reason is required'; end if;
  if char_length(normalized_reason)>1000 then raise exception 'Correction reason cannot exceed 1000 characters'; end if;
  select * into day_row from public.cashbook_days where cashbook_day_id=requested_cashbook_day_id for update;
  if day_row.cashbook_day_id is null or not day_row.is_closed then raise exception 'Only closed cashbook days can be returned for correction'; end if;
  if day_row.audit_status is distinct from 'PENDING_AUDIT' then raise exception 'Only cashbook days pending audit can require correction'; end if;
  update public.cashbook_days set audit_status='CORRECTION_REQUIRED',correction_reason=normalized_reason,correction_requested_at=now(),
    correction_requested_by=actor_profile_id,reviewed_at=now(),reviewed_by=actor_profile_id,review_comment=normalized_reason,updated_by=actor_profile_id,updated_at=now()
  where cashbook_day_id=requested_cashbook_day_id and is_closed=true and audit_status='PENDING_AUDIT';
  if not found then raise exception 'Only cashbook days pending audit can require correction'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
  values(actor_profile_id,actor_role,'accounting.cashbook_correction_requested','accounting','cashbook_day',requested_cashbook_day_id::text,'Cashbook correction requested.',
    jsonb_build_object('audit_status',day_row.audit_status),jsonb_build_object('cashbook_day_id',requested_cashbook_day_id,'cashbook_scope',day_row.cashbook_scope,'cashbook_owner_id',day_row.cashbook_owner_id,'business_date',day_row.business_date,'audit_status','CORRECTION_REQUIRED','correction_reason',normalized_reason));
end $$;

do $$
begin
  if exists(select 1 from public.cashbook_days where
    (cashbook_scope='LEGACY_GLOBAL' and cashbook_owner_id is not null)
    or (cashbook_scope in ('LEGACY_ATTRIBUTED','PERSONAL') and cashbook_owner_id is null)
    or cashbook_scope not in ('LEGACY_GLOBAL','LEGACY_ATTRIBUTED','PERSONAL'))
  then raise exception 'Cashbook day scope/owner validation failed'; end if;
  if exists(select 1 from public.cashbook_entries entry left join public.cashbook_days day on day.cashbook_day_id=entry.cashbook_day_id
    where day.cashbook_day_id is null or entry.business_date is distinct from day.business_date
      or entry.cashbook_scope is distinct from day.cashbook_scope or entry.cashbook_owner_id is distinct from day.cashbook_owner_id)
  then raise exception 'Cashbook entry/day validation failed'; end if;
  if exists(select 1 from public.cashbook_days day left join public.profiles profile on profile.id=day.cashbook_owner_id
    where day.cashbook_owner_id is not null and profile.id is null)
  then raise exception 'Cashbook owner validation failed'; end if;
end $$;

revoke all on function public.assert_cashbook_entry_day_consistency() from public,anon,authenticated;
revoke all on function public.cashbook_opening_balance_for(uuid,date) from public,anon,authenticated;
revoke all on function public.lock_cashbook_timeline(uuid) from public,anon,authenticated;
revoke all on function public.assert_cashbook_predecessor_closed(uuid,date) from public,anon,authenticated;
revoke all on function public.set_cashbook_opening_balance(uuid,date,numeric) from public,anon,authenticated;
revoke all on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date) from public,anon,authenticated;
revoke all on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) from public,anon,authenticated;
revoke all on function public.close_cashbook_day(uuid,date) from public,anon,authenticated;
revoke all on function public.record_sale_payment(uuid,uuid,numeric,date,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.approve_cashbook_audit(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.request_cashbook_correction(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_cashbook_opening_balance(uuid,date,numeric) to service_role;
grant execute on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date) to service_role;
grant execute on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date,text) to service_role;
grant execute on function public.close_cashbook_day(uuid,date) to service_role;
grant execute on function public.record_sale_payment(uuid,uuid,numeric,date,text,text,text,uuid,text) to service_role;
grant execute on function public.approve_cashbook_audit(uuid,uuid,text) to service_role;
grant execute on function public.request_cashbook_correction(uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';

commit;
