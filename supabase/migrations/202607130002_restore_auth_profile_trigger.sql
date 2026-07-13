-- Phase 3A repair: ensure Supabase Auth registrations always create profiles.
-- This migration is intentionally idempotent so it can be applied after an
-- earlier partial Phase 3A migration where auth.users existed but profiles did not.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    country_code,
    country_name,
    customer_type,
    company_name,
    role,
    status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'SEN Customer'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country_code', ''), 'BD'),
    coalesce(nullif(new.raw_user_meta_data->>'country_name', ''), 'Bangladesh'),
    case
      when new.raw_user_meta_data->>'customer_type' = 'company'
        then 'company'::public.customer_type
      else 'individual'::public.customer_type
    end,
    nullif(new.raw_user_meta_data->>'company_name', ''),
    'customer'::public.account_role,
    'active'::public.account_status
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Recreate the auth trigger in a repeatable way. PostgreSQL does not support
-- CREATE OR REPLACE TRIGGER for all supported Supabase Postgres versions.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Backfill any auth users that were created before the trigger existed.
insert into public.profiles (
  id,
  email,
  full_name,
  phone,
  country_code,
  country_name,
  customer_type,
  company_name,
  role,
  status
)
select
  users.id,
  coalesce(users.email, ''),
  coalesce(nullif(users.raw_user_meta_data->>'full_name', ''), 'SEN Customer'),
  nullif(users.raw_user_meta_data->>'phone', ''),
  coalesce(nullif(users.raw_user_meta_data->>'country_code', ''), 'BD'),
  coalesce(nullif(users.raw_user_meta_data->>'country_name', ''), 'Bangladesh'),
  case
    when users.raw_user_meta_data->>'customer_type' = 'company'
      then 'company'::public.customer_type
    else 'individual'::public.customer_type
  end,
  nullif(users.raw_user_meta_data->>'company_name', ''),
  'customer'::public.account_role,
  'active'::public.account_status
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);
