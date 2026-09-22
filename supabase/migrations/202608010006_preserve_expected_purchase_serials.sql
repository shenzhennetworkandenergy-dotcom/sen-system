-- Preserve the SEN code generated when a supplier order is confirmed. Physical
-- receiving activates that exact serial instead of deleting it and inserting a
-- replacement, so printed labels, history, and inventory always refer to the
-- same unit.

create or replace function public.receive_purchase_order(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_receipt_date date,
  requested_delivery_reference text,
  requested_invoice_reference text,
  requested_notes text,
  requested_items jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  order_row public.purchase_orders%rowtype;
  order_item public.purchase_order_items%rowtype;
  product_row public.products%rowtype;
  expected_serial public.serial_numbers%rowtype;
  item jsonb;
  quantity numeric;
  manufacturer_serials jsonb;
  movement_id uuid:=gen_random_uuid();
  receipt_id uuid:=gen_random_uuid();
  receipt_number text;
  balance_row public.inventory_balances%rowtype;
  batch_id uuid;
  fallback_batch_id uuid;
  i integer;
  generated text;
  manufacturer text;
  normalized text;
  serial_id uuid;
  actor_role public.account_role;
  previous_status text;
  all_received boolean;
begin
  perform public.assert_actor_permission(actor_profile_id,'inventory.receive_new_stock');
  perform public.assert_actor_permission(actor_profile_id,'inventory.receive');

  select * into order_row
  from public.purchase_orders
  where id=requested_order_id
  for update;
  if order_row.id is null then raise exception 'Purchase order not found'; end if;
  if order_row.status not in('ordered','partially_received') then
    raise exception 'Only ordered purchase orders can be received';
  end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then
    raise exception 'At least one received item is required';
  end if;

  select role into actor_role
  from public.profiles
  where id=actor_profile_id and status='active';
  receipt_number:=public.next_purchase_receipt_number();

  insert into public.inventory_movements(
    id,reference,movement_type,status,destination_warehouse_id,notes,initiated_by,confirmed_at
  ) values(
    movement_id,receipt_number,'purchase_receipt','confirmed',order_row.destination_warehouse_id,
    nullif(left(trim(requested_notes),1000),''),actor_profile_id,now()
  );
  insert into public.purchase_receipts(
    id,receipt_number,purchase_order_id,warehouse_id,inventory_movement_id,receipt_date,
    supplier_delivery_reference,supplier_invoice_reference,notes,received_by
  ) values(
    receipt_id,receipt_number,order_row.id,order_row.destination_warehouse_id,movement_id,
    coalesce(requested_receipt_date,current_date),nullif(left(trim(requested_delivery_reference),200),''),
    nullif(left(trim(requested_invoice_reference),200),''),nullif(left(trim(requested_notes),1000),''),actor_profile_id
  );

  for item in select value from jsonb_array_elements(requested_items) loop
    select * into order_item
    from public.purchase_order_items
    where id=(item->>'purchase_order_item_id')::uuid
      and purchase_order_id=order_row.id
    for update;
    if order_item.id is null then raise exception 'Purchase order item not found'; end if;

    quantity:=(item->>'quantity')::numeric;
    if quantity<=0 or quantity>order_item.quantity_ordered-order_item.quantity_received-order_item.quantity_rejected then
      raise exception 'Received quantity exceeds the remaining order quantity';
    end if;
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
    values(order_row.destination_warehouse_id,order_item.product_id,order_item.variation_id)
    on conflict do nothing;
    select * into balance_row
    from public.inventory_balances
    where warehouse_id=order_row.destination_warehouse_id
      and product_id=order_item.product_id
      and variation_id is not distinct from order_item.variation_id
      and location_id is null
    for update;
    update public.inventory_balances
    set on_hand=on_hand+quantity,incoming=greatest(incoming-quantity,0),updated_at=now()
    where id=balance_row.id;
    insert into public.inventory_movement_items(
      movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after
    ) values(
      movement_id,order_item.product_id,order_item.variation_id,
      order_row.destination_warehouse_id,quantity,balance_row.on_hand+quantity
    );

    batch_id:=null;
    fallback_batch_id:=null;
    if product_row.serial_tracking_required then
      for i in 1..quantity::integer loop
        manufacturer:=nullif(trim(coalesce(manufacturer_serials->>(i-1),'')),'');
        normalized:=public.normalize_manufacturer_serial(manufacturer);
        if normalized is not null and exists(
          select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized
        ) then
          raise exception 'Manufacturer serial already exists: %',manufacturer;
        end if;

        select sn.* into expected_serial
        from public.serial_numbers sn
        where sn.purchase_order_item_id=order_item.id and sn.status='expected'
        order by sn.generated_at,sn.id
        limit 1
        for update;

        if expected_serial.id is not null then
          serial_id:=expected_serial.id;
          generated:=expected_serial.sen_serial;
          batch_id:=coalesce(batch_id,expected_serial.generation_batch_id);
          update public.serial_numbers
          set manufacturer_serial=manufacturer,
              manufacturer_serial_normalized=normalized,
              warehouse_id=order_row.destination_warehouse_id,
              status='available',
              condition=coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),
              acquisition_reference=order_row.order_number,
              notes='Received on '||receipt_number,
              received_at=now(),
              received_by=actor_profile_id,
              last_movement_id=movement_id,
              updated_at=now()
          where id=serial_id;
        else
          if fallback_batch_id is null then
            fallback_batch_id:=gen_random_uuid();
            insert into public.serial_generation_batches(
              id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_by,generated_at
            ) values(
              fallback_batch_id,order_item.product_id,order_item.variation_id,
              order_row.destination_warehouse_id,(quantity::integer-i)+1,
              coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),
              'Received against '||order_row.order_number,'received',actor_profile_id,now()
            );
          end if;
          generated:=public.next_sen_serial(order_item.product_id);
          serial_id:=gen_random_uuid();
          insert into public.serial_numbers(
            id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,
            product_id,variation_id,warehouse_id,status,condition,acquisition_reference,notes,
            generation_batch_id,generated_at,generated_by,received_at,received_by,last_movement_id,
            purchase_order_item_id
          ) values(
            serial_id,manufacturer,normalized,generated,generated,order_item.product_id,order_item.variation_id,
            order_row.destination_warehouse_id,'available',
            coalesce(nullif(left(trim(item->>'condition'),80),''),'new'),order_row.order_number,
            'Received on '||receipt_number,fallback_batch_id,now(),actor_profile_id,now(),actor_profile_id,
            movement_id,order_item.id
          );
        end if;

        insert into public.serial_number_history(
          serial_number_id,event_type,previous_status,new_sen_serial,new_manufacturer_serial,
          new_status,new_warehouse_id,movement_id,reason,actor_id
        ) values(
          serial_id,'received',case when expected_serial.id is not null then 'expected' else null end,
          generated,manufacturer,'available',order_row.destination_warehouse_id,movement_id,
          'Purchase receipt '||receipt_number,actor_profile_id
        );
        perform public.capture_serial_event(
          serial_id,movement_id,null,'serial.received',actor_profile_id,'Purchase receipt '||receipt_number
        );
      end loop;

      update public.serial_generation_batches batches
      set status=case
        when exists(
          select 1 from public.serial_numbers serials
          where serials.generation_batch_id=batches.id and serials.status='expected'
        ) then 'partially_received'
        else 'received'
      end
      where batches.id in(
        select distinct serials.generation_batch_id
        from public.serial_numbers serials
        where serials.purchase_order_item_id=order_item.id
          and serials.generation_batch_id is not null
      );
      batch_id:=coalesce(batch_id,fallback_batch_id);
    end if;

    insert into public.purchase_receipt_items(
      purchase_receipt_id,purchase_order_item_id,product_id,variation_id,quantity_received,serial_generation_batch_id
    ) values(
      receipt_id,order_item.id,order_item.product_id,order_item.variation_id,quantity,batch_id
    );
    update public.purchase_order_items
    set quantity_received=quantity_received+quantity,updated_at=now()
    where id=order_item.id;
  end loop;

  select bool_and(quantity_received+quantity_rejected>=quantity_ordered)
  into all_received
  from public.purchase_order_items
  where purchase_order_id=order_row.id;
  previous_status:=order_row.status;
  update public.purchase_orders
  set status=case when all_received then 'received' else 'partially_received' end,
      completed_at=case when all_received then now() else completed_at end,
      updated_by=actor_profile_id
  where id=order_row.id;
  insert into public.purchase_order_status_events(
    purchase_order_id,previous_status,new_status,note,actor_profile_id
  ) values(
    order_row.id,previous_status,
    case when all_received then 'received' else 'partially_received' end,
    'Receipt '||receipt_number,actor_profile_id
  );
  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,actor_role,'purchasing.received','purchasing','purchase_receipt',receipt_id::text,
    'Purchase order stock received.',
    jsonb_build_object('purchase_order_id',order_row.id,'receipt_number',receipt_number,'movement_id',movement_id)
  );
  return receipt_id;
end $$;
-- Confirmation creates SEN codes for every physical unit. Serialized products
-- are activated by receive_purchase_order above; this trigger handles only
-- products that do not require a manufacturer serial.
create or replace function public.activate_nonserialized_purchase_serials()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  product_is_serialized boolean;
  receipt_row public.purchase_receipts%rowtype;
  received_serial public.serial_numbers%rowtype;
  first_batch_id uuid;
begin
  select serial_tracking_required into product_is_serialized
  from public.products
  where id=new.product_id;
  if coalesce(product_is_serialized,false) then return new; end if;

  select * into receipt_row
  from public.purchase_receipts
  where id=new.purchase_receipt_id;

  for received_serial in
    update public.serial_numbers
    set warehouse_id=receipt_row.warehouse_id,
        status='available',
        received_at=now(),
        received_by=receipt_row.received_by,
        notes='Received on '||receipt_row.receipt_number,
        last_movement_id=receipt_row.inventory_movement_id,
        updated_at=now()
    where id in(
      select id from public.serial_numbers
      where purchase_order_item_id=new.purchase_order_item_id and status='expected'
      order by generated_at,id
      limit new.quantity_received::integer
    )
    returning *
  loop
    first_batch_id:=coalesce(first_batch_id,received_serial.generation_batch_id);
    insert into public.serial_number_history(
      serial_number_id,event_type,previous_status,new_sen_serial,new_status,
      new_warehouse_id,movement_id,reason,actor_id
    ) values(
      received_serial.id,'received','expected',received_serial.sen_serial,'available',
      receipt_row.warehouse_id,receipt_row.inventory_movement_id,
      'Purchase receipt '||receipt_row.receipt_number,receipt_row.received_by
    );
    perform public.capture_serial_event(
      received_serial.id,receipt_row.inventory_movement_id,null,'serial.received',
      receipt_row.received_by,'Purchase receipt '||receipt_row.receipt_number
    );
  end loop;

  update public.purchase_receipt_items
  set serial_generation_batch_id=first_batch_id
  where id=new.id and first_batch_id is not null;
  update public.serial_generation_batches batches
  set status=case
    when exists(
      select 1 from public.serial_numbers serials
      where serials.generation_batch_id=batches.id and serials.status='expected'
    ) then 'partially_received'
    else 'received'
  end
  where batches.id in(
    select distinct serials.generation_batch_id
    from public.serial_numbers serials
    where serials.purchase_order_item_id=new.purchase_order_item_id
      and serials.generation_batch_id is not null
  );
  return new;
end $$;
revoke all on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb)
to service_role;
