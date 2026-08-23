-- Atomically post actually received Sales payments to the existing Cash Book and ledger.

alter table public.sale_payments
  add column if not exists operation_id uuid,
  add column if not exists receipt_channel text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='sale_payments_receipt_channel_check'
      and conrelid='public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_receipt_channel_check
      check (receipt_channel is null or receipt_channel in ('cash','bank','mfs'));
  end if;
end $$;

create unique index if not exists sale_payments_operation_id_unique
  on public.sale_payments(operation_id)
  where operation_id is not null;

alter table public.cashbook_entries
  add column if not exists sale_payment_id uuid,
  add column if not exists source_payment_method text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='cashbook_entries_sale_payment_id_fkey'
      and conrelid='public.cashbook_entries'::regclass
  ) then
    alter table public.cashbook_entries
      add constraint cashbook_entries_sale_payment_id_fkey
      foreign key (sale_payment_id)
      references public.sale_payments(id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='cashbook_entries_source_payment_method_check'
      and conrelid='public.cashbook_entries'::regclass
  ) then
    alter table public.cashbook_entries
      add constraint cashbook_entries_source_payment_method_check
      check (
        source_payment_method is null
        or source_payment_method in (
          'cash','bank_transfer','cheque','mobile_banking','card',
          'advance_payment','cash_on_delivery','other'
        )
      );
  end if;
end $$;

create unique index if not exists cashbook_entries_sale_payment_id_unique
  on public.cashbook_entries(sale_payment_id)
  where sale_payment_id is not null;

create or replace function public.record_sale_payment(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_amount numeric,
  requested_date date,
  requested_method text,
  requested_reference text,
  requested_note text,
  requested_operation_id uuid,
  requested_receipt_channel text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  payment_id uuid:=gen_random_uuid();
  journal_id uuid:=gen_random_uuid();
  cashbook_id uuid:=gen_random_uuid();
  sale public.sales_orders%rowtype;
  existing_payment public.sale_payments%rowtype;
  sales_description public.cashbook_descriptions%rowtype;
  actor_role public.account_role;
  normalized_method text:=lower(trim(coalesce(requested_method,'')));
  normalized_channel text:=lower(trim(coalesce(requested_receipt_channel,'')));
  normalized_reference text:=nullif(left(trim(coalesce(requested_reference,'')),200),'');
  normalized_note text:=nullif(left(trim(coalesce(requested_note,'')),1000),'');
  normalized_amount numeric(18,2):=round(requested_amount,2);
  effective_date date:=coalesce(requested_date,current_date);
  payment_account_id uuid;
  revenue_account_id uuid;
  invoice_number text;
  customer_name text;
  entry_reference text;
  entry_time timestamptz;
  day_is_closed boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.record_payment');
  if requested_operation_id is null then
    raise exception 'A valid payment operation ID is required';
  end if;
  if requested_amount is null or requested_amount<=0 or normalized_amount<=0 then
    raise exception 'Payment amount must be positive';
  end if;

  if normalized_method='credit_sale' then
    raise exception 'Credit Sale is not a received payment. Record the actual payment method when money is received.';
  elsif normalized_method in ('cash','cash_on_delivery') then
    normalized_channel:='cash';
  elsif normalized_method='mobile_banking' then
    normalized_channel:='mfs';
  elsif normalized_method in ('bank_transfer','cheque','card') then
    normalized_channel:='bank';
  elsif normalized_method in ('advance_payment','other') then
    if normalized_channel not in ('cash','bank','mfs') then
      raise exception 'Select the actual Cash, Bank, or MFS receiving channel';
    end if;
  else
    raise exception 'Invalid received payment method';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_operation_id::text,0)
  );
  select * into existing_payment
  from public.sale_payments
  where operation_id=requested_operation_id;
  if existing_payment.id is not null then
    if existing_payment.received_by is distinct from actor_profile_id
      or existing_payment.order_id is distinct from requested_order_id
      or round(existing_payment.amount,2) is distinct from normalized_amount
      or existing_payment.payment_date is distinct from effective_date
      or existing_payment.method is distinct from normalized_method
      or existing_payment.receipt_channel is distinct from normalized_channel
      or existing_payment.reference_number is distinct from normalized_reference
      or existing_payment.internal_note is distinct from normalized_note
    then
      raise exception 'This payment operation ID was already used with different details';
    end if;
    if not exists(
      select 1 from public.cashbook_entries
      where sale_payment_id=existing_payment.id
    ) then
      raise exception 'This payment operation is missing its linked Accounting transaction';
    end if;
    return existing_payment.id;
  end if;

  select * into sale
  from public.sales_orders
  where id=requested_order_id
  for update;
  if sale.id is null or sale.status='cancelled' then
    raise exception 'Sale is not eligible for payment';
  end if;

  perform public.lock_cashbook_timeline();
  perform public.assert_cashbook_predecessor_closed(effective_date);
  insert into public.cashbook_days(business_date,opening_balance,updated_by)
  values(
    effective_date,
    public.cashbook_opening_balance_for(effective_date),
    actor_profile_id
  )
  on conflict(business_date) do nothing;
  select is_closed into day_is_closed
  from public.cashbook_days
  where business_date=effective_date
  for update;
  if day_is_closed then
    raise exception 'This cashbook date is already closed. Use the authorized accounting correction process.';
  end if;

  select * into sales_description
  from public.cashbook_descriptions
  where lower(trim(name))='sales'
    and transaction_type='income'
    and is_active=true
  order by created_at
  limit 1;
  if sales_description.id is null then
    raise exception 'The active Sales income description is unavailable in Accounting';
  end if;

  select id into payment_account_id
  from public.accounting_accounts
  where code=case normalized_channel
      when 'cash' then '1010'
      when 'bank' then '1020'
      else '1030'
    end
    and currency='BDT'
    and is_active=true;
  select id into revenue_account_id
  from public.accounting_accounts
  where code='4000' and currency='BDT' and is_active=true;
  if payment_account_id is null or revenue_account_id is null then
    raise exception 'Required Sales payment accounting account is unavailable';
  end if;

  insert into public.sale_payments(
    id,order_id,amount,payment_date,method,reference_number,internal_note,
    received_by,operation_id,receipt_channel
  ) values(
    payment_id,sale.id,normalized_amount,effective_date,normalized_method,
    normalized_reference,normalized_note,actor_profile_id,
    requested_operation_id,normalized_channel
  );
  perform public.refresh_sale_payment_totals(sale.id);

  select document_number into invoice_number
  from public.sale_documents
  where order_id=sale.id
    and document_type='invoice'
    and status='generated'
  order by revision_number desc,created_at desc
  limit 1;
  select coalesce(
    nullif(trim(profile.full_name),''),
    nullif(trim(profile.company_name),''),
    nullif(trim(profile.email),''),
    'Customer'
  ) into customer_name
  from public.profiles profile
  where profile.id=sale.customer_profile_id;
  entry_reference:=concat_ws(
    ' — ',
    'Sales Payment',
    sale.order_number,
    invoice_number,
    customer_name,
    case when normalized_reference is null then null else 'Ref: '||normalized_reference end
  );

  if effective_date=(pg_catalog.clock_timestamp() at time zone 'Asia/Dhaka')::date then
    entry_time:=pg_catalog.clock_timestamp();
  else
    entry_time:=(effective_date::timestamp+time '12:00') at time zone 'Asia/Dhaka';
  end if;

  insert into public.journal_entries(
    id,entry_number,entry_date,description,reference_type,reference_id,status,
    currency,created_by,posted_by,posted_at
  ) values(
    journal_id,
    public.next_journal_entry_number(),
    effective_date,
    left(entry_reference,500),
    'payment',
    payment_id,
    'posted',
    'BDT',
    actor_profile_id,
    actor_profile_id,
    pg_catalog.clock_timestamp()
  );
  insert into public.journal_lines(
    journal_entry_id,account_id,description,debit,credit
  ) values
    (journal_id,payment_account_id,left(entry_reference,500),normalized_amount,0),
    (journal_id,revenue_account_id,left(entry_reference,500),0,normalized_amount);

  insert into public.cashbook_entries(
    id,description_id,transaction_type,amount,payment_method,transaction_at,
    business_date,journal_entry_id,created_by,remark,
    sale_payment_id,source_payment_method
  ) values(
    cashbook_id,
    sales_description.id,
    'income',
    normalized_amount,
    normalized_channel,
    entry_time,
    effective_date,
    journal_id,
    actor_profile_id,
    left(entry_reference,240),
    payment_id,
    normalized_method
  );

  select role into actor_role
  from public.profiles
  where id=actor_profile_id;
  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,
    description,new_values
  ) values(
    actor_profile_id,
    actor_role,
    sale.customer_profile_id,
    'sales.payment_accounting_posted',
    'sales',
    'sale_payment',
    payment_id::text,
    'Sales payment recorded and posted to Accounting.',
    jsonb_build_object(
      'operation_id',requested_operation_id,
      'sales_order_id',sale.id,
      'cashbook_entry_id',cashbook_id,
      'journal_entry_id',journal_id,
      'amount',normalized_amount,
      'payment_date',effective_date,
      'payment_method',normalized_method,
      'receipt_channel',normalized_channel
    )
  );
  return payment_id;
end $$;

create or replace function public.record_sale_payment(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_amount numeric,
  requested_date date,
  requested_method text,
  requested_reference text,
  requested_note text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  return public.record_sale_payment(
    actor_profile_id,
    requested_order_id,
    requested_amount,
    requested_date,
    requested_method,
    requested_reference,
    requested_note,
    gen_random_uuid(),
    null
  );
end $$;

create or replace function public.prevent_received_payment_sale_cancellation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='cancelled'
    and old.status is distinct from new.status
    and exists(
      select 1 from public.sale_payments
      where order_id=new.id and status='received'
    )
  then
    raise exception 'This sale has received payment and cannot be cancelled directly. The recorded payment must first be reversed/refunded through an authorized payment reversal process.';
  end if;
  return new;
end $$;

drop trigger if exists prevent_received_payment_sale_cancellation
  on public.sales_orders;
create trigger prevent_received_payment_sale_cancellation
before update of status on public.sales_orders
for each row
execute function public.prevent_received_payment_sale_cancellation();

revoke all on function public.record_sale_payment(
  uuid,uuid,numeric,date,text,text,text,uuid,text
) from public,anon,authenticated;
revoke all on function public.record_sale_payment(
  uuid,uuid,numeric,date,text,text,text
) from public,anon,authenticated;
revoke all on function public.prevent_received_payment_sale_cancellation()
  from public,anon,authenticated;
grant execute on function public.record_sale_payment(
  uuid,uuid,numeric,date,text,text,text,uuid,text
) to service_role;
grant execute on function public.record_sale_payment(
  uuid,uuid,numeric,date,text,text,text
) to service_role;

grant select on public.sale_payments,public.cashbook_entries to authenticated,service_role;
grant all on public.sale_payments,public.cashbook_entries to service_role;
