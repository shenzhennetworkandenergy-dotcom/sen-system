-- SEN minimal Sales module. Additive only: existing Phase 2 sales_orders remain the source of truth.

alter table public.sales_orders add column if not exists billing_address_id uuid references public.customer_addresses(id) on delete set null;
alter table public.sales_orders add column if not exists billing_address_snapshot jsonb;
alter table public.sales_orders add column if not exists sales_source text not null default 'direct_office'
  check (sales_source in ('website','facebook','whatsapp','phone','email','direct_office','existing_customer','sales_representative','referral','other'));
alter table public.sales_orders add column if not exists expected_delivery_date date;
alter table public.sales_orders add column if not exists service_amount numeric(18,4) not null default 0 check(service_amount >= 0);
alter table public.sales_orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid','partially_paid','paid','overpaid','refunded'));
alter table public.sales_orders add column if not exists paid_amount numeric(18,4) not null default 0 check(paid_amount >= 0);
alter table public.sales_orders add column if not exists refunded_amount numeric(18,4) not null default 0 check(refunded_amount >= 0);
alter table public.sales_orders add column if not exists completed_at timestamptz;
create index if not exists sales_orders_payment_status_idx on public.sales_orders(payment_status,updated_at desc);
create index if not exists sales_orders_created_by_idx on public.sales_orders(created_by,created_at desc);

create table if not exists public.sale_price_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  order_item_id uuid references public.sales_order_items(id) on delete restrict,
  adjustment_type text not null check(adjustment_type in ('manual_unit_price','percentage_discount','fixed_line_discount','order_discount','shipping_charge','service_charge','tax')),
  previous_value numeric(18,4),
  new_value numeric(18,4) not null,
  reason text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists sale_price_adjustments_order_idx on public.sale_price_adjustments(order_id,created_at desc);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  amount numeric(18,4) not null check(amount > 0),
  payment_date date not null default current_date,
  method text not null check(method in ('cash','bank_transfer','cheque','mobile_banking','card','credit_sale','advance_payment','cash_on_delivery','other')),
  reference_number text,
  proof_storage_path text,
  internal_note text,
  status text not null default 'received' check(status in ('received','refunded','voided')),
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_order_idx on public.sale_payments(order_id,created_at desc);

create table if not exists public.sale_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  document_number text not null unique,
  document_type text not null check(document_type in ('invoice','delivery_challan')),
  status text not null default 'generated' check(status in ('generated','voided')),
  snapshot jsonb not null,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists sale_documents_order_idx on public.sale_documents(order_id,created_at desc);

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order
from public.app_modules m cross join (values
 ('sales.view_all','View all sales','View sales created by all employees.','view_all',true,15),
 ('sales.view_own','View own sales','View sales created by the current employee.','view_own',false,20),
 ('sales.change_price','Override sale price','Set a selling price different from the product price.','change_price',true,70),
 ('sales.apply_discount','Apply sale discounts','Apply line or order discounts.','apply_discount',true,80),
 ('sales.reserve_stock','Reserve sale stock','Confirm a sale and reserve inventory atomically.','reserve_stock',true,90),
 ('sales.allocate_serials','Allocate sale serials','Assign exact serialized units to a sale.','allocate_serials',true,100),
 ('sales.record_payment','Record sale payments','Record customer payments and references.','record_payment',true,110),
 ('sales.create_invoice','Generate invoices','Generate immutable invoice snapshots.','create_invoice',true,120),
 ('sales.create_delivery_challan','Generate delivery challans','Generate immutable delivery challan snapshots.','create_delivery_challan',true,130)
) as v(key,name,description,action,sensitive,sort_order)
where m.key='sales'
on conflict(key) do update set name=excluded.name,description=excluded.description,is_active=true;
update public.app_modules set is_implemented=true where key='sales';

-- Preserve the existing order RPCs while allowing equivalent Sales permissions.
-- This is intentionally centralized so browser actions still cannot bypass validation.
create or replace function public.assert_actor_permission(actor_profile_id uuid,requested_permission text) returns void
language plpgsql stable security definer set search_path='' as $$
declare sales_alias text;
begin
  if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then raise exception 'Inactive actor'; end if;
  sales_alias:=case requested_permission
    when 'orders.create' then 'sales.create'
    when 'orders.edit' then 'sales.edit'
    when 'orders.confirm' then 'sales.reserve_stock'
    when 'orders.allocate' then 'sales.allocate_serials'
    when 'orders.pack' then 'sales.edit'
    when 'orders.cancel' then 'sales.cancel'
    else null
  end;
  if not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key=requested_permission or (sales_alias is not null and e.permission_key=sales_alias)
  ) then raise exception 'Permission denied'; end if;
end $$;

-- Wrap the existing order creator so Sales metadata and its price-change
-- history are committed together rather than leaving a partial draft.
create or replace function public.create_minimal_sale(
  actor_profile_id uuid, requested_customer_id uuid, requested_address_id uuid,
  requested_address jsonb, requested_billing_address_id uuid, requested_billing_address jsonb,
  requested_warehouse_id uuid, requested_source text, requested_expected_delivery_date date,
  requested_discount numeric, requested_shipping numeric, requested_service numeric,
  requested_tax numeric, requested_internal_notes text, requested_customer_notes text,
  requested_items jsonb, requested_adjustments jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare created_order_id uuid; billing_snapshot jsonb; entry jsonb;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.create');
  if requested_source not in ('website','facebook','whatsapp','phone','email','direct_office','existing_customer','sales_representative','referral','other') then raise exception 'Invalid sales source'; end if;
  if requested_service < 0 then raise exception 'Invalid service amount'; end if;
  if requested_billing_address_id is not null then
    select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'alternate_phone',alternate_phone,'address_line_1',address_line_1,'address_line_2',address_line_2,'area',area,'city',city,'region',region,'postal_code',postal_code,'country_code',country_code,'delivery_instructions',delivery_instructions,'latitude',latitude,'longitude',longitude,'map_label',map_label)
    into billing_snapshot from public.customer_addresses
    where id=requested_billing_address_id and profile_id=requested_customer_id;
    if billing_snapshot is null then raise exception 'Billing address not found'; end if;
  end if;
  billing_snapshot:=coalesce(billing_snapshot,requested_billing_address);
  created_order_id:=public.create_sales_order(actor_profile_id,requested_customer_id,requested_address_id,requested_address,requested_warehouse_id,'BDT',requested_discount,requested_shipping,requested_tax,requested_internal_notes,requested_customer_notes,requested_items);
  update public.sales_orders set billing_address_id=requested_billing_address_id,billing_address_snapshot=billing_snapshot,sales_source=requested_source,expected_delivery_date=requested_expected_delivery_date,service_amount=greatest(coalesce(requested_service,0),0),total_amount=total_amount+greatest(coalesce(requested_service,0),0),updated_at=now() where id=created_order_id;
  for entry in select * from jsonb_array_elements(coalesce(requested_adjustments,'[]'::jsonb)) loop
    if coalesce(trim(entry->>'reason'),'')='' then raise exception 'Price adjustment reason required'; end if;
    insert into public.sale_price_adjustments(order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id)
    values(created_order_id,nullif(entry->>'order_item_id','')::uuid,entry->>'adjustment_type',nullif(entry->>'previous_value','')::numeric,(entry->>'new_value')::numeric,left(entry->>'reason',500),actor_profile_id);
  end loop;
  return created_order_id;
end $$;

alter table public.sale_price_adjustments enable row level security;
alter table public.sale_payments enable row level security;
alter table public.sale_documents enable row level security;

create policy "staff read sale price adjustments" on public.sale_price_adjustments for select to authenticated
using(public.current_user_has_permission('sales.view') or public.current_user_has_permission('sales.view_all') or exists(select 1 from public.sales_orders o where o.id=order_id and o.created_by=auth.uid() and public.current_user_has_permission('sales.view_own')));
create policy "staff read sale payments" on public.sale_payments for select to authenticated
using(public.current_user_has_permission('sales.view') or public.current_user_has_permission('sales.view_all') or exists(select 1 from public.sales_orders o where o.id=order_id and o.created_by=auth.uid() and public.current_user_has_permission('sales.view_own')));
create policy "customers read own sale payments" on public.sale_payments for select to authenticated
using(exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "staff read sale documents" on public.sale_documents for select to authenticated
using(public.current_user_has_permission('sales.view') or public.current_user_has_permission('sales.view_all') or exists(select 1 from public.sales_orders o where o.id=order_id and o.created_by=auth.uid() and public.current_user_has_permission('sales.view_own')));
create policy "customers read own sale documents" on public.sale_documents for select to authenticated
using(exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));

grant select on public.sale_price_adjustments,public.sale_payments,public.sale_documents to authenticated;
grant all on public.sale_price_adjustments,public.sale_payments,public.sale_documents to service_role;

create or replace function public.refresh_sale_payment_totals(requested_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare total numeric; paid numeric; refunded numeric; next_status text;
begin
  select total_amount into total from public.sales_orders where id=requested_order_id for update;
  if total is null then raise exception 'Sale not found'; end if;
  select coalesce(sum(amount) filter(where status='received'),0),coalesce(sum(amount) filter(where status='refunded'),0)
    into paid,refunded from public.sale_payments where order_id=requested_order_id;
  paid:=greatest(paid-refunded,0);
  next_status:=case when refunded>0 and paid=0 then 'refunded' when paid=0 then 'unpaid' when paid<total then 'partially_paid' when paid=total then 'paid' else 'overpaid' end;
  update public.sales_orders set paid_amount=paid,refunded_amount=refunded,payment_status=next_status,updated_at=now() where id=requested_order_id;
end $$;

create or replace function public.record_sale_payment(actor_profile_id uuid,requested_order_id uuid,requested_amount numeric,requested_date date,requested_method text,requested_reference text,requested_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare payment_id uuid:=gen_random_uuid(); o public.sales_orders%rowtype;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.record_payment');
  select * into o from public.sales_orders where id=requested_order_id for update;
  if o.id is null or o.status='cancelled' then raise exception 'Sale is not eligible for payment'; end if;
  if requested_amount<=0 then raise exception 'Payment amount must be positive'; end if;
  if requested_method not in ('cash','bank_transfer','cheque','mobile_banking','card','credit_sale','advance_payment','cash_on_delivery','other') then raise exception 'Invalid payment method'; end if;
  insert into public.sale_payments(id,order_id,amount,payment_date,method,reference_number,internal_note,received_by)
  values(payment_id,o.id,round(requested_amount,4),coalesce(requested_date,current_date),requested_method,nullif(left(requested_reference,200),''),nullif(left(requested_note,1000),''),actor_profile_id);
  perform public.refresh_sale_payment_totals(o.id);
  return payment_id;
end $$;

create or replace function public.generate_sale_document(actor_profile_id uuid,requested_order_id uuid,requested_type text)
returns uuid language plpgsql security definer set search_path='' as $$
declare document_id uuid:=gen_random_uuid(); o public.sales_orders%rowtype; permission_key text; number text; document_snapshot jsonb;
begin
  permission_key:=case when requested_type='invoice' then 'sales.create_invoice' when requested_type='delivery_challan' then 'sales.create_delivery_challan' else null end;
  if permission_key is null then raise exception 'Invalid document type'; end if;
  perform public.assert_actor_permission(actor_profile_id,permission_key);
  select * into o from public.sales_orders where id=requested_order_id;
  if o.id is null or o.status='cancelled' then raise exception 'Sale is not eligible for document generation'; end if;
  number:=case when requested_type='invoice' then 'SEN-INV-' else 'SEN-DC-' end||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(o),
    'customer',(select to_jsonb(p) - 'password' from public.profiles p where p.id=o.customer_profile_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) from public.sales_order_items i where i.order_id=o.id),
    'serials',(select coalesce(jsonb_agg(jsonb_build_object('sen_serial',s.sen_serial,'manufacturer_serial',s.manufacturer_serial,'product_id',s.product_id)),'[]'::jsonb) from public.order_serial_allocations a join public.serial_numbers s on s.id=a.serial_number_id where a.order_id=o.id and a.status not in('released','cancelled')),
    'generated_at',now()
  ) into document_snapshot;
  insert into public.sale_documents(id,order_id,document_number,document_type,snapshot,generated_by) values(document_id,o.id,number,requested_type,document_snapshot,actor_profile_id);
  return document_id;
end $$;

revoke all on function public.refresh_sale_payment_totals(uuid) from public,anon,authenticated;
revoke all on function public.create_minimal_sale(uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.record_sale_payment(uuid,uuid,numeric,date,text,text,text) from public,anon,authenticated;
revoke all on function public.generate_sale_document(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_minimal_sale(uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,text,text,jsonb,jsonb) to service_role;
grant execute on function public.record_sale_payment(uuid,uuid,numeric,date,text,text,text) to service_role;
grant execute on function public.generate_sale_document(uuid,uuid,text) to service_role;
