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
