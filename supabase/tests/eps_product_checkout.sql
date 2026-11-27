-- Run against a disposable local database with the customer commerce fixtures.
begin;
set local request.jwt.claim.role = 'service_role';
do $$
<<eps_test>>
declare
  buyer_id uuid;
  admin_id uuid;
  warehouse_id uuid;
  product_id uuid := gen_random_uuid();
  other_product_id uuid := gen_random_uuid();
  active_cart_id uuid;
  selected_address_id uuid;
  order_id uuid;
  operation_id uuid := gen_random_uuid();
  address_count integer;
  rejected boolean;
begin
  select id into strict buyer_id from public.profiles where email='mobile.customer@example.test';
  select id into strict admin_id from public.profiles where email='mobile.admin@example.test';
  update public.payment_gateways set enabled=true,test_mode=true where code='eps';
  update public.shopping_carts set status='abandoned' where profile_id=buyer_id and status='active';
  insert into public.shopping_carts(profile_id) values(buyer_id) returning id into active_cart_id;
  insert into public.warehouses(code,name,country_code,country_name)
  values('EPS-DIRECT-'||product_id,'EPS direct test warehouse','BD','Bangladesh') returning id into warehouse_id;
  insert into public.products(id,name,slug,sku,status,currency,regular_price,public_catalogue_visible)
  values
    (product_id,'EPS direct test','eps-direct-'||product_id,'EPS-DIRECT-'||product_id,'active','BDT',120.50,true),
    (other_product_id,'Other cart item','eps-other-'||other_product_id,'EPS-OTHER-'||other_product_id,'active','BDT',40,true);
  insert into public.inventory_balances(product_id,warehouse_id,on_hand,reserved) values(product_id,warehouse_id,6,0);
  insert into public.shopping_cart_items(cart_id,product_id,quantity) values(active_cart_id,other_product_id,3);
  insert into public.customer_addresses(profile_id,recipient_name,phone,address_line_1,city,postal_code,country_code)
  values(buyer_id,'Test customer','01712345678','Local fixture address','Dhaka','1200','BD') returning id into selected_address_id;

  select count(*) into address_count from public.customer_addresses where profile_id=buyer_id;
  rejected := false;
  begin
    perform public.customer_checkout_product_eps(
      buyer_id,null,'direct@example.test','01712345678',gen_random_uuid(),repeat('b',64),240,
      product_id,null,2,'{"recipient_name":"Local buyer","address_line_1":"Test street","city":"Dhaka","postal_code":"1200","country_code":"BD"}'
    );
  exception when raise_exception then
    rejected := sqlerrm like '%price or quantity changed%';
  end;
  if not rejected or address_count <> (select count(*) from public.customer_addresses where profile_id=buyer_id) then
    raise exception 'Stale pricing did not reject the whole order and address';
  end if;

  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',operation_id,repeat('a',64),241,
    product_id,null,2,null
  );
  if order_id is distinct from public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',operation_id,repeat('a',64),241,
    product_id,null,2,null
  ) then raise exception 'Repeating the same checkout created another order'; end if;
  if (select status from public.shopping_carts where id=active_cart_id) <> 'active'
    or (select count(*) from public.shopping_cart_items where cart_id=active_cart_id) <> 1
    or (select sum(quantity) from public.shopping_cart_items where cart_id=active_cart_id) <> 3
  then raise exception 'Direct checkout changed the active cart'; end if;
  if (select count(*) from public.sales_order_items where sales_order_items.order_id=eps_test.order_id) <> 1
    or (select total_amount from public.sales_orders where id=order_id) <> 241
  then raise exception 'A different product or amount reached the order'; end if;

  rejected := false;
  begin
    perform public.customer_checkout_product_eps(
      buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('c',64),120.50,
      product_id,null,1,null
    );
  exception when raise_exception then
    rejected := sqlerrm like '%already open%';
  end;
  if not rejected then raise exception 'Another click accepted an overlapping payment'; end if;
  if public.restore_unpaid_eps_cart(order_id,buyer_id,admin_id) <> 'restored'
  then raise exception 'The order could not be recovered'; end if;
  if (select reserved from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 0
    or (select sum(quantity) from public.shopping_cart_items where cart_id=active_cart_id) <> 5
  then raise exception 'Recovery did not release stock and restore the direct order to the cart'; end if;
  if has_function_privilege('authenticated','public.customer_checkout_product_eps(uuid,uuid,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb)','execute')
  then raise exception 'The direct checkout RPC is exposed'; end if;
  raise notice 'PASS: direct checkout isolation, changed total rollback, idempotency, duplicate guard, and stock recovery';
end $$;
rollback;
