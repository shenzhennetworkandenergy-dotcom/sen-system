begin;

-- Correct carrier/tracking metadata without changing the shipment lifecycle.
-- The shipment update and its audit record are deliberately one transaction.
create or replace function public.correct_purchase_inbound_shipment_tracking(
  actor_profile_id uuid,
  requested_purchase_order_id uuid,
  requested_shipment_id uuid,
  requested_carrier_id uuid,
  requested_tracking_number text,
  requested_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  shipment_row public.purchase_inbound_shipments%rowtype;
  carrier_row public.purchase_carriers%rowtype;
  actor_role public.account_role;
  normalized_tracking_number text;
  normalized_reason text;
begin
  perform public.assert_actor_permission(actor_profile_id,'purchasing.edit');
  perform public.assert_actor_permission(actor_profile_id,'shipments.create');

  if requested_tracking_number is not null
    and length(trim(requested_tracking_number))>200
  then
    raise exception 'Tracking number must be 200 characters or fewer';
  end if;
  if requested_reason is not null and length(trim(requested_reason))>1000 then
    raise exception 'Correction reason must be 1000 characters or fewer';
  end if;

  normalized_tracking_number:=nullif(trim(coalesce(requested_tracking_number,'')),'');
  normalized_reason:=nullif(trim(coalesce(requested_reason,'')),'');

  select * into shipment_row
  from public.purchase_inbound_shipments
  where id=requested_shipment_id
    and purchase_order_id=requested_purchase_order_id
  for update;

  if shipment_row.id is null then
    raise exception 'Supplier inbound shipment was not found';
  end if;
  if shipment_row.status not in(
    'ready_for_shipment','shipped','received','stock_received'
  ) then
    raise exception 'Carrier and tracking cannot be corrected for a cancelled shipment';
  end if;
  if nullif(trim(coalesce(shipment_row.tracking_number,'')),'') is not null
    and normalized_tracking_number is null
  then
    raise exception 'An existing tracking number cannot be cleared';
  end if;

  select * into carrier_row
  from public.purchase_carriers
  where id=requested_carrier_id;

  if carrier_row.id is null then
    raise exception 'Select a valid carrier';
  end if;
  if carrier_row.status<>'active'
    and carrier_row.id is distinct from shipment_row.carrier_id
  then
    raise exception 'Select an active carrier';
  end if;

  if carrier_row.id is not distinct from shipment_row.carrier_id
    and carrier_row.name is not distinct from shipment_row.carrier_name
    and normalized_tracking_number is not distinct from shipment_row.tracking_number
  then
    raise exception 'No carrier or tracking changes were provided';
  end if;

  select role into actor_role
  from public.profiles
  where id=actor_profile_id;

  update public.purchase_inbound_shipments
  set carrier_id=carrier_row.id,
      carrier_name=carrier_row.name,
      tracking_number=normalized_tracking_number,
      updated_by=actor_profile_id
  where id=shipment_row.id;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,
    old_values,new_values,metadata
  ) values(
    actor_profile_id,
    actor_role,
    'purchasing.inbound.tracking_corrected',
    'purchasing',
    'purchase_inbound_shipment',
    shipment_row.id::text,
    format(
      'Supplier shipment carrier/tracking corrected: %s / %s → %s / %s.',
      coalesce(shipment_row.carrier_name,'Not set'),
      coalesce(shipment_row.tracking_number,'Not set'),
      carrier_row.name,
      coalesce(normalized_tracking_number,'Not set')
    ),
    jsonb_build_object(
      'carrier_id',shipment_row.carrier_id,
      'carrier_name',shipment_row.carrier_name,
      'tracking_number',shipment_row.tracking_number
    ),
    jsonb_build_object(
      'carrier_id',carrier_row.id,
      'carrier_name',carrier_row.name,
      'tracking_number',normalized_tracking_number
    ),
    jsonb_build_object(
      'purchase_order_id',shipment_row.purchase_order_id,
      'supplier_shipment_id',shipment_row.id,
      'correction_reason',normalized_reason
    )
  );

  return shipment_row.id;
end $$;

revoke all on function public.correct_purchase_inbound_shipment_tracking(
  uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.correct_purchase_inbound_shipment_tracking(
  uuid,uuid,uuid,uuid,text,text
) to service_role;

notify pgrst, 'reload schema';

commit;

