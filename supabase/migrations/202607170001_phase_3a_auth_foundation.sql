do $$ begin
  create type public.account_role as enum ('customer','employee','admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_status as enum ('active','suspended','disabled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.customer_type as enum ('individual','company');
exception
  when duplicate_object then null;
end $$;
create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade,email text,full_name text,phone text,country text default 'Bangladesh',customer_type public.customer_type default 'individual',company_name text,role public.account_role default 'customer',status public.account_status default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists public.audit_logs (id bigserial primary key,actor_id uuid references public.profiles(id),target_profile_id uuid references public.profiles(id),action text not null,metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
alter table public.profiles enable row level security; alter table public.audit_logs enable row level security;
create or replace function public.on_auth_user_created() returns trigger language plpgsql security definer as $$ begin insert into public.profiles (id,email,full_name,phone,country,customer_type,company_name) values (new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',coalesce(new.raw_user_meta_data->>'country','Bangladesh'),coalesce((new.raw_user_meta_data->>'customer_type')::public.customer_type,'individual'),new.raw_user_meta_data->>'company_name') on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "audit admin read" on public.audit_logs;
create policy "audit admin read" on public.audit_logs for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
