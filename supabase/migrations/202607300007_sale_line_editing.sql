-- Controlled post-creation sale line editing with stock, payment, and document integrity.

alter table public.sales_order_items
  add column if not exists discount_type text not null default 'fixed',
  add column if not exists discount_value numeric(18,4) not null default 0;

alter table public.sales_order_items
  drop constraint if exists sales_order_items_discount_type_check,
  add constraint sales_order_items_discount_type_check
    check (discount_type in ('percentage','fixed')),
  drop constraint if exists sales_order_items_discount_value_check,
  add constraint sales_order_items_discount_value_check
    check (discount_value >= 0 and (discount_type <> 'percentage' or discount_value <= 100));

update public.sales_order_items
set discount_type='fixed',discount_value=line_discount
where line_discount>0 and discount_value=0;

alter table public.sale_documents
  add column if not exists revision_number integer not null default 1,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.profiles(id) on delete set null,
  add column if not exists superseded_reason text;

do $$
declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.sale_documents'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.sale_documents drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.sale_documents
  add constraint sale_documents_status_check
    check (status in ('generated','superseded','voided')),
  drop constraint if exists sale_documents_revision_number_check,
  add constraint sale_documents_revision_number_check check (revision_number >= 1);

do $$
declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.sale_price_adjustments'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%adjustment_type%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.sale_price_adjustments drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.sale_price_adjustments
  add constraint sale_price_adjustments_adjustment_type_check
    check(adjustment_type in (
      'manual_unit_price','percentage_discount','fixed_line_discount',
      'order_discount','shipping_charge','service_charge','tax','quantity_change'
    ));

create or replace function public.update_sale_lines(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_reason text,
  requested_items jsonb
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  current_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  entry jsonb;
  item_count integer;
  request_count integer;
  distinct_request_count integer;
  new_quantity numeric;
  new_unit_price numeric;
  new_discount_type text;
  new_discount_value numeric;
  new_subtotal numeric;
  new_discount numeric;
  new_total numeric;
  remaining_quantity numeric;
  quantity_delta numeric;
  revised_subtotal numeric;
  revised_line_total numeric;
  revised_total numeric;
  reason text;
begin
  perform public.assert_actor_permission(actor_profile_id,'sales.edit');
  reason := nullif(left(trim(coalesce(requested_reason,'')),500),'');
  if reason is null then raise exception 'Edit reason is required'; end if;
  if jsonb_typeof(requested_items) <> 'array' then raise exception 'Sale items are invalid'; end if;

  select * into sale from public.sales_orders
  where id=requested_order_id for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.status in ('delivered','cancelled') then
    raise exception 'A delivered or cancelled sale cannot be edited';
  end if;

  select count(*) into item_count from public.sales_order_items where order_id=sale.id;
  select count(*), count(distinct value->>'id')
    into request_count, distinct_request_count
  from jsonb_array_elements(requested_items);
  if request_count <> item_count or distinct_request_count <> item_count then
    raise exception 'Every sale item must be submitted exactly once';
  end if;

  for entry in select value from jsonb_array_elements(requested_items) loop
    select * into current_item from public.sales_order_items
    where id=(entry->>'id')::uuid and order_id=sale.id for update;
    if current_item.id is null then raise exception 'Sale item not found'; end if;

    new_quantity := (entry->>'quantity')::numeric;
    new_unit_price := round((entry->>'unit_price')::numeric,2);
    new_discount_type := entry->>'discount_type';
    new_discount_value := round((entry->>'discount_value')::numeric,2);

    if new_quantity < 1 or new_quantity <> trunc(new_quantity) then
      raise exception 'Quantity must be a whole number of at least 1';
    end if;
    if new_quantity < greatest(
      current_item.allocated_quantity,current_item.packed_quantity,
      current_item.shipped_quantity,current_item.delivered_quantity
    ) then raise exception 'Quantity cannot be reduced below fulfilled units'; end if;
    if new_unit_price < 0 then raise exception 'Unit price cannot be negative'; end if;
    if new_discount_type not in ('percentage','fixed') or new_discount_value < 0
      or (new_discount_type='percentage' and new_discount_value>100)
    then raise exception 'Discount is invalid'; end if;

    new_subtotal := round(new_quantity*new_unit_price,2);
    new_discount := case when new_discount_type='percentage'
      then round(new_subtotal*new_discount_value/100,2)
      else new_discount_value end;
    if new_discount > new_subtotal then
      raise exception 'Fixed discount cannot exceed the line subtotal';
    end if;
    new_total := round(new_subtotal-new_discount+current_item.line_tax,2);

    if new_unit_price <> current_item.unit_price then
      perform public.assert_actor_permission(actor_profile_id,'sales.change_price');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,'manual_unit_price',
        current_item.unit_price,new_unit_price,reason,actor_profile_id
      );
    end if;
    if new_discount <> current_item.line_discount
      or new_discount_type <> current_item.discount_type
      or new_discount_value <> current_item.discount_value
    then
      perform public.assert_actor_permission(actor_profile_id,'sales.apply_discount');
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,
        case when new_discount_type='percentage' then 'percentage_discount' else 'fixed_line_discount' end,
        current_item.line_discount,
        case when new_discount_type='percentage' then new_discount_value else new_discount end,
        reason,actor_profile_id
      );
    end if;

    quantity_delta := new_quantity-current_item.quantity;
    if quantity_delta <> 0 then
      insert into public.sale_price_adjustments(
        order_id,order_item_id,adjustment_type,previous_value,new_value,reason,actor_profile_id
      ) values (
        sale.id,current_item.id,'quantity_change',
        current_item.quantity,new_quantity,reason,actor_profile_id
      );

      if sale.status <> 'draft' then
        select * into balance from public.inventory_balances
        where warehouse_id=current_item.fulfillment_warehouse_id
          and product_id=current_item.product_id
          and variation_id is not distinct from current_item.variation_id
          and location_id is null
        for update;
        if balance.id is null then raise exception 'Inventory balance not found'; end if;
        if quantity_delta > 0 and balance.available < quantity_delta then
          raise exception 'Insufficient available stock for quantity increase';
        end if;
        if quantity_delta < 0 and balance.reserved < abs(quantity_delta) then
          raise exception 'Reserved stock does not match the requested reduction';
        end if;
        update public.inventory_balances
        set reserved=reserved+quantity_delta,updated_at=now()
        where id=balance.id;

        remaining_quantity := new_quantity-current_item.shipped_quantity;
        select * into reservation from public.inventory_reservations
        where order_item_id=current_item.id and status='active'
        for update;
        if remaining_quantity = 0 and reservation.id is not null then
          update public.inventory_reservations
          set status='released',released_at=now(),updated_at=now()
          where id=reservation.id;
        elsif remaining_quantity > 0 and reservation.id is not null then
          update public.inventory_reservations
          set quantity=remaining_quantity,updated_at=now()
          where id=reservation.id;
        elsif remaining_quantity > 0 then
          insert into public.inventory_reservations(
            product_id,variation_id,warehouse_id,quantity,status,reference,
            created_by,order_id,order_item_id
          ) values (
            current_item.product_id,current_item.variation_id,
            current_item.fulfillment_warehouse_id,remaining_quantity,'active',
            sale.order_number,actor_profile_id,sale.id,current_item.id
          );
        end if;
      end if;
    end if;

    update public.sales_order_items set
      quantity=new_quantity,
      unit_price=new_unit_price,
      line_subtotal=new_subtotal,
      line_discount=new_discount,
      line_total=new_total,
      discount_type=new_discount_type,
      discount_value=new_discount_value,
      updated_at=now()
    where id=current_item.id;
  end loop;

  select coalesce(sum(line_subtotal),0),coalesce(sum(line_total),0)
    into revised_subtotal,revised_line_total
  from public.sales_order_items where order_id=sale.id;
  revised_total := round(
    revised_line_total-sale.discount_amount+sale.shipping_amount+
    sale.service_amount+sale.tax_amount,2
  );
  if revised_total < 0 then raise exception 'Sale total cannot be negative'; end if;
  if revised_total < sale.paid_amount then
    raise exception 'Sale total cannot be lower than the amount already paid';
  end if;

  update public.sales_orders set
    subtotal=revised_subtotal,total_amount=revised_total,
    payment_status=case
      when paid_amount=0 then 'unpaid'
      when paid_amount<revised_total then 'partially_paid'
      when paid_amount=revised_total then 'paid'
      else 'overpaid'
    end,
    updated_by=actor_profile_id,updated_at=now()
  where id=sale.id;

  update public.sale_documents set
    status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason=reason
  where order_id=sale.id and status='generated';

  perform public.derive_sales_order_status(sale.id);
end $$;

create or replace function public.generate_sale_document(
  actor_profile_id uuid,requested_order_id uuid,requested_type text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  document_id uuid:=gen_random_uuid();
  o public.sales_orders%rowtype;
  permission_key text;
  number text;
  document_snapshot jsonb;
  next_revision integer;
begin
  permission_key:=case
    when requested_type='invoice' then 'sales.create_invoice'
    when requested_type='delivery_challan' then 'sales.create_delivery_challan'
    else null end;
  if permission_key is null then raise exception 'Invalid document type'; end if;
  perform public.assert_actor_permission(actor_profile_id,permission_key);
  select * into o from public.sales_orders where id=requested_order_id;
  if o.id is null or o.status='cancelled' then
    raise exception 'Sale is not eligible for document generation';
  end if;
  select coalesce(max(revision_number),0)+1 into next_revision
  from public.sale_documents
  where order_id=o.id and document_type=requested_type;
  update public.sale_documents set
    status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason='Replaced by revision '||next_revision
  where order_id=o.id and document_type=requested_type and status='generated';

  number:=case when requested_type='invoice' then 'SEN-INV-' else 'SEN-DC-' end
    ||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(o),
    'customer',(select to_jsonb(p)-'password' from public.profiles p where p.id=o.customer_profile_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
      from public.sales_order_items i where i.order_id=o.id),
    'serials',(select coalesce(jsonb_agg(jsonb_build_object(
      'sen_serial',s.sen_serial,'manufacturer_serial',s.manufacturer_serial,'product_id',s.product_id
    )),'[]'::jsonb) from public.order_serial_allocations a
      join public.serial_numbers s on s.id=a.serial_number_id
      where a.order_id=o.id and a.status not in('released','cancelled')),
    'generated_at',now(),'revision_number',next_revision
  ) into document_snapshot;
  insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,
    generated_by,revision_number
  ) values (
    document_id,o.id,number,requested_type,'generated',document_snapshot,
    actor_profile_id,next_revision
  );
  return document_id;
end $$;

revoke all on function public.update_sale_lines(uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.update_sale_lines(uuid,uuid,text,jsonb)
  to service_role;
