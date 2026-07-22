-- Transactional local acceptance test for Inventory Modernization Phase 3.
-- Every mutation is rolled back; this file is safe only against the disposable
-- local Supabase database.
begin;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  actor uuid;
  customer uuid;
  product uuid;
  duplicate_candidate uuid;
  warehouse uuid;
  reason uuid;
  brand uuid;
  model text;
  batch uuid;
  test_order_id uuid;
  test_order_item_id uuid;
  allocation_id uuid;
  shipment_id uuid;
  session_id uuid;
  location_update_id uuid;
  before_on_hand numeric;
begin
  select id into actor from public.profiles
    where role = 'admin' and status = 'active' order by created_at limit 1;
  select id into customer from public.profiles
    where role = 'customer' and status = 'active' order by created_at limit 1;
  select id into product from public.products
    where serial_tracking_required and status = 'active'
    order by created_at limit 1;
  select id into duplicate_candidate from public.products
    where id <> product order by created_at limit 1;
  select id into warehouse from public.warehouses
    where is_active order by created_at limit 1;
  select id into reason from public.stock_adjustment_reasons
    where key = 'opening_balance' and is_active;
  select id into brand from public.brands where is_active order by created_at limit 1;

  if actor is null or customer is null or product is null or duplicate_candidate is null
     or warehouse is null or reason is null or brand is null then
    raise exception 'Phase 3 test prerequisites are missing';
  end if;

  model := 'PHASE3-ROLLBACK-MODEL';
  update public.products
    set brand_id = brand, model_number = model
    where id = product;

  -- The active brand/model identity must remain unique.
  begin
    update public.products
      set brand_id = brand, model_number = model, status = 'active'
      where id = duplicate_candidate;
    raise exception 'Duplicate active brand/model was incorrectly accepted';
  exception when others then
    if sqlerrm = 'Duplicate active brand/model was incorrectly accepted' then raise; end if;
  end;

  select coalesce(on_hand, 0) into before_on_hand
    from public.inventory_balances
    where warehouse_id = warehouse and product_id = product
      and variation_id is null and location_id is null;
  before_on_hand := coalesce(before_on_hand, 0);

  batch := public.phase3_receive_serialized_stock(
    actor, product, null, warehouse, 1, 'new', reason,
    'Phase 3 rollback-only serialized receipt',
    array['PHASE3-LOCAL-MANUFACTURER-001']
  );
  if batch is null then raise exception 'Serialized receipt returned no batch'; end if;
  if (select count(*) from public.serial_numbers
      where generation_batch_id = batch and status = 'available') <> 1 then
    raise exception 'Serialized unit was not received as available';
  end if;
  if (select on_hand from public.inventory_balances
      where warehouse_id = warehouse and product_id = product
        and variation_id is null and location_id is null) <> before_on_hand + 1 then
    raise exception 'Serialized receipt did not update on-hand balance atomically';
  end if;

  test_order_id := public.create_sales_order(
    actor, customer, null,
    jsonb_build_object(
      'recipient_name', 'Phase 3 Customer',
      'phone', '01700000000',
      'address_line_1', 'Rollback Test Address',
      'city', 'Dhaka',
      'country_code', 'BD'
    ),
    warehouse, 'BDT', 0, 250, 0,
    'Phase 3 rollback-only order',
    'Your order is being prepared.',
    jsonb_build_array(jsonb_build_object(
      'product_id', product,
      'warehouse_id', warehouse,
      'quantity', 1,
      'unit_price', 65000
    ))
  );
  perform public.confirm_sales_order(actor, test_order_id);
  select id into test_order_item_id from public.sales_order_items
    where order_id = test_order_id order by created_at limit 1;
  perform public.auto_allocate_order_serials(actor, test_order_item_id);
  select id into allocation_id from public.order_serial_allocations
    where order_serial_allocations.order_id = test_order_id and status = 'active'
    order by allocated_at limit 1;

  shipment_id := public.create_order_shipment(
    actor, test_order_id, 'local_delivery', null, null,
    jsonb_build_object('label', 'SEN warehouse', 'city', 'Dhaka', 'country_code', 'BD'),
    jsonb_build_object('label', 'Customer address', 'city', 'Dhaka', 'country_code', 'BD'),
    now(), now() + interval '1 day', 1, 1, '20x20x20',
    'Phase 3 internal test', 'Foreground location test',
    '[]'::jsonb,
    '[]'::jsonb
  );

  session_id := public.phase3_manage_location_session(actor, shipment_id, 'start');
  location_update_id := public.phase3_record_location(
    actor, session_id, 23.8103, 90.4125, 12, 45, 0
  );
  if location_update_id is null then raise exception 'Location update was not recorded'; end if;
  if not exists(select 1 from public.delivery_location_updates
      where id = location_update_id and customer_visible) then
    raise exception 'Customer-visible location update is missing';
  end if;
  perform public.phase3_manage_location_session(actor, shipment_id, 'pause');
  perform public.phase3_manage_location_session(actor, shipment_id, 'start');
  perform public.phase3_manage_location_session(actor, shipment_id, 'stop');
  if (select status from public.delivery_location_sessions where id = session_id) <> 'stopped' then
    raise exception 'Location session did not stop';
  end if;

  raise notice 'Phase 3 transactional workflow passed: batch %, shipment %, session %',
    batch, shipment_id, session_id;
end $$;

rollback;
