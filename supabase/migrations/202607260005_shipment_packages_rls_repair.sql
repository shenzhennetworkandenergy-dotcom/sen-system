-- Repair the Phase 2 shipment_packages RLS omission.
-- This join table follows the same staff/customer visibility rules as shipments
-- and order packages. Mutations remain service-role only.

alter table public.shipment_packages enable row level security;

drop policy if exists "staff read shipment packages"
  on public.shipment_packages;
create policy "staff read shipment packages"
  on public.shipment_packages
  for select
  to authenticated
  using (public.current_user_has_permission('shipments.view'));

drop policy if exists "customers read own shipment packages"
  on public.shipment_packages;
create policy "customers read own shipment packages"
  on public.shipment_packages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shipments shipment
      join public.sales_orders customer_order
        on customer_order.id = shipment.order_id
      where shipment.id = shipment_packages.shipment_id
        and shipment.customer_visible
        and customer_order.customer_profile_id = auth.uid()
    )
  );

grant select on public.shipment_packages to authenticated;
grant all on public.shipment_packages to service_role;
