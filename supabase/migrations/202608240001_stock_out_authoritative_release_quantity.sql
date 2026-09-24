-- Stock Out is the physical warehouse release point. Packing is preparation
-- only, so it must not cap an otherwise valid request's release quantity.
--
-- Replace only the obsolete packed-quantity guard in the existing atomic
-- confirmation function. Every permission, warehouse, remaining, reservation,
-- physical-stock, serial, concurrency, idempotency, movement, and audit check
-- remains in the original function definition.
do $migration$
declare
  function_signature regprocedure:=to_regprocedure(
    'public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)'
  );
  function_definition text;
  updated_definition text;
  packed_guard_start integer;
  physical_balance_start integer;
begin
  if function_signature is null then
    raise exception 'confirm_sales_stock_out(uuid,uuid,uuid,jsonb) is required';
  end if;

  select pg_catalog.pg_get_functiondef(function_signature::oid)
  into function_definition;

  packed_guard_start:=pg_catalog.strpos(
    lower(function_definition),
    'packed_quantity:='
  );
  if packed_guard_start=0 then
    packed_guard_start:=pg_catalog.strpos(
      lower(function_definition),
      'packed_quantity :='
    );
  end if;
  physical_balance_start:=pg_catalog.strpos(
    lower(function_definition),
    'select * into balance'
  );

  -- Reapplying the migration is safe when the same correction is already in
  -- place, provided the authoritative safety checks are still present.
  if packed_guard_start=0 then
    if pg_catalog.strpos(lower(function_definition),'request_item.remaining_quantity')=0
      or pg_catalog.strpos(lower(function_definition),'balance.reserved')=0
      or pg_catalog.strpos(lower(function_definition),'balance.on_hand')=0
      or pg_catalog.strpos(lower(function_definition),'array_length(selected_serial_ids')=0
    then
      raise exception 'The Stock Out function is missing a required safety validation';
    end if;
    return;
  end if;

  if physical_balance_start=0 or physical_balance_start<=packed_guard_start then
    raise exception 'The expected packed-quantity Stock Out guard was not found';
  end if;

  updated_definition:=
    substring(function_definition from 1 for packed_guard_start-1)
    || E'\n    '
    || substring(function_definition from physical_balance_start);

  if pg_catalog.strpos(lower(updated_definition),'packed_quantity:=')>0
    or pg_catalog.strpos(lower(updated_definition),'packed_quantity :=')>0
  then
    raise exception 'The obsolete packed-quantity Stock Out guard was not removed';
  end if;
  if pg_catalog.strpos(lower(updated_definition),'request_item.remaining_quantity')=0 then
    raise exception 'The authoritative request remaining-quantity guard is missing';
  end if;
  if pg_catalog.strpos(lower(updated_definition),'balance.reserved')=0
    or pg_catalog.strpos(lower(updated_definition),'balance.on_hand')=0
    or pg_catalog.strpos(lower(updated_definition),'array_length(selected_serial_ids')=0
  then
    raise exception 'A required Stock Out safety validation is missing';
  end if;

  execute updated_definition;
end
$migration$;

revoke all on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  to service_role;
