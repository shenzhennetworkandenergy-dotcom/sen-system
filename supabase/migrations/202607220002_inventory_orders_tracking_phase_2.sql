-- SEN Inventory Modernization Phase 2: orders, allocations, shipments and customer tracking.
-- Additive only. Existing stock, products, serial history and tracking catalogues are preserved.

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  alternate_phone text,
  address_line_1 text not null,
  address_line_2 text,
  area text,
  city text not null,
  region text,
  postal_code text,
  country_code text not null,
  delivery_instructions text,
  latitude numeric(9,6) check(latitude between -90 and 90),
  longitude numeric(9,6) check(longitude between -180 and 180),
  map_label text,
  is_default_shipping boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_one_default_shipping_idx on public.customer_addresses(profile_id) where is_default_shipping;
create index customer_addresses_profile_idx on public.customer_addresses(profile_id,updated_at desc);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  shipping_address_snapshot jsonb not null,
  fulfillment_warehouse_id uuid references public.warehouses(id) on delete restrict,
  status text not null default 'draft' check(status in('draft','confirmed','processing','partially_allocated','allocated','packing','partially_shipped','shipped','delivered','cancelled')),
  currency char(3) not null default 'BDT',
  subtotal numeric(18,4) not null default 0 check(subtotal>=0),
  discount_amount numeric(18,4) not null default 0 check(discount_amount>=0),
  shipping_amount numeric(18,4) not null default 0 check(shipping_amount>=0),
  tax_amount numeric(18,4) not null default 0 check(tax_amount>=0),
  total_amount numeric(18,4) not null default 0 check(total_amount>=0),
  internal_notes text,
  customer_notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  delivered_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_orders_customer_idx on public.sales_orders(customer_profile_id,created_at desc);
create index sales_orders_status_idx on public.sales_orders(status,updated_at desc);
create index sales_orders_number_idx on public.sales_orders(order_number);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  fulfillment_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0),
  allocated_quantity numeric(18,4) not null default 0 check(allocated_quantity>=0),
  packed_quantity numeric(18,4) not null default 0 check(packed_quantity>=0),
  shipped_quantity numeric(18,4) not null default 0 check(shipped_quantity>=0),
  delivered_quantity numeric(18,4) not null default 0 check(delivered_quantity>=0),
  unit_price numeric(18,4) not null check(unit_price>=0),
  line_subtotal numeric(18,4) not null check(line_subtotal>=0),
  line_discount numeric(18,4) not null default 0 check(line_discount>=0),
  line_tax numeric(18,4) not null default 0 check(line_tax>=0),
  line_total numeric(18,4) not null check(line_total>=0),
  currency char(3) not null,
  serial_tracking_required_snapshot boolean not null,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  model_number_snapshot text,
  brand_snapshot text,
  variation_snapshot jsonb,
  product_image_path_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(allocated_quantity<=quantity and packed_quantity<=quantity and shipped_quantity<=quantity and delivered_quantity<=quantity),
  check(not serial_tracking_required_snapshot or quantity=trunc(quantity))
);
create index sales_order_items_order_idx on public.sales_order_items(order_id);
create index sales_order_items_product_idx on public.sales_order_items(product_id,variation_id);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  old_status text,
  new_status text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events(order_id,created_at desc);

alter table public.inventory_reservations add column if not exists order_id uuid references public.sales_orders(id) on delete restrict;
alter table public.inventory_reservations add column if not exists order_item_id uuid references public.sales_order_items(id) on delete restrict;
alter table public.inventory_reservations add column if not exists released_at timestamptz;
create unique index inventory_active_order_item_reservation_idx on public.inventory_reservations(order_item_id) where status='active';
create index inventory_reservations_order_idx on public.inventory_reservations(order_id,status);

create table public.order_serial_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status text not null default 'active' check(status in('active','released','packed','shipped','delivered','cancelled')),
  allocation_method text not null default 'manual' check(allocation_method in('manual','scan','auto','replacement')),
  allocated_by uuid not null references public.profiles(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  released_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  release_reason text,
  replaced_allocation_id uuid references public.order_serial_allocations(id) on delete set null,
  packed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index order_serial_one_active_assignment_idx on public.order_serial_allocations(serial_number_id) where status in('active','packed','shipped');
create index order_serial_allocations_item_idx on public.order_serial_allocations(order_item_id,status);
create index order_serial_allocations_order_idx on public.order_serial_allocations(order_id,status);

create table public.order_packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  package_reference text not null,
  status text not null default 'packing' check(status in('packing','complete','assigned','dispatched','cancelled')),
  weight numeric(18,4) check(weight>=0),
  length numeric(18,4) check(length>=0),
  width numeric(18,4) check(width>=0),
  height numeric(18,4) check(height>=0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,package_reference)
);
create table public.order_packed_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.order_packages(id) on delete restrict,
  order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0),
  allocation_id uuid references public.order_serial_allocations(id) on delete restrict,
  packed_by uuid not null references public.profiles(id) on delete restrict,
  packed_at timestamptz not null default now(),
  unique(package_id,allocation_id),
  check(allocation_id is not null or quantity>0)
);
create unique index packed_active_allocation_idx on public.order_packed_items(allocation_id) where allocation_id is not null;

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  status text not null default 'draft' check(status in('draft','confirmed','packing','ready','dispatched','in_transit','arrived','out_for_delivery','delivered','cancelled')),
  transport_mode text not null check(transport_mode in('air','sea','road','local_delivery','customer_pickup','other')),
  origin_work_location_id uuid references public.work_locations(id) on delete set null,
  destination_work_location_id uuid references public.work_locations(id) on delete set null,
  origin_snapshot jsonb not null,
  destination_snapshot jsonb not null,
  estimated_departure_at timestamptz,
  actual_departure_at timestamptz,
  estimated_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  latest_tracking_status_id uuid references public.tracking_status_definitions(id) on delete set null,
  latest_location_snapshot jsonb,
  package_count integer not null default 1 check(package_count>0),
  gross_weight numeric(18,4) check(gross_weight>=0),
  dimensions text,
  external_reference text,
  internal_notes text,
  customer_visible_note text,
  customer_visible boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id,created_at desc);
create index shipments_status_idx on public.shipments(status,updated_at desc);
create index shipments_transport_idx on public.shipments(transport_mode,status);

create table public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0),
  delivered_quantity numeric(18,4) not null default 0 check(delivered_quantity>=0 and delivered_quantity<=quantity),
  created_at timestamptz not null default now(),
  unique(shipment_id,order_item_id)
);
create table public.shipment_serials (
  shipment_item_id uuid not null references public.shipment_items(id) on delete restrict,
  allocation_id uuid not null references public.order_serial_allocations(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(shipment_item_id,allocation_id),
  unique(allocation_id)
);
create table public.shipment_packages (
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  package_id uuid not null references public.order_packages(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(shipment_id,package_id)
);

create table public.shipment_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  tracking_status_id uuid not null references public.tracking_status_definitions(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  workplace_id uuid references public.work_locations(id) on delete set null,
  location_snapshot jsonb not null default '{}'::jsonb,
  latitude numeric(9,6) check(latitude between -90 and 90),
  longitude numeric(9,6) check(longitude between -180 and 180),
  location_source text not null default 'manual' check(location_source in('workplace','warehouse','manual','browser_once','system','estimated')),
  transport_mode_snapshot text,
  internal_note text,
  customer_visible_title text,
  customer_visible_message text,
  event_visibility text not null default 'both' check(event_visibility in('internal','customer','both')),
  correction_reason text,
  supersedes_event_id uuid references public.shipment_tracking_events(id) on delete set null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index shipment_tracking_timeline_idx on public.shipment_tracking_events(shipment_id,occurred_at desc,recorded_at desc);

create table public.shipment_route_points (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  version integer not null default 1 check(version>0),
  point_order integer not null check(point_order>=0),
  label text not null,
  point_type text not null check(point_type in('origin','supplier','warehouse','airport','seaport','customs','hub','destination','recorded','estimated')),
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  is_estimated boolean not null default true,
  customer_visible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(shipment_id,version,point_order)
);

create table public.shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments(id) on delete restrict,
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  order_item_id uuid references public.sales_order_items(id) on delete restrict,
  serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  product_media_id uuid references public.product_media(id) on delete restrict,
  storage_bucket text not null default 'product-media',
  storage_path text not null,
  original_file_name text,
  document_type text not null check(document_type in('warranty_document','purchase_invoice','packing_list','customs_document','freight_document','internal_shipment_document')),
  visibility text not null check(visibility in('customer_order_restricted','internal')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shipment_documents_order_idx on public.shipment_documents(order_id,visibility);

-- Permission catalogue: reuse existing sales/shipments keys and add only missing operational keys.
insert into public.app_modules(key,name,description,icon_key,sort_order,is_implemented)
values('orders','Orders','Staff-created customer orders and fulfilment.','sales',105,true)
on conflict(key) do update set is_implemented=true,description=excluded.description;
update public.app_modules set is_implemented=true where key='shipments';

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order from public.app_modules m cross join (values
 ('orders.view','View orders','View staff-created customer orders.','view',false,10),
 ('orders.create','Create orders','Create draft customer orders.','create',false,20),
 ('orders.edit','Edit orders','Edit eligible draft orders.','edit',false,30),
 ('orders.confirm','Confirm orders','Confirm and reserve order inventory.','confirm',true,40),
 ('orders.allocate','Allocate order serials','Allocate physical serial units.','allocate',true,50),
 ('orders.pack','Pack orders','Scan and complete order packing.','pack',true,60),
 ('orders.cancel','Cancel orders','Cancel eligible orders and release inventory.','cancel',true,70)
) as v(key,name,description,action,sensitive,sort_order) where m.key='orders'
on conflict(key) do update set name=excluded.name,description=excluded.description,is_active=true;

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select m.id,v.key,v.name,v.description,v.action,v.sensitive,v.sort_order from public.app_modules m cross join (values
 ('shipments.assign_serials','Assign shipment serials','Link allocated serials to shipment items.','assign_serials',true,75),
 ('shipments.confirm_dispatch','Confirm shipment dispatch','Validate and dispatch shipments atomically.','confirm_dispatch',true,80),
 ('shipments.confirm_receipt','Confirm shipment receipt','Confirm arrival or delivery.','confirm_receipt',true,90),
 ('shipments.view_internal_tracking','View internal tracking','View internal shipment tracking events.','view_internal_tracking',true,100),
 ('shipments.manage_documents','Manage shipment documents','Link internal and customer-authorized documents.','manage_documents',true,110),
 ('customer_tracking.view','View customer tracking','View customer-safe shipment tracking.','view',false,120),
 ('customer_tracking.manage','Manage customer tracking','Choose customer-visible tracking information.','manage',true,130)
) as v(key,name,description,action,sensitive,sort_order) where m.key='shipments'
on conflict(key) do update set name=excluded.name,description=excluded.description,is_active=true;

-- RLS is enabled on every Phase 2 table.
do $$ declare t text; begin foreach t in array array[
 'customer_addresses','sales_orders','sales_order_items','order_status_events','order_serial_allocations','order_packages','order_packed_items','shipments','shipment_items','shipment_serials','shipment_tracking_events','shipment_route_points','shipment_documents'
] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy "customers manage own addresses" on public.customer_addresses for all to authenticated
using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "staff read customer addresses" on public.customer_addresses for select to authenticated
using(public.current_user_has_permission('orders.view') or public.current_user_has_permission('orders.create'));
create policy "staff read orders" on public.sales_orders for select to authenticated using(public.current_user_has_permission('orders.view') or public.current_user_has_permission('sales.view'));
create policy "customers read own orders" on public.sales_orders for select to authenticated using(customer_profile_id=auth.uid());
create policy "staff read order items" on public.sales_order_items for select to authenticated using(public.current_user_has_permission('orders.view') or public.current_user_has_permission('sales.view'));
create policy "customers read own order items" on public.sales_order_items for select to authenticated using(exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "staff read order events" on public.order_status_events for select to authenticated using(public.current_user_has_permission('orders.view'));
create policy "staff read allocations" on public.order_serial_allocations for select to authenticated using(public.current_user_has_permission('orders.allocate') or public.current_user_has_permission('serials.view'));
create policy "customers read visible allocations" on public.order_serial_allocations for select to authenticated using(status in('packed','shipped','delivered') and exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "staff read packages" on public.order_packages for select to authenticated using(public.current_user_has_permission('orders.pack') or public.current_user_has_permission('shipments.view'));
create policy "staff read packed items" on public.order_packed_items for select to authenticated using(public.current_user_has_permission('orders.pack') or public.current_user_has_permission('shipments.view'));
create policy "staff read shipments" on public.shipments for select to authenticated using(public.current_user_has_permission('shipments.view'));
create policy "customers read own visible shipments" on public.shipments for select to authenticated using(customer_visible and exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "staff read shipment items" on public.shipment_items for select to authenticated using(public.current_user_has_permission('shipments.view'));
create policy "customers read own shipment items" on public.shipment_items for select to authenticated using(exists(select 1 from public.shipments s join public.sales_orders o on o.id=s.order_id where s.id=shipment_id and s.customer_visible and o.customer_profile_id=auth.uid()));
create policy "staff read shipment serials" on public.shipment_serials for select to authenticated using(public.current_user_has_permission('shipments.view'));
create policy "customers read own shipment serials" on public.shipment_serials for select to authenticated using(exists(select 1 from public.shipment_items si join public.shipments s on s.id=si.shipment_id join public.sales_orders o on o.id=s.order_id where si.id=shipment_item_id and s.customer_visible and o.customer_profile_id=auth.uid()));
create policy "staff read tracking events" on public.shipment_tracking_events for select to authenticated using(public.current_user_has_permission('shipments.view'));
create policy "customers read visible tracking events" on public.shipment_tracking_events for select to authenticated using(event_visibility in('customer','both') and exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "staff read route points" on public.shipment_route_points for select to authenticated using(public.current_user_has_permission('shipments.view'));
create policy "customers read visible route points" on public.shipment_route_points for select to authenticated using(customer_visible and exists(select 1 from public.shipments s join public.sales_orders o on o.id=s.order_id where s.id=shipment_id and s.customer_visible and o.customer_profile_id=auth.uid()));
create policy "staff read shipment documents" on public.shipment_documents for select to authenticated using(public.current_user_has_permission('shipments.manage_documents') or public.current_user_has_permission('shipments.view'));
create policy "customers read authorized documents" on public.shipment_documents for select to authenticated using(visibility='customer_order_restricted' and document_type in('warranty_document','purchase_invoice') and exists(select 1 from public.sales_orders o where o.id=order_id and o.customer_profile_id=auth.uid()));
create policy "customers read assigned serials" on public.serial_numbers for select to authenticated using(exists(select 1 from public.order_serial_allocations a join public.sales_orders o on o.id=a.order_id where a.serial_number_id=serial_numbers.id and a.status in('packed','shipped','delivered') and o.customer_profile_id=auth.uid()));

-- Stable number generators. Random suffixes are collision retried and never reused.
create or replace function public.next_sales_order_number() returns text language plpgsql volatile security definer set search_path='' as $$
declare candidate text; attempts integer:=0; begin loop attempts:=attempts+1; candidate:='SEN-ORD-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6); exit when not exists(select 1 from public.sales_orders where order_number=candidate); if attempts>=20 then raise exception 'Unable to generate order number'; end if; end loop; return candidate; end $$;
create or replace function public.next_shipment_number() returns text language plpgsql volatile security definer set search_path='' as $$
declare candidate text; attempts integer:=0; begin loop attempts:=attempts+1; candidate:='SEN-SHP-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6); exit when not exists(select 1 from public.shipments where shipment_number=candidate); if attempts>=20 then raise exception 'Unable to generate shipment number'; end if; end loop; return candidate; end $$;

create or replace function public.assert_actor_permission(actor_profile_id uuid,requested_permission text) returns void language plpgsql stable security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then raise exception 'Inactive actor'; end if; if not exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) e where e.permission_key=requested_permission) then raise exception 'Permission denied'; end if; end $$;

create or replace function public.derive_sales_order_status(requested_order_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare o public.sales_orders%rowtype; total_qty numeric; allocated_qty numeric; packed_qty numeric; shipped_qty numeric; delivered_qty numeric; derived text; begin
 select * into o from public.sales_orders where id=requested_order_id for update; if o.id is null then raise exception 'Order not found'; end if;
 if o.status='cancelled' then return 'cancelled'; end if;
 select coalesce(sum(quantity),0),coalesce(sum(allocated_quantity),0),coalesce(sum(packed_quantity),0),coalesce(sum(shipped_quantity),0),coalesce(sum(delivered_quantity),0) into total_qty,allocated_qty,packed_qty,shipped_qty,delivered_qty from public.sales_order_items where order_id=requested_order_id;
 derived:=case when total_qty>0 and delivered_qty>=total_qty then 'delivered' when shipped_qty>=total_qty then 'shipped' when shipped_qty>0 then 'partially_shipped' when packed_qty>0 then 'packing' when allocated_qty>=total_qty then 'allocated' when allocated_qty>0 then 'partially_allocated' when o.confirmed_at is not null then 'confirmed' else 'draft' end;
 update public.sales_orders set status=derived,delivered_at=case when derived='delivered' then coalesce(delivered_at,now()) else delivered_at end,updated_at=now() where id=requested_order_id;
 return derived;
end $$;

create or replace function public.create_sales_order(actor_profile_id uuid,requested_customer_id uuid,requested_address_id uuid,requested_address jsonb,requested_warehouse_id uuid,requested_currency text,requested_discount numeric,requested_shipping numeric,requested_tax numeric,requested_internal_notes text,requested_customer_notes text,requested_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare order_id uuid:=gen_random_uuid(); address_snapshot jsonb; entry jsonb; p public.products%rowtype; v public.product_variations%rowtype; brand_name text; image_path text; qty numeric; unit numeric; line_discount numeric; line_tax numeric; line_subtotal numeric; line_total numeric; subtotal_total numeric:=0; total_total numeric:=0; currency_code text:=upper(coalesce(requested_currency,'BDT')); item_warehouse uuid; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.create');
 if not exists(select 1 from public.profiles where id=requested_customer_id and role='customer' and status='active') then raise exception 'Active customer required'; end if;
 if length(currency_code)<>3 then raise exception 'Invalid currency'; end if;
 if requested_address_id is not null then select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'alternate_phone',alternate_phone,'address_line_1',address_line_1,'address_line_2',address_line_2,'area',area,'city',city,'region',region,'postal_code',postal_code,'country_code',country_code,'delivery_instructions',delivery_instructions,'latitude',latitude,'longitude',longitude,'map_label',map_label) into address_snapshot from public.customer_addresses where id=requested_address_id and profile_id=requested_customer_id; end if;
 address_snapshot:=coalesce(address_snapshot,requested_address); if address_snapshot is null or coalesce(address_snapshot->>'recipient_name','')='' or coalesce(address_snapshot->>'address_line_1','')='' then raise exception 'Shipping address required'; end if;
 if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items)=0 then raise exception 'At least one order item is required'; end if;
 insert into public.sales_orders(id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,fulfillment_warehouse_id,currency,discount_amount,shipping_amount,tax_amount,internal_notes,customer_notes,created_by,updated_by) values(order_id,public.next_sales_order_number(),requested_customer_id,requested_address_id,address_snapshot,requested_warehouse_id,currency_code,greatest(coalesce(requested_discount,0),0),greatest(coalesce(requested_shipping,0),0),greatest(coalesce(requested_tax,0),0),nullif(left(requested_internal_notes,4000),''),nullif(left(requested_customer_notes,4000),''),actor_profile_id,actor_profile_id);
 for entry in select * from jsonb_array_elements(requested_items) loop
   select * into p from public.products where id=(entry->>'product_id')::uuid and status<>'archived'; if p.id is null then raise exception 'Product not found'; end if;
   item_warehouse:=coalesce((entry->>'warehouse_id')::uuid,requested_warehouse_id,p.default_warehouse_id); if item_warehouse is null or not exists(select 1 from public.warehouses where id=item_warehouse and is_active) then raise exception 'Active warehouse required'; end if;
   qty:=(entry->>'quantity')::numeric; if qty<=0 or (p.serial_tracking_required and qty<>trunc(qty)) then raise exception 'Invalid quantity'; end if;
   if nullif(entry->>'variation_id','') is not null then select * into v from public.product_variations where id=(entry->>'variation_id')::uuid and product_id=p.id and status='active'; if v.id is null then raise exception 'Invalid variation'; end if; else v:=null; end if;
   unit:=coalesce((entry->>'unit_price')::numeric,v.sale_price,v.regular_price,p.sale_price,p.regular_price,0); if unit<0 then raise exception 'Invalid unit price'; end if;
   line_discount:=greatest(coalesce((entry->>'line_discount')::numeric,0),0); line_tax:=greatest(coalesce((entry->>'line_tax')::numeric,0),0); line_subtotal:=round(qty*unit,4); line_total:=greatest(line_subtotal-line_discount+line_tax,0);
   select b.name into brand_name from public.brands b where b.id=p.brand_id; select pm.storage_path into image_path from public.product_media pm where pm.product_id=p.id and pm.is_primary order by pm.sort_order limit 1;
   insert into public.sales_order_items(order_id,product_id,variation_id,fulfillment_warehouse_id,quantity,unit_price,line_subtotal,line_discount,line_tax,line_total,currency,serial_tracking_required_snapshot,product_name_snapshot,sku_snapshot,model_number_snapshot,brand_snapshot,variation_snapshot,product_image_path_snapshot) values(order_id,p.id,v.id,item_warehouse,qty,unit,line_subtotal,line_discount,line_tax,line_total,currency_code,p.serial_tracking_required,p.name,coalesce(v.sku,p.sku),p.model_number,brand_name,case when v.id is null then null else jsonb_build_object('id',v.id,'sku',v.sku,'combination_key',v.combination_key) end,image_path);
   subtotal_total:=subtotal_total+line_subtotal; total_total:=total_total+line_total;
 end loop;
 update public.sales_orders set subtotal=subtotal_total,total_amount=greatest(total_total-coalesce(requested_discount,0)+coalesce(requested_shipping,0)+coalesce(requested_tax,0),0) where id=order_id;
 insert into public.order_status_events(order_id,new_status,actor_profile_id,note) values(order_id,'draft',actor_profile_id,'Order created');
 return order_id;
end $$;

create or replace function public.confirm_sales_order(actor_profile_id uuid,requested_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.sales_orders%rowtype; item public.sales_order_items%rowtype; b public.inventory_balances%rowtype; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.confirm'); select * into o from public.sales_orders where id=requested_order_id for update; if o.status<>'draft' then raise exception 'Only draft orders can be confirmed'; end if;
 for item in select * from public.sales_order_items where order_id=requested_order_id order by id loop
   select * into b from public.inventory_balances where warehouse_id=item.fulfillment_warehouse_id and product_id=item.product_id and variation_id is not distinct from item.variation_id and location_id is null for update;
   if b.id is null or b.available<item.quantity then raise exception 'Insufficient available inventory for %',item.product_name_snapshot; end if;
   update public.inventory_balances set reserved=reserved+item.quantity,updated_at=now() where id=b.id;
   insert into public.inventory_reservations(product_id,variation_id,warehouse_id,quantity,status,reference,created_by,order_id,order_item_id) values(item.product_id,item.variation_id,item.fulfillment_warehouse_id,item.quantity,'active',o.order_number,actor_profile_id,o.id,item.id);
 end loop;
 update public.sales_orders set status='confirmed',confirmed_at=now(),updated_by=actor_profile_id,updated_at=now() where id=o.id;
 insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note) values(o.id,'draft','confirmed',actor_profile_id,'Order confirmed and inventory reserved');
end $$;

create or replace function public.cancel_sales_order(actor_profile_id uuid,requested_order_id uuid,requested_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.sales_orders%rowtype; r public.inventory_reservations%rowtype; a public.order_serial_allocations%rowtype; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.cancel'); select * into o from public.sales_orders where id=requested_order_id for update; if o.status in('shipped','partially_shipped','delivered','cancelled') then raise exception 'Dispatched or cancelled orders cannot be cancelled'; end if;
 for r in select * from public.inventory_reservations where order_id=o.id and status='active' for update loop update public.inventory_balances set reserved=greatest(reserved-r.quantity,0),updated_at=now() where warehouse_id=r.warehouse_id and product_id=r.product_id and variation_id is not distinct from r.variation_id and location_id is null; update public.inventory_reservations set status='cancelled',released_at=now(),updated_at=now() where id=r.id; end loop;
 for a in select * from public.order_serial_allocations where order_id=o.id and status in('active','packed') for update loop update public.serial_numbers set status='available',updated_at=now() where id=a.serial_number_id and status in('allocated','packed','reserved'); update public.order_serial_allocations set status='cancelled',released_by=actor_profile_id,released_at=now(),release_reason=left(requested_reason,500) where id=a.id; end loop;
 update public.sales_orders set status='cancelled',cancelled_at=now(),updated_by=actor_profile_id,updated_at=now() where id=o.id; insert into public.order_status_events(order_id,old_status,new_status,actor_profile_id,note) values(o.id,o.status,'cancelled',actor_profile_id,left(requested_reason,1000));
end $$;

create or replace function public.allocate_order_serials(actor_profile_id uuid,requested_order_item_id uuid,requested_serial_ids uuid[],requested_method text default 'manual') returns integer language plpgsql security definer set search_path='' as $$
declare item public.sales_order_items%rowtype; o public.sales_orders%rowtype; serial_id uuid; s public.serial_numbers%rowtype; remaining integer; added integer:=0; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.allocate'); select * into item from public.sales_order_items where id=requested_order_item_id for update; select * into o from public.sales_orders where id=item.order_id for update; if not item.serial_tracking_required_snapshot then raise exception 'Item does not require serial allocation'; end if; if o.status in('draft','cancelled','shipped','delivered') then raise exception 'Order is not eligible for allocation'; end if;
 remaining:=(item.quantity-item.allocated_quantity)::integer; if coalesce(array_length(requested_serial_ids,1),0)=0 or array_length(requested_serial_ids,1)>remaining then raise exception 'Select no more than the remaining serial quantity'; end if;
 foreach serial_id in array requested_serial_ids loop
   select * into s from public.serial_numbers where id=serial_id for update; if s.id is null or s.product_id<>item.product_id or s.variation_id is distinct from item.variation_id or s.warehouse_id<>item.fulfillment_warehouse_id or s.status<>'available' or lower(s.condition) in('damaged','lost','disposed','quarantined') then raise exception 'Serial is not eligible for this order item'; end if;
   insert into public.order_serial_allocations(order_id,order_item_id,serial_number_id,warehouse_id,allocation_method,allocated_by) values(item.order_id,item.id,s.id,s.warehouse_id,requested_method,actor_profile_id);
   update public.serial_numbers set status='allocated',updated_at=now() where id=s.id; added:=added+1;
 end loop;
 update public.sales_order_items set allocated_quantity=allocated_quantity+added,updated_at=now() where id=item.id; perform public.derive_sales_order_status(item.order_id); return added;
end $$;

create or replace function public.auto_allocate_order_serials(actor_profile_id uuid,requested_order_item_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare item public.sales_order_items%rowtype; ids uuid[]; needed integer; begin select * into item from public.sales_order_items where id=requested_order_item_id; if item.id is null then raise exception 'Order item not found'; end if; needed:=(item.quantity-item.allocated_quantity)::integer; if needed<=0 then return 0; end if; select array_agg(id order by coalesce(received_at,created_at),created_at) into ids from (select id,received_at,created_at from public.serial_numbers where product_id=item.product_id and variation_id is not distinct from item.variation_id and warehouse_id=item.fulfillment_warehouse_id and status='available' and lower(condition) not in('damaged','lost','disposed','quarantined') order by coalesce(received_at,created_at),created_at limit needed for update skip locked) eligible; if coalesce(array_length(ids,1),0)<>needed then raise exception 'Not enough eligible serials'; end if; return public.allocate_order_serials(actor_profile_id,requested_order_item_id,ids,'auto'); end $$;

create or replace function public.release_order_serial_allocation(actor_profile_id uuid,requested_allocation_id uuid,requested_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.order_serial_allocations%rowtype; begin perform public.assert_actor_permission(actor_profile_id,'orders.allocate'); select * into a from public.order_serial_allocations where id=requested_allocation_id for update; if a.status<>'active' then raise exception 'Only active allocations can be released'; end if; update public.order_serial_allocations set status='released',released_by=actor_profile_id,released_at=now(),release_reason=left(requested_reason,500) where id=a.id; update public.serial_numbers set status='available',updated_at=now() where id=a.serial_number_id and status='allocated'; update public.sales_order_items set allocated_quantity=greatest(allocated_quantity-1,0),updated_at=now() where id=a.order_item_id; perform public.derive_sales_order_status(a.order_id); end $$;

create or replace function public.save_order_packing(actor_profile_id uuid,requested_order_id uuid,requested_package_reference text,requested_allocation_ids uuid[],requested_nonserialized jsonb,requested_complete boolean,requested_weight numeric,requested_dimensions jsonb,requested_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare created_package_id uuid; selected_allocation_id uuid; a public.order_serial_allocations%rowtype; entry jsonb; item public.sales_order_items%rowtype; qty numeric; begin
 perform public.assert_actor_permission(actor_profile_id,'orders.pack'); if not exists(select 1 from public.sales_orders where id=requested_order_id and status not in('draft','cancelled','shipped','delivered')) then raise exception 'Order is not eligible for packing'; end if;
 insert into public.order_packages(order_id,package_reference,status,weight,length,width,height,notes,created_by) values(requested_order_id,left(requested_package_reference,100),case when requested_complete then 'complete' else 'packing' end,requested_weight,(requested_dimensions->>'length')::numeric,(requested_dimensions->>'width')::numeric,(requested_dimensions->>'height')::numeric,left(requested_notes,1000),actor_profile_id) on conflict(order_id,package_reference) do update set status=excluded.status,weight=excluded.weight,length=excluded.length,width=excluded.width,height=excluded.height,notes=excluded.notes,completed_at=case when excluded.status='complete' then now() else null end,updated_at=now() returning id into created_package_id;
 foreach selected_allocation_id in array coalesce(requested_allocation_ids,'{}') loop select * into a from public.order_serial_allocations where id=selected_allocation_id and order_id=requested_order_id for update; if a.id is null or a.status<>'active' then raise exception 'Only assigned active serials can be packed'; end if; insert into public.order_packed_items(package_id,order_item_id,quantity,allocation_id,packed_by) values(created_package_id,a.order_item_id,1,a.id,actor_profile_id) on conflict(package_id,allocation_id) do nothing; update public.order_serial_allocations set status='packed',packed_at=coalesce(packed_at,now()) where id=a.id; update public.serial_numbers set status='packed',updated_at=now() where id=a.serial_number_id; end loop;
 for entry in select * from jsonb_array_elements(coalesce(requested_nonserialized,'[]'::jsonb)) loop select * into item from public.sales_order_items where id=(entry->>'order_item_id')::uuid and order_id=requested_order_id for update; qty:=(entry->>'quantity')::numeric; if item.id is null or item.serial_tracking_required_snapshot or qty<=0 or item.packed_quantity+qty>item.quantity then raise exception 'Invalid non-serialized packed quantity'; end if; insert into public.order_packed_items(package_id,order_item_id,quantity,packed_by) values(created_package_id,item.id,qty,actor_profile_id); end loop;
 update public.sales_order_items i set packed_quantity=least(i.quantity,(select coalesce(sum(pi.quantity),0) from public.order_packed_items pi join public.order_packages p on p.id=pi.package_id where pi.order_item_id=i.id and p.status<>'cancelled')),updated_at=now() where i.order_id=requested_order_id;
 if requested_complete and exists(select 1 from public.sales_order_items where order_id=requested_order_id and packed_quantity<allocated_quantity and serial_tracking_required_snapshot) then raise exception 'Every assigned serialized unit must be packed'; end if; perform public.derive_sales_order_status(requested_order_id); return created_package_id;
end $$;

create or replace function public.create_order_shipment(actor_profile_id uuid,requested_order_id uuid,requested_transport_mode text,requested_origin_id uuid,requested_destination_id uuid,requested_origin jsonb,requested_destination jsonb,requested_estimated_departure timestamptz,requested_estimated_arrival timestamptz,requested_package_count integer,requested_weight numeric,requested_dimensions text,requested_internal_notes text,requested_customer_note text,requested_items jsonb,requested_route_points jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare shipment_id uuid:=gen_random_uuid(); entry jsonb; point jsonb; item public.sales_order_items%rowtype; qty numeric; shipment_item_id uuid; allocation_ids uuid[]; allocation_id uuid; a public.order_serial_allocations%rowtype; point_index integer:=0; begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.create'); if requested_transport_mode not in('air','sea','road','local_delivery','customer_pickup','other') then raise exception 'Invalid transport mode'; end if; if not exists(select 1 from public.sales_orders where id=requested_order_id and status not in('draft','cancelled','delivered')) then raise exception 'Order is not eligible for shipment'; end if;
 insert into public.shipments(id,shipment_number,order_id,transport_mode,origin_work_location_id,destination_work_location_id,origin_snapshot,destination_snapshot,estimated_departure_at,estimated_arrival_at,package_count,gross_weight,dimensions,internal_notes,customer_visible_note,created_by,updated_by) values(shipment_id,public.next_shipment_number(),requested_order_id,requested_transport_mode,requested_origin_id,requested_destination_id,coalesce(requested_origin,'{}'),coalesce(requested_destination,'{}'),requested_estimated_departure,requested_estimated_arrival,greatest(coalesce(requested_package_count,1),1),requested_weight,left(requested_dimensions,300),left(requested_internal_notes,2000),left(requested_customer_note,2000),actor_profile_id,actor_profile_id);
 for entry in select * from jsonb_array_elements(requested_items) loop select * into item from public.sales_order_items where id=(entry->>'order_item_id')::uuid and order_id=requested_order_id for update; qty:=(entry->>'quantity')::numeric; if item.id is null or qty<=0 or item.shipped_quantity+qty>item.quantity then raise exception 'Shipment quantity exceeds remaining order quantity'; end if; insert into public.shipment_items(shipment_id,order_item_id,quantity) values(shipment_id,item.id,qty) returning id into shipment_item_id; if item.serial_tracking_required_snapshot then allocation_ids:=array(select jsonb_array_elements_text(coalesce(entry->'allocation_ids','[]'))::uuid); if coalesce(array_length(allocation_ids,1),0)<>qty::integer then raise exception 'Exact assigned serial count is required'; end if; foreach allocation_id in array allocation_ids loop select * into a from public.order_serial_allocations where id=allocation_id and order_item_id=item.id and status='packed' for update; if a.id is null then raise exception 'Shipment serial must be assigned and packed'; end if; insert into public.shipment_serials(shipment_item_id,allocation_id,serial_number_id) values(shipment_item_id,a.id,a.serial_number_id); end loop; end if; end loop;
 for point in select * from jsonb_array_elements(coalesce(requested_route_points,'[]')) loop insert into public.shipment_route_points(shipment_id,point_order,label,point_type,latitude,longitude,is_estimated,customer_visible,created_by) values(shipment_id,point_index,left(point->>'label',160),coalesce(point->>'point_type','estimated'),(point->>'latitude')::numeric,(point->>'longitude')::numeric,coalesce((point->>'is_estimated')::boolean,true),coalesce((point->>'customer_visible')::boolean,true),actor_profile_id); point_index:=point_index+1; end loop;
 return shipment_id;
end $$;

create or replace function public.confirm_order_shipment(actor_profile_id uuid,requested_shipment_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform public.assert_actor_permission(actor_profile_id,'shipments.edit'); if not exists(select 1 from public.shipments where id=requested_shipment_id and status='draft') then raise exception 'Only draft shipments can be confirmed'; end if; update public.shipments set status='confirmed',confirmed_at=now(),updated_by=actor_profile_id,updated_at=now() where id=requested_shipment_id; end $$;

create or replace function public.dispatch_order_shipment(actor_profile_id uuid,requested_shipment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.shipments%rowtype; si public.shipment_items%rowtype; oi public.sales_order_items%rowtype; a public.order_serial_allocations%rowtype; serial_count integer; status_id uuid; begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.confirm_dispatch'); select * into s from public.shipments where id=requested_shipment_id for update; if s.status not in('confirmed','ready') then raise exception 'Shipment is not ready for dispatch'; end if;
 for si in select * from public.shipment_items where shipment_id=s.id for update loop select * into oi from public.sales_order_items where id=si.order_item_id for update; if oi.shipped_quantity+si.quantity>oi.quantity then raise exception 'Shipment exceeds remaining order quantity'; end if; if oi.serial_tracking_required_snapshot then select count(*) into serial_count from public.shipment_serials ss join public.order_serial_allocations osa on osa.id=ss.allocation_id where ss.shipment_item_id=si.id and osa.status='packed'; if serial_count<>si.quantity::integer then raise exception 'Assigned and packed serial count must equal shipment quantity'; end if; for a in select osa.* from public.shipment_serials ss join public.order_serial_allocations osa on osa.id=ss.allocation_id where ss.shipment_item_id=si.id for update of osa loop update public.order_serial_allocations set status='shipped',shipped_at=now() where id=a.id; update public.serial_numbers set status='shipped',updated_at=now() where id=a.serial_number_id; end loop; end if; update public.sales_order_items set shipped_quantity=shipped_quantity+si.quantity,updated_at=now() where id=oi.id; update public.inventory_balances set on_hand=on_hand-si.quantity,reserved=greatest(reserved-si.quantity,0),updated_at=now() where warehouse_id=oi.fulfillment_warehouse_id and product_id=oi.product_id and variation_id is not distinct from oi.variation_id and location_id is null; update public.inventory_reservations set status='consumed',updated_at=now() where order_item_id=oi.id and status='active'; end loop;
 select id into status_id from public.tracking_status_definitions where key=case when s.transport_mode='air' then 'departed_china_by_air' when s.transport_mode='sea' then 'departed_china_by_sea' else 'in_transit_to_customer' end and is_active limit 1;
 update public.shipments set status='dispatched',actual_departure_at=now(),dispatched_at=now(),latest_tracking_status_id=status_id,latest_location_snapshot=origin_snapshot,updated_by=actor_profile_id,updated_at=now() where id=s.id;
 if status_id is not null then insert into public.shipment_tracking_events(shipment_id,order_id,tracking_status_id,actor_profile_id,location_snapshot,latitude,longitude,location_source,transport_mode_snapshot,customer_visible_title,customer_visible_message,event_visibility,occurred_at) values(s.id,s.order_id,status_id,actor_profile_id,s.origin_snapshot,(s.origin_snapshot->>'latitude')::numeric,(s.origin_snapshot->>'longitude')::numeric,'system',s.transport_mode,'Shipment dispatched','Your shipment has departed the origin location.','both',now()); end if; perform public.derive_sales_order_status(s.order_id);
end $$;

create or replace function public.add_shipment_tracking_event(actor_profile_id uuid,requested_shipment_id uuid,requested_status_id uuid,requested_workplace_id uuid,requested_location jsonb,requested_location_source text,requested_internal_note text,requested_customer_title text,requested_customer_message text,requested_visibility text,requested_occurred_at timestamptz,requested_correction_reason text default null,requested_supersedes_event_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.shipments%rowtype; workplace public.work_locations%rowtype; snapshot jsonb; event_id uuid:=gen_random_uuid(); begin
 perform public.assert_actor_permission(actor_profile_id,'shipments.update_status'); select * into s from public.shipments where id=requested_shipment_id for update; if s.id is null or s.status in('cancelled','delivered') and requested_supersedes_event_id is null then raise exception 'Shipment is not eligible for tracking update'; end if; if not exists(select 1 from public.tracking_status_definitions where id=requested_status_id and is_active) then raise exception 'Active tracking status required'; end if; if requested_visibility not in('internal','customer','both') then raise exception 'Invalid visibility'; end if;
 if requested_workplace_id is not null then select * into workplace from public.work_locations where id=requested_workplace_id and is_active; end if; snapshot:=coalesce(requested_location,case when workplace.id is null then '{}'::jsonb else jsonb_build_object('name',workplace.name,'address',workplace.address,'city',workplace.city,'country',workplace.country_name,'latitude',workplace.latitude,'longitude',workplace.longitude) end);
 insert into public.shipment_tracking_events(id,shipment_id,order_id,tracking_status_id,actor_profile_id,workplace_id,location_snapshot,latitude,longitude,location_source,transport_mode_snapshot,internal_note,customer_visible_title,customer_visible_message,event_visibility,correction_reason,supersedes_event_id,occurred_at) values(event_id,s.id,s.order_id,requested_status_id,actor_profile_id,requested_workplace_id,snapshot,(snapshot->>'latitude')::numeric,(snapshot->>'longitude')::numeric,coalesce(requested_location_source,case when workplace.id is not null then 'workplace' else 'manual' end),s.transport_mode,left(requested_internal_note,2000),left(requested_customer_title,200),left(requested_customer_message,2000),requested_visibility,left(requested_correction_reason,1000),requested_supersedes_event_id,coalesce(requested_occurred_at,now()));
 update public.shipments set latest_tracking_status_id=requested_status_id,latest_location_snapshot=snapshot,status=case when status='dispatched' then 'in_transit' else status end,updated_by=actor_profile_id,updated_at=now() where id=s.id; return event_id;
end $$;

create or replace function public.mark_shipment_delivered(actor_profile_id uuid,requested_shipment_id uuid,requested_note text) returns void language plpgsql security definer set search_path='' as $$
declare s public.shipments%rowtype; si public.shipment_items%rowtype; status_id uuid; begin perform public.assert_actor_permission(actor_profile_id,'shipments.confirm_receipt'); select * into s from public.shipments where id=requested_shipment_id for update; if s.status not in('dispatched','in_transit','arrived','out_for_delivery') then raise exception 'Shipment is not eligible for delivery'; end if; for si in select * from public.shipment_items where shipment_id=s.id for update loop update public.shipment_items set delivered_quantity=quantity where id=si.id; update public.sales_order_items set delivered_quantity=least(quantity,delivered_quantity+si.quantity),updated_at=now() where id=si.order_item_id; update public.order_serial_allocations set status='delivered',delivered_at=now() where id in(select allocation_id from public.shipment_serials where shipment_item_id=si.id); update public.serial_numbers set status='delivered',updated_at=now() where id in(select serial_number_id from public.shipment_serials where shipment_item_id=si.id); end loop; select id into status_id from public.tracking_status_definitions where key='delivered' and is_active limit 1; update public.shipments set status='delivered',actual_arrival_at=now(),delivered_at=now(),latest_tracking_status_id=status_id,updated_by=actor_profile_id,updated_at=now() where id=s.id; if status_id is not null then insert into public.shipment_tracking_events(shipment_id,order_id,tracking_status_id,actor_profile_id,location_snapshot,location_source,transport_mode_snapshot,customer_visible_title,customer_visible_message,event_visibility,occurred_at) values(s.id,s.order_id,status_id,actor_profile_id,s.destination_snapshot,'system',s.transport_mode,'Delivered',coalesce(nullif(left(requested_note,1000),''),'Your shipment was delivered.'),'both',now()); end if; perform public.derive_sales_order_status(s.order_id); end $$;

-- Mutations are server-only. Authenticated users read through RLS.
do $$ declare t text; begin foreach t in array array['customer_addresses','sales_orders','sales_order_items','order_status_events','order_serial_allocations','order_packages','order_packed_items','shipments','shipment_items','shipment_serials','shipment_tracking_events','shipment_route_points','shipment_documents'] loop execute format('grant select on public.%I to authenticated',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
grant insert,update,delete on public.customer_addresses to authenticated;
revoke all on function public.next_sales_order_number() from public,anon,authenticated;
revoke all on function public.next_shipment_number() from public,anon,authenticated;
revoke all on function public.assert_actor_permission(uuid,text) from public,anon,authenticated;
revoke all on function public.derive_sales_order_status(uuid) from public,anon,authenticated;
revoke all on function public.create_sales_order(uuid,uuid,uuid,jsonb,uuid,text,numeric,numeric,numeric,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_sales_order(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cancel_sales_order(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.allocate_order_serials(uuid,uuid,uuid[],text) from public,anon,authenticated;
revoke all on function public.auto_allocate_order_serials(uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_order_serial_allocation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_order_packing(uuid,uuid,text,uuid[],jsonb,boolean,numeric,jsonb,text) from public,anon,authenticated;
revoke all on function public.create_order_shipment(uuid,uuid,text,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,integer,numeric,text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_order_shipment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dispatch_order_shipment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.add_shipment_tracking_event(uuid,uuid,uuid,uuid,jsonb,text,text,text,text,text,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.mark_shipment_delivered(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_sales_order(uuid,uuid,uuid,jsonb,uuid,text,numeric,numeric,numeric,text,text,jsonb) to service_role;
grant execute on function public.confirm_sales_order(uuid,uuid) to service_role;
grant execute on function public.cancel_sales_order(uuid,uuid,text) to service_role;
grant execute on function public.allocate_order_serials(uuid,uuid,uuid[],text) to service_role;
grant execute on function public.auto_allocate_order_serials(uuid,uuid) to service_role;
grant execute on function public.release_order_serial_allocation(uuid,uuid,text) to service_role;
grant execute on function public.save_order_packing(uuid,uuid,text,uuid[],jsonb,boolean,numeric,jsonb,text) to service_role;
grant execute on function public.create_order_shipment(uuid,uuid,text,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,integer,numeric,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.confirm_order_shipment(uuid,uuid) to service_role;
grant execute on function public.dispatch_order_shipment(uuid,uuid) to service_role;
grant execute on function public.add_shipment_tracking_event(uuid,uuid,uuid,uuid,jsonb,text,text,text,text,text,timestamptz,text,uuid) to service_role;
grant execute on function public.mark_shipment_delivered(uuid,uuid,text) to service_role;

comment on table public.shipment_route_points is 'Versioned recorded or estimated points. Estimated points never represent exact live GPS.';
comment on column public.shipments.latest_location_snapshot is 'Latest recorded location snapshot, not continuous GPS.';
