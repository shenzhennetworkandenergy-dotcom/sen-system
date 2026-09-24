\set ON_ERROR_STOP on

begin;

select plan(6);

select ok(
  not has_function_privilege('anon', 'public.refresh_warranty_coverages(uuid)', 'EXECUTE'),
  'anonymous users cannot execute internal warranty coverage refreshes'
);
select ok(
  not has_function_privilege('authenticated', 'public.refresh_warranty_coverages(uuid)', 'EXECUTE'),
  'authenticated users cannot execute internal warranty coverage refreshes'
);
select ok(
  has_function_privilege('service_role', 'public.refresh_warranty_coverages(uuid)', 'EXECUTE'),
  'service role can execute internal warranty coverage refreshes'
);
select ok(
  not has_function_privilege('anon', 'public.snapshot_sales_item_warranty()', 'EXECUTE'),
  'anonymous users cannot execute the warranty snapshot trigger helper'
);
select ok(
  not has_function_privilege('authenticated', 'public.snapshot_sales_item_warranty()', 'EXECUTE'),
  'authenticated users cannot execute the warranty snapshot trigger helper'
);

do $$
declare
  admin_id uuid := '6b132a5a-ffc1-4f4b-92d8-7995567f85b7';
  customer_id uuid := '0bcf8b54-6728-440e-961c-c871cfbbf730';
  warehouse_id uuid := '20000000-0000-4000-8000-000000000003';
  product_id uuid;
  order_id uuid := gen_random_uuid();
  coverage_id uuid;
  claim_id uuid;
  final_status text;
  final_resolution text;
  event_total integer;
  notification_total integer;
  claimed_total numeric;
begin
  select p.id
  into product_id
  from public.products p
  where p.status = 'active'
  order by p.created_at
  limit 1;

  if product_id is null then
    raise exception 'RMA integration test requires one active product';
  end if;

  insert into public.sales_orders (
    id,
    order_number,
    customer_profile_id,
    shipping_address_snapshot,
    billing_address_snapshot,
    fulfillment_warehouse_id,
    status,
    currency,
    subtotal,
    total_amount,
    delivered_at,
    completed_at,
    customer_status,
    created_by,
    updated_by
  ) values (
    order_id,
    'RMA-TEST-' || replace(order_id::text, '-', ''),
    customer_id,
    '{"full_name":"RMA Test Customer","phone":"+8801000000000","street":"Test address","city":"Dhaka","country_code":"BD"}'::jsonb,
    '{"full_name":"RMA Test Customer","phone":"+8801000000000","street":"Test address","city":"Dhaka","country_code":"BD"}'::jsonb,
    warehouse_id,
    'delivered',
    'BDT',
    100,
    100,
    now(),
    now(),
    'received',
    admin_id,
    admin_id
  );

  insert into public.sales_order_items (
    order_id,
    product_id,
    fulfillment_warehouse_id,
    quantity,
    delivered_quantity,
    unit_price,
    line_subtotal,
    line_total,
    currency,
    serial_tracking_required_snapshot,
    product_name_snapshot,
    sku_snapshot,
    warranty_enabled_snapshot,
    warranty_duration_months_snapshot,
    warranty_terms_snapshot
  )
  select
    order_id,
    p.id,
    warehouse_id,
    1,
    1,
    100,
    100,
    100,
    'BDT',
    false,
    p.name,
    p.sku,
    true,
    12,
    'Disposable RMA integration warranty.'
  from public.products p
  where p.id = product_id;

  perform public.refresh_warranty_coverages(order_id);

  select wc.id
  into coverage_id
  from public.warranty_coverages wc
  where wc.sales_order_id = order_id;

  if coverage_id is null then
    raise exception 'Warranty coverage was not created';
  end if;

  claim_id := public.submit_rma_claim(
    customer_id,
    coverage_id,
    'warranty',
    1,
    'Disposable end-to-end warranty integration claim.'
  );

  perform public.transition_rma_claim(admin_id, claim_id, 'under_review', null, 'Review started.', admin_id);
  perform public.transition_rma_claim(admin_id, claim_id, 'return_requested', null, 'Return requested.', admin_id);
  perform public.transition_rma_claim(admin_id, claim_id, 'product_received', null, 'Product received.', admin_id);
  perform public.transition_rma_claim(admin_id, claim_id, 'resolution_in_progress', null, 'Repair started.', admin_id);
  perform public.transition_rma_claim(admin_id, claim_id, 'closed', 'repaired', 'Repair completed.', admin_id);

  select rc.status, rc.resolution
  into final_status, final_resolution
  from public.rma_claims rc
  where rc.id = claim_id;

  select count(*)::integer
  into event_total
  from public.rma_events re
  where re.rma_claim_id = claim_id;

  select count(*)::integer
  into notification_total
  from public.customer_notifications n
  where n.profile_id = customer_id
    and n.entity_type = 'rma_claim'
    and n.entity_id = claim_id;

  select wc.claimed_quantity
  into claimed_total
  from public.warranty_coverages wc
  where wc.id = coverage_id;

  if final_status <> 'closed' or final_resolution <> 'repaired' then
    raise exception 'Unexpected final RMA state: % / %', final_status, final_resolution;
  end if;

  if event_total <> 6 then
    raise exception 'Expected 6 RMA events, found %', event_total;
  end if;

  if notification_total < 6 then
    raise exception 'Expected at least 6 customer notifications, found %', notification_total;
  end if;

  if claimed_total <> 1 then
    raise exception 'Expected claimed quantity 1, found %', claimed_total;
  end if;

  raise notice 'RMA database integration passed: claim %, events %, notifications %, claimed quantity %',
    claim_id, event_total, notification_total, claimed_total;
end;
$$;

select pass('RMA database integration completed');
select * from finish();

rollback;
