-- Transactional local acceptance test for Phase 2. All test changes are rolled back.
begin;
do $$
declare
  actor uuid; customer uuid; product uuid; warehouse uuid; reason uuid;
  test_order_id uuid; test_item_id uuid; allocation_ids uuid[]; test_package_id uuid;
  shipment_one uuid; shipment_two uuid; tracking_id uuid; status_id uuid;
  original_on_hand numeric; original_reserved numeric; final_status text;
begin
  select id into actor from public.profiles where email='shafayet445@gmail.com' and role='admin' and status='active';
  select id into customer from public.profiles where role='customer' and status='active' order by created_at limit 1;
  select id into product from public.products where serial_tracking_required and status='active' order by created_at limit 1;
  select id into warehouse from public.warehouses where is_active order by created_at limit 1;
  select id into reason from public.stock_adjustment_reasons where key='opening_balance' and is_active;
  if actor is null or customer is null or product is null or warehouse is null or reason is null then raise exception 'Phase 2 test prerequisites are missing'; end if;
  select coalesce(on_hand,0),coalesce(reserved,0) into original_on_hand,original_reserved
    from public.inventory_balances where product_id=product and warehouse_id=warehouse and variation_id is null and location_id is null;
  original_on_hand:=coalesce(original_on_hand,0); original_reserved:=coalesce(original_reserved,0);

  perform public.admin_adjust_serialized_inventory(actor,warehouse,product,null,2,reason,'Phase 2 rollback-only test','{}',array['P2-LOCAL-UNIT-001','P2-LOCAL-UNIT-002']);
  test_order_id:=public.create_sales_order(
    actor,customer,null,
    jsonb_build_object('recipient_name','Phase 2 Customer','phone','01700000000','address_line_1','Rollback Test Address','city','Dhaka','country_code','BD'),
    warehouse,'BDT',0,250,0,'Rollback-only internal note','Your order is being prepared.',
    jsonb_build_array(jsonb_build_object('product_id',product,'warehouse_id',warehouse,'quantity',2,'unit_price',65000))
  );
  perform public.confirm_sales_order(actor,test_order_id);
  select id into test_item_id from public.sales_order_items where order_id=test_order_id order by created_at limit 1;
  if test_item_id is null then raise exception 'Order item was not created'; end if;
  if (select reserved from public.inventory_balances where product_id=product and warehouse_id=warehouse and variation_id is null and location_id is null)<>original_reserved+2 then raise exception 'Reservation total is incorrect'; end if;

  if public.auto_allocate_order_serials(actor,test_item_id)<>2 then raise exception 'Auto-allocation count is incorrect'; end if;
  select array_agg(id order by allocated_at) into allocation_ids from public.order_serial_allocations where order_id=test_order_id and status='active';
  if coalesce(array_length(allocation_ids,1),0)<>2 then raise exception 'Exact serial allocation failed'; end if;
  test_package_id:=public.save_order_packing(actor,test_order_id,'P2-BOX-1',allocation_ids,'[]',true,18,jsonb_build_object('length',60,'width',40,'height',30),'Rollback-only packing');
  if test_package_id is null or (select count(*) from public.order_packed_items where package_id=test_package_id)<>2 then raise exception 'Packing failed'; end if;

  shipment_one:=public.create_order_shipment(
    actor,test_order_id,'air',null,null,
    jsonb_build_object('label','Shenzhen origin','city','Shenzhen','country_code','CN','latitude',22.5431,'longitude',114.0579),
    jsonb_build_object('label','Dhaka destination','city','Dhaka','country_code','BD','latitude',23.8103,'longitude',90.4125),
    now(),now()+interval '4 days',1,9,'60x40x30','Internal air test','First partial shipment',
    jsonb_build_array(jsonb_build_object('order_item_id',test_item_id,'quantity',1,'allocation_ids',jsonb_build_array(allocation_ids[1]))),
    jsonb_build_array(jsonb_build_object('label','Shenzhen','point_type','origin','latitude',22.5431,'longitude',114.0579),jsonb_build_object('label','Dhaka','point_type','destination','latitude',23.8103,'longitude',90.4125))
  );
  perform public.confirm_order_shipment(actor,shipment_one); perform public.dispatch_order_shipment(actor,shipment_one);
  select id into status_id from public.tracking_status_definitions where key='arrived_bangladesh_airport';
  tracking_id:=public.add_shipment_tracking_event(actor,shipment_one,status_id,null,jsonb_build_object('label','Dhaka airport','latitude',23.8433,'longitude',90.3978),'manual','Internal arrival note','Arrived in Bangladesh','Your shipment reached the Bangladesh airport.','both',now(),null,null);
  if tracking_id is null then raise exception 'Tracking event failed'; end if;
  perform public.mark_shipment_delivered(actor,shipment_one,'First unit delivered.');
  select status into final_status from public.sales_orders where id=test_order_id;
  if final_status<>'partially_shipped' then raise exception 'Partial order state is incorrect: %',final_status; end if;

  shipment_two:=public.create_order_shipment(
    actor,test_order_id,'sea',null,null,
    jsonb_build_object('label','Shenzhen port','country_code','CN','latitude',22.48,'longitude',113.88),
    jsonb_build_object('label','Chattogram port','country_code','BD','latitude',22.31,'longitude',91.80),
    now(),now()+interval '12 days',1,9,'60x40x30','Internal sea test','Second partial shipment',
    jsonb_build_array(jsonb_build_object('order_item_id',test_item_id,'quantity',1,'allocation_ids',jsonb_build_array(allocation_ids[2]))),
    jsonb_build_array(jsonb_build_object('label','Shenzhen port','point_type','seaport','latitude',22.48,'longitude',113.88),jsonb_build_object('label','Chattogram port','point_type','seaport','latitude',22.31,'longitude',91.80))
  );
  perform public.confirm_order_shipment(actor,shipment_two); perform public.dispatch_order_shipment(actor,shipment_two); perform public.mark_shipment_delivered(actor,shipment_two,'Second unit delivered.');
  select status into final_status from public.sales_orders where id=test_order_id;
  if final_status<>'delivered' then raise exception 'Delivered order state is incorrect: %',final_status; end if;
  if (select count(*) from public.shipments where order_id=test_order_id)<>2 then raise exception 'Multiple shipment support failed'; end if;
  if (select count(*) from public.shipment_tracking_events where order_id=test_order_id and event_visibility in('customer','both'))<3 then raise exception 'Customer-visible tracking events are missing'; end if;
  if (select count(*) from public.order_serial_allocations where order_id=test_order_id and status='delivered')<>2 then raise exception 'Delivered serial state is incorrect'; end if;

  begin
    perform public.allocate_order_serials(actor,test_item_id,array[(select serial_number_id from public.order_serial_allocations where order_id=test_order_id limit 1)],'manual');
    raise exception 'A delivered serial was incorrectly reallocated';
  exception when others then if sqlerrm='A delivered serial was incorrectly reallocated' then raise; end if; end;
  raise notice 'Phase 2 transactional workflow passed: order %, shipments %, %',test_order_id,shipment_one,shipment_two;
end $$;
rollback;
