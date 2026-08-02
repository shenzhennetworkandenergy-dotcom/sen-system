-- Keep internal warranty coverage maintenance callable only by trusted server code.
-- Trigger functions continue to run through their table triggers.

revoke execute on function public.refresh_warranty_coverages(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_warranty_coverages(uuid)
  to service_role;

revoke execute on function public.snapshot_sales_item_warranty()
  from public, anon, authenticated;
revoke execute on function public.refresh_order_warranty_trigger()
  from public, anon, authenticated;
revoke execute on function public.refresh_item_warranty_trigger()
  from public, anon, authenticated;
revoke execute on function public.refresh_allocation_warranty_trigger()
  from public, anon, authenticated;
