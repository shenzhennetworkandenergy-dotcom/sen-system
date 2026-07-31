-- Supplier inbound logistics workflow.
-- Additive to the purchasing module and intentionally separate from customer-delivery shipments.

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;

-- Before this migration, "received" meant that all stock had already been posted.
update public.purchase_order_status_events
set new_status = 'stock_received'
where new_status = 'received'
  and exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_status_events.purchase_order_id
      and po.status = 'received'
  );

update public.purchase_order_status_events
set previous_status = 'stock_received'
where previous_status = 'received'
  and new_status = 'closed';

update public.purchase_orders
set status = 'stock_received'
where status = 'received';

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in (
    'draft','pending_approval','approved','ordered','ready_for_shipment','shipped',
    'received','partially_received','stock_received','cancelled','closed'
  ));

create table public.purchase_inbound_shipments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null unique references public.purchase_orders(id) on delete restrict,
  status text not null check (status in ('ready_for_shipment','shipped','received','stock_received','cancelled')),
  transport_mode text not null check (transport_mode in ('air','sea','road','courier','other')),
  carrier_name text,
  tracking_number text,
  expected_departure_at timestamptz,
  expected_arrival_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  stock_received_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_arrival_at is null or expected_departure_at is null or expected_arrival_at >= expected_departure_at)
);

create index purchase_inbound_shipments_status_idx
  on public.purchase_inbound_shipments(status, updated_at desc);

create trigger purchase_inbound_shipments_touch_updated_at
before update on public.purchase_inbound_shipments
for each row execute function public.purchase_touch_updated_at();

insert into public.purchase_inbound_shipments(
  purchase_order_id,status,transport_mode,received_at,stock_received_at,notes,created_by,updated_by
)
select
  po.id,'stock_received','other',po.completed_at,po.completed_at,
  'Backfilled from a purchase order completed before inbound shipment tracking.',
  po.created_by,po.updated_by
from public.purchase_orders po
where po.status in ('stock_received','closed')
on conflict (purchase_order_id) do nothing;

alter table public.purchase_inbound_shipments enable row level security;

create policy "authorized staff read supplier inbound shipments"
on public.purchase_inbound_shipments for select to authenticated
using (
  public.current_user_has_permission('purchasing.view')
  or public.current_user_has_permission('shipments.view')
);

create or replace function public.transition_purchase_inbound_shipment(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_action text,
  requested_transport_mode text default null,
  requested_carrier_name text default null,
  requested_tracking_number text default null,
  requested_expected_departure_at timestamptz default null,
  requested_expected_arrival_at timestamptz default null,
  requested_note text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  order_row public.purchase_orders%rowtype;
  shipment_row public.purchase_inbound_shipments%rowtype;
  next_status text;
  required_permission text;
begin
  select * into order_row
  from public.purchase_orders
  where id=requested_order_id
  for update;

  if order_row.id is null then raise exception 'Purchase order not found'; end if;

  if requested_action='prepare' and order_row.status='ordered' then
    next_status:='ready_for_shipment';
    required_permission:='shipments.create';
    if requested_transport_mode not in('air','sea','road','courier','other') then
      raise exception 'Select a valid supplier shipment channel';
    end if;
    perform public.assert_actor_permission(actor_profile_id,'purchasing.edit');
  elsif requested_action='ship' and order_row.status='ready_for_shipment' then
    next_status:='shipped';
    required_permission:='shipments.confirm_dispatch';
  elsif requested_action='receive' and order_row.status='shipped' then
    next_status:='received';
    required_permission:='shipments.confirm_receipt';
    perform public.assert_actor_permission(actor_profile_id,'purchasing.receive');
  else
    raise exception 'Supplier shipment cannot perform this action from its current status';
  end if;

  perform public.assert_actor_permission(actor_profile_id,required_permission);

  if requested_action='prepare' then
    insert into public.purchase_inbound_shipments(
      purchase_order_id,status,transport_mode,carrier_name,tracking_number,
      expected_departure_at,expected_arrival_at,notes,created_by,updated_by
    ) values (
      order_row.id,next_status,requested_transport_mode,
      nullif(left(trim(requested_carrier_name),200),''),
      nullif(left(trim(requested_tracking_number),200),''),
      requested_expected_departure_at,requested_expected_arrival_at,
      nullif(left(trim(requested_note),1000),''),
      actor_profile_id,actor_profile_id
    )
    on conflict (purchase_order_id) do update set
      status=excluded.status,
      transport_mode=excluded.transport_mode,
      carrier_name=excluded.carrier_name,
      tracking_number=excluded.tracking_number,
      expected_departure_at=excluded.expected_departure_at,
      expected_arrival_at=excluded.expected_arrival_at,
      notes=excluded.notes,
      updated_by=actor_profile_id
    returning * into shipment_row;
  else
    select * into shipment_row
    from public.purchase_inbound_shipments
    where purchase_order_id=order_row.id
    for update;
    if shipment_row.id is null then raise exception 'Supplier inbound shipment not found'; end if;

    update public.purchase_inbound_shipments set
      status=next_status,
      shipped_at=case when requested_action='ship' then now() else shipped_at end,
      received_at=case when requested_action='receive' then now() else received_at end,
      notes=coalesce(nullif(left(trim(requested_note),1000),''),notes),
      updated_by=actor_profile_id
    where id=shipment_row.id
    returning * into shipment_row;
  end if;

  update public.purchase_orders
  set status=next_status,updated_by=actor_profile_id
  where id=order_row.id;

  insert into public.purchase_order_status_events(
    purchase_order_id,previous_status,new_status,note,actor_profile_id
  ) values (
    order_row.id,order_row.status,next_status,
    coalesce(
      nullif(left(trim(requested_note),1000),''),
      case requested_action
        when 'prepare' then 'Supplier shipment prepared.'
        when 'ship' then 'Supplier shipment dispatched.'
        else 'Supplier shipment physically received.'
      end
    ),
    actor_profile_id
  );

  return shipment_row.id;
end $$;

create or replace function public.post_received_purchase_order(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_receipt_date date,
  requested_delivery_reference text,
  requested_invoice_reference text,
  requested_notes text,
  requested_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  original_status text;
  resulting_status text;
  receipt_id uuid;
begin
  select status into original_status
  from public.purchase_orders
  where id=requested_order_id
  for update;

  if original_status not in('received','partially_received') then
    raise exception 'Purchase order must be physically received before stock can be posted';
  end if;

  -- The existing atomic stock-posting routine accepts ordered/partial orders.
  -- This temporary state exists only inside this transaction and is never externally visible.
  if original_status='received' then
    update public.purchase_orders set status='ordered' where id=requested_order_id;
  end if;

  receipt_id:=public.receive_purchase_order(
    actor_profile_id,
    requested_order_id,
    requested_receipt_date,
    requested_delivery_reference,
    requested_invoice_reference,
    requested_notes,
    requested_items
  );

  select status into resulting_status
  from public.purchase_orders
  where id=requested_order_id;

  if resulting_status='received' then
    resulting_status:='stock_received';
    update public.purchase_orders
    set status=resulting_status,completed_at=now(),updated_by=actor_profile_id
    where id=requested_order_id;

    update public.purchase_inbound_shipments
    set status='stock_received',stock_received_at=now(),updated_by=actor_profile_id
    where purchase_order_id=requested_order_id;
  end if;

  update public.purchase_order_status_events
  set previous_status=original_status,
      new_status=resulting_status,
      note='Stock posted to warehouse inventory for receipt ' || (
        select receipt_number from public.purchase_receipts where id=receipt_id
      )
  where id=(
    select id
    from public.purchase_order_status_events
    where purchase_order_id=requested_order_id
    order by created_at desc,id desc
    limit 1
  );

  return receipt_id;
end $$;

create or replace function public.close_stock_received_purchase_order(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_note text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.purchase_orders
    where id=requested_order_id and status='stock_received'
    for update
  ) then
    raise exception 'Only a stock-received purchase order can be closed';
  end if;

  update public.purchase_orders set status='received' where id=requested_order_id;
  perform public.transition_purchase_order(
    actor_profile_id,requested_order_id,'close',requested_note
  );
  update public.purchase_order_status_events
  set previous_status='stock_received'
  where id=(
    select id from public.purchase_order_status_events
    where purchase_order_id=requested_order_id
    order by created_at desc,id desc
    limit 1
  );
end $$;

revoke all on function public.transition_purchase_inbound_shipment(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,text
) from public,anon,authenticated;
revoke all on function public.post_received_purchase_order(
  uuid,uuid,date,text,text,text,jsonb
) from public,anon,authenticated;
revoke all on function public.close_stock_received_purchase_order(
  uuid,uuid,text
) from public,anon,authenticated;

grant execute on function public.transition_purchase_inbound_shipment(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,text
) to service_role;
grant execute on function public.post_received_purchase_order(
  uuid,uuid,date,text,text,text,jsonb
) to service_role;
grant execute on function public.close_stock_received_purchase_order(
  uuid,uuid,text
) to service_role;

grant select on public.purchase_inbound_shipments to authenticated,service_role;
grant all on public.purchase_inbound_shipments to service_role;
