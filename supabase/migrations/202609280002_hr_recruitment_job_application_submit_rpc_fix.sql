create or replace function public.submit_hr_recruitment_job_application(requested_application_id uuid,requested_profile_id uuid,requested_confirmed boolean)
returns text language plpgsql security definer set search_path=public as $$
declare app public.hr_recruitment_job_applications%rowtype; sequence_value integer; v_application_year integer:=extract(year from current_date)::integer; generated text;
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
  insert into public.hr_recruitment_job_number_sequences(application_year,last_number) values(v_application_year,1) on conflict(application_year) do update set last_number=public.hr_recruitment_job_number_sequences.last_number+1 returning last_number into sequence_value;
  generated:=format('JOB-%s-%s',v_application_year,lpad(sequence_value::text,4,'0'));
  update public.hr_recruitment_job_applications set status='SUBMITTED',application_number=generated,information_confirmed=true,submitted_at=now(),updated_at=now() where id=app.id and status='DRAFT';
  return generated;
end $$;

revoke all on function public.submit_hr_recruitment_job_application(uuid,uuid,boolean) from public;
grant execute on function public.submit_hr_recruitment_job_application(uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
