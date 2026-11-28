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
  replacement_order_id uuid;
  replacement_operation_id uuid := gen_random_uuid();
  saved_item_id uuid;
  active_item_id uuid;
  attempt_id uuid;
  merchant_id text := (900000000000000000 + floor(random()*100000000)::bigint)::text;
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

  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('d',64),241,
    product_id,null,2,null
  );
  attempt_id := (public.begin_eps_payment(order_id,buyer_id,merchant_id)->'attempt'->>'id')::uuid;
  if public.manage_unpaid_eps_checkout(order_id,admin_id,admin_id,'remove') <> 'unavailable'
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'queued'
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'edit') <> 'queued'
  then raise exception 'A queued deletion was not accepted or a foreign request was accepted'; end if;
  if (select requested_change from public.eps_checkout_requests where eps_checkout_requests.order_id=eps_test.order_id) is distinct from 'remove'
  then raise exception 'A conflicting request replaced the original deletion'; end if;
  update public.eps_checkout_requests set payment_expires_at=now()-interval '1 hour'
  where eps_checkout_requests.order_id=eps_test.order_id;
  perform public.expire_eps_unpaid_orders(admin_id);
  if (select reserved from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 2
  then raise exception 'Stock was released while payment could still complete'; end if;
  rejected := false;
  begin
    perform public.begin_eps_payment(order_id,buyer_id,merchant_id);
  exception when raise_exception then
    rejected := sqlerrm like '%checkout is being changed%';
  end;
  if not rejected then raise exception 'A queued deletion allowed the customer to reopen EPS'; end if;

  perform public.apply_eps_verification(attempt_id,merchant_id,241,'cancelled',null,null,admin_id);
  perform public.expire_eps_unpaid_orders(admin_id);
  if not exists(select 1 from public.eps_checkout_requests where eps_checkout_requests.order_id=eps_test.order_id and discarded_at is not null and requested_change is null)
  then raise exception 'The closed checkout was not automatically deleted'; end if;
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'removed'
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'edit') <> 'removed'
  then raise exception 'Checkout removal did not preserve the final state'; end if;
  if (select status from public.sales_orders where id=order_id) <> 'cancelled'
    or (select reserved from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 0
    or (select available from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 6
    or (select sum(quantity) from public.shopping_cart_items where cart_id=active_cart_id) <> 5
    or not exists(select 1 from public.eps_payment_attempts where id=attempt_id and status='cancelled')
    or not exists(select 1 from public.eps_checkout_requests where eps_checkout_requests.order_id=eps_test.order_id and discarded_at is not null)
  then raise exception 'Removal lost history, retained stock, or changed the active cart'; end if;
  select i.id into strict saved_item_id
  from public.eps_checkout_requests c join public.shopping_cart_items i on i.cart_id=c.cart_id
  where c.order_id=eps_test.order_id;
  if public.update_active_cart_item(buyer_id,saved_item_id,0)
    or public.update_active_cart_item(buyer_id,saved_item_id,4)
  then raise exception 'A cart edit changed a converted checkout'; end if;

  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('e',64),120.50,
    product_id,null,1,null
  );
  merchant_id := (merchant_id::bigint + 100000000)::text;
  attempt_id := (public.begin_eps_payment(order_id,buyer_id,merchant_id)->'attempt'->>'id')::uuid;
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'edit') <> 'queued'
    or (select sum(quantity) from public.shopping_cart_items where cart_id=active_cart_id) <> 5
  then raise exception 'An in-flight checkout edit was not queued correctly'; end if;
  perform public.apply_eps_verification(attempt_id,merchant_id,120.50,'failed',null,null,admin_id);
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,null) <> 'restored'
  then raise exception 'The worker did not return the closed checkout to the active cart'; end if;
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'edit') <> 'restored'
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'restored'
  then raise exception 'Editing did not preserve the final state'; end if;
  if (select sum(quantity) from public.shopping_cart_items where cart_id=active_cart_id) <> 6
    or (select reserved from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 0
  then raise exception 'Editing failed to return items and release stock exactly once'; end if;
  select id into strict active_item_id from public.shopping_cart_items
  where cart_id=active_cart_id and shopping_cart_items.product_id=eps_test.product_id;
  if public.update_active_cart_item(admin_id,active_item_id,0)
    or not public.update_active_cart_item(buyer_id,active_item_id,10)
  then raise exception 'Active cart change failed or another account modified it'; end if;
  if (select quantity from public.shopping_cart_items where id=active_item_id) <> 10
    or not public.update_active_cart_item(buyer_id,active_item_id,0)
  then raise exception 'Quantity update or item removal failed'; end if;
  if exists(select 1 from public.shopping_cart_items where id=active_item_id)
  then raise exception 'Removed item remains in the cart'; end if;

  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('f',64),120.50,
    product_id,null,1,null
  );
  merchant_id := (merchant_id::bigint + 100000000)::text;
  attempt_id := (public.begin_eps_payment(order_id,buyer_id,merchant_id)->'attempt'->>'id')::uuid;
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'queued'
  then raise exception 'The deletion was not queued before the EPS payment was recorded'; end if;
  perform public.apply_eps_verification(attempt_id,merchant_id,120.50,'success','LOCAL-SAVED-EPS-TEST','test',admin_id);
  perform public.expire_eps_unpaid_orders(admin_id);
  if (select status from public.eps_payment_attempts where id=attempt_id) <> 'sandbox_paid'
    or (select reserved from public.inventory_balances where inventory_balances.product_id=eps_test.product_id) <> 1
    or exists(select 1 from public.eps_checkout_requests where eps_checkout_requests.order_id=eps_test.order_id and (discarded_at is not null or requested_change is not null))
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'edit') <> 'blocked'
    or public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'blocked'
  then raise exception 'Paid checkout could be changed'; end if;
  if public.confirm_closed_eps_checkout(order_id,admin_id,'EPS-CASE-PAID') <> 'not_eligible'
  then raise exception 'Paid checkout was eligible for manual closure'; end if;

  insert into public.inventory_balances(product_id,warehouse_id,on_hand,reserved)
  values(other_product_id,warehouse_id,6,0);
  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('7',64),80,
    other_product_id,null,2,null
  );
  merchant_id := (merchant_id::bigint + 100000000)::text;
  attempt_id := (public.begin_eps_payment(order_id,buyer_id,merchant_id)->'attempt'->>'id')::uuid;
  -- Simulate a live attempt inside this rolled-back fixture to exercise late real-money detection.
  update public.eps_payment_attempts set test_mode=false where id=attempt_id;
  perform public.apply_eps_verification(attempt_id,merchant_id,80,'pending',null,null,admin_id);
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'queued'
    or public.confirm_closed_eps_checkout(order_id,admin_id,'EPS-CASE-1001') <> 'not_eligible'
  then raise exception 'Manual closure allowed on a checkout whose window was still open'; end if;
  update public.eps_checkout_requests set payment_expires_at=now()-interval '1 day'
  where eps_checkout_requests.order_id=eps_test.order_id;
  rejected := false;
  begin
    perform public.confirm_closed_eps_checkout(order_id,buyer_id,'EPS-CASE-1001');
  exception when raise_exception then
    rejected := sqlerrm = 'Permission denied';
  end;
  if not rejected or public.confirm_closed_eps_checkout(order_id,admin_id,' ') <> 'invalid_reference'
  then raise exception 'An unauthorized actor or a blank reference could close a checkout'; end if;
  if not public.claim_eps_verification(attempt_id)
    or public.confirm_closed_eps_checkout(order_id,admin_id,'EPS-CASE-1001') <> 'verification_busy'
  then raise exception 'Manual closure could race with active payment verification'; end if;
  update public.eps_payment_attempts set verification_lease_until=null where id=attempt_id;
  if public.confirm_closed_eps_checkout(order_id,admin_id,'EPS-CASE-1001') <> 'removed'
    or public.confirm_closed_eps_checkout(order_id,admin_id,'EPS-CASE-1001') <> 'not_eligible'
  then raise exception 'Out-of-band closure failed or could be repeated'; end if;
  if (select reserved from public.inventory_balances where inventory_balances.product_id=other_product_id) <> 0
    or (select available from public.inventory_balances where inventory_balances.product_id=other_product_id) <> 6
    or not exists (
      select 1 from public.audit_logs where action='payments.eps_unpaid_closure_confirmed'
      and entity_id=order_id::text and actor_id=admin_id and new_values->>'confirmation_reference'='EPS-CASE-1001'
    )
  then raise exception 'Manual closure did not release the stock or save the audit reference'; end if;
  if public.apply_eps_verification(attempt_id,merchant_id,80,'success','LOCAL-REVIEW-LATE-EPS','test',admin_id) <> 'review_required'
  then raise exception 'Late verified money after closure was not escalated for review'; end if;

  order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',gen_random_uuid(),repeat('8',64),40,
    other_product_id,null,1,null
  );
  merchant_id := (merchant_id::bigint + 100000000)::text;
  attempt_id := (public.begin_eps_payment(order_id,buyer_id,merchant_id)->'attempt'->>'id')::uuid;
  update public.eps_payment_attempts set test_mode=false where id=attempt_id;
  perform public.apply_eps_verification(attempt_id,merchant_id,40,'pending',null,null,admin_id);
  if public.manage_unpaid_eps_checkout(order_id,buyer_id,admin_id,'remove') <> 'queued'
    or (select checkout.order_id from public.find_blocking_eps_product_checkout(buyer_id,other_product_id,null) checkout)
      is distinct from order_id
  then raise exception 'A live payment window stopped blocking duplicate checkout'; end if;

  update public.eps_checkout_requests set payment_expires_at=now()-interval '1 hour'
  where eps_checkout_requests.order_id=eps_test.order_id;
  if exists(select 1 from public.find_blocking_eps_product_checkout(buyer_id,other_product_id,null))
  then raise exception 'An expired checkout queued for removal blocked a new order'; end if;
  replacement_order_id := public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',replacement_operation_id,repeat('9',64),120,
    other_product_id,null,3,null
  );
  if replacement_order_id=order_id
    or (select total_amount from public.sales_orders where id=replacement_order_id) is distinct from 120
    or (select quantity from public.sales_order_items where sales_order_items.order_id=replacement_order_id) is distinct from 3
    or (select reserved from public.inventory_balances where inventory_balances.product_id=other_product_id) is distinct from 4
    or (select checkout.order_id from public.find_blocking_eps_product_checkout(buyer_id,other_product_id,null) checkout)
      is distinct from replacement_order_id
  then raise exception 'The new selection did not get a separate checkout with the original reservation intact'; end if;
  if public.customer_checkout_product_eps(
    buyer_id,selected_address_id,'direct@example.test','01712345678',replacement_operation_id,repeat('9',64),120,
    other_product_id,null,3,null
  ) is distinct from replacement_order_id
  then raise exception 'Retrying the new checkout created a second order'; end if;
  if (public.begin_eps_payment(replacement_order_id,buyer_id,(merchant_id::bigint + 100000000)::text)->'attempt'->>'amount')::numeric
    is distinct from 120
  then raise exception 'The EPS attempt did not use the new order total'; end if;
  if public.apply_eps_verification(attempt_id,merchant_id,40,'success','LOCAL-ABANDONED-LATE-EPS','test',admin_id) <> 'review_required'
    or exists(select 1 from public.sale_payments where sale_payments.order_id=eps_test.order_id)
    or (select paid_amount from public.sales_orders where id=order_id) is distinct from 0
  then raise exception 'A late payment for the old order was applied automatically'; end if;

  if has_function_privilege('authenticated','public.manage_unpaid_eps_checkout(uuid,uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.update_active_cart_item(uuid,uuid,integer)','execute')
    or has_function_privilege('authenticated','public.confirm_closed_eps_checkout(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.find_blocking_eps_product_checkout(uuid,uuid,uuid)','execute')
  then raise exception 'The saved checkout management RPC is exposed'; end if;
  if has_function_privilege('authenticated','public.customer_checkout_product_eps(uuid,uuid,text,text,uuid,text,numeric,uuid,uuid,integer,jsonb)','execute')
  then raise exception 'The direct checkout RPC is exposed'; end if;
  raise notice 'PASS: direct checkout, duplicate protection, edit and remove, payment safeguards, and stock recovery';
end $$;
rollback;
