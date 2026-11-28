begin;

alter table public.eps_checkout_requests
  add column discarded_at timestamptz,
  add constraint eps_checkout_one_resolution
    check (discarded_at is null or cart_restored_at is null);

-- Use the same order lock as EPS initialization, verification and cart recovery.
create function public.manage_unpaid_eps_checkout(
  requested_order_id uuid,
  requested_profile_id uuid,
  requested_admin_id uuid,
  requested_mode text
) returns text
language plpgsql security definer set search_path='' as $$
declare
  sale public.sales_orders%rowtype;
  checkout public.eps_checkout_requests%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Permission denied';
  end if;
  if requested_mode is null or requested_mode not in ('edit','remove') then
    return 'unavailable';
  end if;

  select * into sale from public.sales_orders
  where id=requested_order_id and customer_profile_id=requested_profile_id
  for update;
  select * into checkout from public.eps_checkout_requests
  where order_id=sale.id and profile_id=requested_profile_id
  for update;
  if checkout.order_id is null then return 'unavailable'; end if;
  if coalesce(sale.paid_amount,0) <> 0 or sale.status not in ('confirmed','cancelled')
    or exists (
      select 1 from public.eps_payment_attempts
      where order_id=sale.id and status not in ('failed','cancelled')
    ) or exists (
      select 1 from public.sales_order_items
      where order_id=sale.id and (allocated_quantity>0 or packed_quantity>0 or shipped_quantity>0)
    ) then
    return 'blocked';
  end if;

  if checkout.discarded_at is not null then return 'removed'; end if;
  if checkout.cart_restored_at is not null then return 'restored'; end if;
  if requested_mode='edit' then
    return public.restore_unpaid_eps_cart(sale.id,requested_profile_id,requested_admin_id);
  end if;

  if sale.status='confirmed' then
    if not exists (
      select 1 from public.profiles
      where id=requested_admin_id and role='admin' and status='active' and archived_at is null
    ) then return 'unavailable'; end if;
    perform public.cancel_sales_order(requested_admin_id,sale.id,'Customer removed unpaid EPS checkout');
  end if;
  update public.eps_checkout_requests set discarded_at=now()
  where operation_id=checkout.operation_id;
  return 'removed';
end $$;

revoke all on function public.manage_unpaid_eps_checkout(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_unpaid_eps_checkout(uuid,uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';

commit;
