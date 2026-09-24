begin;

alter table public.hr_employee_profiles
  add column if not exists father_name text,
  add column if not exists mother_name text;

commit;
