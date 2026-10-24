begin;

-- Retain the existing freeze. Only the trusted, account-scoped amendment below
-- may change due_date, never installment identity, amount, order or provenance.
create or replace function public.protect_receivable_installment_schedule()
returns trigger language plpgsql set search_path='' as $$
declare account_status text;
begin
  select account.status into account_status from public.receivable_accounts account
    where account.id=coalesce(new.receivable_account_id,old.receivable_account_id);
  if account_status not in ('requested','under_review') then
    if tg_op='UPDATE' and account_status='approved'
      and current_setting('app.employee_loan_start_date_account',true)=old.receivable_account_id::text
      and (to_jsonb(new)-'due_date')=(to_jsonb(old)-'due_date')
      and exists(select 1 from public.receivable_employee_loan_details detail
        where detail.receivable_account_id=old.receivable_account_id and detail.final_approved_at is null)
      and not exists(select 1 from public.receivable_loan_documents document
        where document.receivable_account_id=old.receivable_account_id and document.document_type='signed_agreement')
      and not exists(select 1 from public.receivable_transactions movement
        where movement.receivable_account_id=old.receivable_account_id)
    then return new; end if;
    raise exception 'Approved installment schedules are immutable';
  end if;
  return coalesce(new,old);
end $$;

create function public.edit_employee_loan_start_date(
  actor_profile_id uuid, requested_account_id uuid,
  requested_start_date date, requested_expected_version bigint
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare detail public.receivable_employee_loan_details%rowtype;
declare old_dates jsonb;
declare previous_context text;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_account_id is null then raise exception 'Loan ID is required'; end if;
  if requested_start_date is null or not isfinite(requested_start_date)
    or requested_start_date<timezone('Asia/Dhaka',now())::date
    or requested_start_date>'9999-12-31'::date then
    raise exception 'Choose a valid start date today or later';
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null or account.category<>'employee_loan' or account.borrower_type<>'employee' or account.is_opening_balance then
    raise exception 'Employee loan application not found';
  end if;
  select * into detail from public.receivable_employee_loan_details where receivable_account_id=account.id for update;
  if detail.receivable_account_id is null then raise exception 'Employee loan application details are required'; end if;
  if requested_expected_version is null or requested_expected_version<1 or account.version<>requested_expected_version then
    raise exception 'This loan changed. Refresh the page before saving';
  end if;
  if exists(select 1 from public.receivable_transactions where receivable_account_id=account.id)
    or exists(select 1 from public.payroll_receivable_deductions where receivable_account_id=account.id and status<>'voided') then
    raise exception 'This loan has processed financial activity or a payroll deduction plan; its start date is locked';
  end if;
  if account.status not in ('requested','under_review','approved') or account.disbursement_date is not null
    or detail.final_approved_at is not null or detail.workflow_stage in ('final_approved','disbursed','rejected','cancelled')
    or exists(select 1 from public.receivable_loan_documents where receivable_account_id=account.id and document_type='signed_agreement') then
    raise exception 'Signed, disbursed or closed loans cannot be amended in Start Date Edit V1';
  end if;
  if exists(select 1 from public.hr_payroll_records payroll
    where payroll.employee_record_id=account.employee_record_id and payroll.status<>'cancelled'
      and payroll.period_end>=least(coalesce(account.first_due_date,detail.preferred_start_date),requested_start_date)) then
    raise exception 'An affected payroll period already exists. Resolve the payroll through its existing workflow before changing this date';
  end if;
  perform 1 from public.receivable_installments where receivable_account_id=account.id order by installment_number for update;
  if account.status='approved' then
    if account.installment_count is null or account.first_due_date is null or account.approved_amount is null
      or account.installment_count is distinct from detail.approved_installment_count
      or account.installment_amount is distinct from detail.approved_monthly_installment
      or account.first_due_date is distinct from detail.approved_start_date
      or (select count(*) from public.receivable_installments where receivable_account_id=account.id)<>account.installment_count
      or (select coalesce(sum(amount_due),0) from public.receivable_installments where receivable_account_id=account.id)<>account.approved_amount
      or exists(select 1 from public.receivable_installments installment where installment.receivable_account_id=account.id
        and (installment.installment_number not between 1 and account.installment_count
          or installment.due_date<>(account.first_due_date+make_interval(months=>installment.installment_number-1))::date)) then
      raise exception 'The approved installment schedule is inconsistent; no dates were changed';
    end if;
    if (requested_start_date+make_interval(months=>account.installment_count-1))::date>'9999-12-31'::date then
      raise exception 'Choose a start date that keeps all installments within the supported calendar';
    end if;
  elsif account.installment_count is not null or exists(select 1 from public.receivable_installments where receivable_account_id=account.id) then
    raise exception 'Unexpected pending installment schedule; no dates were changed';
  end if;
  if detail.preferred_start_date=requested_start_date and account.first_due_date=requested_start_date
    and (account.status<>'approved' or detail.approved_start_date=requested_start_date) then return account.id; end if;
  old_dates:=jsonb_build_object('preferred_start_date',detail.preferred_start_date,'approved_start_date',detail.approved_start_date,
    'first_due_date',account.first_due_date,'final_due_date',account.final_due_date);
  if account.status='approved' then
    previous_context:=coalesce(current_setting('app.employee_loan_start_date_account',true),'');
    perform set_config('app.employee_loan_start_date_account',account.id::text,true);
    update public.receivable_installments installment
      set due_date=(requested_start_date+make_interval(months=>installment.installment_number-1))::date
      where installment.receivable_account_id=account.id;
    perform set_config('app.employee_loan_start_date_account',previous_context,true);
  end if;
  update public.receivable_accounts set first_due_date=requested_start_date,
    final_due_date=case when account.status='approved' then
      (select max(due_date) from public.receivable_installments where receivable_account_id=account.id)
      else account.final_due_date end,updated_by=actor_profile_id where id=account.id;
  update public.receivable_employee_loan_details set preferred_start_date=requested_start_date,
    approved_start_date=case when account.status='approved' then requested_start_date else detail.approved_start_date end,
    updated_at=now() where receivable_account_id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values,metadata)
  values(actor_profile_id,'admin','receivable.employee_loan_start_date_updated','receivables','receivable_account',account.id::text,
    'Admin amended the unsigned loan start date and unprocessed installment dates only; review agreement before signing.',old_dates,
    jsonb_build_object('preferred_start_date',requested_start_date,
      'approved_start_date',case when account.status='approved' then requested_start_date else detail.approved_start_date end,
      'first_due_date',requested_start_date,
      'final_due_date',(select final_due_date from public.receivable_accounts where id=account.id)),
    jsonb_build_object('previous_version',account.version,'installment_ids_and_amounts_preserved',true,'agreement_review_required',account.status='approved'));
  return account.id;
end $$;

revoke all on function public.edit_employee_loan_start_date(uuid,uuid,date,bigint) from public,anon,authenticated;
grant execute on function public.edit_employee_loan_start_date(uuid,uuid,date,bigint) to service_role;
select pg_notify('pgrst','reload schema');
commit;
