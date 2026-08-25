-- Rollback-only executable acceptance test for the atomic Draft quotation RPC.
create or replace function pg_temp.assert_dqe(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then raise exception '%',failure_message; end if;
end $$;

create or replace function pg_temp.call_dqe(
  actor_id uuid,
  requested_quote_id uuid,
  expected_updated_at timestamptz,
  items jsonb
) returns uuid language sql as $$
  select public.update_draft_quotation(
    actor_id,requested_quote_id,expected_updated_at,
    'Edited Draft subject','Edited Company','TIN-EDITED',current_date+7,current_date+14,
    'Edited terms','Net 30','Edited delivery','Edited customer note','Edited internal note',2,3,items
  )
$$;

create or replace function pg_temp.expect_dqe_failure(
  actor_id uuid,
  requested_quote_id uuid,
  expected_updated_at timestamptz,
  items jsonb,
  expected_error text
) returns void language plpgsql as $$
declare
  header_before jsonb;
  items_before jsonb;
  failed boolean:=false;
begin
  select to_jsonb(q) into header_before from public.quotation_requests q where q.id=requested_quote_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into items_before
  from public.quotation_request_items i where i.quotation_id=requested_quote_id;
  begin
    perform pg_temp.call_dqe(actor_id,requested_quote_id,expected_updated_at,items);
  exception when others then
    failed:=true;
    if position(lower(expected_error) in lower(sqlerrm))=0 then
      raise exception 'Expected error containing "%", got "%"',expected_error,sqlerrm;
    end if;
  end;
  perform pg_temp.assert_dqe(failed,'Expected Draft edit failure did not occur');
  perform pg_temp.assert_dqe(
    header_before=(select to_jsonb(q) from public.quotation_requests q where q.id=requested_quote_id),
    'Failed Draft edit changed its quotation header'
  );
  perform pg_temp.assert_dqe(
    items_before=(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
      from public.quotation_request_items i where i.quotation_id=requested_quote_id),
    'Failed Draft edit changed its quotation items'
  );
end $$;

-- Fingerprints catch inserts, deletes, and in-place updates in the related
-- operational tables.  The disposable verifier runs this whole file in one
-- transaction, so this remains rollback-only even when a future trigger is
-- added to the quotation path.
create or replace function pg_temp.dqe_table_fingerprint(target regclass)
returns text language plpgsql as $$
declare result text;
begin
  execute format(
    'select md5(coalesce(string_agg(to_jsonb(row_data)::text, ''|'' order by to_jsonb(row_data)::text), '''')) from %s row_data',
    target
  ) into result;
  return result;
end $$;

do $$
<<dqe_test>>
declare
  stamp text:=replace(gen_random_uuid()::text,'-','');
  admin_id uuid:=gen_random_uuid();
  owner_id uuid:=gen_random_uuid();
  all_id uuid:=gen_random_uuid();
  denied_id uuid:=gen_random_uuid();
  other_owner_id uuid:=gen_random_uuid();
  customer_id uuid:=gen_random_uuid();
  product_id uuid:=gen_random_uuid();
  replacement_product_id uuid:=gen_random_uuid();
  variation_id uuid:=gen_random_uuid();
  quotation_id uuid:=gen_random_uuid();
  other_quotation_id uuid:=gen_random_uuid();
  quoted_quotation_id uuid:=gen_random_uuid();
  corrupt_quotation_id uuid:=gen_random_uuid();
  expected_updated_at timestamptz;
  role_name text;
  failed boolean;
  result_id uuid;
  replacement_items jsonb;
  unchanged_fingerprints jsonb;
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000',admin_id,'authenticated','authenticated','dqe-admin-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','dqe-owner-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',all_id,'authenticated','authenticated','dqe-all-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',denied_id,'authenticated','authenticated','dqe-denied-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',other_owner_id,'authenticated','authenticated','dqe-other-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',customer_id,'authenticated','authenticated','dqe-customer-'||stamp||'@local.test','offline-only',now(),'{}','{}',now(),now());
  insert into public.profiles(id,email,full_name,role,status)
  values
    (admin_id,'dqe-admin-'||stamp||'@local.test','DQE Admin','admin','active'),
    (owner_id,'dqe-owner-'||stamp||'@local.test','DQE Employee','employee','active'),
    (all_id,'dqe-all-'||stamp||'@local.test','DQE Employee','employee','active'),
    (denied_id,'dqe-denied-'||stamp||'@local.test','DQE Employee','employee','active'),
    (other_owner_id,'dqe-other-'||stamp||'@local.test','DQE Employee','employee','active'),
    (customer_id,'dqe-customer-'||stamp||'@local.test','DQE Customer','customer','active')
  on conflict(id) do nothing;
  update public.profiles set role='admin',status='active',full_name='DQE Admin' where id=admin_id;
  update public.profiles set role='employee',status='active',full_name='DQE Employee'
  where id in(owner_id,all_id,denied_id,other_owner_id);
  update public.profiles set role='customer',status='active',full_name='DQE Customer',phone='01700000009'
  where id=customer_id;

  insert into public.profile_permission_overrides(profile_id,permission_id,effect,reason,assigned_by,is_active)
  select actor.id,p.id,'allow','Draft quotation edit acceptance test',admin_id,true
  from (values
    (owner_id,'quotations.edit'),(owner_id,'quotations.view_own'),
    (all_id,'quotations.edit'),(all_id,'quotations.view_all'),
    (other_owner_id,'quotations.edit'),(other_owner_id,'quotations.view_own')
  ) actor(id,key) join public.permissions p on p.key=actor.key;

  insert into public.products(
    id,name,slug,sku,product_type,status,regular_price,sale_price,currency,
    manage_stock,serial_tracking_required,public_catalogue_visible,created_by,updated_by
  ) values
    (product_id,'DQE Variable Product','dqe-variable-'||stamp,'DQE-V-'||left(stamp,8),'variable','active',100,100,'BDT',false,false,true,admin_id,admin_id),
    (replacement_product_id,'DQE Replacement Product','dqe-replacement-'||stamp,'DQE-R-'||left(stamp,8),'simple','active',100,100,'BDT',false,false,true,admin_id,admin_id);
  insert into public.product_variations(id,product_id,sku,status,regular_price,sale_price,manage_stock,combination_key)
  values(variation_id,product_id,'DQE-VAR-'||left(stamp,8),'active',100,100,false,'dqe-'||left(stamp,8));

  insert into public.quotation_requests(
    id,reference,profile_id,created_by,status,subject,company_name,currency,
    shipping_address_id,billing_address_id,shipping_address_snapshot,billing_address_snapshot
  ) values
    (quotation_id,'DQE-'||left(stamp,10),customer_id,owner_id,'draft','Original subject','Original Co','BDT',null,null,null,null),
    (other_quotation_id,'DQE-OTHER-'||left(stamp,8),customer_id,other_owner_id,'draft','Other subject','Original Co','BDT',null,null,null,null),
    (quoted_quotation_id,'DQE-QUOTED-'||left(stamp,8),customer_id,owner_id,'quoted','Quoted subject','Original Co','BDT',null,null,null,null),
    (corrupt_quotation_id,'DQE-CORRUPT-'||left(stamp,8),customer_id,owner_id,'draft','Corrupt subject','Original Co','BDT',null,null,null,null);
  insert into public.quotation_request_items(
    quotation_id,product_id,variation_id,product_name_snapshot,sku_snapshot,
    quantity,target_price,unit_price,discount_amount,tax_amount,currency
  ) values
    (quotation_id,product_id,variation_id,'DQE Variable Product','DQE-VAR-'||left(stamp,8),1,100,100,0,0,'BDT'),
    (other_quotation_id,product_id,variation_id,'DQE Variable Product','DQE-VAR-'||left(stamp,8),1,100,100,0,0,'BDT'),
    (quoted_quotation_id,product_id,variation_id,'DQE Variable Product','DQE-VAR-'||left(stamp,8),1,100,100,0,0,'BDT'),
    (corrupt_quotation_id,replacement_product_id,variation_id,'Legacy corrupt variation','DQE-VAR-'||left(stamp,8),1,100,100,0,0,'BDT');
  perform public.refresh_quotation_totals(quotation_id);
  perform public.refresh_quotation_totals(other_quotation_id);
  perform public.refresh_quotation_totals(quoted_quotation_id);
  perform public.refresh_quotation_totals(corrupt_quotation_id);

  select updated_at into expected_updated_at from public.quotation_requests where id=quotation_id;
  replacement_items:=jsonb_build_array(jsonb_build_object(
    'product_id',replacement_product_id,'quantity',2,'unit_price',100,'discount_amount',10,'tax_amount',5
  ));
  perform pg_temp.expect_dqe_failure(denied_id,quotation_id,expected_updated_at,replacement_items,'Permission denied');
  perform pg_temp.expect_dqe_failure(owner_id,other_quotation_id,
    (select updated_at from public.quotation_requests where id=other_quotation_id),replacement_items,'access denied');
  perform pg_temp.expect_dqe_failure(owner_id,quoted_quotation_id,
    (select updated_at from public.quotation_requests where id=quoted_quotation_id),replacement_items,'Only Draft');
  perform pg_temp.expect_dqe_failure(owner_id,quotation_id,expected_updated_at-interval '1 microsecond',replacement_items,'changed before');
  perform pg_temp.expect_dqe_failure(owner_id,corrupt_quotation_id,
    (select updated_at from public.quotation_requests where id=corrupt_quotation_id),
    jsonb_build_array(jsonb_build_object(
      'product_id',replacement_product_id,'variation_id',variation_id,'quantity',1,'unit_price',100,'discount_amount',0,'tax_amount',0
    )),'does not belong');
  begin
    perform public.update_quotation_details_and_totals(
      owner_id,quotation_id,null,'Bad null expected status',null,null,null,null,null,null,null,null,null,0,0
    );
    raise exception 'Legacy RPC accepted a null expected Draft status';
  exception when others then
    if sqlerrm not like '%Draft quotation changed%' then raise; end if;
  end;

  perform pg_temp.assert_dqe(
    has_function_privilege('service_role',
      'public.update_draft_quotation(uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'EXECUTE'
    ) and not has_function_privilege('anon',
      'public.update_draft_quotation(uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'EXECUTE'
    ) and not has_function_privilege('authenticated',
      'public.update_draft_quotation(uuid,uuid,timestamp with time zone,text,text,text,date,date,text,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'EXECUTE'
    ),'Draft update RPC execute privilege is not service-role only'
  );
  result_id:=pg_temp.call_dqe(all_id,other_quotation_id,
    (select updated_at from public.quotation_requests where id=other_quotation_id),replacement_items);
  perform pg_temp.assert_dqe(result_id=other_quotation_id,'View All actor could not edit another creator Draft');
  -- Exercise the function as its granted database role as well as checking the
  -- ACL above.  The runner supplies the same service request context used by
  -- the application RPC path.
  begin
    execute 'set local role service_role';
    result_id:=public.update_draft_quotation(
      all_id,other_quotation_id,(select updated_at from public.quotation_requests where id=other_quotation_id),
      'Service role Draft subject',null,null,null,null,null,null,null,null,null,0,0,replacement_items
    );
    execute 'reset role';
  exception when others then
    execute 'reset role';
    raise;
  end;
  perform pg_temp.assert_dqe(result_id=other_quotation_id,'Service role could not execute the Draft update RPC');
  foreach role_name in array array['anon','authenticated'] loop
    failed:=false;
    begin
      execute format('set local role %I',role_name);
      perform public.update_draft_quotation(
        owner_id,quotation_id,expected_updated_at,
        'Unauthorized role call',null,null,null,null,null,null,null,null,null,0,0,replacement_items
      );
      execute 'reset role';
    exception when insufficient_privilege then
      failed:=true;
      execute 'reset role';
    end;
    perform pg_temp.assert_dqe(failed,format('%s unexpectedly executed the service-only Draft update RPC',role_name));
  end loop;

  select jsonb_build_object(
    'customer_notifications',pg_temp.dqe_table_fingerprint('public.customer_notifications'),
    'inventory_balances',pg_temp.dqe_table_fingerprint('public.inventory_balances'),
    'inventory_reservations',pg_temp.dqe_table_fingerprint('public.inventory_reservations'),
    'inventory_movements',pg_temp.dqe_table_fingerprint('public.inventory_movements'),
    'inventory_movement_items',pg_temp.dqe_table_fingerprint('public.inventory_movement_items'),
    'sales_orders',pg_temp.dqe_table_fingerprint('public.sales_orders'),
    'sales_order_items',pg_temp.dqe_table_fingerprint('public.sales_order_items'),
    'sales_stock_out_requests',pg_temp.dqe_table_fingerprint('public.sales_stock_out_requests'),
    'sales_stock_out_request_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_items'),
    'sales_stock_out_request_revisions',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_revisions'),
    'sales_stock_out_request_revision_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_revision_items'),
    'sales_stock_out_releases',pg_temp.dqe_table_fingerprint('public.sales_stock_out_releases'),
    'sales_stock_out_release_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_release_items'),
    'sales_stock_out_release_serials',pg_temp.dqe_table_fingerprint('public.sales_stock_out_release_serials'),
    'sales_stock_out_serial_changes',pg_temp.dqe_table_fingerprint('public.sales_stock_out_serial_changes'),
    'sale_documents',pg_temp.dqe_table_fingerprint('public.sale_documents'),
    'sale_payments',pg_temp.dqe_table_fingerprint('public.sale_payments'),
    'payment_transactions',pg_temp.dqe_table_fingerprint('public.payment_transactions'),
    'shipments',pg_temp.dqe_table_fingerprint('public.shipments'),
    'shipment_items',pg_temp.dqe_table_fingerprint('public.shipment_items'),
    'shipment_serials',pg_temp.dqe_table_fingerprint('public.shipment_serials'),
    'shipment_tracking_events',pg_temp.dqe_table_fingerprint('public.shipment_tracking_events'),
    'cashbook_entries',pg_temp.dqe_table_fingerprint('public.cashbook_entries'),
    'cashbook_days',pg_temp.dqe_table_fingerprint('public.cashbook_days'),
    'journal_entries',pg_temp.dqe_table_fingerprint('public.journal_entries'),
    'journal_lines',pg_temp.dqe_table_fingerprint('public.journal_lines'),
    'sale_price_adjustments',pg_temp.dqe_table_fingerprint('public.sale_price_adjustments')
  ) into unchanged_fingerprints;
  result_id:=pg_temp.call_dqe(owner_id,quotation_id,expected_updated_at,replacement_items);
  perform pg_temp.assert_dqe(result_id=quotation_id,'Draft update returned a different quotation ID');
  perform pg_temp.assert_dqe((select
    reference='DQE-'||left(stamp,10) and profile_id=customer_id and created_by=owner_id
    and status='draft' and shipping_address_id is null and billing_address_id is null
    and subject='Edited Draft subject' and customer_notes='Edited customer note'
    from public.quotation_requests where id=quotation_id),'Draft edit changed fixed identity/customer/ownership/status/address data or missed headers');
  perform pg_temp.assert_dqe((select count(*)=1 from public.quotation_request_items i where i.quotation_id=dqe_test.quotation_id),'Draft item replacement did not leave exactly one line');
  perform pg_temp.assert_dqe((select
    i.product_id=replacement_product_id and i.variation_id is null and i.product_name_snapshot='DQE Replacement Product'
    and i.quantity=2 and i.unit_price=100 and i.discount_amount=10 and i.tax_amount=5
    and i.line_subtotal=200 and i.line_total=195
    from public.quotation_request_items i where i.quotation_id=dqe_test.quotation_id),'Canonical refresher did not calculate replacement line totals');
  perform pg_temp.assert_dqe((select subtotal=200 and discount_amount=2 and tax_amount=3 and total_amount=196
    from public.quotation_requests where id=quotation_id),'Canonical refresher did not calculate quotation totals');
  perform pg_temp.assert_dqe(unchanged_fingerprints=jsonb_build_object(
    'customer_notifications',pg_temp.dqe_table_fingerprint('public.customer_notifications'),
    'inventory_balances',pg_temp.dqe_table_fingerprint('public.inventory_balances'),
    'inventory_reservations',pg_temp.dqe_table_fingerprint('public.inventory_reservations'),
    'inventory_movements',pg_temp.dqe_table_fingerprint('public.inventory_movements'),
    'inventory_movement_items',pg_temp.dqe_table_fingerprint('public.inventory_movement_items'),
    'sales_orders',pg_temp.dqe_table_fingerprint('public.sales_orders'),
    'sales_order_items',pg_temp.dqe_table_fingerprint('public.sales_order_items'),
    'sales_stock_out_requests',pg_temp.dqe_table_fingerprint('public.sales_stock_out_requests'),
    'sales_stock_out_request_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_items'),
    'sales_stock_out_request_revisions',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_revisions'),
    'sales_stock_out_request_revision_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_request_revision_items'),
    'sales_stock_out_releases',pg_temp.dqe_table_fingerprint('public.sales_stock_out_releases'),
    'sales_stock_out_release_items',pg_temp.dqe_table_fingerprint('public.sales_stock_out_release_items'),
    'sales_stock_out_release_serials',pg_temp.dqe_table_fingerprint('public.sales_stock_out_release_serials'),
    'sales_stock_out_serial_changes',pg_temp.dqe_table_fingerprint('public.sales_stock_out_serial_changes'),
    'sale_documents',pg_temp.dqe_table_fingerprint('public.sale_documents'),
    'sale_payments',pg_temp.dqe_table_fingerprint('public.sale_payments'),
    'payment_transactions',pg_temp.dqe_table_fingerprint('public.payment_transactions'),
    'shipments',pg_temp.dqe_table_fingerprint('public.shipments'),
    'shipment_items',pg_temp.dqe_table_fingerprint('public.shipment_items'),
    'shipment_serials',pg_temp.dqe_table_fingerprint('public.shipment_serials'),
    'shipment_tracking_events',pg_temp.dqe_table_fingerprint('public.shipment_tracking_events'),
    'cashbook_entries',pg_temp.dqe_table_fingerprint('public.cashbook_entries'),
    'cashbook_days',pg_temp.dqe_table_fingerprint('public.cashbook_days'),
    'journal_entries',pg_temp.dqe_table_fingerprint('public.journal_entries'),
    'journal_lines',pg_temp.dqe_table_fingerprint('public.journal_lines'),
    'sale_price_adjustments',pg_temp.dqe_table_fingerprint('public.sale_price_adjustments')
  ),'Draft edit caused an unrelated notification, inventory, Sale, shipment, or accounting write');
  perform pg_temp.assert_dqe((select count(*)=0 from public.customer_notifications
    where entity_type='quotation_request' and entity_id=quotation_id
      and notification_type='quotation_updated'),
    'Draft edit produced an unexpected notification behavior');
  perform pg_temp.expect_dqe_failure(owner_id,quotation_id,
    (select updated_at from public.quotation_requests where id=quotation_id),
    replacement_items||replacement_items,'only be added once');
end $$;

select 'Draft quotation editing database behavior passed in a rollback-only transaction.';
