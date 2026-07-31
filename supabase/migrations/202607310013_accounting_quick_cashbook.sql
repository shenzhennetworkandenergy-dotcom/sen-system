-- Quick Cashbook entries stay synchronized with the existing general ledger.
create table public.cashbook_days (
  business_date date primary key,
  opening_balance numeric(18,2) not null default 0 check (opening_balance >= 0),
  closing_balance numeric(18,2),
  is_closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_closed=false and closing_balance is null and closed_at is null and closed_by is null)
    or
    (is_closed=true and closing_balance is not null and closed_at is not null and closed_by is not null)
  )
);

create table public.cashbook_descriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  transaction_type text not null check (transaction_type in ('income','expense')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cashbook_descriptions_name_type_idx
  on public.cashbook_descriptions (lower(name),transaction_type);
create index cashbook_descriptions_active_idx
  on public.cashbook_descriptions (transaction_type,is_active,name);

create table public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  description_id uuid not null references public.cashbook_descriptions(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('income','expense')),
  amount numeric(18,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','bank','mfs')),
  transaction_at timestamptz not null,
  business_date date not null references public.cashbook_days(business_date) on delete restrict,
  journal_entry_id uuid not null unique references public.journal_entries(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index cashbook_entries_business_date_idx
  on public.cashbook_entries (business_date desc,transaction_at desc);
create index cashbook_entries_description_idx
  on public.cashbook_entries (description_id);

insert into public.accounting_accounts(code,name,account_type,currency)
values
  ('1010','Cash','asset','BDT'),
  ('1020','Bank','asset','BDT'),
  ('1030','Mobile financial services','asset','BDT')
on conflict(code) do nothing;

insert into public.cashbook_descriptions(name,transaction_type)
values
  ('Sales','income'),
  ('Other income','income'),
  ('Office rent','expense'),
  ('Transport','expense'),
  ('Utilities','expense')
on conflict do nothing;

create or replace function public.cashbook_opening_balance_for(requested_business_date date)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  select coalesce((
    select case
      when business_date=requested_business_date then opening_balance
      else closing_balance
    end
    from public.cashbook_days
    where business_date<=requested_business_date
      and (business_date=requested_business_date or is_closed=true)
    order by business_date desc
    limit 1
  ),0)::numeric(18,2)
$$;

create or replace function public.lock_cashbook_timeline()
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  perform pg_advisory_xact_lock(20260731,11);
end $$;

create or replace function public.assert_cashbook_predecessor_closed(requested_business_date date)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  predecessor public.cashbook_days%rowtype;
begin
  select * into predecessor
  from public.cashbook_days
  where business_date<requested_business_date
  order by business_date desc
  limit 1;

  if predecessor.business_date is not null and not predecessor.is_closed then
    raise exception 'Close the previous cashbook day before continuing';
  end if;
end $$;

create or replace function public.create_cashbook_description(
  actor_profile_id uuid,
  requested_name text,
  requested_transaction_type text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  description_id uuid:=gen_random_uuid();
  normalized_name text:=trim(coalesce(requested_name,''));
  normalized_type text:=lower(trim(coalesce(requested_transaction_type,'')));
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if char_length(normalized_name) not between 2 and 160 then
    raise exception 'Description must be between 2 and 160 characters';
  end if;
  if normalized_type not in ('income','expense') then
    raise exception 'Transaction type must be income or expense';
  end if;

  insert into public.cashbook_descriptions(id,name,transaction_type,created_by)
  values(description_id,normalized_name,normalized_type,actor_profile_id);

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_description_created',
    'accounting',
    'cashbook_description',
    description_id::text,
    'Cashbook description created.',
    jsonb_build_object('name',normalized_name,'transaction_type',normalized_type)
  );
  return description_id;
exception
  when unique_violation then
    raise exception 'This description already exists for the selected transaction type';
end $$;

create or replace function public.set_cashbook_opening_balance(
  actor_profile_id uuid,
  requested_business_date date,
  requested_opening_balance numeric
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  day_row public.cashbook_days%rowtype;
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_business_date is null then
    raise exception 'Business date is required';
  end if;
  if requested_opening_balance is null or requested_opening_balance<0 then
    raise exception 'Opening cash must be zero or greater';
  end if;

  perform public.lock_cashbook_timeline();
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(requested_business_date,round(requested_opening_balance,2),actor_profile_id)
  on conflict(business_date) do nothing;

  select * into day_row from public.cashbook_days
  where business_date=requested_business_date for update;
  if day_row.is_closed then
    raise exception 'This cashbook day is closed';
  end if;

  update public.cashbook_days
  set opening_balance=round(requested_opening_balance,2),updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_opening_balance_set',
    'accounting',
    'cashbook_day',
    requested_business_date::text,
    'Cashbook opening balance saved.',
    jsonb_build_object('opening_balance',round(requested_opening_balance,2))
  );
end $$;

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
      closed_by=actor_profile_id,updated_by=actor_profile_id,updated_at=now()
  where business_date=requested_business_date;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_day_closed',
    'accounting',
    'cashbook_day',
    requested_business_date::text,
    'Cashbook day closed.',
    jsonb_build_object(
      'opening_balance',day_row.opening_balance,
      'income',income_total,
      'expense',expense_total,
      'closing_balance',final_balance
    )
  );
  return final_balance;
end $$;

create or replace function public.create_cashbook_entry(
  actor_profile_id uuid,
  requested_description_id uuid,
  requested_amount numeric,
  requested_payment_method text,
  requested_occurred_at timestamptz,
  requested_business_date date
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  cashbook_id uuid:=gen_random_uuid();
  journal_id uuid:=gen_random_uuid();
  description_row public.cashbook_descriptions%rowtype;
  payment_account_id uuid;
  counter_account_id uuid;
  normalized_method text:=lower(trim(coalesce(requested_payment_method,'')));
  entry_time timestamptz:=requested_occurred_at;
  entry_date date;
  day_is_closed boolean;
  actor_role public.account_role;
begin
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  if requested_amount is null or requested_amount<=0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if normalized_method not in ('cash','bank','mfs') then
    raise exception 'Payment method must be Cash, Bank, or MFS';
  end if;
  if requested_occurred_at is null or requested_business_date is null then
    raise exception 'Transaction date and business date are required';
  end if;
  entry_date:=(entry_time at time zone 'Asia/Dhaka')::date;
  if entry_date<>requested_business_date then
    raise exception 'Transaction date must match the selected cashbook date';
  end if;

  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(entry_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(entry_date,public.cashbook_opening_balance_for(entry_date),actor_profile_id)
  on conflict(business_date) do nothing;
  select is_closed into day_is_closed
  from public.cashbook_days where business_date=entry_date for update;
  if day_is_closed then
    raise exception 'This cashbook day is closed';
  end if;

  select * into description_row
  from public.cashbook_descriptions
  where id=requested_description_id and is_active=true;
  if description_row.id is null then
    raise exception 'Select an active cashbook description';
  end if;

  select id into payment_account_id
  from public.accounting_accounts
  where code=case normalized_method when 'cash' then '1010' when 'bank' then '1020' else '1030' end
    and currency='BDT' and is_active=true;

  select id into counter_account_id
  from public.accounting_accounts
  where code=case description_row.transaction_type when 'income' then '4000' else '6000' end
    and currency='BDT' and is_active=true;

  if payment_account_id is null or counter_account_id is null then
    raise exception 'Required accounting account is unavailable';
  end if;

  insert into public.journal_entries(
    id,entry_number,entry_date,description,reference_type,reference_id,status,
    currency,created_by,posted_by,posted_at
  ) values(
    journal_id,
    public.next_journal_entry_number(),
    entry_date,
    description_row.name,
    'manual',
    cashbook_id,
    'posted',
    'BDT',
    actor_profile_id,
    actor_profile_id,
    now()
  );

  if description_row.transaction_type='income' then
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values
      (journal_id,payment_account_id,description_row.name,requested_amount,0),
      (journal_id,counter_account_id,description_row.name,0,requested_amount);
  else
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values
      (journal_id,counter_account_id,description_row.name,requested_amount,0),
      (journal_id,payment_account_id,description_row.name,0,requested_amount);
  end if;

  insert into public.cashbook_entries(
    id,description_id,transaction_type,amount,payment_method,transaction_at,
    business_date,journal_entry_id,created_by
  ) values(
    cashbook_id,
    description_row.id,
    description_row.transaction_type,
    round(requested_amount,2),
    normalized_method,
    entry_time,
    entry_date,
    journal_id,
    actor_profile_id
  );

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(
    actor_profile_id,
    actor_role,
    'accounting.cashbook_entry_created',
    'accounting',
    'cashbook_entry',
    cashbook_id::text,
    'Cashbook entry created and posted.',
    jsonb_build_object(
      'transaction_type',description_row.transaction_type,
      'amount',round(requested_amount,2),
      'payment_method',normalized_method,
      'journal_entry_id',journal_id
    )
  );
  return cashbook_id;
end $$;

alter table public.cashbook_days enable row level security;
alter table public.cashbook_descriptions enable row level security;
alter table public.cashbook_entries enable row level security;

create policy "cashbook days read"
  on public.cashbook_days for select to authenticated
  using(public.current_user_has_permission('accounting.view'));
create policy "cashbook descriptions read"
  on public.cashbook_descriptions for select to authenticated
  using(public.current_user_has_permission('accounting.view'));
create policy "cashbook entries read"
  on public.cashbook_entries for select to authenticated
  using(public.current_user_has_permission('accounting.view'));

revoke all on function public.create_cashbook_description(uuid,text,text) from public,anon,authenticated;
revoke all on function public.cashbook_opening_balance_for(date) from public,anon,authenticated;
revoke all on function public.lock_cashbook_timeline() from public,anon,authenticated;
revoke all on function public.assert_cashbook_predecessor_closed(date) from public,anon,authenticated;
revoke all on function public.set_cashbook_opening_balance(uuid,date,numeric) from public,anon,authenticated;
revoke all on function public.close_cashbook_day(uuid,date) from public,anon,authenticated;
revoke all on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date) from public,anon,authenticated;
grant execute on function public.create_cashbook_description(uuid,text,text) to service_role;
grant execute on function public.set_cashbook_opening_balance(uuid,date,numeric) to service_role;
grant execute on function public.close_cashbook_day(uuid,date) to service_role;
grant execute on function public.create_cashbook_entry(uuid,uuid,numeric,text,timestamptz,date) to service_role;

revoke insert,update,delete on public.cashbook_days,public.cashbook_descriptions,public.cashbook_entries from anon,authenticated;
grant select on public.cashbook_days,public.cashbook_descriptions,public.cashbook_entries to authenticated,service_role;
grant all on public.cashbook_days,public.cashbook_descriptions,public.cashbook_entries to service_role;
