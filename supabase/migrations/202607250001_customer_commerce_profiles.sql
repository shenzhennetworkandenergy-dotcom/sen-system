-- SEN customer commerce, profile media, archive metadata, quotations, support and pluggable payments.
-- Additive migration: existing Phase 3A/3B, inventory, orders and sales behaviour is preserved.

alter table public.profiles add column if not exists avatar_kind text not null default 'emoji'
  check (avatar_kind in ('emoji','upload'));
alter table public.profiles add column if not exists avatar_emoji text not null default '🙂';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists archived_at timestamptz;
alter table public.profiles add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists archive_reason text;

alter table public.products add column if not exists archived_at timestamptz;
alter table public.products add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.products add column if not exists archive_reason text;

create table if not exists public.shopping_carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','converted','abandoned')),
  currency char(3) not null default 'BDT',
  converted_order_id uuid references public.sales_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shopping_carts_one_active_idx on public.shopping_carts(profile_id) where status='active';

create table if not exists public.shopping_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shopping_carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, variation_id)
);

create table if not exists public.quotation_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','reviewing','quoted','accepted','declined','closed')),
  subject text not null,
  message text,
  company_name text,
  required_by date,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotation_requests_profile_idx on public.quotation_requests(profile_id,created_at desc);

create table if not exists public.quotation_request_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotation_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text,
  quantity numeric(18,4) not null default 1 check (quantity > 0),
  target_price numeric(18,4) check (target_price is null or target_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  subject text not null,
  status text not null default 'open' check (status in ('open','waiting_customer','waiting_sen','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_conversations_profile_idx on public.support_conversations(profile_id,last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete restrict,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id) on delete cascade,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  adapter text not null check (adapter in ('uddoktapay','eps','manual')),
  enabled boolean not null default false,
  test_mode boolean not null default true,
  display_order integer not null default 0,
  public_config jsonb not null default '{}'::jsonb,
  secret_env_prefix text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  gateway_id uuid not null references public.payment_gateways(id) on delete restrict,
  gateway_transaction_id text,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled','refunded')),
  amount numeric(18,4) not null check (amount > 0),
  currency char(3) not null default 'BDT',
  checkout_url text,
  safe_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_order_idx on public.payment_transactions(order_id,created_at desc);

insert into public.payment_gateways(code,name,adapter,enabled,test_mode,display_order,secret_env_prefix,public_config)
values
 ('uddoktapay','UddoktaPay','uddoktapay',false,true,10,'UDDOKTAPAY','{"description":"Mobile banking and local payment checkout"}'),
 ('eps','EPS','eps',false,true,20,'EPS','{"description":"EPS Bangladesh payment checkout"}'),
 ('cash_on_delivery','Cash on delivery','manual',true,false,30,'MANUAL','{"description":"Pay when the order is delivered"}')
on conflict(code) do update set name=excluded.name,adapter=excluded.adapter,secret_env_prefix=excluded.secret_env_prefix;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('profile-avatars','profile-avatars',false,2097152,array['image/jpeg','image/png','image/webp']),
 ('support-attachments','support-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ declare t text; begin
  foreach t in array array['shopping_carts','shopping_cart_items','quotation_requests','quotation_request_items','support_conversations','support_messages','support_attachments','payment_gateways','payment_transactions']
  loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy "customers read own carts" on public.shopping_carts for select to authenticated using(profile_id=auth.uid());
create policy "customers read own cart items" on public.shopping_cart_items for select to authenticated using(exists(select 1 from public.shopping_carts c where c.id=cart_id and c.profile_id=auth.uid()));
create policy "customers read own quotations" on public.quotation_requests for select to authenticated using(profile_id=auth.uid());
create policy "customers read own quotation items" on public.quotation_request_items for select to authenticated using(exists(select 1 from public.quotation_requests q where q.id=quotation_id and q.profile_id=auth.uid()));
create policy "customers read own conversations" on public.support_conversations for select to authenticated using(profile_id=auth.uid());
create policy "customers read own messages" on public.support_messages for select to authenticated using(exists(select 1 from public.support_conversations c where c.id=conversation_id and c.profile_id=auth.uid()));
create policy "customers read own attachments" on public.support_attachments for select to authenticated using(exists(select 1 from public.support_messages m join public.support_conversations c on c.id=m.conversation_id where m.id=message_id and c.profile_id=auth.uid()));
create policy "authenticated read enabled gateways" on public.payment_gateways for select to authenticated using(enabled);
create policy "customers read own payment transactions" on public.payment_transactions for select to authenticated using(profile_id=auth.uid());

grant select on public.shopping_carts,public.shopping_cart_items,public.quotation_requests,public.quotation_request_items,public.support_conversations,public.support_messages,public.support_attachments,public.payment_gateways,public.payment_transactions to authenticated;
grant all on public.shopping_carts,public.shopping_cart_items,public.quotation_requests,public.quotation_request_items,public.support_conversations,public.support_messages,public.support_attachments,public.payment_gateways,public.payment_transactions to service_role;

create or replace function public.customer_checkout_cart(
  actor_profile_id uuid, requested_address_id uuid, requested_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  cart public.shopping_carts%rowtype; address_snapshot jsonb; order_id uuid:=gen_random_uuid();
  entry record; p public.products%rowtype; warehouse_id uuid; unit numeric; line_total numeric; total numeric:=0;
begin
  if actor_profile_id is distinct from auth.uid() and current_user<>'service_role' then raise exception 'Permission denied'; end if;
  if not exists(select 1 from public.profiles where id=actor_profile_id and status='active' and role in('customer','admin')) then raise exception 'Active customer account required'; end if;
  select * into cart from public.shopping_carts where profile_id=actor_profile_id and status='active' for update;
  if cart.id is null or not exists(select 1 from public.shopping_cart_items where cart_id=cart.id) then raise exception 'Cart is empty'; end if;
  select jsonb_build_object('recipient_name',recipient_name,'phone',phone,'alternate_phone',alternate_phone,'address_line_1',address_line_1,'address_line_2',address_line_2,'area',area,'city',city,'region',region,'postal_code',postal_code,'country_code',country_code,'delivery_instructions',delivery_instructions,'map_label',map_label)
    into address_snapshot from public.customer_addresses where id=requested_address_id and profile_id=actor_profile_id;
  if address_snapshot is null then raise exception 'Choose a saved shipping address'; end if;
  select b.warehouse_id into warehouse_id from public.inventory_balances b join public.shopping_cart_items ci on ci.product_id=b.product_id and ci.cart_id=cart.id where b.available>=ci.quantity order by b.available desc limit 1;
  if warehouse_id is null then select id into warehouse_id from public.warehouses where is_active order by created_at limit 1; end if;
  if warehouse_id is null then raise exception 'No fulfilment warehouse is available'; end if;
  insert into public.sales_orders(id,order_number,customer_profile_id,shipping_address_id,shipping_address_snapshot,fulfillment_warehouse_id,currency,customer_notes,created_by,updated_by)
  values(order_id,public.next_sales_order_number(),actor_profile_id,requested_address_id,address_snapshot,warehouse_id,'BDT',nullif(left(requested_notes,4000),''),actor_profile_id,actor_profile_id);
  for entry in select ci.*,b.available from public.shopping_cart_items ci left join public.inventory_balances b on b.product_id=ci.product_id and b.variation_id is not distinct from ci.variation_id and b.warehouse_id=warehouse_id and b.location_id is null where ci.cart_id=cart.id loop
    select * into p from public.products where id=entry.product_id and status='active' and public_catalogue_visible;
    if p.id is null then raise exception 'A cart product is no longer available'; end if;
    if coalesce(entry.available,0)<entry.quantity and not p.allow_backorders then raise exception 'Insufficient stock for %',p.name; end if;
    unit:=coalesce(p.sale_price,p.regular_price,0); line_total:=round(unit*entry.quantity,4); total:=total+line_total;
    insert into public.sales_order_items(order_id,product_id,variation_id,fulfillment_warehouse_id,quantity,unit_price,line_subtotal,line_total,currency,serial_tracking_required_snapshot,product_name_snapshot,sku_snapshot,model_number_snapshot)
    values(order_id,p.id,entry.variation_id,warehouse_id,entry.quantity,unit,line_total,line_total,'BDT',p.serial_tracking_required,p.name,p.sku,p.model_number);
  end loop;
  update public.sales_orders set subtotal=total,total_amount=total where id=order_id;
  insert into public.order_status_events(order_id,new_status,actor_profile_id,note) values(order_id,'draft',actor_profile_id,'Customer placed order from cart');
  update public.shopping_carts set status='converted',converted_order_id=order_id,updated_at=now() where id=cart.id;
  return order_id;
end $$;
revoke all on function public.customer_checkout_cart(uuid,uuid,text) from public,anon;
grant execute on function public.customer_checkout_cart(uuid,uuid,text) to authenticated,service_role;

update public.app_modules set is_implemented=true,updated_at=now() where key in ('quotations','support');

insert into public.product_categories(name,slug,description,sen_business_category,sort_order)
values
 ('Industrial Automation','industrial-automation','PLC, control and industrial automation equipment.','Energy',20),
 ('Patient Monitoring','patient-monitoring','Clinical patient monitoring and diagnostic equipment.','Medical Equipment',30),
 ('Building Materials','building-materials','Commercial and industrial building materials.','Others',40)
on conflict(slug) do update set name=excluded.name,description=excluded.description,sen_business_category=excluded.sen_business_category,is_active=true;

insert into public.brands(name,slug,description,website_url)
values
 ('Siemens','siemens','Industrial automation and electrification equipment.','https://www.siemens.com/'),
 ('CONTEC','contec-medical','Medical monitoring and diagnostic equipment manufactured in China.','https://www.contecmed.com/'),
 ('SEN Build','sen-build','SEN-sourced commercial building materials.',null)
on conflict(name) do update set description=excluded.description,website_url=excluded.website_url,is_active=true;

with seed(name,slug,sku,model,category,brand,summary,description,price,specs) as (
 values
 ('Siemens SIMATIC S7-1200 CPU 1214C PLC','siemens-simatic-s7-1200-cpu-1214c','SEN-SIEMENS-S7-1214C','CPU 1214C','Energy','Siemens','Compact PLC for industrial machines, factories and process automation.','A widely adopted programmable logic controller for machine automation, digital and analog control, PROFINET communication and expandable I/O.',135000::numeric,'{"controller_family":"SIMATIC S7-1200","communication":"PROFINET","use_case":"Industrial automation","supply":"24 V DC"}'::jsonb),
 ('CONTEC CMS8000 Patient Monitor','contec-cms8000-patient-monitor','SEN-CONTEC-CMS8000','CMS8000','Medical Equipment','CONTEC','Multiparameter bedside patient monitor for hospitals, clinics and emergency care.','China-manufactured multiparameter patient monitor supporting common vital-sign monitoring workflows. Final configuration and clinical accessories must be confirmed before ordering.',185000::numeric,'{"display":"12.1 inch class","parameters":["ECG","SpO2","NIBP","RESP","TEMP"],"use_case":"Bedside patient monitoring","origin":"China"}'::jsonb),
 ('SEN Build PVDF Aluminum Composite Panel 4 mm','sen-build-pvdf-acp-4mm','SEN-BUILD-ACP-PVDF-4MM','ACP-PVDF-4MM','Others','SEN Build','Exterior-grade aluminum composite panel for commercial façades and architectural cladding.','Four-millimetre PVDF-coated aluminum composite panel suitable for commercial façade, signage and architectural cladding projects. Colour, sheet size and fire-rating options are quotation based.',9500::numeric,'{"thickness":"4 mm","coating":"PVDF","application":"Exterior façade and cladding","supply_unit":"Sheet"}'::jsonb)
)
insert into public.products(name,slug,sku,model_number,product_type,status,featured,sen_business_category,brand_id,short_description,description,specifications,regular_price,currency,manage_stock,stock_status,public_catalogue_visible)
select s.name,s.slug,s.sku,s.model,'simple','active',true,s.category,b.id,s.summary,s.description,s.specs,s.price,'BDT',true,'out_of_stock',true
from seed s join public.brands b on b.name=s.brand
on conflict(slug) do update set name=excluded.name,model_number=excluded.model_number,status='active',featured=true,sen_business_category=excluded.sen_business_category,brand_id=excluded.brand_id,short_description=excluded.short_description,description=excluded.description,specifications=excluded.specifications,regular_price=excluded.regular_price,currency='BDT',public_catalogue_visible=true,updated_at=now();

insert into public.product_category_assignments(product_id,category_id,is_primary)
select p.id,c.id,true from public.products p join public.product_categories c on
 (p.slug='siemens-simatic-s7-1200-cpu-1214c' and c.slug='industrial-automation') or
 (p.slug='contec-cms8000-patient-monitor' and c.slug='patient-monitoring') or
 (p.slug='sen-build-pvdf-acp-4mm' and c.slug='building-materials')
on conflict(product_id,category_id) do update set is_primary=true;
