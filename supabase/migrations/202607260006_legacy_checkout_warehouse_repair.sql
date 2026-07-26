-- Repair the backward-compatible checkout RPC without changing its signature.
-- The original function used warehouse_id for both a PL/pgSQL variable and a
-- table column, which made its inventory query ambiguous.

create or replace function public.customer_checkout_cart(
  actor_profile_id uuid,
  requested_address_id uuid,
  requested_notes text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
begin
  if actor_profile_id is distinct from auth.uid()
    and current_user <> 'service_role'
  then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id=actor_profile_id
      and status='active'
      and role in ('customer','admin')
  ) then
    raise exception 'Active customer account required';
  end if;

  select *
  into cart
  from public.shopping_carts
  where profile_id=actor_profile_id and status='active'
  for update;

  if cart.id is null
    or not exists (
      select 1
      from public.shopping_cart_items
      where cart_id=cart.id
    )
  then
    raise exception 'Cart is empty';
  end if;

  select jsonb_build_object(
    'recipient_name',recipient_name,
    'phone',phone,
    'alternate_phone',alternate_phone,
    'address_line_1',address_line_1,
    'address_line_2',address_line_2,
    'area',area,
    'city',city,
    'region',region,
    'postal_code',postal_code,
    'country_code',country_code,
    'delivery_instructions',delivery_instructions,
    'map_label',map_label
  )
  into address_snapshot
  from public.customer_addresses
  where id=requested_address_id and profile_id=actor_profile_id;

  if address_snapshot is null then
    raise exception 'Choose a saved shipping address';
  end if;

  select balance.warehouse_id
  into selected_warehouse_id
  from public.inventory_balances balance
  join public.shopping_cart_items cart_item
    on cart_item.product_id=balance.product_id
    and cart_item.cart_id=cart.id
  where balance.available >= cart_item.quantity
  order by balance.available desc
  limit 1;

  if selected_warehouse_id is null then
    select id
    into selected_warehouse_id
    from public.warehouses
    where is_active
    order by created_at
    limit 1;
  end if;

  if selected_warehouse_id is null then
    raise exception 'No fulfilment warehouse is available';
  end if;

  insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_id,
    shipping_address_snapshot,fulfillment_warehouse_id,currency,
    customer_notes,created_by,updated_by
  ) values (
    order_id,public.next_sales_order_number(),actor_profile_id,
    requested_address_id,address_snapshot,selected_warehouse_id,'BDT',
    nullif(left(requested_notes,4000),''),actor_profile_id,actor_profile_id
  );

  for entry in
    select cart_item.*,balance.available
    from public.shopping_cart_items cart_item
    left join public.inventory_balances balance
      on balance.product_id=cart_item.product_id
      and balance.variation_id is not distinct from cart_item.variation_id
      and balance.warehouse_id=selected_warehouse_id
      and balance.location_id is null
    where cart_item.cart_id=cart.id
  loop
    select *
    into product_row
    from public.products
    where id=entry.product_id
      and status='active'
      and public_catalogue_visible;

    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;
    if coalesce(entry.available,0) < entry.quantity
      and not product_row.allow_backorders
    then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    unit_price := coalesce(
      product_row.sale_price,
      product_row.regular_price,
      0
    );
    line_total := round(unit_price*entry.quantity,4);
    order_total := order_total+line_total;

    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot
    ) values (
      order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number
    );
  end loop;

  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=order_id;

  insert into public.order_status_events(
    order_id,new_status,actor_profile_id,note
  ) values (
    order_id,'draft',actor_profile_id,'Customer placed order from cart'
  );

  update public.shopping_carts
  set status='converted',converted_order_id=order_id,updated_at=now()
  where id=cart.id;

  return order_id;
end $$;

revoke all on function public.customer_checkout_cart(uuid,uuid,text)
  from public,anon;
grant execute on function public.customer_checkout_cart(uuid,uuid,text)
  to authenticated,service_role;
