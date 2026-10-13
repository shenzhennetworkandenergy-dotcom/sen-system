create table if not exists public.employee_business_category_access (
  employee_profile_id uuid not null references public.profiles(id) on delete cascade,
  customer_business_category_id uuid not null references public.customer_business_categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (employee_profile_id, customer_business_category_id)
);

create index if not exists employee_business_category_access_category_idx
  on public.employee_business_category_access(customer_business_category_id);

create or replace function public.ensure_employee_business_access_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.employee_profile_id
      and role = 'employee'
      and archived_at is null
  ) then
    raise exception 'employee_business_category_access requires an active employee profile';
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_employee_business_access_profile_trigger
  on public.employee_business_category_access;
create trigger ensure_employee_business_access_profile_trigger
  before insert or update on public.employee_business_category_access
  for each row
  execute function public.ensure_employee_business_access_profile();

alter table public.employee_business_category_access enable row level security;

drop policy if exists "admins read employee business access" on public.employee_business_category_access;
create policy "admins read employee business access" on public.employee_business_category_access
  for select to authenticated using (public.is_current_user_admin());

drop policy if exists "admins manage employee business access" on public.employee_business_category_access;
create policy "admins manage employee business access" on public.employee_business_category_access
  for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

grant select, insert, delete on public.employee_business_category_access to authenticated;
grant select, insert, delete on public.employee_business_category_access to service_role;
grant execute on function public.ensure_employee_business_access_profile() to authenticated, service_role;

notify pgrst, 'reload schema';
