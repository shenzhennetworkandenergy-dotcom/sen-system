-- Normalize the country field across the original hosted Phase 3A schema and
-- the local development schema. The hosted project originally stored
-- country_code/country_name, while current account administration also uses
-- the canonical country field.

alter table public.profiles
  add column if not exists country text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'country_name'
  ) then
    execute $sql$
      update public.profiles
      set country = country_name
      where (country is null or btrim(country) = '')
        and country_name is not null
        and btrim(country_name) <> ''
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'country_code'
  ) then
    execute $sql$
      update public.profiles
      set country = country_code
      where (country is null or btrim(country) = '')
        and country_code is not null
        and btrim(country_code) <> ''
    $sql$;
  end if;
end
$$;

update public.profiles
set country = 'Bangladesh'
where country is null or btrim(country) = '';

alter table public.profiles
  alter column country set default 'Bangladesh';

alter table public.profiles
  alter column country set not null;

comment on column public.profiles.country is
  'Canonical display country retained alongside legacy country_code/country_name columns when present.';
