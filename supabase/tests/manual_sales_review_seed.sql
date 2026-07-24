-- Local-only browser review fixtures. Never apply this file to hosted Supabase.
-- Safe to rerun after `supabase db reset`.
select set_config('request.jwt.claim.role','service_role',false);
do $$
declare
  actor uuid;
  customer uuid;
  warehouse constant uuid := '20000000-0000-4000-8000-000000000003';
  product constant uuid := '20000000-0000-4000-8000-000000000004';
begin
  select id into actor from public.profiles where email='sales-admin@sen.local';
  select id into customer from public.profiles where email='sales-customer@sen.local';
  if actor is null or customer is null then raise exception 'Create the disposable local Auth users before loading this review seed'; end if;
  update public.profiles set full_name='Offline Sales Administrator',role='admin',status='active' where id=actor;
  update public.profiles set full_name='Offline Sales Customer',role='customer',status='active',phone='01700000000',country='Bangladesh' where id=customer;
  insert into public.warehouses(id,code,name,country_code,country_name) values(warehouse,'SALES-REVIEW','Offline Sales Review Warehouse','BD','Bangladesh') on conflict(id) do nothing;
  insert into public.products(id,name,slug,sku,model_number,product_type,status,regular_price,sale_price,currency,manage_stock,serial_tracking_required,default_warehouse_id,created_by,updated_by)
  values(product,'Offline Sales Review Router','offline-sales-review-router','SEN-OFFLINE-SALES','OFFLINE-SALES-1','simple','active',125000,120000,'BDT',true,false,warehouse,actor,actor)
  on conflict(id) do update set status='active',regular_price=125000,sale_price=120000,currency='BDT',default_warehouse_id=warehouse;
  insert into public.inventory_balances(warehouse_id,product_id,on_hand)
  values(warehouse,product,20)
  on conflict(warehouse_id,product_id) where variation_id is null and location_id is null
  do update set on_hand=20,reserved=0,damaged=0,unavailable=0,updated_at=now();
end $$;
