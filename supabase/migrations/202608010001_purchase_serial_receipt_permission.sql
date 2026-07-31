-- Give employees an explicit, narrowly named permission for posting newly
-- purchased products into stock. Purchase receipts continue to generate SEN
-- serials and update inventory inside the existing single database transaction.

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select
  module.id,
  'inventory.receive_new_stock',
  'স্টকে নতুন পণ্য রিসিভ করুন',
  'Receive newly purchased products into stock and generate unique SEN serials for serialized units.',
  'receive_new_stock',
  true,
  25
from public.app_modules module
where module.key='inventory'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

create or replace function public.assert_actor_permission(actor_profile_id uuid,requested_permission text) returns void
language plpgsql stable security definer set search_path='' as $$
declare permission_aliases text[];
begin
  if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then raise exception 'Inactive actor'; end if;
  permission_aliases:=case requested_permission
    when 'orders.create' then array['sales.create']
    when 'orders.edit' then array['sales.edit']
    when 'orders.confirm' then array['sales.reserve_stock']
    when 'orders.allocate' then array['sales.allocate_serials']
    when 'orders.pack' then array['sales.edit']
    when 'orders.cancel' then array['sales.cancel']
    when 'accounting.create_entry' then array['accounting.manage_cashbook']
    when 'inventory.receive' then array['inventory.receive_new_stock']
    else array[]::text[]
  end;
  if not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key=requested_permission or e.permission_key=any(permission_aliases)
  ) then raise exception 'Permission denied'; end if;
end $$;

