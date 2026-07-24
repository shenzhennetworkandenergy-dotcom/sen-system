-- Transactional local acceptance test for the minimal Sales module.
begin;
select set_config('request.jwt.claim.role','service_role',true);
select plan(1);

do $$
declare
  actor constant uuid := '10000000-0000-4000-8000-000000000001';
  customer constant uuid := '10000000-0000-4000-8000-000000000002';
  warehouse uuid := gen_random_uuid();
  product uuid := gen_random_uuid();
  sale_one uuid;
  sale_two uuid;
  invoice_id uuid;
  challan_id uuid;
  initial_available numeric;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',actor,'authenticated','authenticated','sales-admin@sen.local',crypt('offline-only',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Sales Administrator"}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',customer,'authenticated','authenticated','sales-customer@sen.local',crypt('offline-only',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Sales Customer"}',now(),now());
  update public.profiles set role='admin',status='active' where id=actor;
  update public.profiles set role='customer',status='active',phone='01700000000' where id=customer;

  insert into public.warehouses(id,code,name,country_code,country_name) values(warehouse,'SALES-LOCAL','Sales Local Warehouse','BD','Bangladesh');
  insert into public.products(id,name,slug,sku,model_number,product_type,status,regular_price,sale_price,currency,manage_stock,serial_tracking_required,default_warehouse_id,created_by,updated_by)
  values(product,'Sales Test Router','sales-test-router','SEN-SALES-TEST','SALES-TEST','simple','active',1000,900,'BDT',true,false,warehouse,actor,actor);
  insert into public.inventory_balances(warehouse_id,product_id,on_hand) values(warehouse,product,10);
  select available into initial_available from public.inventory_balances where warehouse_id=warehouse and product_id=product and variation_id is null and location_id is null;

  sale_one:=public.create_minimal_sale(
    actor,customer,null,
    jsonb_build_object('recipient_name','Sales Customer','phone','01700000000','address_line_1','Offline Review Address','city','Dhaka','country_code','BD'),
    null,jsonb_build_object('recipient_name','Accounts','address_line_1','Offline Billing Address','city','Dhaka','country_code','BD'),
    warehouse,'direct_office',current_date+7,100,50,25,0,'Internal test','Customer test',
    jsonb_build_array(jsonb_build_object('product_id',product,'warehouse_id',warehouse,'quantity',2,'unit_price',900,'catalogue_price',1000,'line_discount',50)),
    jsonb_build_array(
      jsonb_build_object('adjustment_type','manual_unit_price','previous_value',1000,'new_value',900,'reason','Approved offline test price'),
      jsonb_build_object('adjustment_type','fixed_line_discount','previous_value',0,'new_value',50,'reason','Approved offline test discount'),
      jsonb_build_object('adjustment_type','service_charge','previous_value',0,'new_value',25,'reason','Installation')
    )
  );
  if (select total_amount from public.sales_orders where id=sale_one)<>1725 then raise exception 'Server total is incorrect'; end if;
  if (select count(*) from public.sale_price_adjustments where order_id=sale_one)<>3 then raise exception 'Price history is incomplete'; end if;

  perform public.confirm_sales_order(actor,sale_one);
  if (select reserved from public.inventory_balances where warehouse_id=warehouse and product_id=product and variation_id is null and location_id is null)<>2 then raise exception 'Sale confirmation did not reserve stock'; end if;
  perform public.record_sale_payment(actor,sale_one,500,current_date,'bank_transfer','LOCAL-PARTIAL','Offline partial payment');
  if (select payment_status from public.sales_orders where id=sale_one)<>'partially_paid' then raise exception 'Partial payment status is incorrect'; end if;
  perform public.record_sale_payment(actor,sale_one,1225,current_date,'cash','LOCAL-FULL','Offline final payment');
  if (select payment_status from public.sales_orders where id=sale_one)<>'paid' then raise exception 'Full payment status is incorrect'; end if;
  invoice_id:=public.generate_sale_document(actor,sale_one,'invoice');
  challan_id:=public.generate_sale_document(actor,sale_one,'delivery_challan');
  if invoice_id is null or challan_id is null or (select count(*) from public.sale_documents where order_id=sale_one)<>2 then raise exception 'Sale documents were not generated'; end if;

  sale_two:=public.create_minimal_sale(
    actor,customer,null,
    jsonb_build_object('recipient_name','Sales Customer','address_line_1','Cancellation Address','city','Dhaka','country_code','BD'),
    null,null,warehouse,'phone',null,0,0,0,0,null,null,
    jsonb_build_array(jsonb_build_object('product_id',product,'warehouse_id',warehouse,'quantity',1,'unit_price',900)),
    '[]'::jsonb
  );
  perform public.confirm_sales_order(actor,sale_two);
  perform public.cancel_sales_order(actor,sale_two,'Offline cancellation test');
  if (select status from public.sales_orders where id=sale_two)<>'cancelled' then raise exception 'Sale cancellation failed'; end if;
  if (select reserved from public.inventory_balances where warehouse_id=warehouse and product_id=product and variation_id is null and location_id is null)<>2 then raise exception 'Cancelled sale did not release its reservation'; end if;
  if initial_available<>10 then raise exception 'Initial fixture balance is incorrect'; end if;
  raise notice 'Minimal Sales workflow passed: %, %',sale_one,sale_two;
end $$;

select ok(true,'Minimal Sales creation, reservation, payments, documents and cancellation workflow');
select * from finish();
rollback;
