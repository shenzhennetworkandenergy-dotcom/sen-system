-- Inventory modernization Phase 1: serialized units, labels, product history,
-- workplace snapshots, tracking statuses and media classification.
-- Additive and backwards compatible with the existing inventory foundation.

alter table public.products add column if not exists model_number text;

alter table public.serial_numbers alter column manufacturer_serial drop not null;
alter table public.serial_numbers alter column warehouse_id drop not null;
alter table public.serial_numbers add column if not exists manufacturer_serial_normalized text;
alter table public.serial_numbers add column if not exists generated_at timestamptz;
alter table public.serial_numbers add column if not exists generated_by uuid references public.profiles(id) on delete set null;
alter table public.serial_numbers add column if not exists received_at timestamptz;
alter table public.serial_numbers add column if not exists received_by uuid references public.profiles(id) on delete set null;

update public.serial_numbers
set manufacturer_serial_normalized = nullif(upper(regexp_replace(trim(manufacturer_serial), '[^A-Za-z0-9]', '', 'g')), '')
where manufacturer_serial is not null and manufacturer_serial_normalized is null;

alter table public.serial_numbers drop constraint if exists serial_numbers_status_check;
alter table public.serial_numbers add constraint serial_numbers_status_check check(status in(
  'expected','in_transit','received','available','reserved','allocated','packed','shipped','delivered',
  'returned','quarantined','damaged','lost','transferred','disposed','voided','sold','unavailable','removed'
));
create unique index if not exists serial_numbers_manufacturer_normalized_idx
  on public.serial_numbers(manufacturer_serial_normalized) where manufacturer_serial_normalized is not null;

create table public.serial_generation_batches(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  expected_warehouse_id uuid references public.warehouses(id) on delete restrict,
  quantity integer not null check(quantity between 1 and 500),
  condition text not null default 'new',
  notes text,
  status text not null default 'generated' check(status in('generated','partially_received','received','cleared')),
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default now()
);
alter table public.serial_numbers add column if not exists generation_batch_id uuid references public.serial_generation_batches(id) on delete restrict;

create table public.serial_number_history(
  id uuid primary key default gen_random_uuid(),
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  event_type text not null,
  previous_sen_serial text,
  new_sen_serial text,
  previous_manufacturer_serial text,
  new_manufacturer_serial text,
  previous_status text,
  new_status text,
  previous_warehouse_id uuid references public.warehouses(id) on delete set null,
  new_warehouse_id uuid references public.warehouses(id) on delete set null,
  movement_id uuid references public.inventory_movements(id) on delete set null,
  reason text,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create unique index if not exists serial_number_history_voided_sen_idx
  on public.serial_number_history(previous_sen_serial) where previous_sen_serial is not null and event_type='regenerated';
create index if not exists serial_number_history_serial_idx on public.serial_number_history(serial_number_id,occurred_at desc);

create table public.product_revisions(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  revision_number bigint generated always as identity,
  snapshot jsonb not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_revisions_product_idx on public.product_revisions(product_id,created_at desc);

create table public.work_locations(
  id uuid primary key default gen_random_uuid(),name text not null,code text not null unique,
  location_type text not null check(location_type in('office','warehouse','supplier','freight_forwarder','airport','seaport','customs','temporary_site','other')),
  address_line text,city text,state_or_region text,postal_code text,country_code text not null,
  latitude numeric(10,7),longitude numeric(10,7),timezone text not null default 'Asia/Dhaka',
  is_active boolean not null default true,created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(latitude is null or latitude between -90 and 90),check(longitude is null or longitude between -180 and 180)
);
create table public.profile_work_locations(
  id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id) on delete restrict,
  work_location_id uuid not null references public.work_locations(id) on delete restrict,is_primary boolean not null default false,
  assigned_by uuid references public.profiles(id) on delete set null,assigned_at timestamptz not null default now(),ended_at timestamptz,is_active boolean not null default true
);
create unique index if not exists profile_work_locations_primary_idx on public.profile_work_locations(profile_id) where is_primary and is_active;

create table public.tracking_status_definitions(
  id uuid primary key default gen_random_uuid(),key text not null unique,name text not null,description text,
  stage text not null default 'inventory',country_scope text,sort_order integer not null default 0,
  is_system boolean not null default false,is_active boolean not null default true,customer_visible_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.serial_tracking_events(
  id uuid primary key default gen_random_uuid(),serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  movement_id uuid references public.inventory_movements(id) on delete set null,tracking_status_id uuid references public.tracking_status_definitions(id) on delete restrict,
  event_type text not null,actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  workplace_id uuid references public.work_locations(id) on delete set null,workplace_name_snapshot text,address_snapshot text,
  city_snapshot text,country_snapshot text,latitude_snapshot numeric(10,7),longitude_snapshot numeric(10,7),
  location_source text not null check(location_source in('profile_work_location','browser_geolocation','admin_override','warehouse','manual_verified')),
  event_status text not null default 'recorded',note text,occurred_at timestamptz not null default now(),recorded_at timestamptz not null default now()
);
create index if not exists serial_tracking_events_serial_idx on public.serial_tracking_events(serial_number_id,occurred_at desc);

alter table public.product_media add column if not exists serial_number_id uuid references public.serial_numbers(id) on delete restrict;
alter table public.product_media add column if not exists original_file_name text;
alter table public.product_media add column if not exists media_purpose text not null default 'gallery_image';
alter table public.product_media add column if not exists visibility text not null default 'public';
alter table public.product_media add column if not exists uploaded_by uuid references public.profiles(id) on delete set null;
alter table public.product_media add column if not exists updated_at timestamptz not null default now();
alter table public.product_media add constraint product_media_purpose_check check(media_purpose in('main_product_image','gallery_image','warranty_document','purchase_invoice','supplier_invoice','packing_list','customs_document','internal_product_document'));
alter table public.product_media add constraint product_media_visibility_check check(visibility in('public','customer_order_restricted','internal'));
update public.product_media set media_purpose=case when media_type='image' and is_primary then 'main_product_image' when media_type='image' then 'gallery_image' else 'internal_product_document' end,
  visibility=case when media_type='image' then 'public' else 'internal' end;

with defaults(key,name,stage,country_scope,sort_order,customer_visible) as(values
('purchased_from_supplier','Purchased from supplier','supplier','China',10,false),('supplier_preparing','Supplier preparing','supplier','China',20,false),
('picked_up_by_china_courier','Picked up by China courier','china_logistics','China',30,false),('at_china_consolidation_warehouse','At China consolidation warehouse','china_warehouse','China',40,false),
('sent_to_freight_forwarder','Sent to freight forwarder','international','China',50,false),('at_china_airport','At China airport','international','China',60,false),('at_china_seaport','At China seaport','international','China',70,false),
('departed_china_by_air','Departed China by air','international','China',80,true),('departed_china_by_sea','Departed China by sea','international','China',90,true),
('in_air_transit','In air transit','international',null,100,true),('in_sea_transit','In sea transit','international',null,110,true),
('arrived_bangladesh_airport','Arrived Bangladesh airport','bangladesh_logistics','Bangladesh',120,true),('arrived_bangladesh_seaport','Arrived Bangladesh seaport','bangladesh_logistics','Bangladesh',130,true),
('customs_clearance','Customs clearance','bangladesh_logistics','Bangladesh',140,true),('received_bangladesh_warehouse','Received Bangladesh warehouse','inventory','Bangladesh',150,true),
('allocated_to_customer','Allocated to customer','fulfilment','Bangladesh',160,true),('packed','Packed','fulfilment','Bangladesh',170,true),('handed_to_local_delivery','Handed to local delivery','delivery','Bangladesh',180,true),
('in_transit_to_customer','In transit to customer','delivery','Bangladesh',190,true),('out_for_delivery','Out for delivery','delivery','Bangladesh',200,true),('delivered','Delivered','complete','Bangladesh',210,true),
('returned','Returned','exception',null,220,false),('lost','Lost','exception',null,230,false),('damaged','Damaged','exception',null,240,false),('cancelled','Cancelled','exception',null,250,false))
insert into public.tracking_status_definitions(key,name,stage,country_scope,sort_order,is_system,customer_visible_default)
select key,name,stage,country_scope,sort_order,true,customer_visible from defaults on conflict(key) do nothing;

with required(module_key,key,name,action,sensitive,sort_order) as(values
('products','products.manage_media','Manage product media','manage_media',true,70),
('serials','serials.generate','Generate SEN serials','generate',true,60),('serials','serials.regenerate','Regenerate draft SEN serials','regenerate',true,70),
('serials','serials.print','Print serial labels','print',false,80),('serials','serials.export','Export serials','export',true,90),
('warehouses','locations.view','View work locations','view_locations',false,50),('warehouses','locations.manage','Manage work locations','manage_locations',true,60),
('warehouses','locations.capture','Capture work location events','capture_location',true,70),
('serials','tracking_statuses.view','View tracking statuses','view_tracking_statuses',false,100),('serials','tracking_statuses.manage','Manage tracking statuses','manage_tracking_statuses',true,110))
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,r.key,r.name,r.name,r.action,r.sensitive,r.sort_order from required r join public.app_modules m on m.key=r.module_key
on conflict(key) do update set name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order;

create or replace function public.normalize_manufacturer_serial(value text) returns text language sql immutable set search_path='' as $$
  select nullif(upper(regexp_replace(trim(value),'[^A-Za-z0-9]','','g')),'');
$$;
create or replace function public.normalize_serial_component(value text) returns text language sql immutable set search_path='' as $$
  select trim(both '-' from regexp_replace(regexp_replace(upper(trim(value)),'[^A-Z0-9]+','-','g'),'-+','-','g'));
$$;
create or replace function public.secure_random_digits(digit_count integer default 10) returns text language plpgsql volatile set search_path='' as $$
declare bytes bytea; result text:=''; i integer;
begin
  if digit_count<1 or digit_count>32 then raise exception 'Invalid digit count'; end if;
  bytes:=extensions.gen_random_bytes(digit_count);
  for i in 0..digit_count-1 loop result:=result||(get_byte(bytes,i)%10)::text; end loop;
  return result;
end $$;
create or replace function public.next_sen_serial(requested_product_id uuid) returns text language plpgsql volatile security definer set search_path='' as $$
declare brand_name text; model text; candidate text; attempts integer:=0;
begin
  select b.name,p.model_number into brand_name,model from public.products p join public.brands b on b.id=p.brand_id and b.is_active where p.id=requested_product_id and p.status<>'archived';
  if brand_name is null then raise exception 'An active brand is required before generating SEN serials'; end if;
  if nullif(trim(model),'') is null then raise exception 'Model number is required before generating SEN serials'; end if;
  loop
    attempts:=attempts+1;
    candidate:='SEN-'||public.normalize_serial_component(brand_name)||'-'||public.normalize_serial_component(model)||'-'||to_char(timezone('Asia/Dhaka',now()),'DD-MM-YYYY')||'-'||public.secure_random_digits(10);
    exit when not exists(select 1 from public.serial_numbers where sen_serial=candidate) and not exists(select 1 from public.serial_number_history where previous_sen_serial=candidate or new_sen_serial=candidate);
    if attempts>=20 then raise exception 'Unable to generate a unique SEN serial'; end if;
  end loop;
  return candidate;
end $$;

create or replace function public.capture_serial_event(requested_serial_id uuid,requested_movement_id uuid,requested_status_id uuid,requested_event_type text,actor_profile_id uuid,requested_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare assignment record; event_id uuid:=gen_random_uuid(); actor_role public.account_role; warehouse_record record;
begin
  select role into actor_role from public.profiles where id=actor_profile_id and status='active'; if actor_role is null then raise exception 'Active actor required'; end if;
  select wl.* into assignment from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active order by pw.assigned_at desc limit 1;
  if actor_role='employee' and assignment.id is null then raise exception 'A verified primary workplace is required'; end if;
  if assignment.id is null and requested_serial_id is not null then select w.id,w.name,w.address,w.country_name into warehouse_record from public.serial_numbers s join public.warehouses w on w.id=s.warehouse_id where s.id=requested_serial_id; end if;
  insert into public.serial_tracking_events(id,serial_number_id,movement_id,tracking_status_id,event_type,actor_profile_id,workplace_id,workplace_name_snapshot,address_snapshot,city_snapshot,country_snapshot,latitude_snapshot,longitude_snapshot,location_source,note)
  values(event_id,requested_serial_id,requested_movement_id,requested_status_id,requested_event_type,actor_profile_id,assignment.id,coalesce(assignment.name,warehouse_record.name),coalesce(assignment.address_line,warehouse_record.address),assignment.city,coalesce(assignment.country_code,warehouse_record.country_name),assignment.latitude,assignment.longitude,case when assignment.id is not null then 'profile_work_location' else 'warehouse' end,left(requested_note,1000));
  return event_id;
end $$;

create or replace function public.generate_serial_batch(actor_profile_id uuid,requested_product_id uuid,requested_variation_id uuid,requested_warehouse_id uuid,requested_quantity integer,requested_condition text default 'new',requested_notes text default null,requested_manufacturer_serials text[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare batch_id uuid:=gen_random_uuid(); actor_role public.account_role; i integer; serial_id uuid; generated text; manufacturer text; normalized text;
begin
  if requested_quantity<1 or requested_quantity>500 then raise exception 'Quantity must be between 1 and 500'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.generate') then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'An active serial-tracked product is required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if coalesce(array_length(requested_manufacturer_serials,1),0)>requested_quantity then raise exception 'Too many manufacturer serials'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  if actor_role='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  insert into public.serial_generation_batches(id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,generated_by) values(batch_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,left(requested_condition,80),left(requested_notes,1000),actor_profile_id);
  for i in 1..requested_quantity loop
    manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer);
    if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if;
    generated:=public.next_sen_serial(requested_product_id); serial_id:=gen_random_uuid();
    insert into public.serial_numbers(id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,notes,generation_batch_id,generated_at,generated_by)
    values(serial_id,manufacturer,normalized,generated,generated,requested_product_id,requested_variation_id,requested_warehouse_id,'expected',left(requested_condition,80),left(requested_notes,1000),batch_id,now(),actor_profile_id);
    insert into public.serial_number_history(serial_number_id,event_type,new_sen_serial,new_manufacturer_serial,new_status,new_warehouse_id,reason,actor_id) values(serial_id,'generated',generated,manufacturer,'expected',requested_warehouse_id,'Batch generation',actor_profile_id);
    perform public.capture_serial_event(serial_id,null,null,'serial.generated',actor_profile_id,requested_notes);
  end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'serial.batch_generated','serials','serial_generation_batch',batch_id::text,'SEN serial batch generated.',jsonb_build_object('product_id',requested_product_id,'quantity',requested_quantity,'warehouse_id',requested_warehouse_id));
  return batch_id;
end $$;

create or replace function public.regenerate_sen_serial(actor_profile_id uuid,requested_serial_id uuid,requested_reason text) returns text language plpgsql security definer set search_path='' as $$
declare unit public.serial_numbers%rowtype; replacement text; actor_role public.account_role;
begin
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.regenerate') then raise exception 'Permission denied'; end if;
  select * into unit from public.serial_numbers where id=requested_serial_id for update; if unit.id is null then raise exception 'Serial not found'; end if;
  if unit.status<>'expected' then raise exception 'Only expected serials can be regenerated'; end if;
  if nullif(trim(requested_reason),'') is null then raise exception 'Regeneration reason required'; end if;
  replacement:=public.next_sen_serial(unit.product_id); select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.serial_number_history(serial_number_id,event_type,previous_sen_serial,new_sen_serial,previous_status,new_status,previous_warehouse_id,new_warehouse_id,reason,actor_id) values(unit.id,'regenerated',unit.sen_serial,replacement,unit.status,unit.status,unit.warehouse_id,unit.warehouse_id,left(requested_reason,1000),actor_profile_id);
  update public.serial_numbers set sen_serial=replacement,barcode_value=replacement,updated_at=now() where id=unit.id;
  perform public.capture_serial_event(unit.id,null,null,'serial.regenerated',actor_profile_id,requested_reason);
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,'serial.regenerated','serials','serial_number',unit.id::text,'Expected SEN serial regenerated.',jsonb_build_object('sen_serial',unit.sen_serial),jsonb_build_object('sen_serial',replacement,'reason',left(requested_reason,1000)));
  return replacement;
end $$;

create or replace function public.update_manufacturer_serial(actor_profile_id uuid,requested_serial_id uuid,requested_value text) returns void language plpgsql security definer set search_path='' as $$
declare unit public.serial_numbers%rowtype; display_value text:=nullif(trim(requested_value),''); normalized text:=public.normalize_manufacturer_serial(requested_value); actor_role public.account_role;
begin
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='serials.correct') then raise exception 'Permission denied'; end if;
  select * into unit from public.serial_numbers where id=requested_serial_id for update; if unit.id is null then raise exception 'Serial not found'; end if;
  if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized and id<>requested_serial_id) then raise exception 'Manufacturer serial already exists'; end if;
  update public.serial_numbers set manufacturer_serial=display_value,manufacturer_serial_normalized=normalized,updated_at=now() where id=unit.id;
  insert into public.serial_number_history(serial_number_id,event_type,previous_manufacturer_serial,new_manufacturer_serial,previous_status,new_status,previous_warehouse_id,new_warehouse_id,reason,actor_id) values(unit.id,'manufacturer_serial_changed',unit.manufacturer_serial,display_value,unit.status,unit.status,unit.warehouse_id,unit.warehouse_id,'Manufacturer serial correction',actor_profile_id);
  perform public.capture_serial_event(unit.id,null,null,'serial.manufacturer_serial_changed',actor_profile_id,null);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,case when unit.manufacturer_serial is null then 'serial.manufacturer_serial_added' else 'serial.manufacturer_serial_changed' end,'serials','serial_number',unit.id::text,'Manufacturer serial updated.',jsonb_build_object('manufacturer_serial',unit.manufacturer_serial),jsonb_build_object('manufacturer_serial',display_value));
end $$;

create or replace function public.admin_adjust_serialized_inventory(actor_profile_id uuid,requested_warehouse_id uuid,requested_product_id uuid,requested_variation_id uuid,quantity_change integer,requested_reason_id uuid,requested_notes text,requested_serial_ids uuid[] default '{}',requested_manufacturer_serials text[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; b public.inventory_balances%rowtype; r public.stock_adjustment_reasons%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; new_on_hand numeric; serial_id uuid; generated text; manufacturer text; normalized text; i integer; affected integer;
begin
  if quantity_change=0 then raise exception 'Quantity change cannot be zero'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key=case when quantity_change>0 then 'inventory.receive' else 'inventory.adjust_stock' end) then raise exception 'Permission denied'; end if;
  select * into p from public.products where id=requested_product_id and serial_tracking_required and status<>'archived'; if p.id is null then raise exception 'Serialized product not found'; end if;
  select * into r from public.stock_adjustment_reasons where id=requested_reason_id and is_active; if r.id is null then raise exception 'Active adjustment reason required'; end if;
  if quantity_change>0 and r.direction='decrease' or quantity_change<0 and r.direction='increase' then raise exception 'Selected reason does not permit this direction'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if quantity_change>0 and coalesce(array_length(requested_serial_ids,1),0) not in(0,quantity_change) then raise exception 'Serial count must equal quantity'; end if;
  if quantity_change<0 and coalesce(array_length(requested_serial_ids,1),0)<>abs(quantity_change) then raise exception 'Serial count must equal quantity'; end if;
  if (select count(distinct x) from unnest(requested_serial_ids) x)<>coalesce(array_length(requested_serial_ids,1),0) then raise exception 'Duplicate serial selection'; end if;
  if (select role from public.profiles where id=actor_profile_id)='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into b from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  new_on_hand:=b.on_hand+quantity_change; if new_on_hand<0 or new_on_hand<b.reserved+b.damaged+b.unavailable then raise exception 'Insufficient available stock'; end if;
  if quantity_change>0 and array_length(requested_serial_ids,1) is not null and (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and status='expected')<>quantity_change then raise exception 'One or more expected serials are invalid'; end if;
  if quantity_change<0 and (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=requested_warehouse_id and status='available')<>abs(quantity_change) then raise exception 'One or more selected serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,source_warehouse_id,reason_id,notes,initiated_by,confirmed_at) values(m_id,'ADJ-'||upper(substr(replace(m_id::text,'-',''),1,12)),case when quantity_change>0 then 'purchase_receipt' else 'manual_adjustment' end,'confirmed',case when quantity_change>0 then requested_warehouse_id end,case when quantity_change<0 then requested_warehouse_id end,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=new_on_hand,updated_at=now() where id=b.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,requested_warehouse_id,quantity_change,new_on_hand);
  if quantity_change>0 and array_length(requested_serial_ids,1) is not null then
    update public.serial_numbers set warehouse_id=requested_warehouse_id,status='available',received_at=now(),received_by=actor_profile_id,last_movement_id=m_id,updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count;
    foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'received','expected','available',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.received',actor_profile_id,requested_notes); end loop;
  elsif quantity_change>0 then
    for i in 1..quantity_change loop manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer); if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if; generated:=public.next_sen_serial(requested_product_id); serial_id:=gen_random_uuid(); insert into public.serial_numbers(id,manufacturer_serial,manufacturer_serial_normalized,sen_serial,barcode_value,product_id,variation_id,warehouse_id,status,condition,last_movement_id,generated_at,generated_by,received_at,received_by) values(serial_id,manufacturer,normalized,generated,generated,requested_product_id,requested_variation_id,requested_warehouse_id,'available','new',m_id,now(),actor_profile_id,now(),actor_profile_id); insert into public.serial_number_history(serial_number_id,event_type,new_sen_serial,new_manufacturer_serial,new_status,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'received',generated,manufacturer,'available',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.received',actor_profile_id,requested_notes); end loop;
  else
    update public.serial_numbers set status='removed',last_movement_id=m_id,updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count; if affected<>abs(quantity_change) then raise exception 'Serial count mismatch'; end if;
    foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,movement_id,reason,actor_id) values(serial_id,'adjusted_out','available','removed',requested_warehouse_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.adjusted',actor_profile_id,requested_notes); end loop;
  end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.adjusted','inventory','inventory_movement',m_id::text,'Serialized inventory adjusted.',jsonb_build_object('product_id',requested_product_id,'warehouse_id',requested_warehouse_id,'quantity_change',quantity_change));
  return m_id;
end $$;

create or replace function public.admin_transfer_serialized_inventory(actor_profile_id uuid,source_id uuid,destination_id uuid,requested_product_id uuid,requested_variation_id uuid,transfer_quantity integer,requested_notes text,requested_serial_ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare src public.inventory_balances%rowtype; dst public.inventory_balances%rowtype; m_id uuid:=gen_random_uuid(); actor_role public.account_role; serial_id uuid; affected integer; lock_id uuid; src_balance_id uuid; dst_balance_id uuid;
begin
  if source_id=destination_id or transfer_quantity<1 then raise exception 'A positive transfer between different warehouses is required'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='inventory.transfer') then raise exception 'Permission denied'; end if;
  if coalesce(array_length(requested_serial_ids,1),0)<>transfer_quantity or (select count(distinct x) from unnest(requested_serial_ids)x)<>transfer_quantity then raise exception 'Every serialized unit must be selected exactly once'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'Serialized product not found'; end if;
  if (select role from public.profiles where id=actor_profile_id)='employee' and not exists(select 1 from public.profile_work_locations pw join public.work_locations wl on wl.id=pw.work_location_id where pw.profile_id=actor_profile_id and pw.is_primary and pw.is_active and wl.is_active) then raise exception 'A verified primary workplace is required'; end if;
  select id into src_balance_id from public.inventory_balances where warehouse_id=source_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null; if src_balance_id is null then raise exception 'Insufficient source stock'; end if;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(destination_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select id into dst_balance_id from public.inventory_balances where warehouse_id=destination_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null;
  for lock_id in select id from public.inventory_balances where id in(src_balance_id,dst_balance_id) order by id loop perform 1 from public.inventory_balances where id=lock_id for update; end loop;
  select * into src from public.inventory_balances where id=src_balance_id; select * into dst from public.inventory_balances where id=dst_balance_id;
  if src.available<transfer_quantity then raise exception 'Insufficient source stock'; end if;
  if (select count(*) from public.serial_numbers where id=any(requested_serial_ids) and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and warehouse_id=source_id and status='available')<>transfer_quantity then raise exception 'One or more selected serials are unavailable'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_movements(id,reference,movement_type,status,source_warehouse_id,destination_warehouse_id,notes,initiated_by,confirmed_at) values(m_id,'TRF-'||upper(substr(replace(m_id::text,'-',''),1,12)),'warehouse_transfer','confirmed',source_id,destination_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand-transfer_quantity,updated_at=now() where id=src.id; update public.inventory_balances set on_hand=on_hand+transfer_quantity,updated_at=now() where id=dst.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after) values(m_id,requested_product_id,requested_variation_id,source_id,-transfer_quantity,src.on_hand-transfer_quantity),(m_id,requested_product_id,requested_variation_id,destination_id,transfer_quantity,dst.on_hand+transfer_quantity);
  update public.serial_numbers set warehouse_id=destination_id,location_id=null,last_movement_id=m_id,status='available',updated_at=now() where id=any(requested_serial_ids); get diagnostics affected=row_count; if affected<>transfer_quantity then raise exception 'Serial count mismatch'; end if;
  foreach serial_id in array requested_serial_ids loop insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,new_warehouse_id,movement_id,reason,actor_id) values(serial_id,'transferred','available','available',source_id,destination_id,m_id,left(requested_notes,1000),actor_profile_id); perform public.capture_serial_event(serial_id,m_id,null,'serial.transferred',actor_profile_id,requested_notes); end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values) values(actor_profile_id,actor_role,'inventory.transferred','inventory','inventory_movement',m_id::text,'Serialized inventory transferred.',jsonb_build_object('product_id',requested_product_id,'source_warehouse_id',source_id,'destination_warehouse_id',destination_id,'quantity',transfer_quantity));
  return m_id;
end $$;

create or replace function public.capture_product_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.product_revisions(product_id,snapshot,actor_id) values(new.id,to_jsonb(new)-'internal_notes',coalesce(new.updated_by,new.created_by));
  return new;
end $$;
drop trigger if exists capture_product_revision on public.products;
create trigger capture_product_revision after insert or update on public.products for each row execute function public.capture_product_revision();

create or replace function public.admin_save_product(actor_profile_id uuid,requested_product_id uuid,requested_product jsonb,requested_category_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid; actor_role public.account_role; old_product jsonb; required_permission text; unknown_keys text[]; serial_count bigint;
begin
  if jsonb_typeof(requested_product)<>'object' then raise exception 'Product data must be an object'; end if;
  select array_agg(k.key order by k.key) into unknown_keys from jsonb_object_keys(requested_product) k(key) where not(k.key=any(array[
    'name','slug','sku','model_number','barcode','manufacturer_part_number','product_type','status','featured','sen_business_category','brand_id',
    'short_description','description','specifications','internal_notes','warranty_information','purchase_cost','regular_price','sale_price','currency',
    'weight','length','width','height','country_of_origin','manage_stock','stock_status','low_stock_threshold','allow_backorders','sold_individually',
    'serial_tracking_required','batch_tracking_enabled','public_catalogue_visible'
  ]));
  if unknown_keys is not null then raise exception 'Unsupported product fields: %',array_to_string(unknown_keys,', '); end if;
  required_permission:=case when requested_product_id is null then 'products.create' else 'products.edit' end;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key=required_permission) then raise exception 'Permission denied'; end if;
  if requested_category_id is not null and not exists(select 1 from public.product_categories where id=requested_category_id and is_active) then raise exception 'Active product category required'; end if;
  if coalesce((requested_product->>'serial_tracking_required')::boolean,false) and nullif(trim(requested_product->>'model_number'),'') is null then raise exception 'Model number is required for serial-tracked products'; end if;
  select role into actor_role from public.profiles where id=actor_profile_id;
  if requested_product_id is null then
    insert into public.products(name,slug,sku,model_number,barcode,manufacturer_part_number,product_type,status,featured,sen_business_category,brand_id,short_description,description,specifications,internal_notes,warranty_information,purchase_cost,regular_price,sale_price,currency,weight,length,width,height,country_of_origin,manage_stock,stock_status,low_stock_threshold,allow_backorders,sold_individually,serial_tracking_required,batch_tracking_enabled,public_catalogue_visible,created_by,updated_by)
    values(requested_product->>'name',requested_product->>'slug',requested_product->>'sku',nullif(trim(requested_product->>'model_number'),''),requested_product->>'barcode',requested_product->>'manufacturer_part_number',requested_product->>'product_type',requested_product->>'status',coalesce((requested_product->>'featured')::boolean,false),requested_product->>'sen_business_category',nullif(requested_product->>'brand_id','')::uuid,requested_product->>'short_description',requested_product->>'description',coalesce(nullif(requested_product->'specifications','null'::jsonb),'{}'::jsonb),requested_product->>'internal_notes',requested_product->>'warranty_information',(requested_product->>'purchase_cost')::numeric,(requested_product->>'regular_price')::numeric,(requested_product->>'sale_price')::numeric,requested_product->>'currency',(requested_product->>'weight')::numeric,(requested_product->>'length')::numeric,(requested_product->>'width')::numeric,(requested_product->>'height')::numeric,requested_product->>'country_of_origin',coalesce((requested_product->>'manage_stock')::boolean,false),requested_product->>'stock_status',coalesce((requested_product->>'low_stock_threshold')::numeric,0),coalesce((requested_product->>'allow_backorders')::boolean,false),coalesce((requested_product->>'sold_individually')::boolean,false),coalesce((requested_product->>'serial_tracking_required')::boolean,false),coalesce((requested_product->>'batch_tracking_enabled')::boolean,false),coalesce((requested_product->>'public_catalogue_visible')::boolean,false),actor_profile_id,actor_profile_id) returning id into saved_id;
  else
    select to_jsonb(p) into old_product from public.products p where p.id=requested_product_id for update;
    if old_product is null then raise exception 'Product not found'; end if;
    select count(*) into serial_count from public.serial_numbers where product_id=requested_product_id;
    update public.products set name=requested_product->>'name',slug=requested_product->>'slug',sku=requested_product->>'sku',model_number=nullif(trim(requested_product->>'model_number'),''),barcode=requested_product->>'barcode',manufacturer_part_number=requested_product->>'manufacturer_part_number',product_type=requested_product->>'product_type',status=requested_product->>'status',featured=coalesce((requested_product->>'featured')::boolean,false),sen_business_category=requested_product->>'sen_business_category',brand_id=nullif(requested_product->>'brand_id','')::uuid,short_description=requested_product->>'short_description',description=requested_product->>'description',specifications=coalesce(nullif(requested_product->'specifications','null'::jsonb),'{}'::jsonb),internal_notes=requested_product->>'internal_notes',warranty_information=requested_product->>'warranty_information',purchase_cost=(requested_product->>'purchase_cost')::numeric,regular_price=(requested_product->>'regular_price')::numeric,sale_price=(requested_product->>'sale_price')::numeric,currency=requested_product->>'currency',weight=(requested_product->>'weight')::numeric,length=(requested_product->>'length')::numeric,width=(requested_product->>'width')::numeric,height=(requested_product->>'height')::numeric,country_of_origin=requested_product->>'country_of_origin',manage_stock=coalesce((requested_product->>'manage_stock')::boolean,false),stock_status=requested_product->>'stock_status',low_stock_threshold=coalesce((requested_product->>'low_stock_threshold')::numeric,0),allow_backorders=coalesce((requested_product->>'allow_backorders')::boolean,false),sold_individually=coalesce((requested_product->>'sold_individually')::boolean,false),serial_tracking_required=coalesce((requested_product->>'serial_tracking_required')::boolean,false),batch_tracking_enabled=coalesce((requested_product->>'batch_tracking_enabled')::boolean,false),public_catalogue_visible=coalesce((requested_product->>'public_catalogue_visible')::boolean,false),updated_by=actor_profile_id,updated_at=now() where id=requested_product_id returning id into saved_id;
    if serial_count>0 and ((old_product->>'brand_id') is distinct from (requested_product->>'brand_id') or (old_product->>'model_number') is distinct from nullif(trim(requested_product->>'model_number'),'')) then
      insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,'product.model_changed','products','product',saved_id::text,'Product brand or model changed; existing serial values were preserved.',jsonb_build_object('brand_id',old_product->>'brand_id','model_number',old_product->>'model_number'),jsonb_build_object('brand_id',requested_product->>'brand_id','model_number',requested_product->>'model_number','existing_serial_count',serial_count));
    end if;
  end if;
  delete from public.product_category_assignments where product_id=saved_id;
  if requested_category_id is not null then insert into public.product_category_assignments(product_id,category_id,is_primary) values(saved_id,requested_category_id,true); end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values) values(actor_profile_id,actor_role,case when requested_product_id is null then 'product.created' else 'product.updated' end,'products','product',saved_id::text,case when requested_product_id is null then 'Product created.' else 'Product updated.' end,old_product,jsonb_build_object('name',requested_product->>'name','sku',requested_product->>'sku','model_number',requested_product->>'model_number','status',requested_product->>'status','product_type',requested_product->>'product_type','category_id',requested_category_id));
  return saved_id;
end $$;

do $$ declare t text; begin foreach t in array array['serial_generation_batches','serial_number_history','product_revisions','work_locations','profile_work_locations','tracking_status_definitions','serial_tracking_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy "authorized staff read serial batches" on public.serial_generation_batches for select to authenticated using(public.current_user_has_permission('serials.view'));
create policy "authorized staff read serial history" on public.serial_number_history for select to authenticated using(public.current_user_has_permission('serials.trace'));
create policy "authorized staff read product revisions" on public.product_revisions for select to authenticated using(public.current_user_has_permission('products.view'));
create policy "authorized staff read work locations" on public.work_locations for select to authenticated using(public.current_user_has_permission('locations.view') or public.current_user_has_permission('locations.manage'));
create policy "employee read own workplace" on public.profile_work_locations for select to authenticated using(profile_id=auth.uid() or public.current_user_has_permission('locations.manage'));
create policy "authorized staff read tracking definitions" on public.tracking_status_definitions for select to authenticated using(public.current_user_has_permission('tracking_statuses.view') or public.current_user_has_permission('serials.trace'));
create policy "authorized staff read serial tracking events" on public.serial_tracking_events for select to authenticated using(public.current_user_has_permission('serials.trace'));

revoke all on function public.next_sen_serial(uuid) from public,anon,authenticated;
revoke all on function public.admin_save_product(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_product(uuid,uuid,jsonb,uuid) to service_role;
revoke all on function public.capture_serial_event(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.generate_serial_batch(uuid,uuid,uuid,uuid,integer,text,text,text[]) from public,anon,authenticated;
revoke all on function public.regenerate_sen_serial(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.update_manufacturer_serial(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_adjust_serialized_inventory(uuid,uuid,uuid,uuid,integer,uuid,text,uuid[],text[]) from public,anon,authenticated;
revoke all on function public.admin_transfer_serialized_inventory(uuid,uuid,uuid,uuid,uuid,integer,text,uuid[]) from public,anon,authenticated;
grant execute on function public.generate_serial_batch(uuid,uuid,uuid,uuid,integer,text,text,text[]) to service_role;
grant execute on function public.regenerate_sen_serial(uuid,uuid,text) to service_role;
grant execute on function public.update_manufacturer_serial(uuid,uuid,text) to service_role;
grant execute on function public.admin_adjust_serialized_inventory(uuid,uuid,uuid,uuid,integer,uuid,text,uuid[],text[]) to service_role;
grant execute on function public.admin_transfer_serialized_inventory(uuid,uuid,uuid,uuid,uuid,integer,text,uuid[]) to service_role;

grant select on public.serial_generation_batches,public.serial_number_history,public.product_revisions,public.work_locations,public.profile_work_locations,public.tracking_status_definitions,public.serial_tracking_events to authenticated,service_role;
grant all on public.serial_generation_batches,public.serial_number_history,public.product_revisions,public.work_locations,public.profile_work_locations,public.tracking_status_definitions,public.serial_tracking_events to service_role;
