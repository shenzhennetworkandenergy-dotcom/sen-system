-- Recruitment Job Application V1 only. Existing Recruitment Terms migrations remain immutable.
create table public.hr_recruitment_job_applications (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null unique references public.hr_recruitment_processes(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED')),
  application_number text unique,
  full_name text, father_name text, mother_name text, date_of_birth date,
  gender text, marital_status text, nationality text, phone text, email text,
  present_address text, permanent_address text,
  emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text,
  spouse_name text, spouse_contact_number text,
  nid_number text, passport_number text, passport_expiry_date date,
  position_applied_for text, preferred_joining_date date, employment_status text,
  current_employer text, current_designation text,
  expected_salary numeric(14,2), salary_currency text not null default 'BDT',
  introduction text, has_experience boolean, has_qualification boolean,
  information_confirmed boolean not null default false,
  submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(profile_id)
);

create table public.hr_recruitment_job_education (
  id uuid primary key, application_id uuid not null references public.hr_recruitment_job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  degree text, institution text, subject text, result text, completion_year integer,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.hr_recruitment_job_experience (
  id uuid primary key, application_id uuid not null references public.hr_recruitment_job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  company text, designation text, from_date date, to_date date, currently_working boolean not null default false,
  responsibilities text, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.hr_recruitment_job_qualifications (
  id uuid primary key, application_id uuid not null references public.hr_recruitment_job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  qualification_name text, institution text, subject text, completion_year integer, details text,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.hr_recruitment_job_skills (
  id uuid primary key, application_id uuid not null references public.hr_recruitment_job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  skill_name text, proficiency text check (proficiency is null or proficiency in ('Basic','Intermediate','Advanced','Expert')),
  details text, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.hr_recruitment_job_documents (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.hr_recruitment_job_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  document_type text not null check (document_type in ('photograph','cv','nid_copy','passport_copy','education_certificate','experience_certificate','qualification_certificate','other')),
  related_record_id uuid, title text not null, storage_path text not null unique,
  original_name text not null, mime_type text not null, size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create table public.hr_recruitment_job_number_sequences (
  application_year integer primary key, last_number integer not null check (last_number > 0)
);

create index hr_recruitment_job_education_application_idx on public.hr_recruitment_job_education(application_id,sort_order);
create index hr_recruitment_job_experience_application_idx on public.hr_recruitment_job_experience(application_id,sort_order);
create index hr_recruitment_job_qualification_application_idx on public.hr_recruitment_job_qualifications(application_id,sort_order);
create index hr_recruitment_job_skills_application_idx on public.hr_recruitment_job_skills(application_id,sort_order);
create index hr_recruitment_job_documents_application_idx on public.hr_recruitment_job_documents(application_id,document_type);
create unique index hr_recruitment_job_documents_single_owner_idx on public.hr_recruitment_job_documents(application_id,document_type,related_record_id) nulls not distinct where document_type<>'other';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hr-recruitment-documents','hr-recruitment-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

alter table public.hr_recruitment_job_applications enable row level security;
alter table public.hr_recruitment_job_education enable row level security;
alter table public.hr_recruitment_job_experience enable row level security;
alter table public.hr_recruitment_job_qualifications enable row level security;
alter table public.hr_recruitment_job_skills enable row level security;
alter table public.hr_recruitment_job_documents enable row level security;
alter table public.hr_recruitment_job_number_sequences enable row level security;

create policy "employee reads own recruitment job application" on public.hr_recruitment_job_applications for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment education" on public.hr_recruitment_job_education for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment experience" on public.hr_recruitment_job_experience for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment qualifications" on public.hr_recruitment_job_qualifications for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment skills" on public.hr_recruitment_job_skills for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment document metadata" on public.hr_recruitment_job_documents for select to authenticated
using (profile_id=auth.uid() and public.current_user_has_permission('hr.access_recruitment'));
create policy "employee reads own recruitment storage objects" on storage.objects for select to authenticated
using (bucket_id='hr-recruitment-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.current_user_has_permission('hr.access_recruitment'));

grant select on public.hr_recruitment_job_applications,public.hr_recruitment_job_education,public.hr_recruitment_job_experience,public.hr_recruitment_job_qualifications,public.hr_recruitment_job_skills,public.hr_recruitment_job_documents to authenticated;
grant all on public.hr_recruitment_job_applications,public.hr_recruitment_job_education,public.hr_recruitment_job_experience,public.hr_recruitment_job_qualifications,public.hr_recruitment_job_skills,public.hr_recruitment_job_documents,public.hr_recruitment_job_number_sequences to service_role;

create or replace function public.submit_hr_recruitment_job_application(requested_application_id uuid,requested_profile_id uuid,requested_confirmed boolean)
returns text language plpgsql security definer set search_path=public as $$
declare app public.hr_recruitment_job_applications%rowtype; sequence_value integer; application_year integer:=extract(year from current_date)::integer; generated text;
begin
  if requested_profile_id<>auth.uid() or not public.current_user_has_permission('hr.access_recruitment') then raise exception 'Recruitment access denied.'; end if;
  select a.* into app from public.hr_recruitment_job_applications a where a.id=requested_application_id and a.profile_id=requested_profile_id for update;
  if app.id is null or app.status<>'DRAFT' then raise exception 'Only your own draft application may be submitted.'; end if;
  if not exists(select 1 from public.hr_recruitment_processes p where p.id=app.process_id and p.profile_id=requested_profile_id and p.terms_version='SEN-RECRUITMENT-LITE-V2' and p.status='terms_completed' and p.current_step=9) then raise exception 'Recruitment Terms V2 must be completed.'; end if;
  if not requested_confirmed then raise exception 'Final confirmation is required.'; end if;
  if nullif(trim(app.full_name),'') is null or nullif(trim(app.father_name),'') is null or nullif(trim(app.mother_name),'') is null or app.date_of_birth is null or app.date_of_birth>current_date or nullif(trim(app.gender),'') is null or nullif(trim(app.marital_status),'') is null or nullif(trim(app.nationality),'') is null or nullif(trim(app.phone),'') is null or nullif(trim(app.email),'') is null or nullif(trim(app.present_address),'') is null or nullif(trim(app.permanent_address),'') is null or nullif(trim(app.emergency_contact_name),'') is null or nullif(trim(app.emergency_contact_phone),'') is null or nullif(trim(app.emergency_contact_relationship),'') is null or nullif(trim(app.nid_number),'') is null or nullif(trim(app.position_applied_for),'') is null or app.preferred_joining_date is null or nullif(trim(app.employment_status),'') is null or length(trim(coalesce(app.introduction,''))) not between 100 and 2000 or app.has_experience is null or app.has_qualification is null then raise exception 'Required application information is incomplete.'; end if;
  if app.marital_status='Married' and (nullif(trim(app.spouse_name),'') is null or nullif(trim(app.spouse_contact_number),'') is null) then raise exception 'Spouse details are required.'; end if;
  if nullif(trim(app.passport_number),'') is not null and app.passport_expiry_date is null then raise exception 'Passport expiry date is required.'; end if;
  if app.employment_status='Employed' and (nullif(trim(app.current_employer),'') is null or nullif(trim(app.current_designation),'') is null) then raise exception 'Current employment details are required.'; end if;
  if not exists(select 1 from public.hr_recruitment_job_education e where e.application_id=app.id) then raise exception 'Education is required.'; end if;
  if exists(select 1 from public.hr_recruitment_job_education e where e.application_id=app.id and (nullif(trim(e.degree),'') is null or nullif(trim(e.institution),'') is null or nullif(trim(e.subject),'') is null or e.completion_year is null or not exists(select 1 from public.hr_recruitment_job_documents d where d.application_id=app.id and d.document_type='education_certificate' and d.related_record_id=e.id))) then raise exception 'Education records are incomplete.'; end if;
  if app.has_experience and not exists(select 1 from public.hr_recruitment_job_experience e where e.application_id=app.id) then raise exception 'Work experience is required.'; end if;
  if exists(select 1 from public.hr_recruitment_job_experience e where e.application_id=app.id and (nullif(trim(e.company),'') is null or nullif(trim(e.designation),'') is null or e.from_date is null or (not e.currently_working and e.to_date is null) or nullif(trim(e.responsibilities),'') is null)) then raise exception 'Work experience records are incomplete.'; end if;
  if app.has_qualification and not exists(select 1 from public.hr_recruitment_job_qualifications q where q.application_id=app.id) then raise exception 'Professional qualification is required.'; end if;
  if exists(select 1 from public.hr_recruitment_job_qualifications q where q.application_id=app.id and (nullif(trim(q.qualification_name),'') is null or nullif(trim(q.institution),'') is null or q.completion_year is null)) then raise exception 'Qualification records are incomplete.'; end if;
  if exists(select 1 from public.hr_recruitment_job_skills s where s.application_id=app.id and nullif(trim(s.skill_name),'') is null) then raise exception 'Skill records are incomplete.'; end if;
  if not exists(select 1 from public.hr_recruitment_job_documents d where d.application_id=app.id and d.document_type='photograph' and d.mime_type in ('image/jpeg','image/png')) or not exists(select 1 from public.hr_recruitment_job_documents d where d.application_id=app.id and d.document_type='cv') or not exists(select 1 from public.hr_recruitment_job_documents d where d.application_id=app.id and d.document_type='nid_copy') then raise exception 'Required documents are incomplete.'; end if;
  if nullif(trim(app.passport_number),'') is not null and not exists(select 1 from public.hr_recruitment_job_documents d where d.application_id=app.id and d.document_type='passport_copy') then raise exception 'Passport copy is required.'; end if;
  insert into public.hr_recruitment_job_number_sequences(application_year,last_number) values(application_year,1) on conflict(application_year) do update set last_number=public.hr_recruitment_job_number_sequences.last_number+1 returning last_number into sequence_value;
  generated:=format('JOB-%s-%s',application_year,lpad(sequence_value::text,4,'0'));
  update public.hr_recruitment_job_applications set status='SUBMITTED',application_number=generated,information_confirmed=true,submitted_at=now(),updated_at=now() where id=app.id and status='DRAFT';
  return generated;
end $$;
revoke all on function public.submit_hr_recruitment_job_application(uuid,uuid,boolean) from public;
grant execute on function public.submit_hr_recruitment_job_application(uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
