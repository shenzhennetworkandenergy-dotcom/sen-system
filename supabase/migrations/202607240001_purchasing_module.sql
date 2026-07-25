-- SEN Purchasing module.
-- Additive: supplier master data, purchase orders, approvals and atomic stock receipts.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  supplier_type text not null default 'distributor'
    check (supplier_type in ('manufacturer','distributor','reseller','service_provider','logistics','other')),
  status text not null default 'active' check (status in ('active','on_hold','archived')),
  contact_person text,
  email text,
  phone text,
  website_url text,
  country_code text not null,
  country_name text not null,
  address text,
  tax_registration text,
  payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 365),
  default_currency char(3) not null default 'BDT',
  lead_time_days integer not null default 0 check (lead_time_days between 0 and 3650),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.purchase_order_number_seq;
create sequence public.purchase_receipt_number_seq;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  destination_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','ordered','partially_received','received','cancelled','closed')),
  currency char(3) not null default 'BDT',
  order_date date not null default current_date,
  expected_delivery_date date,
  supplier_reference text,
  payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 365),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partially_paid','paid','not_applicable')),
  subtotal numeric(18,4) not null default 0 check (subtotal >= 0),
  discount_amount numeric(18,4) not null default 0 check (discount_amount >= 0),
  shipping_amount numeric(18,4) not null default 0 check (shipping_amount >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  other_amount numeric(18,4) not null default 0 check (other_amount >= 0),
  total_amount numeric(18,4) not null default 0 check (total_amount >= 0),
  internal_notes text,
  supplier_notes text,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  ordered_at timestamptz,
  ordered_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_delivery_date is null or expected_delivery_date >= order_date),
  check (total_amount = greatest(subtotal - discount_amount + shipping_amount + tax_amount + other_amount, 0))
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  description text,
  quantity_ordered numeric(18,4) not null check (quantity_ordered > 0),
  quantity_received numeric(18,4) not null default 0 check (quantity_received >= 0),
  quantity_rejected numeric(18,4) not null default 0 check (quantity_rejected >= 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  discount_amount numeric(18,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  line_total numeric(18,4) generated always as
    (greatest((quantity_ordered * unit_cost) - discount_amount + tax_amount, 0)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_received + quantity_rejected <= quantity_ordered)
);

create table public.purchase_order_status_events (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  previous_status text,
  new_status text not null,
  note text,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  inventory_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  receipt_date date not null default current_date,
  supplier_delivery_reference text,
  supplier_invoice_reference text,
  status text not null default 'confirmed' check (status in ('confirmed','reversed')),
  notes text,
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  quantity_received numeric(18,4) not null check (quantity_received > 0),
  serial_generation_batch_id uuid references public.serial_generation_batches(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index suppliers_status_name_idx on public.suppliers(status,name);
create index purchase_orders_status_created_idx on public.purchase_orders(status,created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id,created_at desc);
create index purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index purchase_receipts_order_idx on public.purchase_receipts(purchase_order_id,created_at desc);
create index purchase_status_events_order_idx on public.purchase_order_status_events(purchase_order_id,created_at desc);

create or replace function public.purchase_touch_updated_at() returns trigger
language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end $$;

create trigger suppliers_touch_updated_at before update on public.suppliers
for each row execute function public.purchase_touch_updated_at();
create trigger purchase_orders_touch_updated_at before update on public.purchase_orders
for each row execute function public.purchase_touch_updated_at();
create trigger purchase_order_items_touch_updated_at before update on public.purchase_order_items
for each row execute function public.purchase_touch_updated_at();

create or replace function public.next_purchase_order_number() returns text
language sql volatile security definer set search_path='' as $$
  select 'PO-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.purchase_order_number_seq')::text,5,'0');
$$;

create or replace function public.next_purchase_receipt_number() returns text
language sql volatile security definer set search_path='' as $$
  select 'PR-' || to_char(timezone('Asia/Dhaka',now()),'YYYYMM') || '-' ||
    lpad(nextval('public.purchase_receipt_number_seq')::text,5,'0');
$$;

create or replace function public.refresh_purchase_order_totals(requested_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item_subtotal numeric;
begin
  select coalesce(sum(line_total),0) into item_subtotal
  from public.purchase_order_items where purchase_order_id=requested_order_id;
  update public.purchase_orders
  set subtotal=item_subtotal,
      total_amount=greatest(item_subtotal-discount_amount+shipping_amount+tax_amount+other_amount,0),
      updated_at=now()
  where id=requested_order_id;
end $$;

create or replace function public.create_purchase_order(
  actor_profile_id uuid, requested_supplier_id uuid, requested_warehouse_id uuid,
  requested_currency text, requested_order_date date, requested_expected_date date,
  requested_supplier_reference text, requested_payment_terms integer,
  requested_discount numeric, requested_shipping numeric, requested_tax numeric, requested_other numeric,
  requested_internal_notes text, requested_supplier_notes text, requested_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare order_id uuid:=gen_random_uuid(); item jsonb; product_row public.products%rowtype;
  variation_row public.product_variations%rowtype; quantity numeric; unit_cost numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.create');
  if not exists(select 1 from public.suppliers where id=requested_supplier_id and status='active') then raise exception 'Active supplier required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active destination warehouse required'; end if;
  if requested_expected_date is not null and requested_expected_date<coalesce(requested_order_date,current_date) then raise exception 'Expected delivery cannot be before order date'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one purchase item is required'; end if;
  if coalesce(requested_discount,0)<0 or coalesce(requested_shipping,0)<0 or coalesce(requested_tax,0)<0 or coalesce(requested_other,0)<0 then raise exception 'Order amounts cannot be negative'; end if;

  insert into public.purchase_orders(
    id,order_number,supplier_id,destination_warehouse_id,currency,order_date,expected_delivery_date,
    supplier_reference,payment_terms_days,discount_amount,shipping_amount,tax_amount,other_amount,
    internal_notes,supplier_notes,created_by,updated_by
  ) values (
    order_id,public.next_purchase_order_number(),requested_supplier_id,requested_warehouse_id,
    upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),coalesce(requested_order_date,current_date),
    requested_expected_date,nullif(left(trim(requested_supplier_reference),200),''),
    greatest(0,least(coalesce(requested_payment_terms,0),365)),coalesce(requested_discount,0),
    coalesce(requested_shipping,0),coalesce(requested_tax,0),coalesce(requested_other,0),
    nullif(left(trim(requested_internal_notes),2000),''),nullif(left(trim(requested_supplier_notes),2000),''),
    actor_profile_id,actor_profile_id
  );

  for item in select value from jsonb_array_elements(requested_items) loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid and status<>'archived';
    if product_row.id is null then raise exception 'Active product required'; end if;
    variation_row:=null;
    if nullif(item->>'variation_id','') is not null then
      select * into variation_row from public.product_variations
      where id=(item->>'variation_id')::uuid and product_id=product_row.id and status='active';
      if variation_row.id is null then raise exception 'Invalid product variation'; end if;
    end if;
    quantity:=(item->>'quantity')::numeric; unit_cost:=(item->>'unit_cost')::numeric;
    if quantity<=0 or unit_cost<0 then raise exception 'Item quantity and unit cost are invalid'; end if;
    if product_row.serial_tracking_required and quantity<>trunc(quantity) then raise exception 'Serialized product quantities must be whole numbers'; end if;
    insert into public.purchase_order_items(
      purchase_order_id,product_id,variation_id,product_name_snapshot,sku_snapshot,description,
      quantity_ordered,unit_cost,discount_amount,tax_amount
    ) values (
      order_id,product_row.id,variation_row.id,product_row.name,coalesce(variation_row.sku,product_row.sku),
      nullif(left(trim(item->>'description'),500),''),quantity,unit_cost,
      greatest(coalesce((item->>'discount_amount')::numeric,0),0),
      greatest(coalesce((item->>'tax_amount')::numeric,0),0)
    );
  end loop;
  perform public.refresh_purchase_order_totals(order_id);
  insert into public.purchase_order_status_events(purchase_order_id,new_status,note,actor_profile_id)
  values(order_id,'draft','Purchase order created.',actor_profile_id);
  return order_id;
end $$;

create or replace function public.update_purchase_order(
  actor_profile_id uuid, requested_order_id uuid, requested_supplier_id uuid, requested_warehouse_id uuid,
  requested_currency text, requested_order_date date, requested_expected_date date,
  requested_supplier_reference text, requested_payment_terms integer,
  requested_discount numeric, requested_shipping numeric, requested_tax numeric, requested_other numeric,
  requested_internal_notes text, requested_supplier_notes text, requested_items jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare order_row public.purchase_orders%rowtype; item jsonb; product_row public.products%rowtype;
  variation_row public.product_variations%rowtype; quantity numeric; unit_cost numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.edit');
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status<>'draft' then raise exception 'Only draft purchase orders can be edited'; end if;
  if not exists(select 1 from public.suppliers where id=requested_supplier_id and status='active') then raise exception 'Active supplier required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active destination warehouse required'; end if;
  if requested_expected_date is not null and requested_expected_date<coalesce(requested_order_date,current_date) then raise exception 'Expected delivery cannot be before order date'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one purchase item is required'; end if;
  if coalesce(requested_discount,0)<0 or coalesce(requested_shipping,0)<0 or coalesce(requested_tax,0)<0 or coalesce(requested_other,0)<0 then raise exception 'Order amounts cannot be negative'; end if;
  update public.purchase_orders set
    supplier_id=requested_supplier_id,destination_warehouse_id=requested_warehouse_id,
    currency=upper(left(coalesce(nullif(trim(requested_currency),''),'BDT'),3)),
    order_date=coalesce(requested_order_date,current_date),expected_delivery_date=requested_expected_date,
    supplier_reference=nullif(left(trim(requested_supplier_reference),200),''),
    payment_terms_days=greatest(0,least(coalesce(requested_payment_terms,0),365)),
    discount_amount=coalesce(requested_discount,0),shipping_amount=coalesce(requested_shipping,0),
    tax_amount=coalesce(requested_tax,0),other_amount=coalesce(requested_other,0),
    internal_notes=nullif(left(trim(requested_internal_notes),2000),''),
    supplier_notes=nullif(left(trim(requested_supplier_notes),2000),''),
    updated_by=actor_profile_id
  where id=requested_order_id;
  delete from public.purchase_order_items where purchase_order_id=requested_order_id;
  for item in select value from jsonb_array_elements(requested_items) loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid and status<>'archived';
    if product_row.id is null then raise exception 'Active product required'; end if;
    variation_row:=null;
    if nullif(item->>'variation_id','') is not null then
      select * into variation_row from public.product_variations where id=(item->>'variation_id')::uuid and product_id=product_row.id and status='active';
      if variation_row.id is null then raise exception 'Invalid product variation'; end if;
    end if;
    quantity:=(item->>'quantity')::numeric; unit_cost:=(item->>'unit_cost')::numeric;
    if quantity<=0 or unit_cost<0 then raise exception 'Item quantity and unit cost are invalid'; end if;
    if product_row.serial_tracking_required and quantity<>trunc(quantity) then raise exception 'Serialized product quantities must be whole numbers'; end if;
    insert into public.purchase_order_items(
      purchase_order_id,product_id,variation_id,product_name_snapshot,sku_snapshot,description,
      quantity_ordered,unit_cost,discount_amount,tax_amount
    ) values (
      requested_order_id,product_row.id,variation_row.id,product_row.name,coalesce(variation_row.sku,product_row.sku),
      nullif(left(trim(item->>'description'),500),''),quantity,unit_cost,
      greatest(coalesce((item->>'discount_amount')::numeric,0),0),
      greatest(coalesce((item->>'tax_amount')::numeric,0),0)
    );
  end loop;
  perform public.refresh_purchase_order_totals(requested_order_id);
end $$;

create or replace function public.transition_purchase_order(
  actor_profile_id uuid, requested_order_id uuid, requested_action text, requested_note text default null
) returns void language plpgsql security definer set search_path='' as $$
declare order_row public.purchase_orders%rowtype; next_status text; required_permission text;
  item record; balance_row public.inventory_balances%rowtype; remaining numeric;
begin
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if requested_action='submit' and order_row.status='draft' then next_status:='pending_approval'; required_permission:='purchasing.edit';
  elsif requested_action='approve' and order_row.status='pending_approval' then next_status:='approved'; required_permission:='purchasing.approve';
  elsif requested_action='order' and order_row.status='approved' then next_status:='ordered'; required_permission:='purchasing.approve';
  elsif requested_action='close' and order_row.status='received' then next_status:='closed'; required_permission:='purchasing.edit';
  elsif requested_action='cancel' and order_row.status in('draft','pending_approval','approved','ordered','partially_received') then next_status:='cancelled'; required_permission:='purchasing.cancel';
  else raise exception 'Purchase order cannot perform this action from its current status';
  end if;
  perform public.assert_actor_permission(actor_profile_id,required_permission);
  if requested_action='order' then
    for item in select * from public.purchase_order_items where purchase_order_id=order_row.id loop
      insert into public.inventory_balances(warehouse_id,product_id,variation_id)
      values(order_row.destination_warehouse_id,item.product_id,item.variation_id) on conflict do nothing;
      select * into balance_row from public.inventory_balances
      where warehouse_id=order_row.destination_warehouse_id and product_id=item.product_id
        and variation_id is not distinct from item.variation_id and location_id is null for update;
      update public.inventory_balances set incoming=incoming+(item.quantity_ordered-item.quantity_received),updated_at=now()
      where id=balance_row.id;
    end loop;
  elsif requested_action='cancel' and order_row.status in('ordered','partially_received') then
    for item in select * from public.purchase_order_items where purchase_order_id=order_row.id loop
      remaining:=item.quantity_ordered-item.quantity_received-item.quantity_rejected;
      update public.inventory_balances set incoming=greatest(incoming-remaining,0),updated_at=now()
      where warehouse_id=order_row.destination_warehouse_id and product_id=item.product_id
        and variation_id is not distinct from item.variation_id and location_id is null;
    end loop;
  end if;
  update public.purchase_orders set status=next_status,updated_by=actor_profile_id,
    submitted_at=case when requested_action='submit' then now() else submitted_at end,
    submitted_by=case when requested_action='submit' then actor_profile_id else submitted_by end,
    approved_at=case when requested_action='approve' then now() else approved_at end,
    approved_by=case when requested_action='approve' then actor_profile_id else approved_by end,
    ordered_at=case when requested_action='order' then now() else ordered_at end,
    ordered_by=case when requested_action='order' then actor_profile_id else ordered_by end,
    cancelled_at=case when requested_action='cancel' then now() else cancelled_at end,
    cancelled_by=case when requested_action='cancel' then actor_profile_id else cancelled_by end,
    cancellation_reason=case when requested_action='cancel' then nullif(left(trim(requested_note),1000),'') else cancellation_reason end,
    completed_at=case when requested_action='close' then now() else completed_at end
  where id=requested_order_id;
  insert into public.purchase_order_status_events(purchase_order_id,previous_status,new_status,note,actor_profile_id)
  values(requested_order_id,order_row.status,next_status,nullif(left(trim(requested_note),1000),''),actor_profile_id);
end $$;

create or replace function public.receive_purchase_order(
  actor_profile_id uuid, requested_order_id uuid, requested_receipt_date date,
  requested_delivery_reference text, requested_invoice_reference text, requested_notes text, requested_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare order_row public.purchase_orders%rowtype; order_item public.purchase_order_items%rowtype;
  product_row public.products%rowtype; item jsonb; quantity numeric; manufacturer_serials jsonb;
  movement_id uuid:=gen_random_uuid(); receipt_id uuid:=gen_random_uuid(); receipt_number text;
  balance_row public.inventory_balances%rowtype; batch_id uuid; i integer; generated text;
  manufacturer text; normalized text; serial_id uuid; actor_role public.account_role;
  previous_status text; all_received boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.receive');
  perform public.assert_actor_permission(actor_profile_id,'inventory.receive');
  select * into order_row from public.purchase_orders where id=requested_order_id for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status not in('ordered','partially_received') then raise exception 'Only ordered purchase orders can be received'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one received item is required'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id and status='active';
  receipt_number:=public.next_purchase_receipt_number();
  insert into public.inventory_movements(
    id,reference,movement_type,status,destination_warehouse_id,notes,initiated_by,confirmed_at
  ) values (
    movement_id,receipt_number,'purchase_receipt','confirmed',order_row.destination_warehouse_id,
    nullif(left(trim(requested_notes),1000),''),actor_profile_id,now()
  );
  insert into public.purchase_receipts(
    id,receipt_number,purchase_order_id,warehouse_id,inventory_movement_id,receipt_date,
    supplier_delivery_reference,supplier_invoice_reference,notes,received_by
  ) values (
    receipt_id,receipt_number,order_row.id,order_row.destination_warehouse_id,movement_id,
    coalesce(requested_receipt_date,current_date),nullif(left(trim(requested_delivery_reference),200),''),
    nullif(left(trim(requested_invoice_reference),200),''),nullif(left(trim(requested_notes),1000),''),actor_profile_id
  );

  for item in select value from jsonb_array_elements(requested_items) loop
    select * into order_item from public.purchase_order_items
    where id=(item->>'purchase_order_item_id')::uuid and purchase_order_id=order_row.id for update;
    if order_item.id is null then raise exception 'Purchase order item not found'; end if;
    quantity:=(item->>'quantity')::numeric;
    if quantity<=0 or quantity>order_item.quantity_ordered-order_item.quantity_received-order_item.quantity_rejected then raise exception 'Received quantity exceeds the remaining order quantity'; end if;
    select * into product_row from public.products where id=order_item.product_id;
    manufacturer_serials:=coalesce(item->'manufacturer_serials','[]'::jsonb);
    if product_row.serial_tracking_required then
      if quantity<>trunc(quantity) then raise exception 'Serialized receipt quantity must be a whole number'; end if;
      if jsonb_typeof(manufacturer_serials)<>'array' then raise exception 'Manufacturer serials must be an array'; end if;
      if jsonb_array_length(manufacturer_serials)>quantity then raise exception 'Manufacturer serial count exceeds received quantity'; end if;
    elsif jsonb_array_length(manufacturer_serials)>0 then
      raise exception 'Serials cannot be supplied for a non-serialized product';
    end if;
    insert into public.inventory_balances(warehouse_id,product_id,variation_id)
    values(order_row.destination_warehouse_id,order_item.product_id,order_item.variation_id) on conflict do nothing;
    select * into balance_row from public.inventory_balances
    where warehouse_id=order_row.destination_warehouse_id and product_id=order_item.product_id
      and variation_id is not distinct from order_item.variation_id and location_id is null for update;
    update public.inventory_balances
    set on_hand=on_hand+quantity,incoming=greatest(incoming-quantity,0),updated_at=now()
    where id=balance_row.id;
    insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after)
    values(movement_id,order_item.product_id,order_item.variation_id,order_row.destination_warehouse_id,quantity,balance_row.on_hand+quantity);

    batch_id:=null;
    if product_row.serial_tracking_required then
      batch_id:=gen_random_uuid();
      insert into public.serial_generation_batches(
        id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_by,generated_at
      ) values (
        batch_id,order_item.product_id,order_item.variation_id,order_row.destination_warehouse_id,
        quantity::integer,coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),
        'Received against '||order_row.order_number,'received',actor_profile_id,now()
      );
      for i in 1..quantity::integer loop
        manufacturer:=nullif(trim(coalesce(manufacturer_serials->>(i-1),'')),'');
        normalized:=public.normalize_manufacturer_serial(manufacturer);
        if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if;
        generated:=public.next_sen_serial(order_item.product_id); serial_id:=gen_random_uuid();
        insert into public.serial_numbers(
          id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,
          product_id,variation_id,warehouse_id,status,condition,acquisition_reference,notes,
          generation_batch_id,generated_at,generated_by,received_at,received_by,last_movement_id
        ) values (
          serial_id,manufacturer,normalized,generated,generated,order_item.product_id,order_item.variation_id,
          order_row.destination_warehouse_id,'available',
          coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),order_row.order_number,
          'Received on '||receipt_number,batch_id,now(),actor_profile_id,now(),actor_profile_id,movement_id
        );
        insert into public.serial_number_history(
          serial_number_id,event_type,new_sen_serial,new_manufacturer_serial,new_status,new_warehouse_id,movement_id,reason,actor_id
        ) values (
          serial_id,'received',generated,manufacturer,'available',order_row.destination_warehouse_id,
          movement_id,'Purchase receipt '||receipt_number,actor_profile_id
        );
        perform public.capture_serial_event(serial_id,movement_id,null,'serial.received',actor_profile_id,'Purchase receipt '||receipt_number);
      end loop;
    end if;
    insert into public.purchase_receipt_items(
      purchase_receipt_id,purchase_order_item_id,product_id,variation_id,quantity_received,serial_generation_batch_id
    ) values(receipt_id,order_item.id,order_item.product_id,order_item.variation_id,quantity,batch_id);
    update public.purchase_order_items set quantity_received=quantity_received+quantity,updated_at=now() where id=order_item.id;
  end loop;

  select bool_and(quantity_received+quantity_rejected>=quantity_ordered) into all_received
  from public.purchase_order_items where purchase_order_id=order_row.id;
  previous_status:=order_row.status;
  update public.purchase_orders set
    status=case when all_received then 'received' else 'partially_received' end,
    completed_at=case when all_received then now() else completed_at end,updated_by=actor_profile_id
  where id=order_row.id;
  insert into public.purchase_order_status_events(purchase_order_id,previous_status,new_status,note,actor_profile_id)
  values(order_row.id,previous_status,case when all_received then 'received' else 'partially_received' end,'Receipt '||receipt_number,actor_profile_id);
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,actor_role,'purchasing.received','purchasing','purchase_receipt',receipt_id::text,
    'Purchase order stock received.',jsonb_build_object('purchase_order_id',order_row.id,'receipt_number',receipt_number,'movement_id',movement_id));
  return receipt_id;
end $$;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'suppliers','purchase_orders','purchase_order_items','purchase_order_status_events',
    'purchase_receipts','purchase_receipt_items'
  ] loop execute format('alter table public.%I enable row level security',table_name); end loop;
end $$;

create policy "authorized staff read suppliers" on public.suppliers for select to authenticated
using(public.current_user_has_permission('suppliers.view') or public.current_user_has_permission('purchasing.view'));
create policy "authorized staff read purchase orders" on public.purchase_orders for select to authenticated
using(public.current_user_has_permission('purchasing.view'));
create policy "authorized staff read purchase order items" on public.purchase_order_items for select to authenticated
using(public.current_user_has_permission('purchasing.view'));
create policy "authorized staff read purchase order events" on public.purchase_order_status_events for select to authenticated
using(public.current_user_has_permission('purchasing.view'));
create policy "authorized staff read purchase receipts" on public.purchase_receipts for select to authenticated
using(public.current_user_has_permission('purchasing.view') or public.current_user_has_permission('inventory.view'));
create policy "authorized staff read purchase receipt items" on public.purchase_receipt_items for select to authenticated
using(public.current_user_has_permission('purchasing.view') or public.current_user_has_permission('inventory.view'));

update public.app_modules set is_implemented=true where key in('purchasing','suppliers');

revoke all on function public.next_purchase_order_number() from public,anon,authenticated;
revoke all on function public.next_purchase_receipt_number() from public,anon,authenticated;
revoke all on function public.refresh_purchase_order_totals(uuid) from public,anon,authenticated;
revoke all on function public.create_purchase_order(uuid,uuid,uuid,text,date,date,text,integer,numeric,numeric,numeric,numeric,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.update_purchase_order(uuid,uuid,uuid,uuid,text,date,date,text,integer,numeric,numeric,numeric,numeric,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.transition_purchase_order(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.create_purchase_order(uuid,uuid,uuid,text,date,date,text,integer,numeric,numeric,numeric,numeric,text,text,jsonb) to service_role;
grant execute on function public.update_purchase_order(uuid,uuid,uuid,uuid,text,date,date,text,integer,numeric,numeric,numeric,numeric,text,text,jsonb) to service_role;
grant execute on function public.transition_purchase_order(uuid,uuid,text,text) to service_role;
grant execute on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb) to service_role;

grant select on public.suppliers,public.purchase_orders,public.purchase_order_items,
  public.purchase_order_status_events,public.purchase_receipts,public.purchase_receipt_items
to authenticated,service_role;
grant all on public.suppliers,public.purchase_orders,public.purchase_order_items,
  public.purchase_order_status_events,public.purchase_receipts,public.purchase_receipt_items
to service_role;
grant usage,select on sequence public.purchase_order_number_seq,public.purchase_receipt_number_seq to service_role;

