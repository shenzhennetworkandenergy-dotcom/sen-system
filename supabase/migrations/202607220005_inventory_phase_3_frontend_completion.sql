-- Inventory modernization Phase 3: authoritative product identity, atomic
-- serialized receiving, and explicit foreground delivery-location sessions.

alter table public.products add column if not exists normalized_brand_key text;
alter table public.products add column if not exists normalized_model_number text;
alter table public.products add column if not exists sku_generation_mode text not null default 'legacy'
  check (sku_generation_mode in ('legacy','automatic','custom'));

create index if not exists products_normalized_model_identity_idx
  on public.products(normalized_brand_key, normalized_model_number)
  where status <> 'archived' and normalized_brand_key is not null and normalized_model_number is not null;

create table if not exists public.product_identifier_history(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  previous_sku text,
  new_sku text not null,
  reason text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index if not exists product_identifier_history_product_idx
  on public.product_identifier_history(product_id, occurred_at desc);

create table if not exists public.delivery_location_sessions(
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check(status in('active','paused','stopped','completed')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  ended_at timestamptz,
  last_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists delivery_location_one_active_session_idx
  on public.delivery_location_sessions(shipment_id)
  where status in('active','paused');

create table if not exists public.delivery_location_updates(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.delivery_location_sessions(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  latitude numeric(10,7) not null check(latitude between -90 and 90),
  longitude numeric(10,7) not null check(longitude between -180 and 180),
  accuracy numeric(12,3) check(accuracy is null or accuracy >= 0),
  heading numeric(8,3),
  speed numeric(12,3),
  source text not null default 'browser_geolocation' check(source in('browser_geolocation','manual_verified')),
  work_location_id uuid references public.work_locations(id) on delete set null,
  customer_visible boolean not null default true,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists delivery_location_updates_shipment_idx
  on public.delivery_location_updates(shipment_id, recorded_at desc);

create or replace function public.phase3_normalize_identifier(value text) returns text
language sql immutable set search_path='' as $$
  select nullif(trim(both '-' from regexp_replace(regexp_replace(upper(trim(coalesce(value,''))),'[^A-Z0-9]+','-','g'),'-+','-','g')),'');
$$;

create or replace function public.phase3_product_identity_trigger() returns trigger
language plpgsql set search_path='' as $$
declare brand_name text;
begin
  if new.brand_id is not null then select name into brand_name from public.brands where id=new.brand_id; end if;
  new.normalized_brand_key := public.phase3_normalize_identifier(brand_name);
  new.normalized_model_number := public.phase3_normalize_identifier(new.model_number);
  if new.status <> 'archived' and new.normalized_brand_key is not null and new.normalized_model_number is not null
     and exists(select 1 from public.products p where p.id <> new.id and p.status <> 'archived'
       and p.normalized_brand_key=new.normalized_brand_key and p.normalized_model_number=new.normalized_model_number) then
    raise exception 'This active brand and model already exists';
  end if;
  return new;
end $$;
drop trigger if exists phase3_product_identity on public.products;
create trigger phase3_product_identity before insert or update of brand_id,model_number,status
  on public.products for each row execute function public.phase3_product_identity_trigger();

update public.products p set
  normalized_brand_key=public.phase3_normalize_identifier(b.name),
  normalized_model_number=public.phase3_normalize_identifier(p.model_number)
from public.brands b where b.id=p.brand_id;

create or replace function public.phase3_receive_serialized_stock(
  actor_profile_id uuid, requested_product_id uuid, requested_variation_id uuid,
  requested_warehouse_id uuid, requested_quantity integer, requested_condition text,
  requested_reason_id uuid, requested_notes text, requested_manufacturer_serials text[] default '{}'
) returns uuid language plpgsql security definer set search_path='' as $$
declare batch_id uuid; movement_id uuid:=gen_random_uuid(); actor_role public.account_role;
  balance_row public.inventory_balances%rowtype; serial_row record; manufacturer text; normalized text; i integer;
begin
  if requested_quantity < 1 or requested_quantity > 200 then raise exception 'Quantity must be between 1 and 200'; end if;
  if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key in('inventory.receive','inventory.adjust_stock','serials.generate')) then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.products where id=requested_product_id and serial_tracking_required and status<>'archived') then raise exception 'An active serial-tracked product is required'; end if;
  if not exists(select 1 from public.warehouses where id=requested_warehouse_id and is_active) then raise exception 'Active warehouse required'; end if;
  if requested_variation_id is not null and not exists(select 1 from public.product_variations where id=requested_variation_id and product_id=requested_product_id and status='active') then raise exception 'Invalid variation for product'; end if;
  if coalesce(array_length(requested_manufacturer_serials,1),0)>requested_quantity then raise exception 'Manufacturer serial count exceeds quantity'; end if;
  for i in 1..requested_quantity loop
    manufacturer:=nullif(trim(coalesce(requested_manufacturer_serials[i],'')),''); normalized:=public.normalize_manufacturer_serial(manufacturer);
    if normalized is not null and exists(select 1 from public.serial_numbers where manufacturer_serial_normalized=normalized) then raise exception 'Manufacturer serial already exists: %',manufacturer; end if;
  end loop;
  batch_id:=public.generate_serial_batch(actor_profile_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,requested_condition,requested_notes,requested_manufacturer_serials);
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.inventory_balances(warehouse_id,product_id,variation_id) values(requested_warehouse_id,requested_product_id,requested_variation_id) on conflict do nothing;
  select * into balance_row from public.inventory_balances where warehouse_id=requested_warehouse_id and product_id=requested_product_id and variation_id is not distinct from requested_variation_id and location_id is null for update;
  insert into public.inventory_movements(id,reference,movement_type,status,destination_warehouse_id,reason_id,notes,initiated_by,confirmed_at)
    values(movement_id,'RCV-'||upper(substr(replace(movement_id::text,'-',''),1,12)),'purchase_receipt','confirmed',requested_warehouse_id,requested_reason_id,left(requested_notes,1000),actor_profile_id,now());
  update public.inventory_balances set on_hand=on_hand+requested_quantity,updated_at=now() where id=balance_row.id;
  insert into public.inventory_movement_items(movement_id,product_id,variation_id,warehouse_id,quantity_delta,balance_after)
    values(movement_id,requested_product_id,requested_variation_id,requested_warehouse_id,requested_quantity,balance_row.on_hand+requested_quantity);
  for serial_row in select * from public.serial_numbers where generation_batch_id=batch_id for update loop
    update public.serial_numbers set status='available',received_at=now(),received_by=actor_profile_id,last_movement_id=movement_id,updated_at=now() where id=serial_row.id;
    insert into public.serial_number_history(serial_number_id,event_type,previous_status,new_status,new_warehouse_id,movement_id,reason,actor_id)
      values(serial_row.id,'received','expected','available',requested_warehouse_id,movement_id,left(requested_notes,1000),actor_profile_id);
    perform public.capture_serial_event(serial_row.id,movement_id,null,'serial.received',actor_profile_id,requested_notes);
  end loop;
  update public.serial_generation_batches set status='received' where id=batch_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_role,'inventory.serialized_stock_added','inventory','serial_generation_batch',batch_id::text,'Serialized stock received atomically.',jsonb_build_object('product_id',requested_product_id,'warehouse_id',requested_warehouse_id,'quantity',requested_quantity,'movement_id',movement_id));
  return batch_id;
end $$;

create or replace function public.phase3_manage_location_session(actor_profile_id uuid, requested_shipment_id uuid, requested_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare session_row public.delivery_location_sessions%rowtype; actor_role public.account_role; shipment_status text;
begin
  select role into actor_role from public.profiles where id=actor_profile_id and status='active';
  if actor_role is null or (actor_role<>'admin' and not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key='shipments.share_location')) then raise exception 'Permission denied'; end if;
  select status into shipment_status from public.shipments where id=requested_shipment_id;
  if shipment_status is null or shipment_status in('delivered','cancelled') then raise exception 'Shipment is not eligible for location sharing'; end if;
  select * into session_row from public.delivery_location_sessions where shipment_id=requested_shipment_id and status in('active','paused') order by created_at desc limit 1 for update;
  if requested_action='start' then
    if session_row.id is null then insert into public.delivery_location_sessions(shipment_id,actor_profile_id) values(requested_shipment_id,actor_profile_id) returning * into session_row;
    else update public.delivery_location_sessions set status='active',paused_at=null,updated_at=now() where id=session_row.id returning * into session_row; end if;
  elsif requested_action='pause' and session_row.id is not null then update public.delivery_location_sessions set status='paused',paused_at=now(),updated_at=now() where id=session_row.id returning * into session_row;
  elsif requested_action='stop' and session_row.id is not null then update public.delivery_location_sessions set status='stopped',ended_at=now(),updated_at=now() where id=session_row.id returning * into session_row;
  else raise exception 'Invalid location session action'; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,actor_role,'delivery.location_session_'||requested_action,'shipments','delivery_location_session',session_row.id::text,'Delivery location session updated.',jsonb_build_object('shipment_id',requested_shipment_id,'status',session_row.status));
  return session_row.id;
end $$;

create or replace function public.phase3_record_location(actor_profile_id uuid, requested_session_id uuid, requested_latitude numeric, requested_longitude numeric, requested_accuracy numeric, requested_heading numeric, requested_speed numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare session_row public.delivery_location_sessions%rowtype; update_id uuid:=gen_random_uuid();
begin
  select * into session_row from public.delivery_location_sessions where id=requested_session_id and actor_profile_id=actor_profile_id and status='active' for update;
  if session_row.id is null then raise exception 'Active location session required'; end if;
  if exists(select 1 from public.delivery_location_updates where session_id=requested_session_id and recorded_at > now()-interval '55 seconds') then return null; end if;
  insert into public.delivery_location_updates(id,session_id,shipment_id,actor_profile_id,latitude,longitude,accuracy,heading,speed)
    values(update_id,session_row.id,session_row.shipment_id,actor_profile_id,requested_latitude,requested_longitude,requested_accuracy,requested_heading,requested_speed);
  update public.delivery_location_sessions set last_update_at=now(),updated_at=now() where id=session_row.id;
  update public.shipments set latest_location_snapshot=jsonb_build_object('latitude',requested_latitude,'longitude',requested_longitude,'accuracy',requested_accuracy,'recorded_at',now(),'source','employee_shared_location'),updated_at=now() where id=session_row.shipment_id;
  return update_id;
end $$;

with required(module_key,key,name,action,sensitive,sort_order) as(values
('products','products.manage_identifiers','Manage product identifiers','manage_identifiers',true,75),
('inventory','inventory.receive','Receive inventory','receive',true,75),
('serials','serials.scan','Scan serials','scan',false,95),
('shipments','shipments.share_location','Share shipment location','share_location',true,90))
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,r.key,r.name,r.name,r.action,r.sensitive,r.sort_order from required r join public.app_modules m on m.key=r.module_key
on conflict(key) do update set name=excluded.name,description=excluded.description,action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order;

alter table public.product_identifier_history enable row level security;
alter table public.delivery_location_sessions enable row level security;
alter table public.delivery_location_updates enable row level security;
create policy "authorized staff read identifier history" on public.product_identifier_history for select to authenticated using(public.current_user_has_permission('products.view'));
create policy "staff read delivery sessions" on public.delivery_location_sessions for select to authenticated using(public.current_user_has_permission('shipments.view') or actor_profile_id=auth.uid());
create policy "staff read location updates" on public.delivery_location_updates for select to authenticated using(public.current_user_has_permission('shipments.view') or actor_profile_id=auth.uid());
create policy "customers read own visible location updates" on public.delivery_location_updates for select to authenticated using(customer_visible and exists(select 1 from public.shipments s join public.sales_orders o on o.id=s.order_id where s.id=shipment_id and o.customer_profile_id=auth.uid()));

revoke all on function public.phase3_receive_serialized_stock(uuid,uuid,uuid,uuid,integer,text,uuid,text,text[]) from public,anon,authenticated;
revoke all on function public.phase3_manage_location_session(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.phase3_record_location(uuid,uuid,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.phase3_receive_serialized_stock(uuid,uuid,uuid,uuid,integer,text,uuid,text,text[]) to service_role;
grant execute on function public.phase3_manage_location_session(uuid,uuid,text) to service_role;
grant execute on function public.phase3_record_location(uuid,uuid,numeric,numeric,numeric,numeric,numeric) to service_role;
grant select on public.product_identifier_history,public.delivery_location_sessions,public.delivery_location_updates to authenticated,service_role;
grant all on public.product_identifier_history,public.delivery_location_sessions,public.delivery_location_updates to service_role;
