alter table public.eps_checkout_requests
  add column cart_restored_at timestamptz;

-- Stock release, cart restoration and the replay marker commit together.
-- Lock the order first, as begin_eps_payment and apply_eps_verification do.
create function public.restore_unpaid_eps_cart(
  requested_order_id uuid, requested_profile_id uuid, requested_admin_id uuid
) returns text
language plpgsql security definer set search_path='' as $$
declare
  sale public.sales_orders%rowtype;
  checkout public.eps_checkout_requests%rowtype;
  active_cart_id uuid;
  existing_line_id uuid;
  saved_line record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Permission denied';
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
  if checkout.cart_restored_at is not null then return 'restored'; end if;

  if sale.status='confirmed' then
    if not exists (
      select 1 from public.profiles
      where id=requested_admin_id and role='admin' and status='active' and archived_at is null
    ) then return 'unavailable'; end if;
    perform public.cancel_sales_order(requested_admin_id,sale.id,'Unpaid EPS checkout closed; reserved stock released');
  end if;

  -- Retain the original converted cart as order history. Merge into the current
  -- cart, or open a new one if the customer has not added anything since.
  loop
    insert into public.shopping_carts(profile_id)
    values(requested_profile_id)
    on conflict (profile_id) where status='active' do nothing
    returning id into active_cart_id;
    exit when active_cart_id is not null;
    select id into active_cart_id from public.shopping_carts
    where profile_id=requested_profile_id and status='active' for update;
    exit when active_cart_id is not null;
  end loop;

  for saved_line in
    select product_id,variation_id,sum(quantity) as quantity
    from public.shopping_cart_items where cart_id=checkout.cart_id
    group by product_id,variation_id order by product_id,variation_id nulls first
  loop
    select id into existing_line_id from public.shopping_cart_items
    where cart_id=active_cart_id and product_id=saved_line.product_id
      and variation_id is not distinct from saved_line.variation_id
    order by id limit 1 for update;
    if existing_line_id is null then
      insert into public.shopping_cart_items(cart_id,product_id,variation_id,quantity)
      values(active_cart_id,saved_line.product_id,saved_line.variation_id,least(99,saved_line.quantity));
    else
      update public.shopping_cart_items
      set quantity=least(99,quantity+saved_line.quantity),updated_at=now()
      where id=existing_line_id;
    end if;
  end loop;

  update public.eps_checkout_requests set cart_restored_at=now()
  where operation_id=checkout.operation_id;
  return 'restored';
end $$;

revoke all on function public.restore_unpaid_eps_cart(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.restore_unpaid_eps_cart(uuid,uuid,uuid) to service_role;

-- The existing reconciliation job also handles closed tabs without a callback.
create or replace function public.expire_eps_unpaid_orders(requested_admin_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare candidate record; restored integer:=0;
begin
  if coalesce(auth.role(),'') <> 'service_role' or not exists (
    select 1 from public.profiles where id=requested_admin_id and role='admin' and status='active' and archived_at is null
  ) then raise exception 'Permission denied'; end if;

  for candidate in
    select o.id,c.profile_id from public.sales_orders o
    join public.eps_checkout_requests c on c.order_id=o.id
    where c.cart_restored_at is null and o.status='confirmed' and o.paid_amount=0
      and (c.payment_expires_at<now() or exists (
        select 1 from public.eps_payment_attempts a where a.order_id=o.id and a.status in ('failed','cancelled')
      ))
      and not exists (
        select 1 from public.eps_payment_attempts a where a.order_id=o.id and a.status not in ('failed','cancelled')
      )
      and not exists (
        select 1 from public.sales_order_items i where i.order_id=o.id
        and (i.allocated_quantity>0 or i.packed_quantity>0 or i.shipped_quantity>0)
      )
    order by c.payment_expires_at limit 10 for update of o skip locked
  loop
    if public.restore_unpaid_eps_cart(candidate.id,candidate.profile_id,requested_admin_id)='restored' then
      restored:=restored+1;
    end if;
  end loop;
  return restored;
end $$;
