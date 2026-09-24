-- Immutable, optional Sales money receipts.  This migration deliberately has no
-- accounting, inventory, shipment, invoice, or payment-recording side effects.

create sequence if not exists public.sale_money_receipt_number_seq;

create or replace function public.next_sale_money_receipt_number()
returns text
language sql
volatile
security definer
set search_path=''
as $$
  select 'SEN-MR-' || to_char(timezone('Asia/Dhaka',pg_catalog.clock_timestamp()),'YYYYMMDD') || '-' ||
    pg_catalog.lpad(nextval('public.sale_money_receipt_number_seq')::text,5,'0');
$$;

create or replace function public.sale_money_receipt_amount_in_words(
  requested_amount numeric,
  requested_currency text default 'BDT'
)
returns text
language plpgsql
immutable
strict
security definer
set search_path=''
as $$
declare
  amount_rounded numeric := round(requested_amount,2);
  amount_abs numeric := abs(amount_rounded);
  whole_amount bigint := trunc(amount_abs);
  poisha integer := round((amount_abs - trunc(amount_abs)) * 100)::integer;
  chunk integer;
  remainder integer;
  scale_index integer := 1;
  chunk_words text;
  result_words text := '';
  currency_code text := upper(nullif(trim(requested_currency),''));
  currency_label text;
  fractional_label text;
  units text[] := array['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  tens text[] := array['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  scales text[] := array['','Thousand','Million','Billion','Trillion'];
begin
  currency_code := coalesce(currency_code,'XXX');
  if currency_code = 'BDT' then
    currency_label := 'Bangladeshi Taka';
    fractional_label := 'Poisha';
  else
    currency_label := currency_code;
    fractional_label := 'Cents';
  end if;

  if poisha >= 100 then
    whole_amount := whole_amount + poisha / 100;
    poisha := poisha % 100;
  end if;

  if whole_amount = 0 then
    result_words := 'Zero';
  else
    while whole_amount > 0 loop
      chunk := (whole_amount % 1000)::integer;
      if chunk > 0 then
        chunk_words := '';
        if chunk >= 100 then
          chunk_words := units[(chunk / 100) + 1] || ' Hundred';
          remainder := chunk % 100;
        else
          remainder := chunk;
        end if;
        if remainder > 0 then
          if chunk_words <> '' then chunk_words := chunk_words || ' '; end if;
          if remainder < 20 then
            chunk_words := chunk_words || units[remainder + 1];
          else
            chunk_words := chunk_words || tens[(remainder / 10) + 1];
            if remainder % 10 > 0 then chunk_words := chunk_words || ' ' || units[(remainder % 10) + 1]; end if;
          end if;
        end if;
        if scale_index > 1 then chunk_words := chunk_words || ' ' || scales[scale_index]; end if;
        result_words := case when result_words='' then chunk_words else chunk_words || ' ' || result_words end;
      end if;
      whole_amount := whole_amount / 1000;
      scale_index := scale_index + 1;
    end loop;
  end if;
  if amount_rounded < 0 then result_words := 'Minus ' || result_words; end if;
  result_words := currency_label || ' ' || result_words;
  if poisha > 0 then
    chunk_words := '';
    if poisha < 20 then chunk_words := units[poisha + 1];
    else
      chunk_words := tens[(poisha / 10) + 1];
      if poisha % 10 > 0 then chunk_words := chunk_words || ' ' || units[(poisha % 10) + 1]; end if;
    end if;
    result_words := result_words || ' and ' || chunk_words || ' ' || fractional_label;
  end if;
  return result_words || ' Only';
end
$$;

create table if not exists public.sale_money_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.sale_payments(id) on delete restrict,
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  receipt_number text not null unique,
  receipt_date date not null,
  snapshot jsonb not null,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(snapshot)='object')
);
create index if not exists sale_money_receipts_order_idx on public.sale_money_receipts(order_id,created_at desc);

-- Build every authoritative receipt field from the saved Sale and Payment.
-- The generator and the insert trigger both use this function so a client
-- cannot provide a second source of truth for financial or customer data.
create or replace function public.build_sale_money_receipt_snapshot(
  requested_payment_id uuid,
  requested_order_id uuid,
  requested_receipt_number text,
  requested_receipt_date date,
  requested_generated_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  payment public.sale_payments%rowtype;
  customer public.profiles%rowtype;
  received_by public.profiles%rowtype;
  latest_invoice_number text;
  previously_paid numeric := 0;
  this_payment numeric;
  total_paid numeric;
  remaining numeric;
  history_status text;
begin
  if requested_payment_id is null or requested_order_id is null then
    raise exception 'Payment and sale are required';
  end if;
  if pg_catalog.btrim(coalesce(requested_receipt_number,'')) = '' then
    raise exception 'Receipt number is required';
  end if;
  if requested_receipt_number !~ '^SEN-MR-[0-9]{8}-[0-9]{5,}$' then
    raise exception 'Receipt number is invalid';
  end if;
  if requested_receipt_date is null or requested_generated_at is null then
    raise exception 'Receipt date and generated time are required';
  end if;

  select * into payment
  from public.sale_payments
  where id=requested_payment_id;
  if payment.id is null then raise exception 'Payment not found'; end if;
  if payment.order_id is distinct from requested_order_id then
    raise exception 'Payment does not belong to the sale';
  end if;
  if payment.status <> 'received' then
    raise exception 'Only received payments can have a money receipt';
  end if;
  if payment.payment_date is distinct from requested_receipt_date then
    raise exception 'Receipt date must match the saved payment date';
  end if;

  select * into sale
  from public.sales_orders
  where id=requested_order_id;
  if sale.id is null then raise exception 'Sale not found'; end if;

  select * into customer
  from public.profiles
  where id=sale.customer_profile_id;
  if customer.id is null then raise exception 'Customer not found'; end if;

  select * into received_by
  from public.profiles
  where id=payment.received_by;
  if received_by.id is null then raise exception 'Receiving profile not found'; end if;

  select document_number into latest_invoice_number
  from public.sale_documents
  where order_id=sale.id and document_type='invoice' and status='generated'
  order by revision_number desc,created_at desc limit 1;

  this_payment := payment.amount;
  select coalesce(sum(history.amount),0) into previously_paid
  from (
    select p.amount
    from public.sale_payments p
    where p.order_id=sale.id and p.status='received'
      and (p.created_at,p.id) < (payment.created_at,payment.id)
    order by created_at,id
  ) history;
  total_paid := previously_paid + this_payment;
  remaining := greatest(sale.total_amount-total_paid,0);
  history_status := case when total_paid >= sale.total_amount then 'FULL PAYMENT' else 'PARTIAL PAYMENT' end;

  return jsonb_build_object(
    'receipt_number',requested_receipt_number,
    'receipt_date',requested_receipt_date,
    'generated_at',requested_generated_at,
    'sale',jsonb_build_object('id',sale.id,'order_number',sale.order_number,'total_amount',sale.total_amount,'currency',sale.currency),
    'customer',jsonb_build_object('id',customer.id,'full_name',customer.full_name,'company_name',customer.company_name,'email',customer.email,'phone',customer.phone),
    'contact',jsonb_build_object('full_name',customer.full_name,'email',customer.email,'phone',customer.phone),
    'address',coalesce(nullif(sale.billing_address_snapshot,'{}'::jsonb),sale.shipping_address_snapshot,'{}'::jsonb),
    'payment',jsonb_build_object('id',payment.id,'amount',payment.amount,'payment_date',payment.payment_date,'method',payment.method,'reference_number',payment.reference_number,'status',payment.status,'received_by',jsonb_build_object('id',received_by.id,'full_name',received_by.full_name)),
    'invoice_number',latest_invoice_number,
    'summary',jsonb_build_object('previously_paid',previously_paid,'this_payment',this_payment,'total_paid',total_paid,'remaining',remaining,'status',history_status),
    'amount_in_words',public.sale_money_receipt_amount_in_words(this_payment,sale.currency)
  );
end
$$;

create or replace function public.reject_sale_money_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Sales money receipts are immutable';
end
$$;

create or replace function public.validate_sale_money_receipt_insert()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  generated_at timestamptz;
  expected_snapshot jsonb;
  generator_owner text;
begin
  -- Keep the insert path closed even if a generated/native schema later
  -- re-grants table INSERT to an API role.  The only approved writer is the
  -- security-definer generator below; a direct service_role INSERT is still
  -- rejected by this invoker trigger before snapshot validation.
  generator_owner := pg_catalog.pg_get_userbyid(
    (
      select p.proowner
      from pg_catalog.pg_proc p
      where p.oid=pg_catalog.to_regprocedure('public.generate_sale_money_receipt(uuid,uuid)')
    )
  );
  if generator_owner is null or current_user is distinct from generator_owner then
    raise exception 'Money receipts may only be created by the controlled generator';
  end if;

  if new.snapshot is null or jsonb_typeof(new.snapshot) <> 'object' then
    raise exception 'Money receipt snapshot must be an object';
  end if;

  begin
    generated_at := nullif(new.snapshot->>'generated_at','')::timestamptz;
  exception when others then
    raise exception 'Money receipt generated time is invalid';
  end;

  expected_snapshot := public.build_sale_money_receipt_snapshot(
    new.payment_id,
    new.order_id,
    new.receipt_number,
    new.receipt_date,
    generated_at
  );
  if new.snapshot is distinct from expected_snapshot then
    raise exception 'Money receipt snapshot must be generated from saved sale payment';
  end if;
  return new;
end
$$;

drop trigger if exists reject_sale_money_receipt_mutation on public.sale_money_receipts;
create trigger reject_sale_money_receipt_mutation
before update or delete on public.sale_money_receipts
for each row execute function public.reject_sale_money_receipt_mutation();
drop trigger if exists validate_sale_money_receipt_insert on public.sale_money_receipts;
create trigger validate_sale_money_receipt_insert
before insert on public.sale_money_receipts
for each row execute function public.validate_sale_money_receipt_insert();

-- Only the active, sensitive permission is seeded; permission templates are untouched.
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order,is_active)
select m.id,'sales.money_receipt','Generate sales money receipts','Generate an immutable receipt for a received sale payment.','money_receipt',true,140,true
from public.app_modules m
where m.key='sales'
on conflict(key) do update set
  module_id=excluded.module_id,name=excluded.name,description=excluded.description,
  action=excluded.action,is_sensitive=true,is_active=true,sort_order=excluded.sort_order;

alter table public.sale_money_receipts enable row level security;

-- Resolve the parent-sale scope without consulting the parent table's RLS
-- policy.  The normal sales_orders policy intentionally exposes only broad
-- Sales access; this isolated security-definer lookup also supports an
-- employee who has the narrower sales.view_own permission.  It accepts only
-- the current authenticated identity, so callers cannot probe another actor
-- by passing an arbitrary profile id.
create or replace function public.can_current_user_view_sale_money_receipt(
  requested_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.sales_orders o
    where o.id=requested_order_id
      and (
        public.current_user_has_permission('sales.view')
        or public.current_user_has_permission('sales.view_all')
        or (
          o.created_by=auth.uid()
          and public.current_user_has_permission('sales.view_own')
        )
      )
  );
$$;

drop policy if exists "staff read sale money receipts" on public.sale_money_receipts;
create policy "staff read sale money receipts" on public.sale_money_receipts
for select to authenticated
using (
  public.current_user_has_permission('sales.money_receipt')
  and (
    public.can_current_user_view_sale_money_receipt(order_id)
  )
);

revoke all privileges on table public.sale_money_receipts from public,anon,authenticated,service_role;
grant select on public.sale_money_receipts to authenticated,service_role;
revoke all on function public.can_current_user_view_sale_money_receipt(uuid) from public,anon;
grant execute on function public.can_current_user_view_sale_money_receipt(uuid) to authenticated,service_role;

create or replace function public.generate_sale_money_receipt(
  actor_profile_id uuid,
  requested_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  payment public.sale_payments%rowtype;
  existing_id uuid;
  receipt_id uuid := gen_random_uuid();
  receipt_number text;
  snapshot jsonb;
  inserted boolean := false;
  actor_role public.account_role;
  payment_order_id uuid;
begin
  if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then
    raise exception 'Inactive actor';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'sales.money_receipt');

  -- Resolve and lock the parent sale first, then lock the payment row.
  select order_id into payment_order_id from public.sale_payments where id=requested_payment_id;
  if payment_order_id is null then raise exception 'Payment not found'; end if;
  select * into sale from public.sales_orders where id=payment_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  select * into payment from public.sale_payments where id=requested_payment_id for update;
  if payment.order_id is distinct from sale.id then raise exception 'Payment does not belong to the sale'; end if;

  if not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key in ('sales.view','sales.view_all')
  ) and not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key='sales.view_own' and sale.created_by=actor_profile_id
  ) then
    raise exception 'Sales view permission required';
  end if;

  -- An already-issued receipt is idempotent, including after a later refund.
  select id into existing_id from public.sale_money_receipts where payment_id=payment.id;
  if existing_id is not null then return existing_id; end if;
  if payment.status <> 'received' then raise exception 'Only received payments can have a money receipt'; end if;

  receipt_number := public.next_sale_money_receipt_number();
  snapshot := public.build_sale_money_receipt_snapshot(
    payment.id,
    sale.id,
    receipt_number,
    payment.payment_date,
    pg_catalog.clock_timestamp()
  );

  insert into public.sale_money_receipts(id,payment_id,order_id,receipt_number,receipt_date,snapshot,generated_by)
  values(receipt_id,payment.id,sale.id,receipt_number,payment.payment_date,snapshot,actor_profile_id)
  on conflict (payment_id) do nothing
  returning id into existing_id;
  if existing_id is null then
    select id into existing_id from public.sale_money_receipts where payment_id=payment.id;
  else
    inserted := true;
  end if;

  if inserted then
    select role into actor_role from public.profiles where id=actor_profile_id;
    insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_role,sale.customer_profile_id,'sales.money_receipt_generated','sales','sale_money_receipt',existing_id::text,'Sales money receipt generated.',jsonb_build_object('receipt_id',existing_id,'payment_id',payment.id,'order_id',sale.id,'receipt_number',receipt_number));
  end if;
  return existing_id;
end
$$;

revoke all on function public.generate_sale_money_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.generate_sale_money_receipt(uuid,uuid) to service_role;
revoke all on function public.build_sale_money_receipt_snapshot(uuid,uuid,text,date,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.next_sale_money_receipt_number() from public,anon,authenticated,service_role;
revoke all on function public.sale_money_receipt_amount_in_words(numeric,text) from public,anon,authenticated,service_role;
revoke all on sequence public.sale_money_receipt_number_seq from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
