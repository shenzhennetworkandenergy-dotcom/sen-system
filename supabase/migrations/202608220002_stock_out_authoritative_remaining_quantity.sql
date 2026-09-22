-- The Stock Out request is the authoritative physical release requirement.
-- Packing is informational/preparatory and must not reduce the employee's
-- allowed release quantity below the request's current remaining quantity.
do $migration$
declare
  function_signature regprocedure:=to_regprocedure(
    'public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)'
  );
  function_definition text;
  updated_definition text;
  obsolete_packed_guard constant text:=$guard$
    packed_quantity:=sale_item.packed_quantity-request_item.released_quantity;
    if packed_quantity<quantity_to_release then
      raise exception '% has only % packed unit(s) eligible for release',request_item.product_name_snapshot,greatest(packed_quantity,0);
    end if;
$guard$;
begin
  if function_signature is null then
    raise exception 'confirm_sales_stock_out(uuid,uuid,uuid,jsonb) is required';
  end if;

  select pg_catalog.pg_get_functiondef(function_signature::oid)
  into function_definition;

  if pg_catalog.strpos(function_definition,obsolete_packed_guard)=0 then
    raise exception 'The expected packed-quantity Stock Out guard was not found';
  end if;

  -- Remove the obsolete packed-quantity release guard while preserving every
  -- permission, warehouse, remaining, reservation, physical-stock, serial,
  -- idempotency, concurrency, movement, and audit check in the function.
  updated_definition:=pg_catalog.replace(
    function_definition,
    obsolete_packed_guard,
    E'\n'
  );

  if pg_catalog.strpos(
    updated_definition,
    'quantity_to_release>request_item.remaining_quantity'
  )=0 then
    raise exception 'The authoritative remaining-quantity guard is missing';
  end if;

  execute updated_definition;
end
$migration$;

revoke all on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.confirm_sales_stock_out(uuid,uuid,uuid,jsonb)
  to service_role;
