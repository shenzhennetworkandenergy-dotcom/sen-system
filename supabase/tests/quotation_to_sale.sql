-- Rollback-only local acceptance test for quotation-to-Sale conversion.
begin;
select set_config('request.jwt.claim.role','service_role',true);
select plan(1);

create or replace function pg_temp.assert_q2s(condition boolean, failure_message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then raise exception '%',failure_message; end if;
end $$;

create or replace function pg_temp.expect_q2s_failure(
  requested_actor uuid,
  requested_quote uuid,
  requested_customer uuid,
  requested_shipping_address uuid,
  requested_billing_address uuid,
  requested_warehouse uuid,
  requested_expected_date date,
  requested_items jsonb,
  requested_adjustments jsonb,
  expected_error text
) returns void language plpgsql as $$
declare
  sales_before bigint;
  audits_before bigint;
  original_status text;
  failed boolean:=false;
begin
  select count(*) into sales_before from public.sales_orders;
  select count(*) into audits_before from public.audit_logs;
  select status into original_status from public.quotation_requests where id=requested_quote;
  begin
    perform public.create_sale_from_quotation(
      requested_actor,requested_quote,requested_customer,
      requested_shipping_address,null::jsonb,
      requested_billing_address,null::jsonb,
      requested_warehouse,'direct_office',requested_expected_date,
      0,0,0,0,'Task 9 failure internal','Task 9 failure customer',
      requested_items,requested_adjustments
    );
  exception when others then
    failed:=true;
    if position(lower(expected_error) in lower(sqlerrm))=0 then
      raise exception 'Expected error containing "%", got "%"',expected_error,sqlerrm;
    end if;
  end;
  perform pg_temp.assert_q2s(failed,'Expected conversion failure did not occur');
  perform pg_temp.assert_q2s((select count(*) from public.sales_orders)=sales_before,'Failed conversion left a Sale');
  perform pg_temp.assert_q2s((select count(*) from public.audit_logs)=audits_before,'Failed conversion left an audit row');
  perform pg_temp.assert_q2s((select converted_order_id is null from public.quotation_requests where id=requested_quote),'Failed conversion left a Sale link');
  perform pg_temp.assert_q2s((select status=original_status from public.quotation_requests where id=requested_quote),'Failed conversion changed quotation status');
end $$;

do $$
<<q2s_test>>
declare
  run_id uuid:=gen_random_uuid();
  stamp text;
  admin_id uuid:=gen_random_uuid();
  owner_id uuid:=gen_random_uuid();
  all_id uuid:=gen_random_uuid();
  missing_conversion_id uuid:=gen_random_uuid();
  missing_sales_id uuid:=gen_random_uuid();
  no_scope_id uuid:=gen_random_uuid();
  other_owner_id uuid:=gen_random_uuid();
  customer_id uuid:=gen_random_uuid();
  other_customer_id uuid:=gen_random_uuid();
  warehouse_id uuid:=gen_random_uuid();
  product_id uuid:=gen_random_uuid();
  zero_product_id uuid:=gen_random_uuid();
  variation_id uuid:=gen_random_uuid();
  balance_id uuid:=gen_random_uuid();
  zero_balance_id uuid:=gen_random_uuid();
  shipping_id uuid:=gen_random_uuid();
  billing_id uuid:=gen_random_uuid();
  foreign_address_id uuid:=gen_random_uuid();
  transition_quote_id uuid:=gen_random_uuid();
  decline_quote_id uuid:=gen_random_uuid();
  reject_quote_id uuid:=gen_random_uuid();
  expired_transition_quote_id uuid:=gen_random_uuid();
  main_quote_id uuid:=gen_random_uuid();
  main_item_id uuid:=gen_random_uuid();
  zero_item_id uuid:=gen_random_uuid();
  draft_quote_id uuid:=gen_random_uuid();
  quoted_quote_id uuid:=gen_random_uuid();
  approved_quote_id uuid:=gen_random_uuid();
  rejected_quote_id uuid:=gen_random_uuid();
  declined_quote_id uuid:=gen_random_uuid();
  expired_quote_id uuid:=gen_random_uuid();
  other_owned_quote_id uuid:=gen_random_uuid();
  null_owned_quote_id uuid:=gen_random_uuid();
  all_scope_quote_id uuid:=gen_random_uuid();
  invalid_item_quote_id uuid:=gen_random_uuid();
  invalid_adjustment_quote_id uuid:=gen_random_uuid();
  invalid_customer_quote_id uuid:=gen_random_uuid();
  invalid_address_quote_id uuid:=gen_random_uuid();
  item_id uuid;
  result jsonb;
  retry_result jsonb;
  sale_id uuid;
  all_scope_sale_id uuid;
  manual_sale_id uuid;
  common_item jsonb;
  main_items jsonb;
  main_adjustments jsonb;
  counts_before jsonb;
  balance_before jsonb;
begin
  stamp:=replace(run_id::text,'-','');

  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000',admin_id,'authenticated','authenticated','q2s9-admin-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','q2s9-owner-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',all_id,'authenticated','authenticated','q2s9-all-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',missing_conversion_id,'authenticated','authenticated','q2s9-no-convert-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',missing_sales_id,'authenticated','authenticated','q2s9-no-sales-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',no_scope_id,'authenticated','authenticated','q2s9-no-scope-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',other_owner_id,'authenticated','authenticated','q2s9-other-owner-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',customer_id,'authenticated','authenticated','q2s9-customer-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',other_customer_id,'authenticated','authenticated','q2s9-other-customer-'||stamp||'@local.test',crypt('offline-only',gen_salt('bf')),now(),'{}','{}',now(),now());

  update public.profiles set role='admin',status='active',full_name='Task 9 Admin' where id=admin_id;
  update public.profiles set role='employee',status='active',full_name='Task 9 Employee' where id in(
    owner_id,all_id,missing_conversion_id,missing_sales_id,no_scope_id,other_owner_id
  );
  update public.profiles set role='customer',status='active',full_name='Task 9 Customer',phone='01700000009',company_name='Task 9 Company' where id=customer_id;
  update public.profiles set role='customer',status='active',full_name='Other Task 9 Customer',phone='01700000008' where id=other_customer_id;

  insert into public.profile_permission_overrides(profile_id,permission_id,effect,reason,assigned_by,is_active)
  select actor.id,p.id,'allow','Task 9 rollback-only verification',admin_id,true
  from (values
    (owner_id,'quotations.convert_to_sale'),(owner_id,'sales.create'),(owner_id,'sales.change_price'),(owner_id,'quotations.view_own'),
    (all_id,'quotations.convert_to_sale'),(all_id,'sales.create'),(all_id,'quotations.view_all'),
    (missing_conversion_id,'sales.create'),(missing_conversion_id,'quotations.view_all'),
    (missing_sales_id,'quotations.convert_to_sale'),(missing_sales_id,'quotations.view_all'),
    (no_scope_id,'quotations.convert_to_sale'),(no_scope_id,'sales.create')
  ) actor(id,key)
  join public.permissions p on p.key=actor.key;

  insert into public.warehouses(id,code,name,country_code,country_name,is_active)
  values(warehouse_id,'Q2S9-'||left(stamp,8),'Task 9 Warehouse','BD','Bangladesh',true);
  insert into public.products(
    id,name,slug,sku,product_type,status,regular_price,sale_price,currency,
    manage_stock,serial_tracking_required,default_warehouse_id,public_catalogue_visible,
    created_by,updated_by
  ) values
    (product_id,'Task 9 Variable Product','q2s9-variable-'||stamp,'Q2S9-P-'||left(stamp,8),'variable','active',999,888,'BDT',false,false,warehouse_id,true,admin_id,admin_id),
    (zero_product_id,'Task 9 Zero Product','q2s9-zero-'||stamp,'Q2S9-Z-'||left(stamp,8),'simple','active',77.77,77.77,'BDT',true,false,warehouse_id,true,admin_id,admin_id);
  insert into public.product_variations(
    id,product_id,sku,status,regular_price,sale_price,manage_stock,combination_key
  ) values(variation_id,product_id,'Q2S9-V-'||left(stamp,8),'active',999,888,true,'q2s9-'||left(stamp,8));
  insert into public.inventory_balances(id,warehouse_id,product_id,variation_id,on_hand,reserved)
  values(balance_id,warehouse_id,product_id,variation_id,100,0);
  insert into public.inventory_balances(id,warehouse_id,product_id,on_hand,reserved)
  values(zero_balance_id,warehouse_id,zero_product_id,100,0);
  insert into public.customer_addresses(
    id,profile_id,recipient_name,phone,alternate_phone,address_line_1,address_line_2,
    area,city,region,postal_code,country_code,delivery_instructions,
    latitude,longitude,map_label,created_by,updated_by
  ) values
    (shipping_id,customer_id,'Task 9 Shipping','01700000009','01800000009','Shipping Road 9','Shipping Floor 9','Shipping Area 9','Dhaka','Dhaka Division','1209','BD','Shipping instructions',23.780901,90.407201,'Shipping pin',admin_id,admin_id),
    (billing_id,customer_id,'Task 9 Billing','01700000019','01800000019','Billing Road 9','Billing Floor 9','Billing Area 9','Chattogram','Chattogram Division','4009','BD','Billing instructions',22.356901,91.783201,'Billing pin',admin_id,admin_id),
    (foreign_address_id,other_customer_id,'Foreign Task 9','01700000008',null,'Foreign Road 9',null,null,'Dhaka',null,null,'BD',null,null,null,null,admin_id,admin_id);

  -- Business transition state and metadata are separate from internal approval/rejection.
  insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject,expiration_date)
  values(transition_quote_id,'Q2S9-TRANS-'||left(stamp,10),customer_id,admin_id,'draft','Transition test',current_date+10);
  perform pg_temp.assert_q2s(public.transition_quotation_business_status(admin_id,transition_quote_id,'approve',null)='approved','Draft did not become internally approved');
  perform pg_temp.assert_q2s(public.transition_quotation_business_status(admin_id,transition_quote_id,'issue',null)='quoted','Approved did not become issued');
  perform pg_temp.assert_q2s(public.transition_quotation_business_status(admin_id,transition_quote_id,'accept',null)='accepted','Issued did not become customer-accepted');
  perform pg_temp.assert_q2s((select issued_by=admin_id and issued_at is not null and customer_accepted_by=admin_id and customer_accepted_at is not null from public.quotation_requests where id=transition_quote_id),'Transition metadata was not recorded');

  insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject)
  values(decline_quote_id,'Q2S9-DECL-'||left(stamp,10),customer_id,admin_id,'quoted','Decline test');
  perform pg_temp.assert_q2s(public.transition_quotation_business_status(admin_id,decline_quote_id,'decline','Customer selected another supplier')='declined','Issued did not become customer-declined');
  perform pg_temp.assert_q2s((select customer_declined_by=admin_id and customer_declined_at is not null and customer_decline_reason='Customer selected another supplier' from public.quotation_requests where id=decline_quote_id),'Decline metadata was not recorded');

  insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject)
  values(reject_quote_id,'Q2S9-REJECT-'||left(stamp,10),customer_id,admin_id,'approved','Internal reject test');
  perform pg_temp.assert_q2s(public.transition_quotation_business_status(admin_id,reject_quote_id,'reject','Internal review')='rejected','Internal rejection was conflated with customer decline');
  insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject,expiration_date)
  values(expired_transition_quote_id,'Q2S9-EXPTR-'||left(stamp,10),customer_id,admin_id,'quoted','Expired transition test',current_date-1);
  begin
    perform public.transition_quotation_business_status(admin_id,expired_transition_quote_id,'accept',null);
    raise exception 'Expired issued quotation was accepted';
  exception when others then
    if sqlerrm not like '%Expired quotation cannot be accepted%' then raise; end if;
  end;

  -- Main accepted quotation contains a variable-price line and an exact zero-price line.
  insert into public.quotation_requests(
    id,reference,profile_id,created_by,status,subject,company_name,required_by,
    expiration_date,currency,shipping_address_id,billing_address_id,
    shipping_address_snapshot,billing_address_snapshot,subtotal,discount_amount,
    tax_amount,total_amount,internal_notes,customer_notes,terms_and_conditions,
    payment_terms,delivery_information,customer_accepted_at,customer_accepted_by
  ) values(
    main_quote_id,'Q2S9-MAIN-'||left(stamp,10),customer_id,owner_id,'accepted',
    'Exact commercial transfer','Task 9 Company',current_date+20,current_date+30,'BDT',
    shipping_id,billing_id,
    jsonb_build_object(
      'recipient_name','Task 9 Shipping','phone','01700000009','alternate_phone','01800000009',
      'address_line_1','Shipping Road 9','address_line_2','Shipping Floor 9',
      'area','Shipping Area 9','city','Dhaka','region','Dhaka Division','postal_code','1209',
      'country_code','BD','delivery_instructions','Shipping instructions',
      'latitude',23.780901::numeric,'longitude',90.407201::numeric,'map_label','Shipping pin'
    ),
    jsonb_build_object(
      'recipient_name','Task 9 Billing','phone','01700000019','alternate_phone','01800000019',
      'address_line_1','Billing Road 9','address_line_2','Billing Floor 9',
      'area','Billing Area 9','city','Chattogram','region','Chattogram Division','postal_code','4009',
      'country_code','BD','delivery_instructions','Billing instructions',
      'latitude',22.356901::numeric,'longitude',91.783201::numeric,'map_label','Billing pin'
    ),
    246.90,10.11,12.34,251.47,'Exact internal notes','Exact customer notes',
    'Read-only source terms','30 days','Source delivery information',now(),owner_id
  );
  insert into public.quotation_request_items(
    id,quotation_id,product_id,variation_id,product_name_snapshot,sku_snapshot,
    quantity,target_price,unit_price,discount_amount,tax_amount,line_subtotal,line_total,currency
  ) values
    (main_item_id,main_quote_id,product_id,variation_id,'Task 9 Variable Product','Q2S9-V-'||left(stamp,8),2,123.45,123.45,5.55,7.89,246.90,249.24,'BDT'),
    (zero_item_id,main_quote_id,zero_product_id,null,'Task 9 Zero Product','Q2S9-Z-'||left(stamp,8),3,0,0,0,0,0,0,'BDT');
  main_items:=jsonb_build_array(
    jsonb_build_object('source_quotation_item_id',main_item_id,'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',2,'unit_price',123.45,'line_discount',5.55,'line_tax',7.89),
    jsonb_build_object('source_quotation_item_id',zero_item_id,'product_id',zero_product_id,'warehouse_id',warehouse_id,'quantity',3,'unit_price',0,'line_discount',0,'line_tax',0)
  );
  main_adjustments:=jsonb_build_array(jsonb_build_object(
    'source_quotation_item_id',null,'product_id',null,'variation_id',null,
    'adjustment_type','service_charge','previous_value',0,'new_value',6.78,
    'reason','Approved Task 9 service charge'
  ));

  -- Search requires both permissions and respects View Own before conversion.
  perform pg_temp.assert_q2s((select count(*)=1 from public.search_eligible_quotations_for_sale(owner_id,'Q2S9-MAIN',20) where quotation_id=main_quote_id),'View Own search did not find its own accepted quotation');
  perform pg_temp.assert_q2s((select count(*)=1 from public.search_eligible_quotations_for_sale(all_id,'Task 9 Company',20) where quotation_id=main_quote_id),'View All search did not find an accepted quotation');
  begin
    perform public.search_eligible_quotations_for_sale(missing_conversion_id,'Q2S9-MAIN',20);
    raise exception 'Search accepted an actor without conversion permission';
  exception when others then
    if sqlerrm not like '%Permission denied%' then raise; end if;
  end;

  -- Reusable one-line status/permission fixtures.
  common_item:=jsonb_build_array(jsonb_build_object(
    'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,
    'quantity',1,'unit_price',123.45,'line_discount',0,'line_tax',0
  ));
  insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject,expiration_date,currency)
  values
    (draft_quote_id,'Q2S9-DRAFT-'||left(stamp,8),customer_id,owner_id,'draft','Denied state',current_date+10,'BDT'),
    (quoted_quote_id,'Q2S9-QUOTED-'||left(stamp,8),customer_id,owner_id,'quoted','Denied state',current_date+10,'BDT'),
    (approved_quote_id,'Q2S9-APPR-'||left(stamp,8),customer_id,owner_id,'approved','Denied state',current_date+10,'BDT'),
    (rejected_quote_id,'Q2S9-REJ-'||left(stamp,8),customer_id,owner_id,'rejected','Denied state',current_date+10,'BDT'),
    (declined_quote_id,'Q2S9-DECL2-'||left(stamp,8),customer_id,owner_id,'declined','Denied state',current_date+10,'BDT'),
    (expired_quote_id,'Q2S9-EXP-'||left(stamp,8),customer_id,owner_id,'accepted','Denied expiry',current_date-1,'BDT'),
    (other_owned_quote_id,'Q2S9-OTHER-'||left(stamp,8),customer_id,other_owner_id,'accepted','Own denial',current_date+10,'BDT'),
    (null_owned_quote_id,'Q2S9-NULL-'||left(stamp,8),customer_id,null,'accepted','Null owner denial',current_date+10,'BDT'),
    (all_scope_quote_id,'Q2S9-ALL-'||left(stamp,8),customer_id,other_owner_id,'accepted','All scope success',current_date+10,'BDT'),
    (invalid_item_quote_id,'Q2S9-BADITEM-'||left(stamp,8),customer_id,owner_id,'accepted','Invalid item rollback',current_date+10,'BDT'),
    (invalid_adjustment_quote_id,'Q2S9-BADADJ-'||left(stamp,8),customer_id,owner_id,'accepted','Invalid adjustment rollback',current_date+10,'BDT'),
    (invalid_customer_quote_id,'Q2S9-BADCUST-'||left(stamp,8),customer_id,owner_id,'accepted','Invalid customer rollback',current_date+10,'BDT'),
    (invalid_address_quote_id,'Q2S9-BADADDR-'||left(stamp,8),customer_id,owner_id,'accepted','Invalid address rollback',current_date+10,'BDT');
  for item_id in select unnest(array[draft_quote_id,quoted_quote_id,approved_quote_id,rejected_quote_id,declined_quote_id,expired_quote_id,other_owned_quote_id,null_owned_quote_id,all_scope_quote_id,invalid_item_quote_id,invalid_adjustment_quote_id,invalid_customer_quote_id,invalid_address_quote_id])
  loop
    insert into public.quotation_request_items(
      id,quotation_id,product_id,variation_id,product_name_snapshot,sku_snapshot,
      quantity,target_price,unit_price,discount_amount,tax_amount,line_subtotal,line_total,currency
    ) values(gen_random_uuid(),item_id,product_id,variation_id,'Task 9 Variable Product','Q2S9-V-'||left(stamp,8),1,123.45,123.45,0,0,123.45,123.45,'BDT');
  end loop;

  -- Replace the generic common item with each quotation's real source item.
  select id into item_id from public.quotation_request_items where quotation_id=draft_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,draft_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','customer-accepted');
  select id into item_id from public.quotation_request_items where quotation_id=quoted_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,quoted_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','customer-accepted');
  select id into item_id from public.quotation_request_items where quotation_id=approved_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,approved_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','customer-accepted');
  select id into item_id from public.quotation_request_items where quotation_id=rejected_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,rejected_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','customer-accepted');
  select id into item_id from public.quotation_request_items where quotation_id=declined_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,declined_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','customer-accepted');
  select id into item_id from public.quotation_request_items where quotation_id=expired_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,expired_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','Expired quotation');

  select id into item_id from public.quotation_request_items where quotation_id=other_owned_quote_id;
  common_item:=jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true);
  perform pg_temp.expect_q2s_failure(owner_id,other_owned_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,common_item,'[]','access denied');
  select id into item_id from public.quotation_request_items where quotation_id=null_owned_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,null_owned_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]','access denied');
  perform pg_temp.expect_q2s_failure(missing_conversion_id,other_owned_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,common_item,'[]','Permission denied');
  perform pg_temp.expect_q2s_failure(missing_sales_id,other_owned_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,common_item,'[]','Permission denied');
  perform pg_temp.expect_q2s_failure(no_scope_id,other_owned_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,common_item,'[]','access denied');

  -- View All can convert another creator's quotation with both permissions.
  select id into item_id from public.quotation_request_items where quotation_id=all_scope_quote_id;
  result:=public.create_sale_from_quotation(
    all_id,all_scope_quote_id,customer_id,shipping_id,null,billing_id,null,warehouse_id,
    'direct_office',current_date+10,0,0,0,0,'View All internal','View All customer',
    jsonb_set(common_item,'{0,source_quotation_item_id}',to_jsonb(item_id),true),'[]'
  );
  all_scope_sale_id:=(result->>'sale_id')::uuid;
  perform pg_temp.assert_q2s((select status='draft' from public.sales_orders where id=all_scope_sale_id),'View All conversion did not create a draft Sale');

  -- Invalid item, adjustment, customer, and address failures are atomic.
  select id into item_id from public.quotation_request_items where quotation_id=invalid_item_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,invalid_item_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,
    jsonb_build_array(jsonb_build_object('source_quotation_item_id',main_item_id,'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',1,'unit_price',123.45,'line_discount',0,'line_tax',0)),
    '[]','source item is invalid');
  select id into item_id from public.quotation_request_items where quotation_id=invalid_adjustment_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,invalid_adjustment_quote_id,customer_id,shipping_id,billing_id,warehouse_id,current_date+10,
    jsonb_build_array(jsonb_build_object('source_quotation_item_id',item_id,'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',1,'unit_price',120,'line_discount',0,'line_tax',0)),
    '[]','adjustments do not match');
  select id into item_id from public.quotation_request_items where quotation_id=invalid_customer_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,invalid_customer_quote_id,other_customer_id,foreign_address_id,foreign_address_id,warehouse_id,current_date+10,
    jsonb_build_array(jsonb_build_object('source_quotation_item_id',item_id,'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',1,'unit_price',123.45,'line_discount',0,'line_tax',0)),
    '[]','customer must match');
  select id into item_id from public.quotation_request_items where quotation_id=invalid_address_quote_id;
  perform pg_temp.expect_q2s_failure(owner_id,invalid_address_quote_id,customer_id,foreign_address_id,billing_id,warehouse_id,current_date+10,
    jsonb_build_array(jsonb_build_object('source_quotation_item_id',item_id,'product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',1,'unit_price',123.45,'line_discount',0,'line_tax',0)),
    '[]','Shipping address does not belong');

  select jsonb_build_object(
    'reservations',(select count(*) from public.inventory_reservations),
    'movements',(select count(*) from public.inventory_movements),
    'documents',(select count(*) from public.sale_documents),
    'payments',(select count(*) from public.sale_payments),
    'stock_out',(select count(*) from public.sales_stock_out_requests),
    'payment_transactions',(select count(*) from public.payment_transactions),
    'shipments',(select count(*) from public.shipments),
    'cashbook',(select count(*) from public.cashbook_entries),
    'journals',(select count(*) from public.journal_entries)
  ) into counts_before;
  select to_jsonb(b) into balance_before from public.inventory_balances b where id=balance_id;

  result:=public.create_sale_from_quotation(
    owner_id,main_quote_id,customer_id,shipping_id,null,billing_id,null,warehouse_id,
    'existing_customer',current_date+20,10.11,4.56,6.78,12.34,
    'Exact internal notes','Exact customer notes',main_items,main_adjustments
  );
  sale_id:=(result->>'sale_id')::uuid;
  perform pg_temp.assert_q2s(coalesce((result->>'existing')::boolean,false)=false,'First conversion was reported as existing');
  perform pg_temp.assert_q2s((select count(*)=1 from public.sales_orders where id=sale_id and status='draft' and confirmed_at is null),'Conversion did not create exactly one unconfirmed draft Sale');
  perform pg_temp.assert_q2s((select
    customer_profile_id=customer_id
    and shipping_address_id=shipping_id and billing_address_id=billing_id
    and fulfillment_warehouse_id=warehouse_id and sales_source='existing_customer'
    and currency='BDT' and expected_delivery_date=current_date+20
    and subtotal=246.90 and discount_amount=10.11 and shipping_amount=4.56
    and service_amount=6.78 and tax_amount=12.34 and total_amount=262.81
    and internal_notes='Exact internal notes' and customer_notes='Exact customer notes'
    from public.sales_orders where id=sale_id
  ),'Header, customer, address IDs, warehouse, currency, totals, date, or notes did not transfer exactly');
  perform pg_temp.assert_q2s((select shipping_address_snapshot=jsonb_build_object(
    'recipient_name','Task 9 Shipping','phone','01700000009','alternate_phone','01800000009',
    'address_line_1','Shipping Road 9','address_line_2','Shipping Floor 9',
    'area','Shipping Area 9','city','Dhaka','region','Dhaka Division',
    'postal_code','1209','country_code','BD','delivery_instructions','Shipping instructions',
    'latitude',23.780901::numeric,'longitude',90.407201::numeric,'map_label','Shipping pin'
  ) from public.sales_orders where id=sale_id),'Shipping address ID/snapshot fields did not transfer exactly');
  perform pg_temp.assert_q2s((select billing_address_snapshot=jsonb_build_object(
    'recipient_name','Task 9 Billing','phone','01700000019','alternate_phone','01800000019',
    'address_line_1','Billing Road 9','address_line_2','Billing Floor 9',
    'area','Billing Area 9','city','Chattogram','region','Chattogram Division',
    'postal_code','4009','country_code','BD','delivery_instructions','Billing instructions',
    'latitude',22.356901::numeric,'longitude',91.783201::numeric,'map_label','Billing pin'
  ) from public.sales_orders where id=sale_id),'Billing address ID/snapshot fields did not transfer exactly');
  perform pg_temp.assert_q2s((select count(*)=2 from public.sales_order_items where order_id=sale_id),'Sale item count is not exact');
  perform pg_temp.assert_q2s((select count(*)=1 from public.sales_order_items i where
    i.order_id=sale_id and i.product_id=q2s_test.product_id
    and i.variation_id=q2s_test.variation_id and i.fulfillment_warehouse_id=warehouse_id
    and i.product_name_snapshot='Task 9 Variable Product'
    and i.sku_snapshot='Q2S9-V-'||left(stamp,8) and i.currency='BDT'
    and i.quantity=2 and i.unit_price=123.45 and i.line_subtotal=246.90
    and i.line_discount=5.55 and i.line_tax=7.89 and i.line_total=249.24
  ),'Approved variable line snapshots, warehouse, quantity, price, discount, or tax did not transfer exactly');
  perform pg_temp.assert_q2s((select count(*)=1 from public.sales_order_items i where
    i.order_id=sale_id and i.product_id=q2s_test.zero_product_id and i.variation_id is null
    and i.fulfillment_warehouse_id=warehouse_id and i.product_name_snapshot='Task 9 Zero Product'
    and i.sku_snapshot='Q2S9-Z-'||left(stamp,8) and i.currency='BDT'
    and i.quantity=3 and i.unit_price=0 and i.line_subtotal=0
    and i.line_discount=0 and i.line_tax=0 and i.line_total=0
  ),'Exact zero-priced line snapshots, warehouse, quantity, price, discount, or tax did not transfer');
  perform pg_temp.assert_q2s((select count(*)=1 from public.sale_price_adjustments where order_id=sale_id and adjustment_type='service_charge' and previous_value=0 and new_value=6.78),'Reviewed service adjustment history is not exact');
  perform pg_temp.assert_q2s((select count(*)=2 from public.order_status_events where order_id=sale_id),'Draft creation and quotation-origin events are not exact');
  perform pg_temp.assert_q2s((select count(*)=1 from public.order_status_events where order_id=sale_id and note like 'Draft Sale created from accepted quotation%'),'Quotation origin event is missing or duplicated');
  perform pg_temp.assert_q2s((select count(*)=1 from public.audit_logs where entity_type='quotation_request' and entity_id=main_quote_id::text and action='quotation.converted_to_sale'),'Conversion audit is missing or duplicated');
  perform pg_temp.assert_q2s((select status='converted_to_sale' and converted_order_id=sale_id and converted_at is not null and converted_by=owner_id from public.quotation_requests where id=main_quote_id),'Quotation link/status metadata is not exact');

  perform pg_temp.assert_q2s(counts_before=jsonb_build_object(
    'reservations',(select count(*) from public.inventory_reservations),
    'movements',(select count(*) from public.inventory_movements),
    'documents',(select count(*) from public.sale_documents),
    'payments',(select count(*) from public.sale_payments),
    'stock_out',(select count(*) from public.sales_stock_out_requests),
    'payment_transactions',(select count(*) from public.payment_transactions),
    'shipments',(select count(*) from public.shipments),
    'cashbook',(select count(*) from public.cashbook_entries),
    'journals',(select count(*) from public.journal_entries)
  ),'Draft conversion caused a reservation, movement, invoice, payment, Stock Out, shipment, balance, or accounting side effect');
  perform pg_temp.assert_q2s(balance_before=(select to_jsonb(b) from public.inventory_balances b where id=balance_id),'Draft conversion changed inventory balance');

  retry_result:=public.create_sale_from_quotation(
    owner_id,main_quote_id,customer_id,shipping_id,null,billing_id,null,warehouse_id,
    'existing_customer',current_date+20,10.11,4.56,6.78,12.34,
    'Exact internal notes','Exact customer notes',main_items,main_adjustments
  );
  perform pg_temp.assert_q2s((retry_result->>'sale_id')::uuid=sale_id and (retry_result->>'existing')::boolean,'Retry did not return the existing linked Sale');
  perform pg_temp.assert_q2s((select count(*)=1 from public.audit_logs where entity_type='quotation_request' and entity_id=main_quote_id::text and action='quotation.converted_to_sale'),'Retry duplicated conversion audit');

  -- The existing manual creator stays unlinked and its confirmation/cancellation workflow still works.
  manual_sale_id:=public.create_minimal_sale(
    admin_id,customer_id,shipping_id,null,billing_id,null,warehouse_id,'phone',current_date+21,
    0,0,0,0,'Manual Task 9','Manual customer Task 9',
    jsonb_build_array(jsonb_build_object('product_id',product_id,'variation_id',variation_id,'warehouse_id',warehouse_id,'quantity',1,'unit_price',888,'line_discount',0,'line_tax',0)),
    '[]'
  );
  perform pg_temp.assert_q2s((select status='draft' from public.sales_orders where id=manual_sale_id),'Manual create_minimal_sale did not create a draft');
  perform pg_temp.assert_q2s(not exists(select 1 from public.quotation_requests where converted_order_id=manual_sale_id),'Manual Sale was incorrectly linked to a quotation');
  perform public.confirm_sales_order(admin_id,manual_sale_id);
  perform pg_temp.assert_q2s((select status='confirmed' from public.sales_orders where id=manual_sale_id),'Manual confirmation stopped working');
  perform pg_temp.assert_q2s((select count(*)=1 from public.inventory_reservations r where
    r.order_id=manual_sale_id and r.product_id=q2s_test.product_id
    and r.variation_id=q2s_test.variation_id and r.warehouse_id=q2s_test.warehouse_id
    and r.quantity=1 and r.status='active'
  ),'Manual confirmation did not create the exact active reservation');
  perform pg_temp.assert_q2s((select reserved=1 from public.inventory_balances where id=balance_id),'Manual confirmation did not increase the reserved balance by one');
  perform pg_temp.assert_q2s(not exists(select 1 from public.quotation_requests where converted_order_id=manual_sale_id),'Confirmed manual Sale was incorrectly linked to a quotation');
  perform public.cancel_sales_order(admin_id,manual_sale_id,'Task 9 manual workflow rollback verification');
  perform pg_temp.assert_q2s((select status='cancelled' from public.sales_orders where id=manual_sale_id),'Manual cancellation stopped working');
  perform pg_temp.assert_q2s((select count(*)=1 from public.inventory_reservations where order_id=manual_sale_id and quantity=1 and status='cancelled'),'Manual cancellation did not cancel the exact reservation');
  perform pg_temp.assert_q2s((select reserved=0 from public.inventory_balances where id=balance_id),'Manual cancellation did not release its reservation');
  perform pg_temp.assert_q2s(not exists(select 1 from public.quotation_requests where converted_order_id=manual_sale_id),'Cancelled manual Sale was incorrectly linked to a quotation');
end $$;

select ok(true,'Quotation-to-Sale database behavior passed inside a rollback-only transaction');
select * from finish();
rollback;
