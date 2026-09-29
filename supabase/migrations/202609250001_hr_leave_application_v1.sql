-- Standalone HR Leave V1 application and signed-copy metadata only.
create sequence if not exists public.hr_leave_application_number_seq;

create or replace function public.next_hr_leave_application_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'LV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.hr_leave_application_number_seq')::text,4,'0')
$$;

alter table public.hr_leave_requests
  add column if not exists application_number text,
  add column if not exists contact_number text,
  add column if not exists leave_location text,
  add column if not exists additional_note text,
  add column if not exists signed_storage_path text,
  add column if not exists signed_file_name text,
  add column if not exists signed_mime_type text,
  add column if not exists signed_size_bytes bigint,
  add column if not exists signed_uploaded_at timestamptz;

alter table public.hr_leave_requests
  alter column application_number set default public.next_hr_leave_application_number();

update public.hr_leave_requests
set application_number = public.next_hr_leave_application_number()
where application_number is null;

alter table public.hr_leave_requests
  alter column application_number set not null,
  drop constraint if exists hr_leave_requests_leave_type_check,
  add constraint hr_leave_requests_leave_type_check check (leave_type in ('annual','casual','sick','emergency','unpaid','parental','other')),
  add constraint hr_leave_signed_size_check check (signed_size_bytes is null or signed_size_bytes between 1 and 10485760);

create unique index if not exists hr_leave_application_number_uidx
  on public.hr_leave_requests(application_number);

insert into public.hr_leave_types(code,name,default_days,is_paid,requires_document,is_active)
values
  ('CASUAL','Casual',0,true,false,true),
  ('EMERGENCY','Emergency',0,true,false,true)
on conflict(code) do update set name=excluded.name,is_active=true;

revoke all on function public.next_hr_leave_application_number() from public,anon,authenticated;
grant execute on function public.next_hr_leave_application_number() to service_role;
revoke all on sequence public.hr_leave_application_number_seq from public,anon,authenticated;
grant usage,select on sequence public.hr_leave_application_number_seq to service_role;
