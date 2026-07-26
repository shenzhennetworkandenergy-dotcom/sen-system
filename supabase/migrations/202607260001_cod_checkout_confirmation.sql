-- Additive COD checkout repair.
-- Preserves the original customer_checkout_cart RPC for backward compatibility.

create or replace function public.customer_checkout_cart_cod(
  actor_profile_id uuid,
  requested_address_id uuid,
  requested_notes text,
  requested_email text,
  requested_phone text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  billing_snapshot jsonb;
  order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
  available_quantity numeric;
  cod_gateway_id uuid;
  normalized_phone text;
begin
  if actor_profile_id is distinct from auth.uid() and current_user <> 'service_role' then
    raise exception 'Permission denied';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id=actor_profile_id and status='active' and role in ('customer','admin')
  ) then
    raise exception 'Active customer account required';
  end if;

  if requested_email is null
    or requested_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  then
    raise exception 'Enter a valid billing email';
  end if;

  normalized_phone := regexp_replace(coalesce(requested_phone,''),'[().[:space:]-]','','g');
  if normalized_phone !~ '^\+8801[3-9][0-9]{8}$'
    and normalized_phone !~ '^01[3-9][0-9]{8}$'
    and normalized_phone !~ '^\+[1-9][0-9]{6,14}$'
  then
    raise exception 'Enter a valid contact phone number';
  end if;

  select *
  into cart
  from public.shopping_carts
  where profile_id=actor_profile_id and status='active'
  for update;

  if cart.id is null
    or not exists (select 1 from public.shopping_cart_items where cart_id=cart.id)
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

  billing_snapshot := address_snapshot || jsonb_build_object(
    'email',lower(trim(requested_email)),
    'contact_phone',trim(requested_phone),
    'payment_method','cash_on_delivery'
  );

  -- Select one active warehouse that can fulfil every cart line. Balances are
  -- summed across the warehouse's internal locations instead of requiring a
  -- synthetic location_id IS NULL balance row.
  select warehouse.id
  into selected_warehouse_id
  from public.warehouses warehouse
  where warehouse.is_active
    and not exists (
      select 1
      from public.shopping_cart_items item
      join public.products product on product.id=item.product_id
      where item.cart_id=cart.id
        and (
          product.status <> 'active'
          or not product.public_catalogue_visible
          or (
            not product.allow_backorders
            and coalesce((
              select sum(balance.available)
              from public.inventory_balances balance
              where balance.warehouse_id=warehouse.id
                and balance.product_id=item.product_id
                and balance.variation_id is not distinct from item.variation_id
            ),0) < item.quantity
          )
        )
    )
  order by warehouse.created_at
  limit 1;

  if selected_warehouse_id is null then
    raise exception 'No fulfilment warehouse has sufficient stock for this cart';
  end if;

  insert into public.sales_orders(
    id,order_number,customer_profile_id,
    shipping_address_id,shipping_address_snapshot,
    billing_address_id,billing_address_snapshot,
    fulfillment_warehouse_id,currency,customer_notes,sales_source,
    payment_status,created_by,updated_by
  )
  values(
    order_id,public.next_sales_order_number(),actor_profile_id,
    requested_address_id,address_snapshot,
    requested_address_id,billing_snapshot,
    selected_warehouse_id,'BDT',nullif(left(requested_notes,4000),''),
    'website','unpaid',actor_profile_id,actor_profile_id
  );

  for entry in
    select *
    from public.shopping_cart_items
    where cart_id=cart.id
    order by created_at
  loop
    select *
    into product_row
    from public.products
    where id=entry.product_id and status='active' and public_catalogue_visible;

    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;

    select coalesce(sum(balance.available),0)
    into available_quantity
    from public.inventory_balances balance
    where balance.warehouse_id=selected_warehouse_id
      and balance.product_id=entry.product_id
      and balance.variation_id is not distinct from entry.variation_id;

    if available_quantity < entry.quantity and not product_row.allow_backorders then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    unit_price := coalesce(product_row.sale_price,product_row.regular_price,0);
    line_total := round(unit_price*entry.quantity,4);
    order_total := order_total+line_total;

    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot
    )
    values(
      order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number
    );
  end loop;

  if order_total <= 0 then
    raise exception 'Cart total must be greater than zero';
  end if;

  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=order_id;

  select id
  into cod_gateway_id
  from public.payment_gateways
  where code='cash_on_delivery' and enabled
  limit 1;

  if cod_gateway_id is null then
    raise exception 'Cash on delivery is not currently available';
  end if;

  insert into public.payment_transactions(
    order_id,profile_id,gateway_id,status,amount,currency,safe_response
  )
  values(
    order_id,actor_profile_id,cod_gateway_id,'pending',order_total,'BDT',
    jsonb_build_object('method','cash_on_delivery','customer_confirmed',true)
  );

  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(order_id,'draft',actor_profile_id,'Customer confirmed a cash-on-delivery order');

  update public.shopping_carts
  set status='converted',converted_order_id=order_id,updated_at=now()
  where id=cart.id;

  return order_id;
end
$$;

revoke all on function public.customer_checkout_cart_cod(uuid,uuid,text,text,text)
from public,anon;
grant execute on function public.customer_checkout_cart_cod(uuid,uuid,text,text,text)
to authenticated,service_role;
