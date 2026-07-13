create type public.account_role as enum ('admin', 'employee', 'customer');
create type public.account_status as enum ('active', 'suspended', 'disabled');
create type public.customer_type as enum ('individual', 'company');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  country_code text not null default 'BD',
  country_name text not null default 'Bangladesh',
  customer_type public.customer_type not null default 'individual',
  company_name text,
  role public.account_role not null default 'customer',
  status public.account_status not null default 'active',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  created_by uuid,
  updated_by uuid
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_role public.account_role,
  action text not null,
  module text not null,
  entity_type text not null,
  entity_id text,
  description text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.prevent_self_role_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and public.current_user_role() <> 'admin' and (new.role <> old.role or new.status <> old.status or new.created_by is distinct from old.created_by or new.updated_by is distinct from old.updated_by) then
    raise exception 'Users cannot change protected account fields';
  end if;
  return new;
end; $$;
create trigger profiles_prevent_self_role_status_change before update on public.profiles for each row execute function public.prevent_self_role_status_change();


create or replace function public.handle_new_user_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone, country_code, country_name, customer_type, company_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'SEN Customer'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country_code', ''), 'BD'),
    coalesce(nullif(new.raw_user_meta_data->>'country_name', ''), 'Bangladesh'),
    case when new.raw_user_meta_data->>'customer_type' = 'company' then 'company'::public.customer_type else 'individual'::public.customer_type end,
    nullif(new.raw_user_meta_data->>'company_name', ''),
    'customer'::public.account_role,
    'active'::public.account_status
  );
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user_profile();

create or replace function public.current_user_role() returns public.account_role language sql stable security definer set search_path = public as $$ select role from public.profiles where id = auth.uid() $$;

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.current_user_role() = 'admin');
create policy "profiles_insert_service_only" on public.profiles for insert to authenticated with check (false);
create policy "profiles_update_own_safe_fields" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()) and status = (select status from public.profiles where id = auth.uid()));
create policy "profiles_update_admin" on public.profiles for update to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "audit_logs_admin_read" on public.audit_logs for select to authenticated using (public.current_user_role() = 'admin');
create policy "audit_logs_no_user_writes" on public.audit_logs for all to authenticated using (false) with check (false);
