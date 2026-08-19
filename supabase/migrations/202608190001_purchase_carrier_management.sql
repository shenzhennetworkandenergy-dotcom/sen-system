begin;

-- Additive-only carrier master fields. Existing rows and historical carrier
-- name snapshots remain unchanged.
alter table public.purchase_carriers
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists description text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.purchase_inbound_shipments
  add column if not exists carrier_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='purchase_inbound_shipments_carrier_id_fkey'
  ) then
    alter table public.purchase_inbound_shipments
      add constraint purchase_inbound_shipments_carrier_id_fkey
      foreign key (carrier_id) references public.purchase_carriers(id) on delete restrict;
  end if;
end $$;

create index if not exists purchase_inbound_shipments_carrier_id_idx
  on public.purchase_inbound_shipments(carrier_id) where carrier_id is not null;

-- New application calls use a carrier ID while the established transition
-- and every historical carrier_name snapshot remain available unchanged.
create or replace function public.transition_purchase_inbound_shipment_with_carrier(
  actor_profile_id uuid,
  requested_order_id uuid,
  requested_action text,
  requested_transport_mode text default null,
  requested_carrier_id uuid default null,
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
  resolved_carrier_id uuid;
  resolved_carrier_name text;
  shipment_id uuid;
begin
  if requested_action='prepare' then
    select id,name into resolved_carrier_id,resolved_carrier_name
    from public.purchase_carriers
    where id=requested_carrier_id and status='active';

    if resolved_carrier_id is null then
      raise exception 'Select an active carrier';
    end if;
  end if;

  shipment_id:=public.transition_purchase_inbound_shipment(
    actor_profile_id,
    requested_order_id,
    requested_action,
    requested_transport_mode,
    resolved_carrier_name,
    requested_tracking_number,
    requested_expected_departure_at,
    requested_expected_arrival_at,
    requested_note
  );

  if requested_action='prepare' then
    update public.purchase_inbound_shipments
    set carrier_id=resolved_carrier_id
    where id=shipment_id;
  end if;

  return shipment_id;
end $$;

revoke all on function public.transition_purchase_inbound_shipment_with_carrier(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.transition_purchase_inbound_shipment_with_carrier(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,text
) to service_role;

commit;
