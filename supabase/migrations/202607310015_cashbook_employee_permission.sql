insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select
  module.id,
  'accounting.manage_cashbook',
  'View and edit কুইক ক্যাশবুক ও ক্যাশ ক্লোজিং সিস্টেম',
  'Allow this employee to view and edit only the Quick Cashbook and Cash Closing System.',
  'cashbook_manage',
  true,
  5
from public.app_modules module
where module.key='accounting'
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
declare permission_alias text;
begin
  if not exists(select 1 from public.profiles p where p.id=actor_profile_id and p.status='active') then raise exception 'Inactive actor'; end if;
  permission_alias:=case requested_permission
    when 'orders.create' then 'sales.create'
    when 'orders.edit' then 'sales.edit'
    when 'orders.confirm' then 'sales.reserve_stock'
    when 'orders.allocate' then 'sales.allocate_serials'
    when 'orders.pack' then 'sales.edit'
    when 'orders.cancel' then 'sales.cancel'
    when 'accounting.create_entry' then 'accounting.manage_cashbook'
    else null
  end;
  if not exists(
    select 1 from public.effective_permissions_for_profile(actor_profile_id) e
    where e.permission_key=requested_permission or (permission_alias is not null and e.permission_key=permission_alias)
  ) then raise exception 'Permission denied'; end if;
end $$;

drop policy if exists "cashbook days read" on public.cashbook_days;
drop policy if exists "cashbook descriptions read" on public.cashbook_descriptions;
drop policy if exists "cashbook entries read" on public.cashbook_entries;

create policy "cashbook days read"
  on public.cashbook_days for select to authenticated
  using(public.current_user_has_permission('accounting.view') or public.current_user_has_permission('accounting.manage_cashbook'));
create policy "cashbook descriptions read"
  on public.cashbook_descriptions for select to authenticated
  using(public.current_user_has_permission('accounting.view') or public.current_user_has_permission('accounting.manage_cashbook'));
create policy "cashbook entries read"
  on public.cashbook_entries for select to authenticated
  using(public.current_user_has_permission('accounting.view') or public.current_user_has_permission('accounting.manage_cashbook'));
