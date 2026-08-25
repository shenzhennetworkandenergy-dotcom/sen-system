-- Rollback-only executable acceptance test for the atomic Draft quotation RPC.
create or replace function pg_temp.assert_dqe(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then raise exception '%',failure_message; end if;
end $$;

create or replace function pg_temp.call_dqe(
  actor_id uuid,
  quotation_id uuid,
  expected_updated_at timestamptz,
  items jsonb
) returns uuid language sql as $$
  select public.update_draft_quotation(
    actor_id,quotation_id,expected_updated_at,
    'Edited Draft subject','Edited Company','TIN-EDITED',current_date+7,current_date+14,
    'Edited terms','Net 30','Edited delivery','Edited customer note','Edited internal note',2,3,items
  )
$$;

create or replace function pg_temp.expect_dqe_failure(
  actor_id uuid,
  quotation_id uuid,
  expected_updated_at timestamptz,
  items jsonb,
  expected_error text
) returns void language plpgsql as $$
declare
  header_before jsonb;
  items_before jsonb;
  failed boolean:=false;
begin
  select to_jsonb(q) into header_before from public.quotation_requests q where q.id=quotation_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into items_before
  from public.quotation_request_items i where i.quotation_id=quotation_id;
  begin
    perform pg_temp.call_dqe(actor_id,quotation_id,expected_updated_at,items);
  exception when others then
    failed:=true;
    if position(lower(expected_error) in lower(sqlerrm))=0 then
      raise exception 'Expected error containing "%", got "%"',expected_error,sqlerrm;
    end if;
  end;
  perform pg_temp.assert_dqe(failed,'Expected Draft edit failure did not occur');
  perform pg_temp.assert_dqe(
    header_before=(select to_jsonb(q) from public.quotation_requests q where q.id=quotation_id),
    'Failed Draft edit changed its quotation header'
  );
  perform pg_temp.assert_dqe(
    items_before=(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
      from public.quotation_request_items i where i.quotation_id=quotation_id),
    'Failed Draft edit changed its quotation items'
  );
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
  result_id uuid;
  replacement_items jsonb;
  unchanged_counts jsonb;
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000',admin_id,'authenticated','authenticated','dqe-admin-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','dqe-owner-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',all_id,'authenticated','authenticated','dqe-all-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',denied_id,'authenticated','authenticated','dqe-denied-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',other_owner_id,'authenticated','authenticated','dqe-other-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',customer_id,'authenticated','authenticated','dqe-customer-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now());
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

  select jsonb_build_object(
    'inventory_movements',(select count(*) from public.inventory_movements),
    'sales_orders',(select count(*) from public.sales_orders),
    'cashbook_entries',(select count(*) from public.cashbook_entries),
    'journal_entries',(select count(*) from public.journal_entries)
  ) into unchanged_counts;
  result_id:=pg_temp.call_dqe(owner_id,quotation_id,expected_updated_at,replacement_items);
  perform pg_temp.assert_dqe(result_id=quotation_id,'Draft update returned a different quotation ID');
  perform pg_temp.assert_dqe((select
    reference='DQE-'||left(stamp,10) and profile_id=customer_id and created_by=owner_id
    and status='draft' and shipping_address_id is null and billing_address_id is null
    and subject='Edited Draft subject' and customer_notes='Edited customer note'
    from public.quotation_requests where id=quotation_id),'Draft edit changed fixed identity/customer/ownership/status/address data or missed headers');
  perform pg_temp.assert_dqe((select count(*)=1 from public.quotation_request_items where quotation_id=quotation_id),'Draft item replacement did not leave exactly one line');
  perform pg_temp.assert_dqe((select
    product_id=replacement_product_id and variation_id is null and product_name_snapshot='DQE Replacement Product'
    and quantity=2 and unit_price=100 and discount_amount=10 and tax_amount=5
    and line_subtotal=200 and line_total=195
    from public.quotation_request_items where quotation_id=quotation_id),'Canonical refresher did not calculate replacement line totals');
  perform pg_temp.assert_dqe((select subtotal=200 and discount_amount=2 and tax_amount=3 and total_amount=196
    from public.quotation_requests where id=quotation_id),'Canonical refresher did not calculate quotation totals');
  perform pg_temp.assert_dqe(unchanged_counts=jsonb_build_object(
    'inventory_movements',(select count(*) from public.inventory_movements),
    'sales_orders',(select count(*) from public.sales_orders),
    'cashbook_entries',(select count(*) from public.cashbook_entries),
    'journal_entries',(select count(*) from public.journal_entries)
  ),'Draft edit caused an unrelated inventory, Sale, or accounting write');
  perform pg_temp.expect_dqe_failure(owner_id,quotation_id,
    (select updated_at from public.quotation_requests where id=quotation_id),
    replacement_items||replacement_items,'only be added once');
end $$;

select 'Draft quotation editing database behavior passed in a rollback-only transaction.';
