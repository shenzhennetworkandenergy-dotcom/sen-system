-- SEN RMA and warranty claims. Additive and safe for existing Phase 3 data.
alter table public.products add column if not exists warranty_enabled boolean not null default false;
alter table public.products add column if not exists warranty_duration_months integer not null default 12;
alter table public.products add column if not exists warranty_terms text;
alter table public.products add column if not exists warranty_exclusions text;
alter table public.products drop constraint if exists products_warranty_duration_months_check;
alter table public.products add constraint products_warranty_duration_months_check check (warranty_duration_months between 0 and 240);

update public.products
set warranty_enabled = true,
    warranty_terms = coalesce(warranty_terms, warranty_information),
    warranty_duration_months = case when warranty_duration_months = 0 then 12 else warranty_duration_months end
where nullif(trim(warranty_information), '') is not null;

alter table public.sales_order_items add column if not exists warranty_enabled_snapshot boolean not null default false;
alter table public.sales_order_items add column if not exists warranty_duration_months_snapshot integer not null default 0;
alter table public.sales_order_items add column if not exists warranty_terms_snapshot text;
alter table public.sales_order_items add column if not exists warranty_exclusions_snapshot text;

alter table public.serial_numbers add column if not exists service_status text not null default 'normal';
alter table public.serial_numbers add column if not exists active_rma_claim_id uuid;
alter table public.serial_numbers add column if not exists replacement_for_serial_id uuid references public.serial_numbers(id) on delete set null;
alter table public.serial_numbers drop constraint if exists serial_numbers_service_status_check;
alter table public.serial_numbers add constraint serial_numbers_service_status_check check (service_status in ('normal','claim_open','return_requested','received_for_service','under_service','repaired','replaced','retired'));

create sequence if not exists public.warranty_coverage_number_seq start 1;
create sequence if not exists public.rma_claim_number_seq start 1;

create table if not exists public.warranty_coverages (
  id uuid primary key default gen_random_uuid(),
  coverage_number text not null unique default ('WAR-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.warranty_coverage_number_seq')::text,6,'0')),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  covered_quantity integer not null default 1 check (covered_quantity > 0),
  claimed_quantity integer not null default 0 check (claimed_quantity >= 0 and claimed_quantity <= covered_quantity),
  warranty_duration_months integer not null check (warranty_duration_months >= 0),
  warranty_terms text,
  warranty_exclusions text,
  starts_at date not null,
  ends_at date not null,
  status text not null default 'active' check (status in ('active','expired','void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_order_item_id, serial_number_id),
  check (ends_at >= starts_at)
);

create unique index if not exists warranty_coverages_nonserial_item_unique
  on public.warranty_coverages(sales_order_item_id) where serial_number_id is null;
create index if not exists warranty_coverages_customer_idx on public.warranty_coverages(customer_profile_id, status, ends_at);
create index if not exists warranty_coverages_order_idx on public.warranty_coverages(sales_order_id, sales_order_item_id);

create table if not exists public.rma_claims (
  id uuid primary key default gen_random_uuid(),
  rma_number text not null unique default ('RMA-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.rma_claim_number_seq')::text,6,'0')),
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  warranty_coverage_id uuid not null references public.warranty_coverages(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  claim_type text not null check (claim_type in ('warranty','damaged','defective','return')),
  quantity integer not null default 1 check (quantity > 0),
  description text not null check (length(trim(description)) between 10 and 4000),
  status text not null default 'submitted' check (status in ('submitted','under_review','return_requested','product_received','resolution_in_progress','closed')),
  resolution text check (resolution is null or resolution in ('repaired','replaced','refund_approved','credit_issued','claim_rejected','no_fault_found','damaged_beyond_repair_retired')),
  assigned_to uuid references public.profiles(id) on delete set null,
  internal_notes text,
  customer_notes text,
  replacement_serial_number_id uuid references public.serial_numbers(id) on delete set null,
  submitted_at timestamptz not null default now(),
  received_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rma_claims_customer_idx on public.rma_claims(customer_profile_id, created_at desc);
create index if not exists rma_claims_staff_queue_idx on public.rma_claims(status, assigned_to, created_at desc);

create table if not exists public.rma_events (
  id uuid primary key default gen_random_uuid(),
  rma_claim_id uuid not null references public.rma_claims(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  previous_status text,
  new_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rma_events_claim_idx on public.rma_events(rma_claim_id, created_at);

create table if not exists public.rma_attachments (
  id uuid primary key default gen_random_uuid(),
  rma_claim_id uuid not null references public.rma_claims(id) on delete cascade,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.serial_numbers drop constraint if exists serial_numbers_active_rma_claim_id_fkey;
alter table public.serial_numbers add constraint serial_numbers_active_rma_claim_id_fkey foreign key (active_rma_claim_id) references public.rma_claims(id) on delete set null;

insert into public.app_modules(key,name,description,icon_key,sort_order,is_active,is_implemented)
values ('rma','RMA & Warranty','Warranty coverage, returns and resolution workflows.','support',195,true,true)
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  icon_key=excluded.icon_key,
  sort_order=excluded.sort_order,
  is_active=true,
  is_implemented=true;

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order,is_active)
select m.id, p.key, p.name, p.description, p.action, p.sensitive, p.sort_order, true
from public.app_modules m
cross join (values
 ('rma.view','View RMA claims','View warranty coverage and RMA queues.','view',false,10),
 ('rma.create','Create RMA claims','Create a claim for a customer.','create',false,20),
 ('rma.review','Review RMA claims','Review and request returned products.','review',true,30),
 ('rma.assign','Assign RMA claims','Assign claims to employees.','assign',true,40),
 ('rma.receive','Receive RMA products','Confirm returned product receipt.','receive',true,50),
 ('rma.resolve','Resolve RMA claims','Record repair, replacement, refund or rejection.','resolve',true,60),
 ('rma.close','Close RMA claims','Close completed RMA claims.','close',true,70),
 ('rma.manage_attachments','Manage RMA attachments','View and manage claim evidence.','manage_attachments',true,80),
 ('rma.override_warranty','Override warranty eligibility','Override normal eligibility after review.','override_warranty',true,90)
) as p(key,name,description,action,sensitive,sort_order)
where m.key='rma'
on conflict (key) do update set
  name=excluded.name,
  description=excluded.description,
  module_id=excluded.module_id,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('rma-attachments','rma-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.snapshot_sales_item_warranty()
returns trigger language plpgsql security definer set search_path='' as $$
declare p record;
begin
  select warranty_enabled,warranty_duration_months,warranty_terms,warranty_exclusions
  into p from public.products where id=new.product_id;
  if tg_op='INSERT' or new.warranty_duration_months_snapshot is null then
    new.warranty_enabled_snapshot := coalesce(p.warranty_enabled,false);
    new.warranty_duration_months_snapshot := case when coalesce(p.warranty_enabled,false) then coalesce(p.warranty_duration_months,0) else 0 end;
    new.warranty_terms_snapshot := p.warranty_terms;
    new.warranty_exclusions_snapshot := p.warranty_exclusions;
  end if;
  return new;
end $$;
revoke execute on function public.snapshot_sales_item_warranty() from public, anon, authenticated;
drop trigger if exists snapshot_sales_item_warranty_trigger on public.sales_order_items;
create trigger snapshot_sales_item_warranty_trigger before insert on public.sales_order_items for each row execute function public.snapshot_sales_item_warranty();

update public.sales_order_items i set
 warranty_enabled_snapshot=p.warranty_enabled,
 warranty_duration_months_snapshot=case when p.warranty_enabled then p.warranty_duration_months else 0 end,
 warranty_terms_snapshot=p.warranty_terms,
 warranty_exclusions_snapshot=p.warranty_exclusions
from public.products p where p.id=i.product_id and i.warranty_duration_months_snapshot=0;

create or replace function public.refresh_warranty_coverages(requested_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o record; i record; a record; start_date date;
begin
  select id,customer_profile_id,coalesce(delivered_at,updated_at,now())::date as delivered_date into o
  from public.sales_orders where id=requested_order_id;
  if o.id is null then return; end if;
  start_date := o.delivered_date;
  for i in select * from public.sales_order_items where order_id=requested_order_id and warranty_enabled_snapshot=true and delivered_quantity>0 loop
    if i.serial_tracking_required_snapshot then
      for a in select osa.serial_number_id from public.order_serial_allocations osa
               where osa.order_item_id=i.id and osa.status='delivered' loop
        insert into public.warranty_coverages(sales_order_id,sales_order_item_id,customer_profile_id,product_id,variation_id,serial_number_id,covered_quantity,warranty_duration_months,warranty_terms,warranty_exclusions,starts_at,ends_at)
        values (o.id,i.id,o.customer_profile_id,i.product_id,i.variation_id,a.serial_number_id,1,i.warranty_duration_months_snapshot,i.warranty_terms_snapshot,i.warranty_exclusions_snapshot,start_date,(start_date+make_interval(months=>i.warranty_duration_months_snapshot))::date)
        on conflict (sales_order_item_id,serial_number_id) do nothing;
      end loop;
    else
      insert into public.warranty_coverages(sales_order_id,sales_order_item_id,customer_profile_id,product_id,variation_id,covered_quantity,warranty_duration_months,warranty_terms,warranty_exclusions,starts_at,ends_at)
      values (o.id,i.id,o.customer_profile_id,i.product_id,i.variation_id,greatest(1,floor(i.delivered_quantity)::integer),i.warranty_duration_months_snapshot,i.warranty_terms_snapshot,i.warranty_exclusions_snapshot,start_date,(start_date+make_interval(months=>i.warranty_duration_months_snapshot))::date)
      on conflict (sales_order_item_id) where serial_number_id is null do update set covered_quantity=greatest(public.warranty_coverages.covered_quantity,excluded.covered_quantity), ends_at=excluded.ends_at, updated_at=now();
    end if;
  end loop;
end $$;

revoke execute on function public.refresh_warranty_coverages(uuid) from public, anon, authenticated;
grant execute on function public.refresh_warranty_coverages(uuid) to service_role;

create or replace function public.refresh_order_warranty_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.refresh_warranty_coverages(new.id); return new; end $$;
revoke execute on function public.refresh_order_warranty_trigger() from public, anon, authenticated;
drop trigger if exists refresh_order_warranty_trigger on public.sales_orders;
create trigger refresh_order_warranty_trigger after update of status,delivered_at on public.sales_orders for each row when (new.status='delivered') execute function public.refresh_order_warranty_trigger();

create or replace function public.refresh_item_warranty_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.refresh_warranty_coverages(new.order_id); return new; end $$;
revoke execute on function public.refresh_item_warranty_trigger() from public, anon, authenticated;
drop trigger if exists refresh_item_warranty_trigger on public.sales_order_items;
create trigger refresh_item_warranty_trigger after update of delivered_quantity on public.sales_order_items for each row when (new.delivered_quantity>0) execute function public.refresh_item_warranty_trigger();

create or replace function public.refresh_allocation_warranty_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare order_id uuid;
begin
  if new.status='delivered' and old.status is distinct from new.status then
    select i.order_id into order_id from public.sales_order_items i where i.id=new.order_item_id;
    if order_id is not null then perform public.refresh_warranty_coverages(order_id); end if;
  end if;
  return new;
end $$;
revoke execute on function public.refresh_allocation_warranty_trigger() from public, anon, authenticated;
drop trigger if exists refresh_allocation_warranty_trigger on public.order_serial_allocations;
create trigger refresh_allocation_warranty_trigger after update of status on public.order_serial_allocations for each row execute function public.refresh_allocation_warranty_trigger();

create or replace function public.submit_rma_claim(actor_profile_id uuid, requested_coverage_id uuid, requested_claim_type text, requested_quantity integer, requested_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c record; actor record; claim_id uuid;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  select * into c from public.warranty_coverages where id=requested_coverage_id for update;
  if c.id is null then raise exception 'Warranty coverage not found'; end if;
  if actor.role='customer' and c.customer_profile_id<>actor.id then raise exception 'Warranty coverage access denied'; end if;
  if actor.role not in ('customer','admin') then perform public.assert_actor_permission(actor.id,'rma.create'); end if;
  if requested_claim_type not in ('warranty','damaged','defective','return') then raise exception 'Invalid claim type'; end if;
  if requested_quantity<1 or c.claimed_quantity+requested_quantity>c.covered_quantity then raise exception 'Claim quantity exceeds eligible coverage'; end if;
  if length(trim(coalesce(requested_description,'')))<10 then raise exception 'Claim description must be at least 10 characters'; end if;
  if c.status<>'active' or c.ends_at<current_date then raise exception 'Warranty coverage is not active'; end if;
  insert into public.rma_claims(customer_profile_id,warranty_coverage_id,sales_order_id,sales_order_item_id,product_id,variation_id,serial_number_id,claim_type,quantity,description)
  values(c.customer_profile_id,c.id,c.sales_order_id,c.sales_order_item_id,c.product_id,c.variation_id,c.serial_number_id,requested_claim_type,requested_quantity,trim(requested_description)) returning id into claim_id;
  update public.warranty_coverages set claimed_quantity=claimed_quantity+requested_quantity,updated_at=now() where id=c.id;
  if c.serial_number_id is not null then update public.serial_numbers set service_status='claim_open',active_rma_claim_id=claim_id,updated_at=now() where id=c.serial_number_id; end if;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,new_status,note) values(claim_id,actor.id,'claim_submitted','submitted','Warranty claim submitted.');
  insert into public.customer_notifications(profile_id,notification_type,title,message,href,entity_type,entity_id)
  values(c.customer_profile_id,'rma_status','Warranty claim submitted','Your RMA claim has been submitted and is waiting for review.','/account/rma/'||claim_id,'rma_claim',claim_id);
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.claim_submitted','rma','rma_claim',claim_id::text,'Warranty claim submitted.',jsonb_build_object('rma_claim_id',claim_id),jsonb_build_object('status','submitted','claim_type',requested_claim_type,'quantity',requested_quantity));
  return claim_id;
end $$;

create or replace function public.transition_rma_claim(actor_profile_id uuid, requested_claim_id uuid, requested_status text, requested_resolution text default null, requested_note text default null, requested_assigned_to uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare c record; actor record; allowed boolean:=false;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  if actor.role<>'admin' then perform public.assert_actor_permission(actor.id,case when requested_status='closed' then 'rma.close' when requested_status='product_received' then 'rma.receive' when requested_status='resolution_in_progress' then 'rma.resolve' else 'rma.review' end); end if;
  select * into c from public.rma_claims where id=requested_claim_id for update;
  if c.id is null then raise exception 'RMA claim not found'; end if;
  allowed := (c.status='submitted' and requested_status='under_review') or
             (c.status='under_review' and requested_status in ('return_requested','resolution_in_progress','closed')) or
             (c.status='return_requested' and requested_status in ('product_received','closed')) or
             (c.status='product_received' and requested_status in ('resolution_in_progress','closed')) or
             (c.status='resolution_in_progress' and requested_status='closed');
  if not allowed then raise exception 'Invalid RMA status transition'; end if;
  if requested_status='closed' and requested_resolution is null then raise exception 'Resolution is required before closing'; end if;
  update public.rma_claims set status=requested_status,resolution=coalesce(requested_resolution,resolution),assigned_to=coalesce(requested_assigned_to,assigned_to),received_at=case when requested_status='product_received' then now() else received_at end,resolved_at=case when requested_status in ('resolution_in_progress','closed') then now() else resolved_at end,closed_at=case when requested_status='closed' then now() else closed_at end,updated_at=now() where id=c.id;
  if c.serial_number_id is not null then
    update public.serial_numbers set service_status=case requested_status when 'return_requested' then 'return_requested' when 'product_received' then 'received_for_service' when 'resolution_in_progress' then 'under_service' when 'closed' then case requested_resolution when 'repaired' then 'repaired' when 'replaced' then 'replaced' when 'damaged_beyond_repair_retired' then 'retired' else 'normal' end else service_status end,active_rma_claim_id=case when requested_status='closed' then null else c.id end,updated_at=now() where id=c.serial_number_id;
  end if;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,previous_status,new_status,note) values(c.id,actor.id,'status_changed',c.status,requested_status,nullif(trim(coalesce(requested_note,'')),''));
  insert into public.customer_notifications(profile_id,notification_type,title,message,href,entity_type,entity_id)
  values(c.customer_profile_id,'rma_status','Warranty claim updated','Your RMA claim is now '||replace(requested_status,'_',' ')||'.','/account/rma/'||c.id,'rma_claim',c.id);
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,old_values,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.status_changed','rma','rma_claim',c.id::text,'Warranty claim status changed.',jsonb_build_object('rma_claim_id',c.id),jsonb_build_object('status',c.status),jsonb_build_object('status',requested_status,'resolution',requested_resolution,'assigned_to',requested_assigned_to));
  return c.id;
end $$;

create or replace function public.assign_rma_claim(actor_profile_id uuid, requested_claim_id uuid, requested_assigned_to uuid, requested_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare c record; actor record; assignee record;
begin
  select id,role,status into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.status<>'active' then raise exception 'Active profile required'; end if;
  if actor.role<>'admin' then perform public.assert_actor_permission(actor.id,'rma.assign'); end if;
  select * into c from public.rma_claims where id=requested_claim_id for update;
  if c.id is null then raise exception 'RMA claim not found'; end if;
  if requested_assigned_to is not null then
    select id,role,status into assignee from public.profiles where id=requested_assigned_to;
    if assignee.id is null or assignee.status<>'active' or assignee.role not in ('admin','employee') then raise exception 'Choose an active SEN team member'; end if;
  end if;
  update public.rma_claims set assigned_to=requested_assigned_to,updated_at=now() where id=c.id;
  insert into public.rma_events(rma_claim_id,actor_profile_id,event_type,note,metadata)
  values(c.id,actor.id,'assignment_changed',nullif(trim(coalesce(requested_note,'')),''),jsonb_build_object('assigned_to',requested_assigned_to));
  insert into public.audit_logs(actor_id,actor_role,target_profile_id,action,module,entity_type,entity_id,description,metadata,old_values,new_values)
  values(actor.id,actor.role,c.customer_profile_id,'rma.assignment_changed','rma','rma_claim',c.id::text,'RMA assignment changed.',jsonb_build_object('rma_claim_id',c.id),jsonb_build_object('assigned_to',c.assigned_to),jsonb_build_object('assigned_to',requested_assigned_to));
  return c.id;
end $$;

revoke execute on function public.submit_rma_claim(uuid,uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.submit_rma_claim(uuid,uuid,text,integer,text) to service_role;
grant execute on function public.transition_rma_claim(uuid,uuid,text,text,text,uuid) to service_role;
revoke execute on function public.transition_rma_claim(uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.assign_rma_claim(uuid,uuid,uuid,text) to service_role;
revoke execute on function public.assign_rma_claim(uuid,uuid,uuid,text) from public, anon, authenticated;

alter table public.warranty_coverages enable row level security;
alter table public.rma_claims enable row level security;
alter table public.rma_events enable row level security;
alter table public.rma_attachments enable row level security;

drop policy if exists warranty_coverages_customer_read on public.warranty_coverages;
create policy warranty_coverages_customer_read on public.warranty_coverages for select to authenticated using (customer_profile_id=auth.uid() or public.current_user_has_permission('rma.view'));
drop policy if exists rma_claims_customer_read on public.rma_claims;
create policy rma_claims_customer_read on public.rma_claims for select to authenticated using (customer_profile_id=auth.uid() or public.current_user_has_permission('rma.view'));
drop policy if exists rma_events_customer_read on public.rma_events;
create policy rma_events_customer_read on public.rma_events for select to authenticated using (exists(select 1 from public.rma_claims c where c.id=rma_events.rma_claim_id and (c.customer_profile_id=auth.uid() or public.current_user_has_permission('rma.view'))) and (customer_visible or public.current_user_has_permission('rma.view')));
drop policy if exists rma_attachments_customer_read on public.rma_attachments;
create policy rma_attachments_customer_read on public.rma_attachments for select to authenticated using (exists(select 1 from public.rma_claims c where c.id=rma_attachments.rma_claim_id and (c.customer_profile_id=auth.uid() or public.current_user_has_permission('rma.view'))));

do $$ begin
  if exists(select 1 from pg_constraint where conrelid='public.customer_notifications'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%notification_type%') then
    execute (select 'alter table public.customer_notifications drop constraint '||quote_ident(conname) from pg_constraint where conrelid='public.customer_notifications'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%notification_type%' limit 1);
  end if;
end $$;
alter table public.customer_notifications add constraint customer_notifications_notification_type_check check (
  notification_type in (
    'order_status','support_reply','support_new','system',
    'quotation_status','quotation_expiry','quotation_submitted','quotation_staff_new',
    'quotation_assigned','quotation_additional_info_required','quotation_information_required',
    'quotation_approved','quotation_rejected','quotation_expired',
    'quotation_converted_to_invoice','quotation_converted','quotation_updated','quotation_expiring',
    'rma_status','rma_new'
  )
);

select public.refresh_warranty_coverages(id) from public.sales_orders where status='delivered';
