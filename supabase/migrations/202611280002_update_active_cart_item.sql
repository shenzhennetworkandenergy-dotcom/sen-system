begin;

create function public.update_active_cart_item(
  requested_profile_id uuid,
  requested_item_id uuid,
  requested_quantity integer
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  active_cart_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Permission denied';
  end if;
  if requested_quantity is null or requested_quantity not between 0 and 99 then
    raise exception 'Invalid quantity';
  end if;

  -- Checkout also locks the cart before reading items and converting it.
  select id into active_cart_id from public.shopping_carts
  where profile_id=requested_profile_id and status='active'
  for update;
  if active_cart_id is null then return false; end if;

  if requested_quantity=0 then
    delete from public.shopping_cart_items
    where id=requested_item_id and cart_id=active_cart_id;
  else
    update public.shopping_cart_items set quantity=requested_quantity,updated_at=now()
    where id=requested_item_id and cart_id=active_cart_id;
  end if;
  return found;
end $$;

revoke all on function public.update_active_cart_item(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.update_active_cart_item(uuid,uuid,integer) to service_role;
notify pgrst, 'reload schema';

commit;
