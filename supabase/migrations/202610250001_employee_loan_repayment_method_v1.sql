begin;

-- Configuration policy history only. No backfill and no financial ledger.
create table public.employee_loan_repayment_method_changes (
  id uuid primary key default gen_random_uuid(),
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  old_method text check (old_method in ('salary_deduction','cash','bank','mfs','other')),
  new_method text check (new_method in ('salary_deduction','cash','bank','mfs','other')),
  effective_date date not null check (isfinite(effective_date)),
  recorded_at timestamptz not null default now(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  previous_version bigint not null check (previous_version>0),
  resulting_version bigint not null check (resulting_version=previous_version+1),
  operation_id uuid not null unique,
  payload_hash text not null,
  loan_state jsonb not null,
  check (old_method is distinct from new_method),
  unique(receivable_account_id,resulting_version)
);
create index employee_loan_method_as_of on public.employee_loan_repayment_method_changes
  (receivable_account_id,effective_date desc,resulting_version desc);
alter table public.employee_loan_repayment_method_changes enable row level security;
revoke all on public.employee_loan_repayment_method_changes from public,anon,authenticated,service_role;
grant select on public.employee_loan_repayment_method_changes to authenticated,service_role;
create policy employee_loan_method_admin_read on public.employee_loan_repayment_method_changes
  for select to authenticated using (exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin' and p.status='active' and p.archived_at is null));

create function public.guard_employee_loan_method_history_v1() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'Repayment method history is immutable'; end if;
  if current_user<>'postgres' or current_setting('app.employee_loan_method_operation',true) is distinct from new.operation_id::text then
    raise exception 'Use the authorized repayment method workflow';
  end if;
  return new;
end $$;
create trigger employee_loan_method_history_guard before insert or update or delete
  on public.employee_loan_repayment_method_changes for each row execute function public.guard_employee_loan_method_history_v1();

create function public.guard_employee_loan_method_update_v1() returns trigger
language plpgsql set search_path='' as $$
begin
  if (old.category='employee_loan' or new.category='employee_loan')
    and old.default_repayment_method is distinct from new.default_repayment_method then
    if current_user<>'postgres' or not exists(select 1 from public.employee_loan_repayment_method_changes c
      where c.receivable_account_id=old.id and c.previous_version=old.version
        and c.resulting_version=old.version+1
        and c.old_method is not distinct from old.default_repayment_method
        and c.new_method is not distinct from new.default_repayment_method
        and c.actor_id=new.updated_by
        and c.operation_id::text=current_setting('app.employee_loan_method_operation',true))
      or (to_jsonb(new)-array['default_repayment_method','version','updated_at','updated_by']) is distinct from
        (to_jsonb(old)-array['default_repayment_method','version','updated_at','updated_by']) then
      raise exception 'Use the authorized repayment method workflow; other loan terms cannot change';
    end if;
  end if;
  return new;
end $$;
create trigger receivable_employee_loan_method_guard before update on public.receivable_accounts
  for each row execute function public.guard_employee_loan_method_update_v1();

create function public.employee_loan_repayment_method_as_of_v1(requested_account_id uuid, effective_date date)
returns text language plpgsql stable security definer set search_path='' as $$
declare method text; first_change public.employee_loan_repayment_method_changes%rowtype;
begin
  if effective_date is null or not isfinite(effective_date) then raise exception 'A valid effective date is required'; end if;
  select c.new_method into method from public.employee_loan_repayment_method_changes c
    where c.receivable_account_id=requested_account_id and c.effective_date<=employee_loan_repayment_method_as_of_v1.effective_date
    order by c.effective_date desc,c.resulting_version desc limit 1;
  if found then return method; end if;
  select * into first_change from public.employee_loan_repayment_method_changes c
    where c.receivable_account_id=requested_account_id order by c.resulting_version limit 1;
  if found then return first_change.old_method; end if;
  return (select a.default_repayment_method from public.receivable_accounts a where a.id=requested_account_id);
end $$;

create function public.employee_loan_repayment_method_context_v1(actor_profile_id uuid, requested_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_hr_admin(actor_profile_id);
  return (select jsonb_build_object('method',a.default_repayment_method,'version',a.version,
    'effective_date',timezone('Asia/Dhaka',now())::date) from public.receivable_accounts a
    where a.id=requested_account_id and a.category='employee_loan' and a.borrower_type='employee');
end $$;

create function public.edit_employee_loan_repayment_method_v1(
  actor_profile_id uuid, requested_account_id uuid, requested_method text, requested_reason text,
  requested_effective_date date, requested_expected_version bigint, requested_operation_id uuid,
  requested_confirmed boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype; employee_id uuid; policy public.employee_loan_repayment_method_changes%rowtype;
  payload text; state jsonb; previous_context text; result jsonb;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_account_id is null or requested_operation_id is null then raise exception 'Loan and operation IDs are required'; end if;
  if requested_confirmed is distinct from true then raise exception 'Explicit date and agreement compatibility confirmation is required'; end if;
  if requested_method is not null and requested_method not in ('salary_deduction','cash','bank','mfs','other') then raise exception 'Unsupported repayment method'; end if;
  if requested_reason is null or length(btrim(requested_reason)) not between 10 and 2000 then raise exception 'A reason between 10 and 2000 characters is required'; end if;
  if requested_expected_version is null or requested_expected_version<1 then raise exception 'Refresh the loan version'; end if;
  payload:=md5(jsonb_build_object('actor',actor_profile_id,'account',requested_account_id,'method',requested_method,
    'reason',btrim(requested_reason),'effective_date',requested_effective_date,'version',requested_expected_version)::text);
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  select * into policy from public.employee_loan_repayment_method_changes where operation_id=requested_operation_id;
  if found then
    if policy.payload_hash<>payload then raise exception 'Operation ID was already used for a different request'; end if;
    return jsonb_build_object('id',policy.id,'method',policy.new_method,'version',policy.resulting_version,'effective_date',policy.effective_date,'replayed',true);
  end if;
  if requested_effective_date is null or not isfinite(requested_effective_date)
    or requested_effective_date<>timezone('Asia/Dhaka',now())::date then
    raise exception 'Only the explicitly confirmed current Dhaka business date is supported; refresh the page';
  end if;
  select a.employee_record_id into employee_id from public.receivable_accounts a where a.id=requested_account_id;
  if employee_id is null then raise exception 'Employee loan not found'; end if;
  -- Match Payroll V1 lock order: employee, then loan. No payroll row is changed.
  perform 1 from public.hr_employee_records where id=employee_id and archived_at is null for update;
  if not found then raise exception 'Active employee enrollment not found'; end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.employee_record_id is distinct from employee_id or account.category<>'employee_loan' or account.borrower_type<>'employee' then raise exception 'Employee loan identity mismatch'; end if;
  if account.version<>requested_expected_version then raise exception 'This loan changed. Refresh the page before saving'; end if;
  if account.status not in ('requested','under_review','approved','active') then raise exception 'Closed or settled loans cannot change repayment method'; end if;
  if account.status='active' and public.receivable_current_outstanding(account.id)<=0 then raise exception 'Settled loan cannot change repayment method'; end if;
  if account.default_repayment_method is not distinct from requested_method then raise exception 'Choose a different repayment method'; end if;
  if exists(select 1 from public.hr_payroll_records p where p.employee_record_id=employee_id and p.status in ('draft','approved'))
    or exists(select 1 from public.payroll_receivable_deductions d where d.receivable_account_id=account.id and d.status in ('draft','approved')) then
    raise exception 'Active payroll or installment reservation exists. Resolve it through the existing payroll workflow first';
  end if;
  -- Payment effective dates, not salary period end or the machine's current date.
  -- Ambiguous historical Paid timestamps fail closed. Even zero-deduction Paid
  -- snapshots in today's/future cycle must not be retroactively reinterpreted.
  if exists(select 1 from public.hr_payroll_records p where p.employee_record_id=employee_id and p.status='paid'
    and (coalesce(p.payment_effective_date,timezone('Asia/Dhaka',p.paid_at)::date) is null
      or coalesce(p.payment_effective_date,timezone('Asia/Dhaka',p.paid_at)::date)>=requested_effective_date))
    or exists(select 1 from public.receivable_transactions t where t.receivable_account_id=account.id and t.effective_date>=requested_effective_date) then
    raise exception 'Posted financial activity already covers this effective date. No historical records were changed';
  end if;
  state:=jsonb_build_object('status',account.status,'approved_at',account.approved_at,
    'disbursed_at',account.disbursed_at,'disbursement_date',account.disbursement_date,
    'workflow',(select jsonb_build_object('stage',d.workflow_stage,'final_approved_at',d.final_approved_at)
      from public.receivable_employee_loan_details d where d.receivable_account_id=account.id));
  previous_context:=coalesce(current_setting('app.employee_loan_method_operation',true),'');
  perform set_config('app.employee_loan_method_operation',requested_operation_id::text,true);
  insert into public.employee_loan_repayment_method_changes(receivable_account_id,old_method,new_method,effective_date,
    actor_id,reason,previous_version,resulting_version,operation_id,payload_hash,loan_state)
  values(account.id,account.default_repayment_method,requested_method,requested_effective_date,actor_profile_id,
    btrim(requested_reason),account.version,account.version+1,requested_operation_id,payload,state) returning * into policy;
  update public.receivable_accounts set default_repayment_method=requested_method,updated_by=actor_profile_id where id=account.id;
  if (select version from public.receivable_accounts where id=account.id)<>policy.resulting_version then raise exception 'Loan version contract mismatch'; end if;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values,metadata)
  values(actor_profile_id,'admin','receivable.employee_loan_repayment_method_changed','receivables','receivable_account',account.id::text,
    'Admin changed future repayment configuration only; financial history and agreements preserved.',
    jsonb_build_object('default_repayment_method',account.default_repayment_method,'version',account.version),
    jsonb_build_object('default_repayment_method',requested_method,'version',policy.resulting_version),
    jsonb_build_object('reason',btrim(requested_reason),'effective_date',requested_effective_date,'operation_id',requested_operation_id,
      'policy_id',policy.id,'loan_state',state,'agreement_compatibility_confirmed',true));
  perform set_config('app.employee_loan_method_operation',previous_context,true);
  result:=jsonb_build_object('id',policy.id,'method',requested_method,'version',policy.resulting_version,'effective_date',requested_effective_date,'replayed',false);
  return result;
end $$;

-- Preserve every existing planner filter and amount rule. Only Employee Loan
-- policy selection changes. Salary Advance behavior remains exactly as before.
create or replace function public.hr_payroll_plan_v1(actor_profile_id uuid, requested_employee_id uuid,
  effective_date date, requested_currency text, excluded_payroll_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if effective_date is null or not isfinite(effective_date) or effective_date not between '1900-01-01'::date and '9999-12-31'::date then
    raise exception 'Confirm a valid payment effective date';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,'reference',a.receivable_number,'category',a.category,
    'installment_id',i.id,'installment_number',i.installment_number,'due_date',i.due_date,
    'original_amount',i.amount_due,'amount',trunc(least(i.remaining_amount,i.amount_due,public.receivable_current_outstanding(a.id)),2),
    'outstanding',public.receivable_current_outstanding(a.id),'effective_date',effective_date
  ) order by a.id),'[]') into result
  from public.receivable_accounts a
  cross join lateral (select s.* from public.receivable_installment_status_v s
    where s.receivable_account_id=a.id and s.remaining_amount>0 order by s.installment_number limit 1) i
  where a.employee_record_id=requested_employee_id and a.category in ('employee_loan','salary_advance')
    and a.status='active' and a.approved_amount>0 and a.disbursed_at is not null and a.disbursement_date<=effective_date
    and (case when a.category='employee_loan' then public.employee_loan_repayment_method_as_of_v1(a.id,effective_date)
      else a.default_repayment_method end)='salary_deduction' and a.currency=requested_currency and i.due_date<=effective_date
    and exists(select 1 from public.receivable_transactions t where t.receivable_account_id=a.id and t.transaction_type='disbursement' and t.direction='increase')
    and trunc(least(i.remaining_amount,i.amount_due,public.receivable_current_outstanding(a.id)),2)>0
    and not exists(select 1 from public.payroll_receivable_deductions d where d.receivable_account_id=a.id
      and d.status in ('draft','approved') and d.payroll_record_id is distinct from excluded_payroll_id);
  return result;
end $$;

revoke all on function public.guard_employee_loan_method_history_v1(),public.guard_employee_loan_method_update_v1(),
  public.employee_loan_repayment_method_as_of_v1(uuid,date),public.employee_loan_repayment_method_context_v1(uuid,uuid),
  public.edit_employee_loan_repayment_method_v1(uuid,uuid,text,text,date,bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.employee_loan_repayment_method_as_of_v1(uuid,date),
  public.employee_loan_repayment_method_context_v1(uuid,uuid),
  public.edit_employee_loan_repayment_method_v1(uuid,uuid,text,text,date,bigint,uuid,boolean) to service_role;
select pg_notify('pgrst','reload schema');
commit;
