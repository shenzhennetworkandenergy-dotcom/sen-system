-- The cart and one-product checkout use the same price, reservation and order rules.
create or replace function public.customer_checkout_eps_order(
  actor_profile_id uuid,
  requested_address_id uuid,
  requested_notes text,
  requested_email text,
  requested_phone text,
  requested_operation_id uuid,
  requested_fingerprint text,
  requested_expected_total numeric,
  requested_product_id uuid,
  requested_variation_id uuid,
  requested_quantity integer,
  requested_new_address jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  cart public.shopping_carts%rowtype;
  address_snapshot jsonb;
  billing_snapshot jsonb;
  new_order_id uuid := gen_random_uuid();
  entry record;
  product_row public.products%rowtype;
  variation_row public.product_variations%rowtype;
  selected_warehouse_id uuid;
  unit_price numeric;
  line_total numeric;
  order_total numeric := 0;
  available_quantity numeric;
  gateway_row public.payment_gateways%rowtype;
  previous_request public.eps_checkout_requests%rowtype;
  balance_row public.inventory_balances%rowtype;
  order_item public.sales_order_items%rowtype;
  normalized_phone text;
  address_id uuid := requested_address_id;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Permission denied'; end if;
  if requested_operation_id is null or coalesce(requested_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid checkout request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select * into previous_request from public.eps_checkout_requests where operation_id=requested_operation_id;
  if previous_request.operation_id is not null then
    if previous_request.profile_id is distinct from actor_profile_id or previous_request.fingerprint is distinct from requested_fingerprint then raise exception 'Checkout request was already used'; end if;
    return previous_request.order_id;
  end if;
  select * into gateway_row from public.payment_gateways where code='eps' and adapter='eps' and enabled;
  if gateway_row.id is null then raise exception 'Online payment is not available'; end if;
  if not exists (
    select 1 from public.profiles
    where id=actor_profile_id and status='active' and archived_at is null and role in ('customer','admin')
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

  if requested_product_id is null then
    select * into cart
    from public.shopping_carts
    where profile_id=actor_profile_id and status='active'
    for update;
    if cart.id is null
      or not exists (select 1 from public.shopping_cart_items where cart_id=cart.id)
    then
      raise exception 'Cart is empty';
    end if;
  else
    if requested_quantity is null or requested_quantity not between 1 and 99 then
      raise exception 'Invalid product quantity';
    end if;
    -- Serialize separate submissions for this customer's direct purchases.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_profile_id::text,1));
    if exists (
      select 1
      from public.eps_checkout_requests checkout
      join public.sales_orders sale on sale.id=checkout.order_id
      join public.sales_order_items item on item.order_id=sale.id
      where checkout.profile_id=actor_profile_id and checkout.cart_restored_at is null
        and sale.status='confirmed' and sale.paid_amount=0
        and item.product_id=requested_product_id
        and item.variation_id is not distinct from requested_variation_id
    ) then
      raise exception 'An EPS payment for this product is already open. Check your saved checkout before paying again';
    end if;

    -- This snapshot belongs to the new order. The regular active cart is separate.
    insert into public.shopping_carts(profile_id,status,currency)
    values(actor_profile_id,'abandoned','BDT') returning * into cart;
    insert into public.shopping_cart_items(cart_id,product_id,variation_id,quantity)
    values(cart.id,requested_product_id,requested_variation_id,requested_quantity);

    if address_id is null and requested_new_address is not null then
      if coalesce(trim(requested_new_address->>'recipient_name'),'')=''
        or coalesce(trim(requested_new_address->>'address_line_1'),'')=''
        or coalesce(trim(requested_new_address->>'city'),'')=''
        or coalesce(trim(requested_new_address->>'postal_code'),'')=''
        or coalesce(requested_new_address->>'country_code','') !~ '^[A-Z]{2}$'
      then
        raise exception 'Complete your shipping address';
      end if;
      insert into public.customer_addresses (
        profile_id,recipient_name,phone,address_line_1,city,postal_code,country_code,created_by,updated_by
      ) values (
        actor_profile_id,left(trim(requested_new_address->>'recipient_name'),160),trim(requested_phone),
        left(trim(requested_new_address->>'address_line_1'),240),left(trim(requested_new_address->>'city'),120),
        left(trim(requested_new_address->>'postal_code'),30),requested_new_address->>'country_code',
        actor_profile_id,actor_profile_id
      ) returning id into address_id;
    end if;
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
  ) into address_snapshot
  from public.customer_addresses
  where id=address_id and profile_id=actor_profile_id;
  if address_snapshot is null then
    raise exception 'Choose a saved shipping address';
  end if;
  if requested_product_id is not null and (
    coalesce(trim(address_snapshot->>'city'),'')='' or coalesce(trim(address_snapshot->>'postal_code'),'')=''
  ) then
    raise exception 'Add a postcode and city to your shipping address for online payment';
  end if;
  billing_snapshot := address_snapshot || jsonb_build_object(
    'email',lower(trim(requested_email)),
    'contact_phone',trim(requested_phone),
    'payment_method','eps'
  );

  select warehouse.id into selected_warehouse_id
  from public.warehouses warehouse
  where warehouse.is_active
    and not exists (
      select 1
      from public.shopping_cart_items item
      join public.products product on product.id=item.product_id
      left join public.product_variations variation
        on variation.id=item.variation_id
        and variation.product_id=item.product_id
        and variation.status='active'
      where item.cart_id=cart.id
        and (
          product.status <> 'active'
          or not product.public_catalogue_visible
          or (product.product_type='variable' and variation.id is null)
          or (product.product_type<>'variable' and item.variation_id is not null)
          or (
            coalesce((
              select sum(balance.available)
              from public.inventory_balances balance
              where balance.warehouse_id=warehouse.id
                and balance.product_id=item.product_id
                and balance.variation_id is not distinct from item.variation_id
                and balance.location_id is null
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
  ) values (
    new_order_id,public.next_sales_order_number(),actor_profile_id,
    address_id,address_snapshot,
    address_id,billing_snapshot,
    selected_warehouse_id,'BDT',nullif(left(requested_notes,4000),''),
    'website','unpaid',actor_profile_id,actor_profile_id
  );

  for entry in
    select * from public.shopping_cart_items
    where cart_id=cart.id
    order by created_at
  loop
    select * into product_row
    from public.products
    where id=entry.product_id and status='active' and public_catalogue_visible;
    if product_row.id is null then
      raise exception 'A cart product is no longer available';
    end if;

    variation_row := null;
    if product_row.product_type='variable' then
      if entry.variation_id is null then
        raise exception 'Select a configuration for %',product_row.name;
      end if;
      select * into variation_row
      from public.product_variations
      where id=entry.variation_id
        and product_id=product_row.id
        and status='active';
      if variation_row.id is null then
        raise exception 'A selected product configuration is no longer available';
      end if;
      product_row.allow_backorders := variation_row.allow_backorders;
      product_row.sale_price := variation_row.sale_price;
      product_row.regular_price := variation_row.regular_price;
      product_row.sku := variation_row.sku;
      product_row.name := product_row.name || ' (' || variation_row.combination_key || ')';
    elsif entry.variation_id is not null then
      raise exception 'The cart contains an invalid product configuration';
    end if;

    select coalesce(sum(balance.available),0) into available_quantity
    from public.inventory_balances balance
    where balance.warehouse_id=selected_warehouse_id
      and balance.product_id=entry.product_id
      and balance.variation_id is not distinct from entry.variation_id;
    if available_quantity < entry.quantity and not product_row.allow_backorders then
      raise exception 'Insufficient stock for %',product_row.name;
    end if;

    if coalesce(product_row.currency,'BDT') <> 'BDT' then raise exception 'Online payment supports BDT products only'; end if;
    unit_price := round(coalesce(product_row.sale_price,product_row.regular_price,0),2);
    line_total := round(unit_price*entry.quantity,2);
    order_total := order_total+line_total;
    insert into public.sales_order_items(
      order_id,product_id,variation_id,fulfillment_warehouse_id,
      quantity,unit_price,line_subtotal,line_total,currency,
      serial_tracking_required_snapshot,product_name_snapshot,
      sku_snapshot,model_number_snapshot,variation_snapshot
    ) values (
      new_order_id,product_row.id,entry.variation_id,selected_warehouse_id,
      entry.quantity,unit_price,line_total,line_total,'BDT',
      product_row.serial_tracking_required,product_row.name,
      product_row.sku,product_row.model_number,
      case when variation_row.id is null then null else
        jsonb_build_object(
          'id',variation_row.id,
          'sku',variation_row.sku,
          'combination_key',variation_row.combination_key
        )
      end
    );
  end loop;

  if order_total <= 0 then
    raise exception 'Cart total must be greater than zero';
  end if;
  if requested_expected_total is null or order_total is distinct from requested_expected_total then
    if requested_product_id is not null then
      raise exception 'The product price or quantity changed. Reload this page to review before payment';
    end if;
    raise exception 'Your cart price or quantity changed. Review the current cart total before paying';
  end if;
  update public.sales_orders
  set subtotal=order_total,total_amount=order_total
  where id=new_order_id;

  -- Stock is reserved before the customer is sent to EPS; reuse existing fulfilment records.
  for order_item in select * from public.sales_order_items where order_id=new_order_id order by product_id,variation_id nulls first loop
    select * into balance_row from public.inventory_balances
    where warehouse_id=order_item.fulfillment_warehouse_id and product_id=order_item.product_id
      and variation_id is not distinct from order_item.variation_id and location_id is null for update;
    if balance_row.id is null or balance_row.available<order_item.quantity then raise exception 'Insufficient stock for %',order_item.product_name_snapshot; end if;
    update public.inventory_balances set reserved=reserved+order_item.quantity,updated_at=now() where id=balance_row.id;
    insert into public.inventory_reservations(product_id,variation_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id)
    values(order_item.product_id,order_item.variation_id,order_item.fulfillment_warehouse_id,order_item.quantity,'active',
      (select order_number from public.sales_orders where id=new_order_id),actor_profile_id,new_order_id,order_item.id);
  end loop;
  update public.sales_orders set status='confirmed',confirmed_at=now() where id=new_order_id;
  insert into public.eps_checkout_requests(operation_id,profile_id,cart_id,order_id,fingerprint)
  values(requested_operation_id,actor_profile_id,cart.id,new_order_id,requested_fingerprint);
  insert into public.order_status_events(order_id,new_status,actor_profile_id,note)
  values(new_order_id,'confirmed',actor_profile_id,'Website order awaiting verified EPS payment; stock reserved');
  update public.shopping_carts
  set status='converted',converted_order_id=new_order_id,updated_at=now()
  where id=cart.id;
  return new_order_id;
end
$$;

revoke all on function public.customer_checkout_eps_order(uuid,uuid,text,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;

create or replace function public.customer_checkout_cart_eps(
  actor_profile_id uuid, requested_address_id uuid, requested_notes text, requested_email text,
  requested_phone text, requested_operation_id uuid, requested_fingerprint text, requested_expected_total numeric
) returns uuid
language sql security definer set search_path=''
as $$
  select public.customer_checkout_eps_order(
    actor_profile_id,requested_address_id,requested_notes,requested_email,requested_phone,
    requested_operation_id,requested_fingerprint,requested_expected_total,null,null,null,null
  );
$$;

create or replace function public.customer_checkout_product_eps(
  actor_profile_id uuid, requested_address_id uuid, requested_email text, requested_phone text,
  requested_operation_id uuid, requested_fingerprint text, requested_expected_total numeric,
  requested_product_id uuid, requested_variation_id uuid, requested_quantity integer, requested_new_address jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
begin
  if requested_product_id is null then raise exception 'Choose a product for online payment'; end if;
  return public.customer_checkout_eps_order(
    actor_profile_id,requested_address_id,null,requested_email,requested_phone,
    requested_operation_id,requested_fingerprint,requested_expected_total,
    requested_product_id,requested_variation_id,requested_quantity,requested_new_address
  );
end
$$;

revoke all on function public.customer_checkout_product_eps(uuid,uuid,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.customer_checkout_product_eps(uuid,uuid,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb) to service_role;

notify pgrst, 'reload schema';
