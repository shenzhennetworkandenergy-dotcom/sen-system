begin;

-- Employee self-service extends the existing Receivables account. It does not
-- create another loan master or any Accounting, Cash Book, Payroll, or Sales row.
create table if not exists public.receivable_employee_loan_consents (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_record_id uuid not null references public.hr_employee_records(id) on delete restrict,
  consent_version text not null,
  consent_items jsonb not null check(jsonb_typeof(consent_items)='array'),
  accepted_at timestamptz not null default now(),
  used_at timestamptz,
  used_by_account_id uuid references public.receivable_accounts(id) on delete restrict
);

create index if not exists receivable_employee_loan_consents_owner_idx
  on public.receivable_employee_loan_consents(employee_record_id,accepted_at desc);

create table if not exists public.receivable_employee_loan_details (
  receivable_account_id uuid primary key references public.receivable_accounts(id) on delete restrict,
  employee_profile_id uuid not null references public.profiles(id) on delete restrict,
  consent_id uuid not null unique references public.receivable_employee_loan_consents(id) on delete restrict,
  purpose text check(purpose is null or char_length(trim(purpose)) between 1 and 500),
  requested_repayment_period text not null check(char_length(trim(requested_repayment_period)) between 2 and 120),
  proposed_months integer not null check(proposed_months between 0 and 120),
  proposed_days integer not null default 0 check(proposed_days>=0),
  installment_frequency text not null default 'monthly' check(installment_frequency in ('monthly','weekly','daily')),
  proposed_monthly_installment numeric(18,4) not null check(proposed_monthly_installment>0 and proposed_monthly_installment=trunc(proposed_monthly_installment)),
  preferred_start_date date not null,
  detailed_explanation text not null check(char_length(trim(detailed_explanation)) between 10 and 4000),
  employee_note text,
  witnesses jsonb not null default '[]'::jsonb check(jsonb_typeof(witnesses)='array'),
  workflow_stage text not null default 'submitted' check(workflow_stage in (
    'submitted','under_review','agreement_ready','agreement_sent','signed_submitted',
    'final_review','final_approved','disbursed','rejected','cancelled'
  )),
  approved_repayment_period text,
  approved_installment_count integer check(approved_installment_count is null or approved_installment_count between 1 and 120),
  approved_monthly_installment numeric(18,4) check(approved_monthly_installment is null or approved_monthly_installment>0),
  approved_start_date date,
  approved_purpose text,
  special_terms text,
  admin_note text,
  agreement_reference text unique,
  agreement_date date,
  agreement_generated_at timestamptz,
  agreement_generated_by uuid references public.profiles(id) on delete set null,
  agreement_sent_at timestamptz,
  agreement_sent_by uuid references public.profiles(id) on delete set null,
  final_approved_at timestamptz,
  final_approved_by uuid references public.profiles(id) on delete set null,
  payment_method text,
  payment_reference text,
  payment_account_reference text,
  disbursement_admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.receivable_employee_loan_details alter column purpose drop not null;
alter table public.receivable_employee_loan_details add column if not exists proposed_days integer not null default 0;
alter table public.receivable_employee_loan_details add column if not exists installment_frequency text not null default 'monthly';
alter table public.receivable_employee_loan_details add column if not exists witnesses jsonb not null default '[]'::jsonb;
alter table public.receivable_employee_loan_details
  add column if not exists selected_sen_representative_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists selected_sen_representative_name_snapshot text,
  add column if not exists selected_sen_representative_designation_snapshot text,
  add column if not exists selected_sen_representative_email_snapshot text;
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_purpose_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_purpose_check
  check(purpose is null or char_length(trim(purpose)) between 1 and 500);
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_proposed_months_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_proposed_months_check
  check(proposed_months between 0 and 120);
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_proposed_days_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_proposed_days_check
  check(proposed_days>=0);
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_duration_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_duration_check
  check(proposed_months>0 or proposed_days>0) not valid;
alter table public.receivable_employee_loan_details validate constraint receivable_employee_loan_details_duration_check;
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_installment_frequency_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_installment_frequency_check
  check(installment_frequency in ('monthly','weekly','daily'));
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_proposed_monthly_installment_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_proposed_monthly_installment_check
  check(proposed_monthly_installment>0 and proposed_monthly_installment=trunc(proposed_monthly_installment));
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_witnesses_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_witnesses_check
  check(jsonb_typeof(witnesses)='array');
alter table public.receivable_employee_loan_details drop constraint if exists receivable_employee_loan_details_representative_snapshot_check;
alter table public.receivable_employee_loan_details add constraint receivable_employee_loan_details_representative_snapshot_check
  check(selected_sen_representative_user_id is null
    or nullif(trim(selected_sen_representative_name_snapshot),'') is not null);

create index if not exists receivable_employee_loan_details_owner_idx
  on public.receivable_employee_loan_details(employee_profile_id,created_at desc);
create index if not exists receivable_employee_loan_details_stage_idx
  on public.receivable_employee_loan_details(workflow_stage,updated_at desc);

create table if not exists public.receivable_loan_documents (
  id uuid primary key default gen_random_uuid(),
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  employee_profile_id uuid not null references public.profiles(id) on delete restrict,
  document_type text not null check(document_type in ('signed_agreement','disbursement_proof')),
  document_status text not null default 'submitted' check(document_status in ('submitted','verified','rejected')),
  storage_bucket text not null default 'receivables-private' check(storage_bucket='receivables-private'),
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size bigint not null check(file_size>0 and file_size<=10485760),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz
);

create index if not exists receivable_loan_documents_account_idx
  on public.receivable_loan_documents(receivable_account_id,document_type,uploaded_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receivables-private','receivables-private',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.receivable_employee_loan_consents enable row level security;
alter table public.receivable_employee_loan_details enable row level security;
alter table public.receivable_loan_documents enable row level security;
revoke all on public.receivable_employee_loan_consents,public.receivable_employee_loan_details,
  public.receivable_loan_documents from public,anon,authenticated;
grant all on public.receivable_employee_loan_consents,public.receivable_employee_loan_details,
  public.receivable_loan_documents to service_role;

drop function if exists public.create_employee_loan_application(uuid,uuid,uuid,numeric,text,text,integer,numeric,date,text,text);
drop function if exists public.finalize_employee_loan_terms(uuid,uuid,numeric,text,integer,numeric,date,text,text,text,date,text);

create or replace function public.create_employee_loan_application(
  actor_profile_id uuid, requested_consent_id uuid, requested_operation_id uuid,
  requested_amount numeric, requested_purpose text, requested_months integer, requested_days integer,
  requested_installment_frequency text, requested_installment numeric, requested_start_date date,
  requested_explanation text, requested_employee_note text, requested_witnesses jsonb
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare actor public.profiles%rowtype;
declare employee public.hr_employee_records%rowtype;
declare consent public.receivable_employee_loan_consents%rowtype;
declare account_id uuid;
declare operation_hash text;
begin
  select * into actor from public.profiles where id=actor_profile_id and role='employee' and status='active' and archived_at is null;
  if actor.id is null then raise exception 'An active employee login is required'; end if;
  select * into employee from public.hr_employee_records
    where profile_id=actor.id and archived_at is null and employment_status in ('active','probation','on_leave');
  if employee.id is null then raise exception 'An active employee record is required'; end if;
  select * into consent from public.receivable_employee_loan_consents
    where id=requested_consent_id and employee_profile_id=actor.id and employee_record_id=employee.id
      and consent_version='employee-loan-terms-bn-v3'
      and consent_items @> '["term_01","term_02","term_03","term_04","term_05","term_06","term_07","term_08","term_09","term_10","term_11","term_12","term_13","term_14","final_guidance","final_repayment","final_authoritative_terms","final_salary_deduction","final_accuracy","final_no_guarantee","final_witness"]'::jsonb
      and used_at is null for update;
  if consent.id is null then raise exception 'Accepted loan guidance is required'; end if;
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  if coalesce(requested_amount,0)<=0 or requested_amount<>trunc(requested_amount)
    or requested_months is null or requested_months not between 0 and 120
    or requested_days is null or requested_days<0 or (requested_months=0 and requested_days=0)
    or requested_installment_frequency is null
    or requested_installment_frequency not in ('monthly','weekly','daily')
    or coalesce(requested_installment,0)<=0 or requested_installment<>trunc(requested_installment) then
    raise exception 'Loan amount and repayment proposal are invalid';
  end if;
  if nullif(trim(coalesce(requested_purpose,'')),'') is not null and char_length(trim(requested_purpose))>500 then
    raise exception 'Loan purpose exceeds the allowed length';
  end if;
  if requested_witnesses is null or jsonb_typeof(requested_witnesses)<>'array' or jsonb_array_length(requested_witnesses)<3
    or jsonb_array_length(requested_witnesses)>20
    or exists(
      select 1 from jsonb_array_elements(requested_witnesses) witness
      where jsonb_typeof(witness)<>'object'
        or nullif(trim(witness->>'name'),'') is null or char_length(trim(witness->>'name'))>160
        or nullif(trim(witness->>'address'),'') is null or char_length(trim(witness->>'address'))>500
        or nullif(trim(witness->>'phone'),'') is null or char_length(trim(witness->>'phone'))>50
    ) then raise exception 'At least three valid witnesses are required'; end if;
  if requested_start_date is null then raise exception 'Preferred repayment start date is required'; end if;
  operation_hash:=md5(jsonb_build_object('employee',employee.id,'amount',requested_amount,
    'purpose',nullif(trim(coalesce(requested_purpose,'')),''),'months',requested_months,'days',requested_days,
    'frequency',requested_installment_frequency,'installment',requested_installment,'witnesses',requested_witnesses,
    'start',requested_start_date,'consent',consent.id)::text);
  select id into account_id from public.receivable_accounts where operation_id=requested_operation_id;
  if account_id is not null then return account_id; end if;
  account_id:=gen_random_uuid();
  insert into public.receivable_accounts(
    id,receivable_number,category,borrower_type,employee_record_id,borrower_display_name_snapshot,
    currency,requested_amount,original_amount,default_repayment_method,installment_count,
    installment_amount,first_due_date,status,notes,is_opening_balance,operation_id,operation_hash,created_by,updated_by
  ) values(
    account_id,public.next_receivable_number(),'employee_loan','employee',employee.id,
    coalesce(nullif(trim(actor.full_name),''),employee.employee_number),'BDT',requested_amount,requested_amount,
    null,null,null,requested_start_date,'requested',
    nullif(left(trim(coalesce(requested_purpose,'')),500),''),false,requested_operation_id,operation_hash,actor.id,actor.id
  );
  insert into public.receivable_employee_loan_details(
    receivable_account_id,employee_profile_id,consent_id,purpose,requested_repayment_period,
    proposed_months,proposed_days,installment_frequency,proposed_monthly_installment,
    preferred_start_date,detailed_explanation,employee_note,witnesses
  ) values(account_id,actor.id,consent.id,nullif(left(trim(coalesce(requested_purpose,'')),500),''),
    concat(requested_months,' month(s), ',requested_days,' day(s)'),requested_months,requested_days,
    requested_installment_frequency,requested_installment,requested_start_date,left(trim(requested_explanation),4000),
    nullif(left(trim(requested_employee_note),2000),''),requested_witnesses);
  update public.receivable_employee_loan_consents set used_at=now(),used_by_account_id=account_id where id=consent.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(actor.id,actor.role,'receivable.employee_loan_submitted','receivables','receivable_account',account_id::text,
    'Employee loan application submitted without a financial balance movement.',
    jsonb_build_object('status','requested','employee_record_id',employee.id),
    jsonb_build_object('consent_id',consent.id,'consent_version',consent.consent_version,'operation_id',requested_operation_id));
  return account_id;
end $$;

create or replace function public.finalize_employee_loan_terms(
  actor_profile_id uuid, requested_account_id uuid, requested_approved_amount numeric,
  requested_period text, requested_installment_count integer, requested_installment_amount numeric,
  requested_start_date date, requested_purpose text, requested_special_terms text,
  requested_admin_note text, requested_agreement_date date, requested_agreement_reference text,
  requested_representative_profile_id uuid
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare representative public.profiles%rowtype;
declare representative_employee public.hr_employee_records%rowtype;
declare representative_designation text;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.approve');
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null or account.category<>'employee_loan' then raise exception 'Employee loan application not found'; end if;
  if account.status not in ('requested','under_review') then raise exception 'Only a pending employee loan can be preliminarily approved'; end if;
  if not exists(select 1 from public.receivable_employee_loan_details where receivable_account_id=account.id) then
    raise exception 'Employee loan application details are required';
  end if;
  if coalesce(requested_approved_amount,0)<=0 or requested_installment_count not between 1 and 120
    or coalesce(requested_installment_amount,0)<=0 or requested_start_date is null then raise exception 'Approved terms are invalid'; end if;
  select * into representative from public.profiles
    where id=requested_representative_profile_id and role='admin' and status='active' and archived_at is null;
  if representative.id is null then raise exception 'Choose an active administrator as the SEN representative'; end if;
  select * into representative_employee from public.hr_employee_records
    where profile_id=representative.id and archived_at is null limit 1;
  select coalesce(representative_employee.job_title, designation.name, representative.job_title) into representative_designation
    from public.hr_designations designation where designation.id=representative_employee.designation_id;
  perform public.rebuild_receivable_installments(account.id,round(requested_approved_amount,4),requested_installment_count,
    round(requested_installment_amount,4),requested_start_date,actor_profile_id);
  update public.receivable_accounts set approved_amount=round(requested_approved_amount,4),
    installment_count=requested_installment_count,installment_amount=round(requested_installment_amount,4),
    first_due_date=requested_start_date,final_due_date=(select max(due_date) from public.receivable_installments where receivable_account_id=account.id),
    approved_by=actor_profile_id,approved_at=now(),status='approved',updated_by=actor_profile_id where id=account.id;
  update public.receivable_employee_loan_details set workflow_stage='agreement_ready',
    approved_repayment_period=left(trim(requested_period),120),approved_installment_count=requested_installment_count,
    approved_monthly_installment=round(requested_installment_amount,4),approved_start_date=requested_start_date,
    approved_purpose=left(trim(requested_purpose),500),special_terms=left(trim(requested_special_terms),4000),
    admin_note=nullif(left(trim(requested_admin_note),2000),''),agreement_reference=left(trim(requested_agreement_reference),100),
    selected_sen_representative_user_id=representative.id,
    selected_sen_representative_name_snapshot=left(trim(coalesce(representative.full_name,representative.email)),200),
    selected_sen_representative_designation_snapshot=nullif(left(trim(coalesce(representative_designation,'')),160),''),
    selected_sen_representative_email_snapshot=nullif(left(trim(coalesce(representative.email,'')),200),''),
    agreement_date=requested_agreement_date,agreement_generated_at=now(),agreement_generated_by=actor_profile_id,updated_at=now()
    where receivable_account_id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,(select role from public.profiles where id=actor_profile_id),'receivable.employee_loan_preliminary_approved',
    'receivables','receivable_account',account.id::text,'Employee loan terms finalized and agreement generated.',
    jsonb_build_object('status','approved','workflow_stage','agreement_ready','approved_amount',round(requested_approved_amount,4)));
  return account.id;
end $$;

create or replace function public.send_employee_loan_agreement(actor_profile_id uuid,requested_account_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.approve');
  update public.receivable_employee_loan_details set workflow_stage='agreement_sent',agreement_sent_at=now(),
    agreement_sent_by=actor_profile_id,updated_at=now()
  where receivable_account_id=requested_account_id and workflow_stage='agreement_ready' and agreement_generated_at is not null;
  if not found then raise exception 'A generated agreement is required before sending'; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,(select role from public.profiles where id=actor_profile_id),'receivable.employee_loan_agreement_sent',
    'receivables','receivable_account',requested_account_id::text,'Employee loan agreement sent to employee.',jsonb_build_object('workflow_stage','agreement_sent'));
  return requested_account_id;
end $$;

create or replace function public.record_employee_loan_document(
  actor_profile_id uuid, requested_account_id uuid, requested_document_type text,
  requested_storage_path text, requested_original_name text, requested_mime_type text, requested_file_size bigint
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare detail public.receivable_employee_loan_details%rowtype;
declare document_id uuid:=gen_random_uuid();
declare employee_owned boolean;
declare admin_allowed boolean;
begin
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  select * into detail from public.receivable_employee_loan_details where receivable_account_id=requested_account_id for update;
  if account.id is null or detail.receivable_account_id is null then raise exception 'Employee loan application not found'; end if;
  employee_owned:=detail.employee_profile_id=actor_profile_id;
  admin_allowed:=exists(select 1 from public.effective_permissions_for_profile(actor_profile_id) where permission_key in ('receivables.approve','receivables.disburse'));
  if requested_document_type='signed_agreement' then
    if not employee_owned or detail.agreement_sent_at is null or account.status<>'approved' then raise exception 'Only the owning employee may upload a sent signed agreement'; end if;
  elsif requested_document_type='disbursement_proof' then
    if not admin_allowed then raise exception 'Receivables disbursement permission is required'; end if;
  else raise exception 'Unsupported loan document type'; end if;
  if requested_mime_type not in ('application/pdf','image/jpeg','image/png') or requested_file_size<=0 or requested_file_size>10485760 then
    raise exception 'Invalid private loan document';
  end if;
  insert into public.receivable_loan_documents(id,receivable_account_id,employee_profile_id,document_type,
    storage_path,original_file_name,mime_type,file_size,uploaded_by)
  values(document_id,account.id,detail.employee_profile_id,requested_document_type,left(requested_storage_path,500),
    left(requested_original_name,200),requested_mime_type,requested_file_size,actor_profile_id);
  if requested_document_type='signed_agreement' then
    update public.receivable_employee_loan_details set workflow_stage='signed_submitted',updated_at=now() where receivable_account_id=account.id;
  end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,(select role from public.profiles where id=actor_profile_id),'receivable.employee_loan_document_uploaded',
    'receivables','receivable_loan_document',document_id::text,'Private employee loan document uploaded.',
    jsonb_build_object('account_id',account.id,'document_type',requested_document_type));
  return document_id;
end $$;

create or replace function public.final_approve_employee_loan(actor_profile_id uuid,requested_account_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare detail public.receivable_employee_loan_details%rowtype;
declare account public.receivable_accounts%rowtype;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.approve');
  select * into detail from public.receivable_employee_loan_details where receivable_account_id=requested_account_id for update;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null or account.status<>'approved' or detail.receivable_account_id is null or detail.agreement_generated_at is null or detail.agreement_sent_at is null then
    raise exception 'Generated and sent agreement is required before final approval';
  end if;
  if not exists(select 1 from public.receivable_loan_documents where receivable_account_id=requested_account_id and document_type='signed_agreement' and document_status in ('submitted','verified')) then
    raise exception 'Signed agreement is required before final approval';
  end if;
  update public.receivable_loan_documents set document_status='verified',verified_by=actor_profile_id,verified_at=now()
    where receivable_account_id=requested_account_id and document_type='signed_agreement' and document_status='submitted';
  update public.receivable_employee_loan_details set workflow_stage='final_approved',final_approved_at=now(),
    final_approved_by=actor_profile_id,updated_at=now() where receivable_account_id=requested_account_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
  values(actor_profile_id,(select role from public.profiles where id=actor_profile_id),'receivable.employee_loan_final_approved',
    'receivables','receivable_account',requested_account_id::text,'Signed employee loan agreement verified; loan final-approved for disbursement.',
    jsonb_build_object('workflow_stage','final_approved'));
  return requested_account_id;
end $$;

create or replace function public.protect_employee_loan_activation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status in ('disbursed','active') and old.status not in ('disbursed','active')
    and exists(select 1 from public.receivable_employee_loan_details where receivable_account_id=new.id) then
    if current_setting('app.employee_loan_disbursement_account',true) is distinct from new.id::text
      or not exists(select 1 from public.receivable_employee_loan_details detail
      where detail.receivable_account_id=new.id and detail.final_approved_at is not null
      and detail.agreement_sent_at is not null and detail.workflow_stage='final_approved')
      or not exists(select 1 from public.receivable_loan_documents document
        where document.receivable_account_id=new.id and document.document_type='signed_agreement' and document.document_status='verified') then
      raise exception 'Signed agreement is required before loan activation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists receivable_employee_loan_activation_gate on public.receivable_accounts;
create trigger receivable_employee_loan_activation_gate
before update of status on public.receivable_accounts
for each row execute function public.protect_employee_loan_activation();

create or replace function public.confirm_employee_loan_disbursement(
  actor_profile_id uuid,requested_account_id uuid,requested_operation_id uuid,requested_amount numeric,
  requested_effective_date date,requested_payment_method text,requested_payment_reference text,
  requested_account_reference text,requested_admin_note text,requested_proof_path text,
  requested_proof_name text,requested_proof_mime text,requested_proof_size bigint
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare transaction_id uuid;
declare detail public.receivable_employee_loan_details%rowtype;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.disburse');
  select * into detail from public.receivable_employee_loan_details where receivable_account_id=requested_account_id for update;
  if detail.receivable_account_id is null or detail.workflow_stage<>'final_approved' or detail.final_approved_at is null then
    raise exception 'Final-approved signed agreement is required before disbursement';
  end if;
  if char_length(coalesce(trim(requested_payment_reference),''))<2 then raise exception 'Payment reference is required'; end if;
  perform set_config('app.employee_loan_disbursement_account',requested_account_id::text,true);
  transaction_id:=public.confirm_receivable_disbursement(actor_profile_id,requested_account_id,requested_operation_id,
    requested_amount,requested_effective_date,requested_payment_method,requested_admin_note);
  update public.receivable_employee_loan_details set workflow_stage='disbursed',payment_method=requested_payment_method,
    payment_reference=left(trim(requested_payment_reference),200),payment_account_reference=nullif(left(trim(requested_account_reference),200),''),
    disbursement_admin_note=nullif(left(trim(requested_admin_note),2000),''),updated_at=now()
    where receivable_account_id=requested_account_id;
  if requested_proof_path is not null then
    insert into public.receivable_loan_documents(receivable_account_id,employee_profile_id,document_type,document_status,
      storage_path,original_file_name,mime_type,file_size,uploaded_by,verified_by,verified_at)
    values(requested_account_id,detail.employee_profile_id,'disbursement_proof','verified',requested_proof_path,
      left(requested_proof_name,200),requested_proof_mime,requested_proof_size,actor_profile_id,actor_profile_id,now());
  end if;
  return transaction_id;
end $$;

revoke all on function public.create_employee_loan_application(uuid,uuid,uuid,numeric,text,integer,integer,text,numeric,date,text,text,jsonb),
  public.finalize_employee_loan_terms(uuid,uuid,numeric,text,integer,numeric,date,text,text,text,date,text,uuid),
  public.send_employee_loan_agreement(uuid,uuid),
  public.record_employee_loan_document(uuid,uuid,text,text,text,text,bigint),
  public.final_approve_employee_loan(uuid,uuid),public.protect_employee_loan_activation(),
  public.confirm_employee_loan_disbursement(uuid,uuid,uuid,numeric,date,text,text,text,text,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.create_employee_loan_application(uuid,uuid,uuid,numeric,text,integer,integer,text,numeric,date,text,text,jsonb),
  public.finalize_employee_loan_terms(uuid,uuid,numeric,text,integer,numeric,date,text,text,text,date,text,uuid),
  public.send_employee_loan_agreement(uuid,uuid),
  public.record_employee_loan_document(uuid,uuid,text,text,text,text,bigint),
  public.final_approve_employee_loan(uuid,uuid),
  public.confirm_employee_loan_disbursement(uuid,uuid,uuid,numeric,date,text,text,text,text,text,text,text,bigint)
  to service_role;

commit;
