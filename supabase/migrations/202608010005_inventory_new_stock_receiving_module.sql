-- Physical stock receipt is an Inventory responsibility. The supplier shipment
-- has already been confirmed as arrived before this function can run, so an
-- employee needs the narrow inventory.receive_new_stock permission rather than
-- the broader purchasing.receive permission.
do $$
declare
  old_definition text;
  new_definition text;
begin
  select pg_get_functiondef(
    'public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb)'::regprocedure
  ) into old_definition;

  new_definition := regexp_replace(
    old_definition,
    'perform\s+public\.assert_actor_permission\(actor_profile_id,\s*''purchasing\.receive''\);',
    'perform public.assert_actor_permission(actor_profile_id,''inventory.receive_new_stock'');',
    'i'
  );

  if new_definition = old_definition then
    raise exception 'Unable to update purchase stock receipt permission guard';
  end if;
  execute new_definition;
end $$;

revoke all on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.receive_purchase_order(uuid,uuid,date,text,text,text,jsonb)
to service_role;
