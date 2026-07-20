-- Inventory integrity hardening. Apply after 202607200002 and 202607200003.

do $$
declare missing_permissions text[];
begin
  if to_regclass('public.profiles') is null or to_regclass('public.audit_logs') is null or to_regclass('public.app_modules') is null or to_regclass('public.permissions') is null then
    raise exception 'Inventory hardening requires the Phase 3A and Phase 3B tables';
  end if;
  if to_regprocedure('public.effective_permissions_for_profile(uuid)') is null or to_regprocedure('public.current_user_has_permission(text)') is null then
    raise exception 'Inventory hardening requires the Phase 3B permission functions';
  end if;
  if to_regclass('public.products') is null or to_regclass('public.inventory_balances') is null or to_regprocedure('public.inventory_dashboard_summary(uuid)') is null then
    raise exception 'Apply inventory foundation and reporting migrations before hardening';
  end if;
  select array_agg(required.key order by required.key) into missing_permissions
  from unnest(array[
    'products.view','products.create','products.edit','products.archive','products.import','products.export',
    'inventory.view','inventory.receive','inventory.adjust_stock','inventory.transfer','inventory.count','inventory.export',
    'warehouses.view','warehouses.create','warehouses.edit','warehouses.manage_locations',
    'serials.view','serials.assign','serials.receive','serials.trace','serials.correct'
  ]) required(key)
  where not exists(select 1 from public.permissions p where p.key=required.key and p.is_active);
  if missing_permissions is not null then raise exception 'Missing required inventory permissions: %', array_to_string(missing_permissions, ', '); end if;
end $$;

do $$
begin
  if exists(select 1 from public.products p join public.product_variations v on v.sku=p.sku) then raise exception 'Cross-table duplicate SKUs must be resolved before inventory hardening'; end if;
  if exists(select 1 from public.products p join public.product_variations v on v.product_id=p.id and v.status='active' and v.manage_stock where p.product_type='variable' and p.manage_stock) then raise exception 'Ambiguous parent and variation stock settings must be resolved before inventory hardening'; end if;
  if exists(select 1 from public.inventory_balances b join public.product_variations v on v.id=b.variation_id where v.product_id<>b.product_id) then raise exception 'Inventory balance has a variation from another product'; end if;
  if exists(select 1 from public.inventory_movement_items i join public.product_variations v on v.id=i.variation_id where v.product_id<>i.product_id) then raise exception 'Inventory movement has a variation from another product'; end if;
  if exists(select 1 from public.inventory_reservations r join public.product_variations v on v.id=r.variation_id where v.product_id<>r.product_id) then raise exception 'Inventory reservation has a variation from another product'; end if;
  if exists(select 1 from public.serial_numbers s join public.product_variations v on v.id=s.variation_id where v.product_id<>s.product_id) then raise exception 'Serial number has a variation from another product'; end if;
  if exists(select 1 from public.product_media m join public.product_variations v on v.id=m.variation_id where v.product_id<>m.product_id) then raise exception 'Product media has a variation from another product'; end if;
  if exists(select 1 from public.inventory_balances b join public.warehouse_locations l on l.id=b.location_id where l.warehouse_id<>b.warehouse_id) then raise exception 'Inventory balance has a location from another warehouse'; end if;
  if exists(select 1 from public.serial_numbers s join public.warehouse_locations l on l.id=s.location_id where l.warehouse_id<>s.warehouse_id) then raise exception 'Serial number has a location from another warehouse'; end if;
end $$;

create or replace function public.enforce_global_product_sku() returns trigger language plpgsql set search_path='' as $$
begin
  new.sku:=btrim(new.sku);
  if new.sku='' then raise exception 'SKU is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.sku,0));
  if tg_table_name='products' and exists(select 1 from public.product_variations v where v.sku=new.sku) then raise exception 'SKU already exists on a product variation'; end if;
  if tg_table_name='product_variations' and exists(select 1 from public.products p where p.sku=new.sku) then raise exception 'SKU already exists on a product'; end if;
  return new;
end $$;
drop trigger if exists enforce_global_product_sku on public.products;
create trigger enforce_global_product_sku before insert or update of sku on public.products for each row execute function public.enforce_global_product_sku();
drop trigger if exists enforce_global_variation_sku on public.product_variations;
create trigger enforce_global_variation_sku before insert or update of sku on public.product_variations for each row execute function public.enforce_global_product_sku();

create or replace function public.validate_product_stock_model() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('product-stock:'||new.id::text,0));
  if new.product_type='simple' and exists(select 1 from public.product_variations v where v.product_id=new.id) then raise exception 'A product with variations cannot be changed to a simple product'; end if;
  if new.product_type='variable' and new.manage_stock and exists(select 1 from public.product_variations v where v.product_id=new.id and v.status='active' and v.manage_stock) then raise exception 'Stock cannot be managed by both the variable parent and its variations'; end if;
  return new;
end $$;
drop trigger if exists validate_product_stock_model on public.products;
create trigger validate_product_stock_model before insert or update of product_type,manage_stock on public.products for each row execute function public.validate_product_stock_model();

create or replace function public.validate_product_variation() returns trigger language plpgsql set search_path='' as $$
declare parent public.products%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('product-stock:'||new.product_id::text,0));
  select * into parent from public.products where id=new.product_id;
  if parent.id is null then raise exception 'Variation parent product was not found'; end if;
  if parent.product_type<>'variable' then raise exception 'Variations require a variable parent product'; end if;
  if new.status='active' and parent.manage_stock and new.manage_stock then raise exception 'Stock cannot be managed by both the variable parent and its variations'; end if;
  return new;
end $$;

alter table public.product_variations add constraint product_variations_id_product_key unique(id,product_id);
alter table public.warehouse_locations add constraint warehouse_locations_id_warehouse_key unique(id,warehouse_id);
alter table public.inventory_balances add constraint inventory_balances_variation_product_fk foreign key(variation_id,product_id) references public.product_variations(id,product_id) on delete restrict not valid;
alter table public.inventory_movement_items add constraint inventory_movement_items_variation_product_fk foreign key(variation_id,product_id) references public.product_variations(id,product_id) on delete restrict not valid;
alter table public.inventory_reservations add constraint inventory_reservations_variation_product_fk foreign key(variation_id,product_id) references public.product_variations(id,product_id) on delete restrict not valid;
alter table public.serial_numbers add constraint serial_numbers_variation_product_fk foreign key(variation_id,product_id) references public.product_variations(id,product_id) on delete restrict not valid;
alter table public.product_media add constraint product_media_variation_product_fk foreign key(variation_id,product_id) references public.product_variations(id,product_id) on delete cascade not valid;
alter table public.inventory_balances add constraint inventory_balances_location_warehouse_fk foreign key(location_id,warehouse_id) references public.warehouse_locations(id,warehouse_id) on delete restrict not valid;
alter table public.serial_numbers add constraint serial_numbers_location_warehouse_fk foreign key(location_id,warehouse_id) references public.warehouse_locations(id,warehouse_id) on delete restrict not valid;
alter table public.inventory_balances validate constraint inventory_balances_variation_product_fk;
alter table public.inventory_movement_items validate constraint inventory_movement_items_variation_product_fk;
alter table public.inventory_reservations validate constraint inventory_reservations_variation_product_fk;
alter table public.serial_numbers validate constraint serial_numbers_variation_product_fk;
alter table public.product_media validate constraint product_media_variation_product_fk;
alter table public.inventory_balances validate constraint inventory_balances_location_warehouse_fk;
alter table public.serial_numbers validate constraint serial_numbers_location_warehouse_fk;

create or replace function public.admin_save_product(actor_profile_id uuid,requested_product_id uuid,requested_product jsonb,requested_category_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid; actor_role public.account_role; old_product jsonb; required_permission text; unknown_keys text[];
begin
  if jsonb_typeof(requested_product)<>'object' then raise exception 'Product data must be an object'; end if;
  select array_agg(k.key order by k.key) into unknown_keys from jsonb_object_keys(requested_product) k(key) where not(k.key=any(array[
    'name','slug','sku','barcode','manufacturer_part_number','product_type','status','featured','sen_business_category','brand_id',
    'short_description','description','specifications','internal_notes','warranty_information','purchase_cost','regular_price','sale_price','currency',
    'weight','length','width','height','country_of_origin','manage_stock','stock_status','low_stock_threshold','allow_backorders','sold_individually',
    'serial_tracking_required','batch_tracking_enabled','public_catalogue_visible'
  ]));
  if unknown_keys is not null then raise exception 'Unsupported product fields: %',array_to_string(unknown_keys,', '); end if;
  required_permission:=case when requested_product_id is null then 'products.create' else 'products.edit' end;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key=required_permission) then raise exception 'Permission denied'; end if;
  if requested_category_id is not null and not exists(select 1 from public.product_categories where id=requested_category_id and is_active) then raise exception 'Active product category required'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  if requested_product_id is null then
    insert into public.products(name,slug,sku,barcode,manufacturer_part_number,product_type,status,featured,sen_business_category,brand_id,short_description,description,specifications,internal_notes,warranty_information,purchase_cost,regular_price,sale_price,currency,weight,length,width,height,country_of_origin,manage_stock,stock_status,low_stock_threshold,allow_backorders,sold_individually,serial_tracking_required,batch_tracking_enabled,public_catalogue_visible,created_by,updated_by)
    values(requested_product->>'name',requested_product->>'slug',requested_product->>'sku',requested_product->>'barcode',requested_product->>'manufacturer_part_number',requested_product->>'product_type',requested_product->>'status',coalesce((requested_product->>'featured')::boolean,false),requested_product->>'sen_business_category',nullif(requested_product->>'brand_id','')::uuid,requested_product->>'short_description',requested_product->>'description',coalesce(nullif(requested_product->'specifications','null'::jsonb),'{}'::jsonb),requested_product->>'internal_notes',requested_product->>'warranty_information',(requested_product->>'purchase_cost')::numeric,(requested_product->>'regular_price')::numeric,(requested_product->>'sale_price')::numeric,requested_product->>'currency',(requested_product->>'weight')::numeric,(requested_product->>'length')::numeric,(requested_product->>'width')::numeric,(requested_product->>'height')::numeric,requested_product->>'country_of_origin',coalesce((requested_product->>'manage_stock')::boolean,false),requested_product->>'stock_status',coalesce((requested_product->>'low_stock_threshold')::numeric,0),coalesce((requested_product->>'allow_backorders')::boolean,false),coalesce((requested_product->>'sold_individually')::boolean,false),coalesce((requested_product->>'serial_tracking_required')::boolean,false),coalesce((requested_product->>'batch_tracking_enabled')::boolean,false),coalesce((requested_product->>'public_catalogue_visible')::boolean,false),actor_profile_id,actor_profile_id) returning id into saved_id;
  else
    select jsonb_build_object('name',p.name,'sku',p.sku,'status',p.status,'product_type',p.product_type,'brand_id',p.brand_id,'manage_stock',p.manage_stock) into old_product from public.products p where p.id=requested_product_id for update;
    if old_product is null then raise exception 'Product not found'; end if;
    update public.products set name=requested_product->>'name',slug=requested_product->>'slug',sku=requested_product->>'sku',barcode=requested_product->>'barcode',manufacturer_part_number=requested_product->>'manufacturer_part_number',product_type=requested_product->>'product_type',status=requested_product->>'status',featured=coalesce((requested_product->>'featured')::boolean,false),sen_business_category=requested_product->>'sen_business_category',brand_id=nullif(requested_product->>'brand_id','')::uuid,short_description=requested_product->>'short_description',description=requested_product->>'description',specifications=coalesce(nullif(requested_product->'specifications','null'::jsonb),'{}'::jsonb),internal_notes=requested_product->>'internal_notes',warranty_information=requested_product->>'warranty_information',purchase_cost=(requested_product->>'purchase_cost')::numeric,regular_price=(requested_product->>'regular_price')::numeric,sale_price=(requested_product->>'sale_price')::numeric,currency=requested_product->>'currency',weight=(requested_product->>'weight')::numeric,length=(requested_product->>'length')::numeric,width=(requested_product->>'width')::numeric,height=(requested_product->>'height')::numeric,country_of_origin=requested_product->>'country_of_origin',manage_stock=coalesce((requested_product->>'manage_stock')::boolean,false),stock_status=requested_product->>'stock_status',low_stock_threshold=coalesce((requested_product->>'low_stock_threshold')::numeric,0),allow_backorders=coalesce((requested_product->>'allow_backorders')::boolean,false),sold_individually=coalesce((requested_product->>'sold_individually')::boolean,false),serial_tracking_required=coalesce((requested_product->>'serial_tracking_required')::boolean,false),batch_tracking_enabled=coalesce((requested_product->>'batch_tracking_enabled')::boolean,false),public_catalogue_visible=coalesce((requested_product->>'public_catalogue_visible')::boolean,false),updated_by=actor_profile_id,updated_at=now() where id=requested_product_id returning id into saved_id;
  end if;
  delete from public.product_category_assignments where product_id=saved_id;
  if requested_category_id is not null then insert into public.product_category_assignments(product_id,category_id,is_primary) values(saved_id,requested_category_id,true); end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,case when requested_product_id is null then 'product.created' else 'product.updated' end,'products','product',saved_id::text,case when requested_product_id is null then 'Product created.' else 'Product updated.' end,old_product,jsonb_build_object('name',requested_product->>'name','sku',requested_product->>'sku','status',requested_product->>'status','product_type',requested_product->>'product_type','category_id',requested_category_id));
  return saved_id;
end $$;

create or replace function public.admin_adjust_inventory(actor_profile_id uuid,requested_warehouse_id uuid,requested_product_id uuid,requested_variation_id uuid,quantity_change numeric,requested_reason_id uuid,requested_notes text,requested_serials text[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; b public.inventory_balances%rowtype; r public.stock_adjustment_reasons%rowtype; m_id uuid:=gen_random_uuid(); new_on_hand numeric; actor_role public.account_role; affected_serials integer;
begin
  if quantity_change is null or quantity_change=0 then raise exception 'Quantity change cannot be zero'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.adjust_stock') then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
  select * into r from public.stock_adjustment_reasons where id=requested_reason_id and is_active; if r.id is null then raise exception 'Active adjustment reason required'; end if;
  if quantity_change>0 and r.direction='decrease' then raise exception 'Selected reason only permits stock decreases'; end if;
  if quantity_change<0 and r.direction='increase' then raise exception 'Selected reason only permits stock increases'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if p.serial_tracking_required and (quantity_change<>trunc(quantity_change) or coalesce(array_length(requested_serials,1),0)<>abs(quantity_change)::integer or (select count(distinct trim(s)) from unnest(requested_serials) s)<>abs(quantity_change)::integer) then raise exception 'Every serialized unit requires one unique serial number'; end if;
  if p.serial_tracking_required and quantity_change<0 and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into b from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  if p.serial_tracking_required and quantity_change<0 and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if;
  new_on_hand:=b.on_hand+quantity_change; if new_on_hand<0 or new_on_hand<b.reserved+b.damaged+b.unavailable then raise exception 'Insufficient available stock'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,source_warehouse_id,reason_id,notes,initiated_by,confirmed_at) values(m_id,'ADJ-'||upper(substr(replace(m_id::text,'-',''),1,12)),case when b.on_hand=0 and quantity_change>0 then 'opening_balance' else 'manual_adjustment' end,'confirmed',case when quantity_change>0 then requested_warehouse_id end,case when quantity_change<0 then requested_warehouse_id end,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=new_on_hand,updated_at=now() where id=b.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,requested_warehouse_id,quantity_change,new_on_hand);
  if p.serial_tracking_required and quantity_change>0 then insert into public.serial_numbers(manufacturer_serial,product_id,variation_id,warehouse_id,last_movement_id) select distinct trim(s),requested_product_id,requested_variation_id,requested_warehouse_id,m_id from unnest(requested_serials) s; end if;
  if p.serial_tracking_required and quantity_change<0 then update public.serial_numbers set status='removed',last_movement_id=m_id,updated_at=now() where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available'; get diagnostics affected_serials=row_count; if affected_serials<>abs(quantity_change)::integer then raise exception 'One or more serials are unavailable'; end if; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.adjusted','inventory','inventory_movement',m_id::text,'Inventory quantity adjusted.',jsonb_build_object('product_id',requested_product_id,'variation_id',requested_variation_id,'warehouse_id',requested_warehouse_id,'quantity_change',quantity_change,'reason',r.key));
  return m_id;
end $$;

create or replace function public.admin_transfer_inventory(actor_profile_id uuid,source_id uuid,destination_id uuid,requested_product_id uuid,requested_variation_id uuid,transfer_quantity numeric,requested_notes text,requested_serials text[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; src public.inventory_balances%rowtype; dst public.inventory_balances%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; locked_id uuid; src_id uuid; dst_id uuid; affected_serials integer;
begin
  if source_id=destination_id or transfer_quantity is null or transfer_quantity<=0 then raise exception 'A positive transfer between different warehouses is required'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.transfer') then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
  if (select count(*) from public.warehouses where id in(source_id,destination_id) and is_active)<>2 then raise exception 'Two active warehouses are required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if p.serial_tracking_required and (transfer_quantity<>trunc(transfer_quantity) or coalesce(array_length(requested_serials,1),0)<>transfer_quantity::integer or (select count(distinct trim(s)) from unnest(requested_serials) s)<>transfer_quantity::integer) then raise exception 'Every serialized unit must be selected'; end if;
  select id into src_id from public.inventory_balances where warehouse_id=source_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null; if src_id is null then raise exception 'Insufficient available source stock'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(destination_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select id into dst_id from public.inventory_balances where warehouse_id=destination_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null;
  for locked_id in select id from public.inventory_balances where id in(src_id,dst_id) order by id loop perform 1 from public.inventory_balances where id=locked_id for update; end loop;
  select * into src from public.inventory_balances where id=src_id; select * into dst from public.inventory_balances where id=dst_id;
  if src.available<transfer_quantity then raise exception 'Insufficient available source stock'; end if;
  if p.serial_tracking_required and (select count(*) from public.serial_numbers where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available')<>transfer_quantity::integer then raise exception 'One or more serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,notes,initiated_by,confirmed_at) values(m_id,'TRF-'||upper(substr(replace(m_id::text,'-',''),1,12)),'warehouse_transfer','confirmed',source_id,destination_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand-transfer_quantity,updated_at=now() where id=src.id; update public.inventory_balances set on_hand=on_hand+transfer_quantity,updated_at=now() where id=dst.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,source_id,-transfer_quantity,src.on_hand-transfer_quantity),(m_id,requested_product_id,requested_variation_id,destination_id,transfer_quantity,dst.on_hand+transfer_quantity);
  if p.serial_tracking_required then update public.serial_numbers set warehouse_id=destination_id,location_id=null,last_movement_id=m_id,status='available',updated_at=now() where manufacturer_serial=any(requested_serials) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available'; get diagnostics affected_serials=row_count; if affected_serials<>transfer_quantity::integer then raise exception 'One or more serials are unavailable'; end if; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.transferred','inventory','inventory_movement',m_id::text,'Inventory transferred between warehouses.',jsonb_build_object('product_id',requested_product_id,'variation_id',requested_variation_id,'source_warehouse_id',source_id,'destination_warehouse_id',destination_id,'quantity',transfer_quantity));
  return m_id;
end $$;

revoke all on function public.admin_save_product(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_product(uuid,uuid,jsonb,uuid) to service_role;
revoke all on function public.admin_adjust_inventory(uuid,uuid,uuid,uuid,numeric,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.admin_adjust_inventory(uuid,uuid,uuid,uuid,numeric,uuid,text,text[]) to service_role;
revoke all on function public.admin_transfer_inventory(uuid,uuid,uuid,uuid,uuid,numeric,text,text[]) from public,anon,authenticated;
grant execute on function public.admin_transfer_inventory(uuid,uuid,uuid,uuid,uuid,numeric,text,text[]) to service_role;
