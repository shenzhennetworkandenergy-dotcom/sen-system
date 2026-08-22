-- Employee Stock Out / Product Release.
-- This migration is additive: existing sales, inventory, serial, shipment, and
-- RMA history remains in place. Physical mutations are added as atomic RPCs in
-- the sections below and direct employee writes remain disabled.

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order
)
select
  module.id,
  'inventory.release_sales_stock',
  'Stock Out / Release Invoiced Products',
  'Release finalized Sales Invoice products from physical warehouse inventory.',
  'release_sales_stock',
  true,
  85
from public.app_modules module
where module.key='inventory'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

alter table public.sale_documents
  add column if not exists finalization_idempotency_key uuid;

create unique index if not exists sale_documents_finalization_idempotency_unique
  on public.sale_documents(finalization_idempotency_key)
  where finalization_idempotency_key is not null;

-- The existing check constraints are widened without rewriting any row.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check check (
    movement_type=any(array[
      'opening_balance','purchase_receipt','manual_adjustment','warehouse_transfer',
      'reservation','reservation_release','sale_allocation','stock_out',
      'customer_return','supplier_return','damage','correction'
    ]::text[])
  );

alter table public.serial_numbers
  drop constraint if exists serial_numbers_status_check;
alter table public.serial_numbers
  add constraint serial_numbers_status_check check (
    status=any(array[
      'expected','in_transit','received','available','reserved','allocated','packed',
      'warehouse_released','shipped','delivered','returned','quarantined','damaged',
      'lost','transferred','disposed','voided','sold','unavailable','removed'
    ]::text[])
  );

alter table public.order_serial_allocations
  drop constraint if exists order_serial_allocations_status_check;
alter table public.order_serial_allocations
  add constraint order_serial_allocations_status_check check (
    status=any(array[
      'active','released','packed','warehouse_released','shipped','delivered','cancelled'
    ]::text[])
  );

-- A serial that has left the warehouse remains exclusively bound to its sale.
-- Replacing the original partial unique index is safe and preserves every row.
drop index if exists public.order_serial_one_active_assignment_idx;
create unique index order_serial_one_active_assignment_idx
  on public.order_serial_allocations(serial_number_id)
  where status in('active','packed','warehouse_released','shipped');

create table if not exists public.sales_stock_out_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  current_invoice_document_id uuid not null references public.sale_documents(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending_release',
  current_revision_number integer not null default 1,
  required_quantity numeric(18,4) not null default 0,
  released_quantity numeric(18,4) not null default 0,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  invoice_revision_pending boolean not null default false,
  version bigint not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  constraint sales_stock_out_requests_number_unique unique(request_number),
  constraint sales_stock_out_requests_sales_order_unique unique(sales_order_id),
  constraint sales_stock_out_requests_status_check check (
    status=any(array['pending_release','partially_released','fully_released','cancelled']::text[])
  ),
  constraint sales_stock_out_requests_revision_check check(current_revision_number>=1),
  constraint sales_stock_out_requests_required_check check(required_quantity>=0),
  constraint sales_stock_out_requests_released_check check(released_quantity>=0),
  constraint sales_stock_out_requests_quantity_check check(required_quantity>=released_quantity),
  constraint sales_stock_out_requests_version_check check(version>=1),
  constraint sales_stock_out_requests_cancelled_check check(
    (status='cancelled' and cancelled_at is not null) or status<>'cancelled'
  )
);

create table if not exists public.sales_stock_out_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  sales_order_item_id uuid not null,
  line_key text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  serial_tracking_required boolean not null default false,
  required_quantity numeric(18,4) not null,
  released_quantity numeric(18,4) not null default 0,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  packed_quantity_snapshot numeric(18,4) not null default 0,
  latest_revision_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_stock_out_request_items_order_item_unique unique(request_id,sales_order_item_id),
  constraint sales_stock_out_request_items_line_unique unique(request_id,line_key),
  constraint sales_stock_out_request_items_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_items_released_check check(released_quantity>=0),
  constraint sales_stock_out_request_items_quantity_check check(required_quantity>=released_quantity),
  constraint sales_stock_out_request_items_packed_check check(packed_quantity_snapshot>=0),
  constraint sales_stock_out_request_items_revision_check check(latest_revision_number>=1)
);

create table if not exists public.sales_stock_out_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  sale_document_id uuid not null references public.sale_documents(id) on delete restrict,
  revision_number integer not null,
  operation_id uuid not null,
  invoice_number_snapshot text not null,
  invoice_snapshot jsonb not null,
  required_quantity numeric(18,4) not null,
  released_quantity_at_revision numeric(18,4) not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sales_stock_out_request_revisions_request_revision_unique unique(request_id,revision_number),
  constraint sales_stock_out_request_revisions_document_unique unique(sale_document_id),
  constraint sales_stock_out_request_revisions_operation_unique unique(operation_id),
  constraint sales_stock_out_request_revisions_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_revisions_released_check check(released_quantity_at_revision>=0),
  constraint sales_stock_out_request_revisions_quantity_check check(required_quantity>=released_quantity_at_revision),
  constraint sales_stock_out_request_revisions_revision_check check(revision_number>=1)
);

create table if not exists public.sales_stock_out_request_revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.sales_stock_out_request_revisions(id) on delete restrict,
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  sales_order_item_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  required_quantity numeric(18,4) not null,
  released_quantity numeric(18,4) not null,
  remaining_quantity numeric(18,4) generated always as (
    greatest(required_quantity-released_quantity,0::numeric)
  ) stored,
  preassigned_serial_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  constraint sales_stock_out_request_revision_items_unique unique(revision_id,request_item_id),
  constraint sales_stock_out_request_revision_items_required_check check(required_quantity>=0),
  constraint sales_stock_out_request_revision_items_released_check check(released_quantity>=0),
  constraint sales_stock_out_request_revision_items_quantity_check check(required_quantity>=released_quantity)
);

create table if not exists public.sales_stock_out_releases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  request_revision_id uuid not null references public.sales_stock_out_request_revisions(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sale_document_id uuid not null references public.sale_documents(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  invoice_number_snapshot text not null,
  quantity_released numeric(18,4) not null,
  status text not null default 'confirmed',
  released_by uuid not null references public.profiles(id) on delete restrict,
  released_by_name text not null,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_stock_out_releases_operation_unique unique(operation_id),
  constraint sales_stock_out_releases_movement_unique unique(movement_id),
  constraint sales_stock_out_releases_quantity_check check(quantity_released>0),
  constraint sales_stock_out_releases_status_check check(status='confirmed')
);

create table if not exists public.sales_stock_out_release_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.sales_stock_out_releases(id) on delete restrict,
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  inventory_movement_item_id uuid not null references public.inventory_movement_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity_released numeric(18,4) not null,
  previous_physical_quantity numeric(18,4) not null,
  new_physical_quantity numeric(18,4) not null,
  previous_reserved_quantity numeric(18,4) not null,
  new_reserved_quantity numeric(18,4) not null,
  created_at timestamptz not null default now(),
  constraint sales_stock_out_release_items_movement_item_unique unique(inventory_movement_item_id),
  constraint sales_stock_out_release_items_request_item_unique unique(release_id,request_item_id),
  constraint sales_stock_out_release_items_quantity_check check(quantity_released>0),
  constraint sales_stock_out_release_items_physical_check check(
    previous_physical_quantity>=0 and new_physical_quantity>=0 and
    previous_physical_quantity-new_physical_quantity=quantity_released
  ),
  constraint sales_stock_out_release_items_reserved_check check(
    previous_reserved_quantity>=0 and new_reserved_quantity>=0 and
    previous_reserved_quantity-new_reserved_quantity=quantity_released
  )
);

create table if not exists public.sales_stock_out_release_serials (
  id uuid primary key default gen_random_uuid(),
  release_item_id uuid not null references public.sales_stock_out_release_items(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  allocation_id uuid references public.order_serial_allocations(id) on delete restrict,
  sen_serial_snapshot text not null,
  manufacturer_serial_snapshot text,
  previous_status text not null,
  new_status text not null default 'warehouse_released',
  created_at timestamptz not null default now(),
  constraint sales_stock_out_release_serials_serial_unique unique(serial_number_id),
  constraint sales_stock_out_release_serials_release_serial_unique unique(release_item_id,serial_number_id),
  constraint sales_stock_out_release_serials_status_check check(new_status='warehouse_released')
);

create table if not exists public.sales_stock_out_serial_changes (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.sales_stock_out_request_items(id) on delete restrict,
  operation_id uuid not null,
  previous_serial_number_id uuid references public.serial_numbers(id) on delete restrict,
  replacement_serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  reason text not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint sales_stock_out_serial_changes_operation_unique unique(operation_id),
  constraint sales_stock_out_serial_changes_different_check check(
    previous_serial_number_id is distinct from replacement_serial_number_id
  ),
  constraint sales_stock_out_serial_changes_reason_check check(length(btrim(reason))>=3)
);

create table if not exists public.rma_return_receipts (
  id uuid primary key default gen_random_uuid(),
  rma_claim_id uuid not null references public.rma_claims(id) on delete restrict,
  stock_out_request_id uuid not null references public.sales_stock_out_requests(id) on delete restrict,
  stock_out_release_id uuid not null references public.sales_stock_out_releases(id) on delete restrict,
  stock_out_release_item_id uuid not null references public.sales_stock_out_release_items(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  operation_id uuid not null,
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  quantity_received numeric(18,4) not null,
  status text not null default 'confirmed',
  received_by uuid not null references public.profiles(id) on delete restrict,
  received_by_name text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rma_return_receipts_operation_unique unique(operation_id),
  constraint rma_return_receipts_movement_unique unique(movement_id),
  constraint rma_return_receipts_quantity_check check(quantity_received>0),
  constraint rma_return_receipts_status_check check(status='confirmed')
);

create table if not exists public.rma_return_receipt_serials (
  id uuid primary key default gen_random_uuid(),
  return_receipt_id uuid not null references public.rma_return_receipts(id) on delete restrict,
  original_release_serial_id uuid not null references public.sales_stock_out_release_serials(id) on delete restrict,
  serial_number_id uuid not null references public.serial_numbers(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now(),
  constraint rma_return_receipt_serials_receipt_unique unique(return_receipt_id,serial_number_id),
  constraint rma_return_receipt_serials_original_unique unique(original_release_serial_id)
);

create index if not exists sales_stock_out_requests_queue_idx
  on public.sales_stock_out_requests(warehouse_id,status,updated_at desc);
create index if not exists sales_stock_out_request_items_request_idx
  on public.sales_stock_out_request_items(request_id,latest_revision_number);
create index if not exists sales_stock_out_request_revisions_request_idx
  on public.sales_stock_out_request_revisions(request_id,revision_number desc);
create index if not exists sales_stock_out_releases_request_idx
  on public.sales_stock_out_releases(request_id,released_at desc);
create index if not exists rma_return_receipts_release_item_idx
  on public.rma_return_receipts(stock_out_release_item_id,received_at desc);

create or replace function public.can_access_stock_out_warehouse(requested_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_current_user_admin() or (
    public.current_user_has_permission('inventory.release_sales_stock') and
    exists(
      select 1
      from public.profiles profile
      where profile.status='active'
        and profile.id=auth.uid()
        and profile.role='employee'
        and exists(
          select 1 from public.profile_warehouse_assignments assignment
          where assignment.profile_id=profile.id
            and assignment.warehouse_id=requested_warehouse_id
            and assignment.is_active
            and assignment.ended_at is null
        )
    )
  )
$$;

create or replace function public.can_receive_rma_at_warehouse(requested_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.is_current_user_admin() or (
    public.current_user_has_permission('rma.receive') and
    exists(
      select 1
      from public.profiles profile
      where profile.status='active'
        and profile.id=auth.uid()
        and profile.role='employee'
        and exists(
          select 1 from public.profile_warehouse_assignments assignment
          where assignment.profile_id=profile.id
            and assignment.warehouse_id=requested_warehouse_id
            and assignment.is_active
            and assignment.ended_at is null
        )
    )
  )
$$;

alter table public.sales_stock_out_requests enable row level security;
alter table public.sales_stock_out_request_items enable row level security;
alter table public.sales_stock_out_request_revisions enable row level security;
alter table public.sales_stock_out_request_revision_items enable row level security;
alter table public.sales_stock_out_releases enable row level security;
alter table public.sales_stock_out_release_items enable row level security;
alter table public.sales_stock_out_release_serials enable row level security;
alter table public.sales_stock_out_serial_changes enable row level security;
alter table public.rma_return_receipts enable row level security;
alter table public.rma_return_receipt_serials enable row level security;

create policy "authorized warehouse reads stock out requests"
  on public.sales_stock_out_requests for select to authenticated
  using(public.can_access_stock_out_warehouse(warehouse_id));

create policy "authorized warehouse reads stock out request items"
  on public.sales_stock_out_request_items for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_requests request
    where request.id=request_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

create policy "authorized warehouse reads stock out revisions"
  on public.sales_stock_out_request_revisions for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_requests request
    where request.id=request_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

create policy "authorized warehouse reads stock out revision items"
  on public.sales_stock_out_request_revision_items for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_request_revisions revision
    join public.sales_stock_out_requests request on request.id=revision.request_id
    where revision.id=revision_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

create policy "authorized warehouse reads stock out releases"
  on public.sales_stock_out_releases for select to authenticated
  using(public.can_access_stock_out_warehouse(warehouse_id));

create policy "authorized warehouse reads stock out release items"
  on public.sales_stock_out_release_items for select to authenticated
  using(exists(
    select 1 from public.sales_stock_out_releases release
    where release.id=release_id
      and public.can_access_stock_out_warehouse(release.warehouse_id)
  ));

create policy "authorized warehouse reads stock out release serials"
  on public.sales_stock_out_release_serials for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_release_items item
    join public.sales_stock_out_releases release on release.id=item.release_id
    where item.id=release_item_id
      and public.can_access_stock_out_warehouse(release.warehouse_id)
  ));

create policy "authorized warehouse reads stock out serial changes"
  on public.sales_stock_out_serial_changes for select to authenticated
  using(exists(
    select 1
    from public.sales_stock_out_request_items item
    join public.sales_stock_out_requests request on request.id=item.request_id
    where item.id=request_item_id
      and public.can_access_stock_out_warehouse(request.warehouse_id)
  ));

create policy "authorized warehouse reads RMA return receipts"
  on public.rma_return_receipts for select to authenticated
  using(public.can_receive_rma_at_warehouse(warehouse_id));

create policy "authorized warehouse reads RMA return receipt serials"
  on public.rma_return_receipt_serials for select to authenticated
  using(exists(
    select 1 from public.rma_return_receipts receipt
    where receipt.id=return_receipt_id
      and public.can_receive_rma_at_warehouse(receipt.warehouse_id)
  ));

revoke all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
from authenticated;
revoke all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
from anon;

grant select on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
to authenticated;

grant all on public.sales_stock_out_requests,
  public.sales_stock_out_request_items,
  public.sales_stock_out_request_revisions,
  public.sales_stock_out_request_revision_items,
  public.sales_stock_out_releases,
  public.sales_stock_out_release_items,
  public.sales_stock_out_release_serials,
  public.sales_stock_out_serial_changes,
  public.rma_return_receipts,
  public.rma_return_receipt_serials
to service_role;

revoke all on function public.can_access_stock_out_warehouse(uuid) from public,anon;
revoke all on function public.can_receive_rma_at_warehouse(uuid) from public,anon;
grant execute on function public.can_access_stock_out_warehouse(uuid) to authenticated,service_role;
grant execute on function public.can_receive_rma_at_warehouse(uuid) to authenticated,service_role;

create or replace function public.mark_stock_out_invoice_revision_pending()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.document_type='invoice'
    and old.status='generated'
    and new.status='superseded'
  then
    update public.sales_stock_out_requests
    set invoice_revision_pending=true,updated_at=now(),version=version+1
    where sales_order_id=old.order_id and status<>'cancelled';
  end if;
  return new;
end $$;

drop trigger if exists sale_documents_mark_stock_out_revision_pending
  on public.sale_documents;
create trigger sale_documents_mark_stock_out_revision_pending
after update of status on public.sale_documents
for each row execute function public.mark_stock_out_invoice_revision_pending();

create or replace function public.finalize_sale_invoice(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  sale public.sales_orders%rowtype;
  sale_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  request_row public.sales_stock_out_requests%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  existing_document_id uuid;
  existing_document_order_id uuid;
  document_id uuid:=gen_random_uuid();
  request_id uuid;
  request_revision_id uuid:=gen_random_uuid();
  invoice_number text;
  document_snapshot jsonb;
  next_revision integer;
  required_quantity numeric:=0;
  released_quantity numeric:=0;
  item_released_quantity numeric;
  desired_reservation numeric;
  current_reservation numeric;
  reservation_delta numeric;
  active_reservation_count integer;
  preassigned_serial_ids uuid[];
  request_status text;
begin
  if requested_operation_id is null then
    raise exception 'A valid invoice finalization operation ID is required';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'sales.create_invoice');

  select document.id,document.order_id
  into existing_document_id,existing_document_order_id
  from public.sale_documents document
  where document.finalization_idempotency_key=requested_operation_id;
  if existing_document_id is not null then
    if existing_document_order_id<>requested_order_id then
      raise exception 'The invoice finalization operation ID belongs to another sale';
    end if;
    return existing_document_id;
  end if;

  select * into sale
  from public.sales_orders
  where id=requested_order_id
  for update;
  if sale.id is null then raise exception 'Sale not found'; end if;
  if sale.confirmed_at is null or sale.status in('draft','cancelled') then
    raise exception 'Sale is not eligible for invoice finalization';
  end if;

  -- Recheck after the order lock so concurrent retries return the first commit.
  select document.id,document.order_id
  into existing_document_id,existing_document_order_id
  from public.sale_documents document
  where document.finalization_idempotency_key=requested_operation_id;
  if existing_document_id is not null then
    if existing_document_order_id<>requested_order_id then
      raise exception 'The invoice finalization operation ID belongs to another sale';
    end if;
    return existing_document_id;
  end if;

  select * into request_row
  from public.sales_stock_out_requests request
  where request.sales_order_id=sale.id
  for update;
  request_id:=request_row.id;

  if not exists(select 1 from public.sales_order_items where order_id=sale.id) then
    raise exception 'A finalized invoice must contain at least one product';
  end if;
  if exists(
    select 1 from public.sales_order_items item
    where item.order_id=sale.id
      and item.fulfillment_warehouse_id is distinct from sale.fulfillment_warehouse_id
  ) then
    raise exception 'All finalized invoice products must use the sale warehouse';
  end if;

  -- Lock, validate, and reconcile every reservation before creating a document.
  for sale_item in
    select * from public.sales_order_items
    where order_id=sale.id
    order by created_at,id
    for update
  loop
    select * into request_item
    from public.sales_stock_out_request_items item
    where item.request_id=request_id
      and item.sales_order_item_id=sale_item.id
    for update;
    item_released_quantity:=coalesce(request_item.released_quantity,0);
    required_quantity:=required_quantity+sale_item.quantity;
    released_quantity:=released_quantity+item_released_quantity;

    if sale_item.quantity<request_item.released_quantity then
      raise exception 'Invoice quantity cannot be lower than % unit(s) already physically released for %',
        request_item.released_quantity,sale_item.product_name_snapshot;
    end if;

    desired_reservation:=sale_item.quantity-item_released_quantity;
    select * into balance
    from public.inventory_balances
    where warehouse_id=sale_item.fulfillment_warehouse_id
      and product_id=sale_item.product_id
      and variation_id is not distinct from sale_item.variation_id
      and location_id is null
    for update;
    if balance.id is null then raise exception 'Inventory balance not found for %',sale_item.product_name_snapshot; end if;

    perform id from public.inventory_reservations
    where order_item_id=sale_item.id and status='active'
    for update;
    select count(*),coalesce(sum(quantity),0)
    into active_reservation_count,current_reservation
    from public.inventory_reservations
    where order_item_id=sale_item.id and status='active';
    if active_reservation_count>1 then
      raise exception 'Multiple active reservations exist for one sale product';
    end if;

    reservation_delta:=desired_reservation-current_reservation;
    if reservation_delta>0 and balance.available<reservation_delta then
      raise exception 'Insufficient eligible available stock to finalize %',sale_item.product_name_snapshot;
    end if;
    if reservation_delta<>0 then
      update public.inventory_balances
      set reserved=reserved+reservation_delta,updated_at=now()
      where id=balance.id;
    end if;

    select * into reservation
    from public.inventory_reservations
    where order_item_id=sale_item.id and status='active'
    limit 1;
    if desired_reservation=0 and reservation.id is not null then
      update public.inventory_reservations
      set status=case when item_released_quantity>0 then 'consumed' else 'released' end,
        released_at=case when item_released_quantity=0 then now() else released_at end,
        updated_at=now()
      where id=reservation.id;
    elsif desired_reservation>0 and reservation.id is not null then
      update public.inventory_reservations
      set quantity=desired_reservation,updated_at=now()
      where id=reservation.id;
    elsif desired_reservation>0 then
      insert into public.inventory_reservations(
        product_id,variation_id,warehouse_id,quantity,status,reference,
        created_by,order_id,order_item_id
      ) values(
        sale_item.product_id,sale_item.variation_id,sale_item.fulfillment_warehouse_id,
        desired_reservation,'active',sale.order_number,actor_profile_id,sale.id,sale_item.id
      );
    end if;
  end loop;

  select coalesce(max(revision_number),0)+1 into next_revision
  from public.sale_documents
  where order_id=sale.id and document_type='invoice';
  invoice_number:='SEN-INV-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6);
  select jsonb_build_object(
    'order',to_jsonb(sale),
    'customer',(select to_jsonb(profile)-'password' from public.profiles profile where profile.id=sale.customer_profile_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at),'[]'::jsonb)
      from public.sales_order_items item where item.order_id=sale.id),
    'serials',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',serial.id,'sen_serial',serial.sen_serial,
      'manufacturer_serial',serial.manufacturer_serial,'product_id',serial.product_id,
      'order_item_id',allocation.order_item_id
    ) order by allocation.allocated_at),'[]'::jsonb)
      from public.order_serial_allocations allocation
      join public.serial_numbers serial on serial.id=allocation.serial_number_id
      where allocation.order_id=sale.id
        and allocation.status not in('released','cancelled')),
    'generated_at',now(),'revision_number',next_revision
  ) into document_snapshot;

  update public.sale_documents
  set status='superseded',superseded_at=now(),superseded_by=actor_profile_id,
    superseded_reason='Replaced by finalized revision '||next_revision
  where order_id=sale.id and document_type='invoice' and status='generated';

  insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,generated_by,
    revision_number,finalization_idempotency_key
  ) values(
    document_id,sale.id,invoice_number,'invoice','generated',document_snapshot,
    actor_profile_id,next_revision,requested_operation_id
  );

  request_status:=case
    when released_quantity=0 then 'pending_release'
    when released_quantity>=required_quantity then 'fully_released'
    else 'partially_released' end;
  if request_id is null then request_id:=gen_random_uuid(); end if;
  insert into public.sales_stock_out_requests(
    id,request_number,sales_order_id,current_invoice_document_id,warehouse_id,
    customer_profile_id,status,current_revision_number,required_quantity,
    released_quantity,invoice_revision_pending,created_by,finalized_at
  ) values(
    request_id,'STO-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||public.secure_random_digits(6),
    sale.id,document_id,sale.fulfillment_warehouse_id,sale.customer_profile_id,
    request_status,next_revision,required_quantity,released_quantity,false,
    actor_profile_id,now()
  ) on conflict(sales_order_id) do update set
    current_invoice_document_id=excluded.current_invoice_document_id,
    warehouse_id=excluded.warehouse_id,
    customer_profile_id=excluded.customer_profile_id,
    status=excluded.status,
    current_revision_number=excluded.current_revision_number,
    required_quantity=excluded.required_quantity,
    released_quantity=excluded.released_quantity,
    invoice_revision_pending=false,
    finalized_at=now(),updated_at=now(),version=public.sales_stock_out_requests.version+1
  returning id into request_id;

  insert into public.sales_stock_out_request_revisions(
    id,request_id,sale_document_id,revision_number,operation_id,
    invoice_number_snapshot,invoice_snapshot,required_quantity,
    released_quantity_at_revision,created_by
  ) values(
    request_revision_id,request_id,document_id,next_revision,requested_operation_id,
    invoice_number,document_snapshot,required_quantity,released_quantity,actor_profile_id
  );

  for sale_item in
    select * from public.sales_order_items
    where order_id=sale.id
    order by created_at,id
  loop
    insert into public.sales_stock_out_request_items(
      request_id,sales_order_item_id,line_key,product_id,variation_id,warehouse_id,
      product_name_snapshot,sku_snapshot,serial_tracking_required,required_quantity,
      released_quantity,packed_quantity_snapshot,latest_revision_number
    ) values(
      request_id,sale_item.id,sale_item.id::text,sale_item.product_id,sale_item.variation_id,
      sale_item.fulfillment_warehouse_id,sale_item.product_name_snapshot,sale_item.sku_snapshot,
      sale_item.serial_tracking_required_snapshot,sale_item.quantity,0,
      sale_item.packed_quantity,next_revision
    ) on conflict(request_id,sales_order_item_id) do update set
      product_id=excluded.product_id,variation_id=excluded.variation_id,
      warehouse_id=excluded.warehouse_id,product_name_snapshot=excluded.product_name_snapshot,
      sku_snapshot=excluded.sku_snapshot,
      serial_tracking_required=excluded.serial_tracking_required,
      required_quantity=excluded.required_quantity,
      packed_quantity_snapshot=excluded.packed_quantity_snapshot,
      latest_revision_number=excluded.latest_revision_number,updated_at=now()
    returning * into request_item;

    select coalesce(array_agg(allocation.serial_number_id order by allocation.allocated_at),'{}'::uuid[])
    into preassigned_serial_ids
    from public.order_serial_allocations allocation
    where allocation.order_item_id=sale_item.id
      and allocation.status not in('released','cancelled');

    insert into public.sales_stock_out_request_revision_items(
      revision_id,request_item_id,sales_order_item_id,product_id,variation_id,
      warehouse_id,required_quantity,released_quantity,preassigned_serial_ids
    ) values(
      request_revision_id,request_item.id,sale_item.id,sale_item.product_id,
      sale_item.variation_id,sale_item.fulfillment_warehouse_id,sale_item.quantity,
      request_item.released_quantity,preassigned_serial_ids
    );
  end loop;

  -- The trigger temporarily marks the old revision pending; this transaction has
  -- now installed its matching immutable request revision.
  update public.sales_stock_out_requests
  set invoice_revision_pending=false,updated_at=now()
  where id=request_id;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values
  ) values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'sale.invoice_finalized','sales','sales_stock_out_request',request_id::text,
    'Sales Invoice finalized and Stock Out request synchronized.',
    jsonb_build_object('order_id',sale.id,'document_id',document_id,
      'revision_number',next_revision,'required_quantity',required_quantity,
      'released_quantity',released_quantity)
  );
  return document_id;
end $$;

revoke all on function public.mark_stock_out_invoice_revision_pending()
  from public,anon,authenticated;
revoke all on function public.finalize_sale_invoice(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_sale_invoice(uuid,uuid,uuid)
  to service_role;

create or replace function public.confirm_sales_stock_out(
  actor_profile_id uuid,
  requested_request_id uuid,
  requested_operation_id uuid,
  requested_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  request public.sales_stock_out_requests%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  revision public.sales_stock_out_request_revisions%rowtype;
  sale_item public.sales_order_items%rowtype;
  balance public.inventory_balances%rowtype;
  reservation public.inventory_reservations%rowtype;
  serial public.serial_numbers%rowtype;
  allocation public.order_serial_allocations%rowtype;
  existing_release public.sales_stock_out_releases%rowtype;
  item_entry jsonb;
  request_version bigint;
  request_item_id uuid;
  quantity_to_release numeric;
  selected_serial_ids uuid[];
  selected_serial_id uuid;
  selected_serial_count integer;
  payload_item_count integer;
  release_id uuid:=gen_random_uuid();
  release_item_id uuid;
  movement_id uuid:=gen_random_uuid();
  movement_item_id uuid;
  total_quantity numeric:=0;
  packed_quantity numeric;
  previous_physical numeric;
  previous_reserved numeric;
  remaining_after numeric;
  release_status text;
begin
  if requested_operation_id is null then
    raise exception 'A valid Stock Out operation ID is required';
  end if;
  perform public.assert_actor_permission(actor_profile_id,'inventory.release_sales_stock');
  select * into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.role<>'employee' or actor.status<>'active' then
    raise exception 'An active employee account is required for Stock Out';
  end if;

  -- One operation token has one permanent result, even across browser retries.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_operation_id::text,0)
  );
  select * into existing_release
  from public.sales_stock_out_releases
  where operation_id=requested_operation_id;
  if existing_release.id is not null then
    if existing_release.request_id<>requested_request_id then
      raise exception 'This Stock Out operation belongs to another request';
    end if;
    return existing_release.id;
  end if;

  select * into request
  from public.sales_stock_out_requests
  where id=requested_request_id
  for update;
  if request.id is null then raise exception 'Stock Out request not found'; end if;
  if request.status not in('pending_release','partially_released') then
    raise exception 'This Stock Out request has already been updated or completed. Please refresh the request.';
  end if;
  if request.invoice_revision_pending then
    raise exception 'The latest Sales Invoice revision must be finalized before Stock Out';
  end if;
  if not exists(
    select 1 from public.profile_warehouse_assignments assignment
    join public.warehouses warehouse on warehouse.id=assignment.warehouse_id
    where assignment.profile_id=actor_profile_id
      and assignment.warehouse_id=request.warehouse_id
      and assignment.is_active and assignment.ended_at is null
      and warehouse.is_active
  ) then
    raise exception 'The employee is not actively assigned to this warehouse';
  end if;

  if jsonb_typeof(requested_items)<>'object'
    or jsonb_typeof(requested_items->'items')<>'array'
  then
    raise exception 'Stock Out release details are invalid';
  end if;
  begin
    request_version:=(requested_items->>'request_version')::bigint;
  exception when others then
    raise exception 'A valid Stock Out request version is required';
  end;
  if request_version is distinct from request.version then
    raise exception 'This Stock Out request has already been updated. Please refresh the request.';
  end if;

  select count(*) into payload_item_count
  from jsonb_array_elements(requested_items->'items');
  if payload_item_count=0 then raise exception 'At least one product must be released'; end if;
  if payload_item_count<>(
    select count(distinct value->>'request_item_id')
    from jsonb_array_elements(requested_items->'items')
  ) then
    raise exception 'A Stock Out product cannot be submitted more than once';
  end if;

  select * into revision
  from public.sales_stock_out_request_revisions
  where request_id=request.id and revision_number=request.current_revision_number
  for update;
  if revision.id is null then raise exception 'The current Stock Out revision is unavailable'; end if;

  -- Validate the basic shape before creating any authoritative rows.
  for item_entry in select value from jsonb_array_elements(requested_items->'items')
  loop
    begin
      request_item_id:=(item_entry->>'request_item_id')::uuid;
      quantity_to_release:=(item_entry->>'quantity')::numeric;
    exception when others then
      raise exception 'A Stock Out product quantity is invalid';
    end;
    if quantity_to_release<=0 or quantity_to_release<>trunc(quantity_to_release) then
      raise exception 'Stock Out quantity must be a positive whole number';
    end if;
    total_quantity:=total_quantity+quantity_to_release;
  end loop;

  insert into public.inventory_movements(
    movement_type,id,reference,status,source_warehouse_id,notes,
    initiated_by,confirmed_at
  ) values(
    'stock_out',movement_id,
    'STO-MV-'||upper(substr(replace(movement_id::text,'-',''),1,12)),
    'confirmed',request.warehouse_id,
    'Physical release for Sales Invoice '||revision.invoice_number_snapshot,
    actor_profile_id,now()
  );
  insert into public.sales_stock_out_releases(
    id,request_id,request_revision_id,sales_order_id,sale_document_id,
    warehouse_id,customer_profile_id,operation_id,movement_id,
    invoice_number_snapshot,quantity_released,released_by,released_by_name,released_at
  ) values(
    release_id,request.id,revision.id,request.sales_order_id,revision.sale_document_id,
    request.warehouse_id,request.customer_profile_id,requested_operation_id,movement_id,
    revision.invoice_number_snapshot,total_quantity,actor_profile_id,
    coalesce(nullif(actor.full_name,''),actor.email,'Employee'),now()
  );

  for item_entry in select value from jsonb_array_elements(requested_items->'items')
  loop
    request_item_id:=(item_entry->>'request_item_id')::uuid;
    quantity_to_release:=(item_entry->>'quantity')::numeric;
    selected_serial_ids:=array(
      select value::uuid
      from jsonb_array_elements_text(coalesce(item_entry->'serial_ids','[]'::jsonb))
      order by value
    );

    select * into request_item
    from public.sales_stock_out_request_items
    where id=request_item_id and request_id=request.id
    for update;
    if request_item.id is null then raise exception 'Stock Out request product not found'; end if;
    if quantity_to_release>request_item.remaining_quantity then
      raise exception 'Release quantity exceeds the remaining quantity for %',request_item.product_name_snapshot;
    end if;

    select * into sale_item
    from public.sales_order_items
    where id=request_item.sales_order_item_id and order_id=request.sales_order_id
    for update;
    if sale_item.id is null then raise exception 'The finalized invoice product is unavailable'; end if;
    packed_quantity:=sale_item.packed_quantity-request_item.released_quantity;
    if packed_quantity<quantity_to_release then
      raise exception '% has only % packed unit(s) eligible for release',request_item.product_name_snapshot,greatest(packed_quantity,0);
    end if;

    select * into balance
    from public.inventory_balances
    where warehouse_id=request.warehouse_id
      and product_id=request_item.product_id
      and variation_id is not distinct from request_item.variation_id
      and location_id is null
    for update;
    if balance.id is null then raise exception 'Physical inventory balance was not found'; end if;
    if balance.on_hand<quantity_to_release then
      raise exception 'Insufficient physical stock for %',request_item.product_name_snapshot;
    end if;
    if balance.reserved<quantity_to_release then
      raise exception 'Insufficient reserved stock for %',request_item.product_name_snapshot;
    end if;

    select * into reservation
    from public.inventory_reservations
    where order_item_id=request_item.sales_order_item_id and status='active'
    for update;
    if reservation.id is null or reservation.quantity<quantity_to_release then
      raise exception 'The active Sales reservation is insufficient for %',request_item.product_name_snapshot;
    end if;

    if request_item.serial_tracking_required then
      selected_serial_count:=coalesce(array_length(selected_serial_ids,1),0);
      if selected_serial_count<>quantity_to_release::integer
        or selected_serial_count<>(select count(distinct id) from unnest(selected_serial_ids) id)
      then
        raise exception 'Exactly % unique eligible SEN Serial Number(s) must be selected',quantity_to_release;
      end if;

      -- Lock serials in one stable order to avoid cross-employee deadlocks.
      perform id from public.serial_numbers
      where id=any(selected_serial_ids)
      order by id
      for update;
      if (select count(*) from public.serial_numbers where id=any(selected_serial_ids))<>selected_serial_count then
        raise exception 'One or more selected SEN Serial Numbers no longer exist';
      end if;

      foreach selected_serial_id in array selected_serial_ids
      loop
        select * into serial from public.serial_numbers where id=selected_serial_id;
        if serial.product_id is distinct from request_item.product_id then
          raise exception 'Selected SEN Serial does not belong to the invoice product';
        end if;
        if serial.variation_id is distinct from request_item.variation_id then
          raise exception 'Selected SEN Serial does not belong to the invoice variation';
        end if;
        if serial.warehouse_id is distinct from request.warehouse_id then
          raise exception 'Selected SEN Serial is not physically in the request warehouse';
        end if;
        if serial.status not in('available','reserved','allocated','packed')
          or lower(coalesce(serial.condition,'')) in('damaged','unavailable','quarantined','lost','disposed')
        then
          raise exception 'SEN Serial % is damaged, unavailable, quarantined, or otherwise ineligible',coalesce(serial.sen_serial,serial.id::text);
        end if;
        if exists(select 1 from public.sales_stock_out_release_serials released where released.serial_number_id=serial.id) then
          raise exception 'SEN Serial % has already been physically released',coalesce(serial.sen_serial,serial.id::text);
        end if;
        if exists(
          select 1 from public.order_serial_allocations conflict
          where conflict.serial_number_id=serial.id
            and conflict.order_item_id<>request_item.sales_order_item_id
            and conflict.status in('active','packed','warehouse_released','shipped')
        ) then
          raise exception 'SEN Serial % is assigned to another transaction',coalesce(serial.sen_serial,serial.id::text);
        end if;
      end loop;
    elsif coalesce(array_length(selected_serial_ids,1),0)>0 then
      raise exception 'SEN Serial Numbers cannot be attached to a non-serialized product';
    end if;

    previous_physical:=balance.on_hand;
    previous_reserved:=balance.reserved;
    update public.inventory_balances
    set on_hand=on_hand-quantity_to_release,
      reserved=reserved-quantity_to_release,
      updated_at=now()
    where id=balance.id;

    if reservation.quantity=quantity_to_release then
      update public.inventory_reservations
      set status='consumed',updated_at=now()
      where id=reservation.id;
    else
      update public.inventory_reservations
      set quantity=quantity-quantity_to_release,updated_at=now()
      where id=reservation.id;
    end if;

    insert into public.inventory_movement_items(
      quantity_delta,movement_id,product_id,variation_id,warehouse_id,balance_after
    ) values(
      -quantity_to_release,movement_id,request_item.product_id,
      request_item.variation_id,request.warehouse_id,previous_physical-quantity_to_release
    ) returning id into movement_item_id;

    insert into public.sales_stock_out_release_items(
      release_id,request_item_id,inventory_movement_item_id,product_id,
      variation_id,warehouse_id,quantity_released,previous_physical_quantity,
      new_physical_quantity,previous_reserved_quantity,new_reserved_quantity
    ) values(
      release_id,request_item.id,movement_item_id,request_item.product_id,
      request_item.variation_id,request.warehouse_id,quantity_to_release,
      previous_physical,previous_physical-quantity_to_release,
      previous_reserved,previous_reserved-quantity_to_release
    ) returning id into release_item_id;

    if request_item.serial_tracking_required then
      foreach selected_serial_id in array selected_serial_ids
      loop
        select * into serial from public.serial_numbers where id=selected_serial_id for update;
        select * into allocation
        from public.order_serial_allocations
        where serial_number_id=serial.id
          and order_item_id=request_item.sales_order_item_id
          and status in('active','packed')
        for update;
        if allocation.id is null then
          insert into public.order_serial_allocations(
            order_id,order_item_id,serial_number_id,warehouse_id,status,
            allocation_method,allocated_by,released_by,released_at
          ) values(
            request.sales_order_id,request_item.sales_order_item_id,serial.id,
            request.warehouse_id,'warehouse_released','scan',actor_profile_id,
            actor_profile_id,now()
          ) returning * into allocation;
        else
          update public.order_serial_allocations
          set status='warehouse_released',released_by=actor_profile_id,released_at=now()
          where id=allocation.id;
        end if;

        update public.serial_numbers
        set status='warehouse_released',last_movement_id=movement_id,updated_at=now()
        where id=serial.id;
        insert into public.serial_number_history(
          serial_number_id,event_type,previous_status,new_status,
          previous_warehouse_id,new_warehouse_id,movement_id,reason,actor_id
        ) values(
          serial.id,'stock_out',serial.status,'warehouse_released',
          request.warehouse_id,request.warehouse_id,movement_id,
          'Released for Sales Invoice '||revision.invoice_number_snapshot,actor_profile_id
        );
        insert into public.sales_stock_out_release_serials(
          release_item_id,serial_number_id,allocation_id,sen_serial_snapshot,
          manufacturer_serial_snapshot,previous_status,new_status
        ) values(
          release_item_id,serial.id,allocation.id,coalesce(serial.sen_serial,serial.id::text),
          serial.manufacturer_serial,serial.status,'warehouse_released'
        );
      end loop;
    end if;

    update public.sales_stock_out_request_items
    set released_quantity=released_quantity+quantity_to_release,updated_at=now()
    where id=request_item.id;
  end loop;

  remaining_after:=request.required_quantity-(request.released_quantity+total_quantity);
  release_status:=case
    when remaining_after=0 then 'fully_released'
    when request.released_quantity+total_quantity>0 then 'partially_released'
    else 'pending_release'
  end;
  update public.sales_stock_out_requests
  set released_quantity=released_quantity+total_quantity,
    status=release_status,version=version+1,updated_at=now()
  where id=request.id;

  insert into public.audit_logs(
    actor_id,actor_role,target_profile_id,action,module,entity_type,
    entity_id,description,new_values
  ) values(
    actor_profile_id,actor.role,request.customer_profile_id,
    'sale.stock_out_confirmed','inventory','sales_stock_out_release',release_id::text,
    'Sales Invoice products were physically released from the warehouse.',
    jsonb_build_object('request_id',request.id,'sales_order_id',request.sales_order_id,
      'warehouse_id',request.warehouse_id,'invoice_number',revision.invoice_number_snapshot,
      'quantity_released',total_quantity,'request_status',release_status)
  );
  return release_id;
end $$;

create or replace function public.replace_stock_out_serial(
  actor_profile_id uuid,
  requested_request_item_id uuid,
  requested_previous_serial_id uuid,
  requested_replacement_serial_id uuid,
  requested_reason text,
  requested_operation_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles%rowtype;
  request_item public.sales_stock_out_request_items%rowtype;
  request public.sales_stock_out_requests%rowtype;
  previous_serial public.serial_numbers%rowtype;
  replacement_serial public.serial_numbers%rowtype;
  allocation public.order_serial_allocations%rowtype;
  existing_change_id uuid;
  change_id uuid:=gen_random_uuid();
  replacement_status text;
begin
  if requested_operation_id is null then raise exception 'A valid serial replacement operation ID is required'; end if;
  if requested_previous_serial_id=requested_replacement_serial_id then raise exception 'Choose a different replacement SEN Serial'; end if;
  if length(btrim(coalesce(requested_reason,'')))<3 then raise exception 'A replacement reason is required'; end if;
  perform public.assert_actor_permission(actor_profile_id,'inventory.release_sales_stock');
  select * into actor from public.profiles where id=actor_profile_id;
  if actor.id is null or actor.role<>'employee' or actor.status<>'active' then
    raise exception 'An active employee account is required for serial replacement';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requested_operation_id::text,0));
  select id into existing_change_id from public.sales_stock_out_serial_changes where operation_id=requested_operation_id;
  if existing_change_id is not null then return existing_change_id; end if;

  select * into request_item from public.sales_stock_out_request_items
  where id=requested_request_item_id for update;
  if request_item.id is null or not request_item.serial_tracking_required then
    raise exception 'Serialized Stock Out request product not found';
  end if;
  select * into request from public.sales_stock_out_requests
  where id=request_item.request_id for update;
  if request.status not in('pending_release','partially_released') or request.invoice_revision_pending then
    raise exception 'This Stock Out request cannot accept a serial replacement';
  end if;
  if not exists(
    select 1 from public.profile_warehouse_assignments assignment
    join public.warehouses warehouse on warehouse.id=assignment.warehouse_id
    where assignment.profile_id=actor_profile_id and assignment.warehouse_id=request.warehouse_id
      and assignment.is_active and assignment.ended_at is null and warehouse.is_active
  ) then raise exception 'The employee is not actively assigned to this warehouse'; end if;

  perform id from public.serial_numbers
  where id in(requested_previous_serial_id,requested_replacement_serial_id)
  order by id for update;
  select * into previous_serial from public.serial_numbers where id=requested_previous_serial_id;
  select * into replacement_serial from public.serial_numbers where id=requested_replacement_serial_id;
  if previous_serial.id is null or replacement_serial.id is null then raise exception 'SEN Serial not found'; end if;
  if exists(select 1 from public.sales_stock_out_release_serials where serial_number_id=previous_serial.id) then
    raise exception 'The assigned SEN Serial has already been physically released and cannot be replaced';
  end if;
  select * into allocation from public.order_serial_allocations
  where serial_number_id=previous_serial.id
    and order_item_id=request_item.sales_order_item_id
    and status in('active','packed')
  for update;
  if allocation.id is null then raise exception 'The previous SEN Serial is not actively assigned to this invoice'; end if;
  if replacement_serial.product_id is distinct from request_item.product_id
    or replacement_serial.variation_id is distinct from request_item.variation_id
    or replacement_serial.warehouse_id is distinct from request.warehouse_id
  then raise exception 'Replacement SEN Serial must match the product, variation, and warehouse'; end if;
  if replacement_serial.status not in('available','reserved','allocated','packed')
    or lower(coalesce(replacement_serial.condition,'')) in('damaged','unavailable','quarantined','lost','disposed')
  then raise exception 'Replacement SEN Serial is damaged, unavailable, quarantined, or otherwise ineligible'; end if;
  if exists(select 1 from public.sales_stock_out_release_serials where serial_number_id=replacement_serial.id)
    or exists(
      select 1 from public.order_serial_allocations conflict
      where conflict.serial_number_id=replacement_serial.id
        and conflict.status in('active','packed','warehouse_released','shipped')
    )
  then raise exception 'Replacement SEN Serial is already assigned or physically released'; end if;

  replacement_status:=case when allocation.status='packed' then 'packed' else 'allocated' end;
  update public.order_serial_allocations
  set serial_number_id=replacement_serial.id,allocation_method='replacement'
  where id=allocation.id;
  update public.serial_numbers set status='available',updated_at=now() where id=previous_serial.id;
  update public.serial_numbers set status=replacement_status,updated_at=now() where id=replacement_serial.id;
  insert into public.serial_number_history(
    serial_number_id,event_type,previous_status,new_status,previous_warehouse_id,
    new_warehouse_id,reason,actor_id
  ) values
    (previous_serial.id,'stock_out_serial_replaced',previous_serial.status,'available',
      request.warehouse_id,request.warehouse_id,left(requested_reason,1000),actor_profile_id),
    (replacement_serial.id,'stock_out_serial_selected',replacement_serial.status,replacement_status,
      request.warehouse_id,request.warehouse_id,left(requested_reason,1000),actor_profile_id);
  insert into public.sales_stock_out_serial_changes(
    id,request_item_id,operation_id,previous_serial_number_id,
    replacement_serial_number_id,reason,changed_by
  ) values(
    change_id,request_item.id,requested_operation_id,previous_serial.id,
    replacement_serial.id,left(btrim(requested_reason),1000),actor_profile_id
  );
  return change_id;
end $$;

revoke all on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.replace_stock_out_serial(uuid,uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  to service_role;
grant execute on function public.replace_stock_out_serial(uuid,uuid,uuid,uuid,text,uuid)
  to service_role;
