-- Shared private profile fields for customers, employees and administrators.

alter table public.profiles
  add column if not exists cover_path text,
  add column if not exists bio text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists pronouns text,
  add column if not exists alternate_phone text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists job_title text,
  add column if not exists department text,
  add column if not exists professional_summary text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text;

alter table public.profiles
  drop constraint if exists profiles_gender_check,
  add constraint profiles_gender_check
    check (gender is null or gender in ('female','male','non_binary','prefer_not_to_say')),
  drop constraint if exists profiles_social_links_object_check,
  add constraint profiles_social_links_object_check
    check (jsonb_typeof(social_links) = 'object'),
  drop constraint if exists profiles_profile_field_lengths_check,
  add constraint profiles_profile_field_lengths_check check (
    char_length(coalesce(bio,'')) <= 500 and
    char_length(coalesce(pronouns,'')) <= 60 and
    char_length(coalesce(alternate_phone,'')) <= 60 and
    char_length(coalesce(address_line,'')) <= 300 and
    char_length(coalesce(city,'')) <= 120 and
    char_length(coalesce(region,'')) <= 120 and
    char_length(coalesce(postal_code,'')) <= 30 and
    char_length(coalesce(job_title,'')) <= 160 and
    char_length(coalesce(department,'')) <= 160 and
    char_length(coalesce(professional_summary,'')) <= 1000 and
    char_length(coalesce(emergency_contact_name,'')) <= 160 and
    char_length(coalesce(emergency_contact_relationship,'')) <= 100 and
    char_length(coalesce(emergency_contact_phone,'')) <= 60
  );
