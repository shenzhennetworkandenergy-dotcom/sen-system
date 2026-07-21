-- Read-only verification after migrations 002, 003, and 004.
select object_name, object_exists from (values
  ('products',to_regclass('public.products') is not null),('product_categories',to_regclass('public.product_categories') is not null),
  ('brands',to_regclass('public.brands') is not null),('attributes',to_regclass('public.attributes') is not null),
  ('product_variations',to_regclass('public.product_variations') is not null),('product_media',to_regclass('public.product_media') is not null),
  ('warehouses',to_regclass('public.warehouses') is not null),('warehouse_locations',to_regclass('public.warehouse_locations') is not null),
  ('inventory_balances',to_regclass('public.inventory_balances') is not null),('inventory_movements',to_regclass('public.inventory_movements') is not null),
  ('inventory_movement_items',to_regclass('public.inventory_movement_items') is not null),('inventory_reservations',to_regclass('public.inventory_reservations') is not null),
  ('serial_numbers',to_regclass('public.serial_numbers') is not null),('stock_adjustment_reasons',to_regclass('public.stock_adjustment_reasons') is not null),
  ('inventory_dashboard_summary(uuid)',to_regprocedure('public.inventory_dashboard_summary(uuid)') is not null),
  ('admin_save_product(uuid,uuid,jsonb,uuid)',to_regprocedure('public.admin_save_product(uuid,uuid,jsonb,uuid)') is not null),
  ('admin_adjust_inventory(uuid,uuid,uuid,uuid,numeric,uuid,text,text[])',to_regprocedure('public.admin_adjust_inventory(uuid,uuid,uuid,uuid,numeric,uuid,text,text[])') is not null),
  ('admin_transfer_inventory(uuid,uuid,uuid,uuid,uuid,numeric,text,text[])',to_regprocedure('public.admin_transfer_inventory(uuid,uuid,uuid,uuid,uuid,numeric,text,text[])') is not null)
) checks(object_name,object_exists) order by object_name;

select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname=any(array['products','product_categories','brands','attributes','product_variations','product_media','warehouses','warehouse_locations','inventory_balances','inventory_movements','inventory_movement_items','inventory_reservations','serial_numbers','stock_adjustment_reasons']) order by c.relname;

select p.proname,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,has_function_privilege('service_role',p.oid,'execute') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['admin_save_product','admin_adjust_inventory','admin_transfer_inventory','inventory_dashboard_summary']) order by p.proname;

select conname,contype,convalidated from pg_constraint where conname=any(array['product_variations_id_product_key','warehouse_locations_id_warehouse_key','inventory_balances_variation_product_fk','inventory_movement_items_variation_product_fk','inventory_reservations_variation_product_fk','serial_numbers_variation_product_fk','product_media_variation_product_fk','inventory_balances_location_warehouse_fk','serial_numbers_location_warehouse_fk']) order by conname;

select tgname,tgrelid::regclass as table_name from pg_trigger where not tgisinternal and tgname=any(array['enforce_global_product_sku','enforce_global_variation_sku','validate_product_stock_model','validate_product_variation']) order by tgname;

select check_name,passed from (values
  ('global SKU enforcement',position('pg_advisory_xact_lock' in pg_get_functiondef('public.enforce_global_product_sku()'::regprocedure))>0),
  ('stock-model serialization',position('product-stock:' in pg_get_functiondef('public.validate_product_stock_model()'::regprocedure))>0 and position('product-stock:' in pg_get_functiondef('public.validate_product_variation()'::regprocedure))>0),
  ('adjustment reason direction',position('Selected reason only permits' in pg_get_functiondef('public.admin_adjust_inventory(uuid,uuid,uuid,uuid,numeric,uuid,text,text[])'::regprocedure))>0),
  ('deterministic transfer locking',position('order by id' in lower(pg_get_functiondef('public.admin_transfer_inventory(uuid,uuid,uuid,uuid,uuid,numeric,text,text[])'::regprocedure)))>0),
  ('transactional product category save',position('product_category_assignments' in pg_get_functiondef('public.admin_save_product(uuid,uuid,jsonb,uuid)'::regprocedure))>0)
) checks(check_name,passed) order by check_name;

select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='product-media';

select 'cross_table_duplicate_sku' as violation,count(*) from public.products p join public.product_variations v on v.sku=p.sku
union all select 'ambiguous_stock_management',count(*) from public.products p join public.product_variations v on v.product_id=p.id and v.status='active' and v.manage_stock where p.product_type='variable' and p.manage_stock
union all select 'balance_variation_product_mismatch',count(*) from public.inventory_balances b join public.product_variations v on v.id=b.variation_id where v.product_id<>b.product_id
union all select 'movement_variation_product_mismatch',count(*) from public.inventory_movement_items i join public.product_variations v on v.id=i.variation_id where v.product_id<>i.product_id
union all select 'reservation_variation_product_mismatch',count(*) from public.inventory_reservations r join public.product_variations v on v.id=r.variation_id where v.product_id<>r.product_id
union all select 'serial_variation_product_mismatch',count(*) from public.serial_numbers s join public.product_variations v on v.id=s.variation_id where v.product_id<>s.product_id
union all select 'media_variation_product_mismatch',count(*) from public.product_media m join public.product_variations v on v.id=m.variation_id where v.product_id<>m.product_id
union all select 'balance_location_warehouse_mismatch',count(*) from public.inventory_balances b join public.warehouse_locations l on l.id=b.location_id where l.warehouse_id<>b.warehouse_id
union all select 'serial_location_warehouse_mismatch',count(*) from public.serial_numbers s join public.warehouse_locations l on l.id=s.location_id where l.warehouse_id<>s.warehouse_id;
