begin;

-- No default or backfill: historical payment timestamps and balances are untouched.
alter table public.hr_payroll_records add column payment_effective_date date;
alter table public.payroll_receivable_deductions
  add column installment_id uuid references public.receivable_installments(id) on delete restrict,
  add column installment_number integer,
  add column installment_due_date date,
  add column original_installment_amount numeric(18,4),
  add column outstanding_at_plan numeric(18,4);
create unique index payroll_active_installment_reservation
  on public.payroll_receivable_deductions(installment_id)
  where status in ('draft','approved') and installment_id is not null;

-- Cancelled payroll is not paid coverage, and must not prevent safe recreation.
alter table public.hr_payroll_records drop constraint hr_payroll_records_employee_record_id_period_start_period_e_key;
create unique index payroll_active_exact_period on public.hr_payroll_records(employee_record_id,period_start,period_end)
  where status<>'cancelled';

-- A pure calendar rule, shared by the server autofill RPC and SQL regression tests.
-- No current_date fallback, truncated history or inference from just the last row.
create function public.hr_payroll_next_period_v1(hired date, history jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb; cursor_date date; start_date date; end_date date;
begin
  if hired is null or not isfinite(hired) or extract(day from hired)<>1 then
    return jsonb_build_object('review_reason','Partial-month or missing hire date: review salary coverage manually.');
  end if;
  cursor_date:=hired;
  for item in select value from jsonb_array_elements(coalesce(history,'[]'))
    where value->>'status'<>'cancelled' order by value->>'period_start',value->>'period_end'
  loop
    start_date:=(item->>'period_start')::date; end_date:=(item->>'period_end')::date;
    if start_date is null or end_date is null or not isfinite(start_date) or not isfinite(end_date)
      or start_date<>cursor_date or extract(day from start_date)<>1
      or end_date<>(start_date+interval '1 month -1 day')::date then
      return jsonb_build_object('review_reason','Gap, overlap or partial-month payroll history: manual review required.');
    end if;
    if item->>'status'<>'paid' then
      return jsonb_build_object('review_reason','An unpaid Draft or Approved payroll already exists: review it before creating another.');
    end if;
    cursor_date:=(end_date+1);
  end loop;
  return jsonb_build_object('period_start',cursor_date,'period_end',(cursor_date+interval '1 month -1 day')::date,'review_reason',null);
end $$;

create function public.hr_payroll_autofill_v1(actor_profile_id uuid, requested_employee_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare employee public.hr_employee_records%rowtype; history jsonb; period_result jsonb;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into employee from public.hr_employee_records where id=requested_employee_id and archived_at is null;
  if employee.id is null then raise exception 'Employee enrollment not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('period_start',period_start,'period_end',period_end,'status',status) order by period_start),'[]')
    into history from public.hr_payroll_records where employee_record_id=employee.id;
  period_result:=public.hr_payroll_next_period_v1(employee.hire_date,history);
  if employee.termination_date is not null or employee.employment_status='terminated' then
    period_result:=jsonb_build_object('review_reason','Employment has ended: manually review the final salary period and adjustments.');
  end if;
  return period_result||jsonb_build_object(
    'employee_id',employee.id,'base_salary',employee.base_salary,'currency',employee.salary_currency,
    'salary_review',case when employee.base_salary is null then 'No enrolled base salary: an Admin must review the enrollment. No salary was assumed.' end);
end $$;

-- One earliest unpaid installment per loan, just as Phase 4. Never skip an
-- installment reserved elsewhere, or silently adopt a legacy unpinned plan.
create function public.hr_payroll_plan_v1(actor_profile_id uuid, requested_employee_id uuid,
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
    and a.default_repayment_method='salary_deduction' and a.currency=requested_currency and i.due_date<=effective_date
    and exists(select 1 from public.receivable_transactions t where t.receivable_account_id=a.id and t.transaction_type='disbursement' and t.direction='increase')
    and trunc(least(i.remaining_amount,i.amount_due,public.receivable_current_outstanding(a.id)),2)>0
    and not exists(select 1 from public.payroll_receivable_deductions d where d.receivable_account_id=a.id
      and d.status in ('draft','approved') and d.payroll_record_id is distinct from excluded_payroll_id);
  return result;
end $$;

create function public.hr_payroll_quote_v1(actor_profile_id uuid, requested_employee_id uuid, effective_date date,
  requested_currency text, base numeric, allowance numeric, bonus numeric, manual numeric, excluded_payroll_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; automatic numeric;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if base is null or allowance is null or bonus is null or manual is null
    or least(base,allowance,bonus,manual)<0 or greatest(base,allowance,bonus,manual)>=1e14
    or base<>round(base,2) or allowance<>round(allowance,2) or bonus<>round(bonus,2) or manual<>round(manual,2)
    or base::text='NaN' or allowance::text='NaN' or bonus::text='NaN' or manual::text='NaN' then raise exception 'Invalid payroll amounts'; end if;
  plan:=public.hr_payroll_plan_v1(actor_profile_id,requested_employee_id,effective_date,requested_currency,excluded_payroll_id);
  select coalesce(sum((value->>'amount')::numeric),0) into automatic from jsonb_array_elements(plan);
  return jsonb_build_object('installments',plan,'automatic',automatic,'manual',manual,'deductions',automatic+manual,
    'gross',base+allowance+bonus,'net',base+allowance+bonus-manual-automatic,'effective_date',effective_date);
end $$;

-- All writes now cross a trusted atomic RPC. RLS remains enabled, including
-- Admin reads. No browser (even Admin) can mutate financial rows directly.
revoke insert,update,delete on public.hr_payroll_records,public.hr_payroll_components from authenticated;

create function public.guard_hr_payroll_v1() returns trigger language plpgsql set search_path='' as $$
declare employee_id uuid; payroll_id uuid;
begin
  payroll_id:=case when tg_op='DELETE' then old.id else new.id end;
  if tg_op<>'INSERT' and old.status='paid' then raise exception 'Paid payroll is immutable and final'; end if;
  if current_setting('app.payroll_v1_id',true) is distinct from payroll_id::text then
    raise exception 'Use the authorized atomic payroll workflow';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' then
    if old.status='cancelled' then raise exception 'Cancelled payroll is final'; end if;
    if old.employee_record_id<>new.employee_record_id then raise exception 'Payroll employee identity is immutable'; end if;
    if old.status='approved' and (to_jsonb(new)-array['status','paid_at','updated_at']) is distinct from
      (to_jsonb(old)-array['status','paid_at','updated_at']) then raise exception 'Approved payroll terms are immutable'; end if;
    if new.status<>old.status and not ((old.status='draft' and new.status in ('approved','cancelled'))
      or (old.status='approved' and new.status in ('paid','cancelled'))) then raise exception 'Unsafe payroll transition'; end if;
  elsif new.status<>'draft' then raise exception 'New payroll must be Draft'; end if;
  if new.status<>'cancelled' and (new.payment_effective_date is null or not isfinite(new.payment_effective_date)) then raise exception 'Confirm a valid payment effective date'; end if;
  if new.gross_pay<0 or new.deductions<0 or new.net_pay<>new.gross_pay-new.deductions or new.net_pay<0 then
    raise exception 'Invalid payroll totals'; end if;
  employee_id:=new.employee_record_id;
  -- The employee lock serializes range validation, including concurrent drafts.
  perform 1 from public.hr_employee_records where id=employee_id for update;
  if new.status<>'cancelled' and exists(select 1 from public.hr_payroll_records p
    where p.employee_record_id=employee_id and p.id<>new.id and p.status<>'cancelled'
      and daterange(p.period_start,p.period_end,'[]') && daterange(new.period_start,new.period_end,'[]')) then
    raise exception 'Payroll periods overlap an existing active payroll';
  end if;
  return new;
end $$;
create trigger hr_payroll_guard_v1 before insert or update or delete on public.hr_payroll_records
  for each row execute function public.guard_hr_payroll_v1();

create function public.guard_hr_payroll_component_v1() returns trigger language plpgsql set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype; payroll_id uuid;
begin
  payroll_id:=case when tg_op='DELETE' then old.payroll_record_id else new.payroll_record_id end;
  select * into payroll from public.hr_payroll_records where id=payroll_id;
  if payroll.status is distinct from 'draft' or current_setting('app.payroll_v1_id',true) is distinct from payroll_id::text then
    raise exception 'Payroll components are immutable outside the atomic Draft workflow'; end if;
  if tg_op='UPDATE' and old.payroll_record_id<>new.payroll_record_id then raise exception 'Payroll component identity is immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger hr_payroll_component_guard_v1 before insert or update or delete on public.hr_payroll_components
  for each row execute function public.guard_hr_payroll_component_v1();

create or replace function public.protect_payroll_receivable_deduction_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'Approved or paid deduction snapshots are immutable'; end if;
    if current_setting('app.payroll_v1_id',true) is distinct from old.payroll_record_id::text then raise exception 'Use atomic payroll planning'; end if;
    return old;
  end if;
  if current_setting('app.payroll_v1_id',true) is distinct from new.payroll_record_id::text then raise exception 'Use atomic payroll planning'; end if;
  if tg_op='UPDATE' then
    if old.status in ('approved','paid','voided') and
      (to_jsonb(new)-array['status','repayment_transaction_id','updated_by','updated_at','voided_at','voided_by','void_reason']) is distinct from
      (to_jsonb(old)-array['status','repayment_transaction_id','updated_by','updated_at','voided_at','voided_by','void_reason']) then
      raise exception 'Approved payroll deduction snapshots are immutable'; end if;
    if old.status in ('paid','voided') then raise exception 'Paid or voided payroll deductions are final'; end if;
  end if;
  if new.status<>'voided' and not exists(select 1 from public.receivable_installments i
    where i.id=new.installment_id and i.receivable_account_id=new.receivable_account_id
      and i.installment_number=new.installment_number and i.due_date=new.installment_due_date and i.amount_due=new.original_installment_amount) then
    raise exception 'An authoritative installment identity is required; legacy plans need manual review';
  end if;
  return new;
end $$;
drop trigger payroll_receivable_deductions_snapshot_freeze on public.payroll_receivable_deductions;
create trigger payroll_receivable_deductions_snapshot_freeze before insert or update or delete on public.payroll_receivable_deductions
  for each row execute function public.protect_payroll_receivable_deduction_snapshot();

create function public.save_hr_payroll_draft_v1(actor_profile_id uuid, requested_employee_id uuid,
  requested_start date, requested_end date, requested_base numeric, requested_allowance numeric,
  requested_bonus numeric, requested_manual numeric, requested_currency text, requested_effective date,
  date_confirmed boolean, requested_notes text, requested_payroll_id uuid default null,
  expected_updated_at timestamptz default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare employee public.hr_employee_records%rowtype; payroll public.hr_payroll_records%rowtype;
  payroll_id uuid:=coalesce(requested_payroll_id,gen_random_uuid()); previous_context text;
  plan jsonb; item jsonb; component_id uuid; automatic numeric; gross numeric; plan_hash text;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if date_confirmed is distinct from true or requested_effective is null or not isfinite(requested_effective)
    or requested_effective not between '1900-01-01'::date and '9999-12-31'::date then raise exception 'Explicitly confirm a valid payment effective date'; end if;
  if requested_start is null or requested_end is null or not isfinite(requested_start) or not isfinite(requested_end)
    or requested_start>requested_end or requested_start<'1900-01-01'::date or requested_end>'9999-12-31'::date then raise exception 'Invalid salary period'; end if;
  if requested_base is null or requested_allowance is null or requested_bonus is null or requested_manual is null
    or least(requested_base,requested_allowance,requested_bonus,requested_manual)<0
    or greatest(requested_base,requested_allowance,requested_bonus,requested_manual)>=1e14
    or requested_base<>round(requested_base,2) or requested_allowance<>round(requested_allowance,2)
    or requested_bonus<>round(requested_bonus,2) or requested_manual<>round(requested_manual,2)
    or requested_base::text in ('NaN','Infinity','-Infinity') or requested_allowance::text in ('NaN','Infinity','-Infinity')
    or requested_bonus::text in ('NaN','Infinity','-Infinity') or requested_manual::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid payroll money: use nonnegative amounts with at most two decimal places'; end if;
  select * into employee from public.hr_employee_records where id=requested_employee_id and archived_at is null for update;
  if employee.id is null then raise exception 'Employee enrollment not found'; end if;
  if employee.base_salary is null then raise exception 'No enrolled base salary. Review employee enrollment before payroll'; end if;
  if requested_currency is distinct from employee.salary_currency then raise exception 'Payroll currency must match the enrolled salary currency'; end if;
  if employee.hire_date is null or requested_start<employee.hire_date then raise exception 'Salary period cannot precede verified employment'; end if;
  if (employee.termination_date is not null and requested_end>employee.termination_date)
    or (employee.employment_status='terminated' and employee.termination_date is null) then
    raise exception 'Review verified employment end before creating this salary period';
  end if;
  if exists(select 1 from public.hr_payroll_records p where p.employee_record_id=employee.id
    and p.id is distinct from requested_payroll_id and p.status<>'cancelled'
    and daterange(p.period_start,p.period_end,'[]') && daterange(requested_start,requested_end,'[]')) then
    raise exception 'Payroll periods overlap an existing active payroll';
  end if;
  if (requested_base<>employee.base_salary or requested_start<>date_trunc('month',requested_start)::date
    or requested_end<>(requested_start+interval '1 month -1 day')::date
    or (requested_payroll_id is null and public.hr_payroll_autofill_v1(actor_profile_id,employee.id)->>'review_reason' is not null))
    and char_length(trim(coalesce(requested_notes,'')))<10 then raise exception 'Manual review reason is required for salary adjustments or ambiguous payroll history'; end if;
  if requested_payroll_id is not null then
    select * into payroll from public.hr_payroll_records where id=payroll_id for update;
    if payroll.id is null or payroll.employee_record_id<>employee.id or payroll.status<>'draft' then raise exception 'Only this employee''s Draft payroll can be recalculated'; end if;
    if expected_updated_at is distinct from payroll.updated_at then raise exception 'Payroll changed: refresh before recalculating'; end if;
    if exists(select 1 from public.hr_payroll_components c where c.payroll_record_id=payroll.id and (
      (c.name in ('Allowance','Bonus') and c.component_type<>'earning')
      or (c.name='Deduction' and c.component_type<>'deduction')
      or (c.name not in ('Allowance','Bonus','Deduction') and not exists(
        select 1 from public.payroll_receivable_deductions d where d.payroll_record_id=payroll.id
          and d.payroll_component_id=c.id and d.status='draft' and c.component_type='deduction'))
    )) then raise exception 'Unrecognized legacy payroll components: manual review required; no adjustments were removed'; end if;
  end if;
  -- Stable account locks serialize all reservation and repayment decisions with
  -- the existing manual repayment RPC (which also locks the account).
  perform 1 from public.receivable_accounts where employee_record_id=employee.id
    and category in ('employee_loan','salary_advance') order by id for update;
  plan:=public.hr_payroll_plan_v1(actor_profile_id,employee.id,requested_effective,requested_currency,payroll_id);
  select coalesce(sum((value->>'amount')::numeric),0) into automatic from jsonb_array_elements(plan);
  gross:=requested_base+requested_allowance+requested_bonus;
  if gross<automatic+requested_manual then raise exception 'Deductions cannot make net salary negative'; end if;
  previous_context:=coalesce(current_setting('app.payroll_v1_id',true),'');
  perform set_config('app.payroll_v1_id',payroll_id::text,true);
  if requested_payroll_id is null then
    insert into public.hr_payroll_records(id,employee_record_id,period_start,period_end,base_salary,gross_pay,deductions,net_pay,currency,status,notes,created_by,payment_effective_date)
    values(payroll_id,employee.id,requested_start,requested_end,requested_base,gross,automatic+requested_manual,gross-automatic-requested_manual,requested_currency,'draft',requested_notes,actor_profile_id,requested_effective);
  else
    delete from public.payroll_receivable_deductions where payroll_record_id=payroll_id;
    delete from public.hr_payroll_components where payroll_record_id=payroll_id;
    update public.hr_payroll_records set period_start=requested_start,period_end=requested_end,base_salary=requested_base,
      gross_pay=gross,deductions=automatic+requested_manual,net_pay=gross-automatic-requested_manual,
      notes=requested_notes,payment_effective_date=requested_effective,updated_at=clock_timestamp() where id=payroll_id;
  end if;
  insert into public.hr_payroll_components(payroll_record_id,component_type,name,amount)
    select payroll_id,t.kind,t.name,t.amount from (values ('earning','Allowance',requested_allowance),('earning','Bonus',requested_bonus),('deduction','Deduction',requested_manual)) t(kind,name,amount) where t.amount>0;
  plan_hash:=md5(payroll_id::text||requested_effective::text||plan::text);
  for item in select value from jsonb_array_elements(plan) loop
    insert into public.hr_payroll_components(payroll_record_id,component_type,name,amount,notes)
      values(payroll_id,'deduction','Loan installment — '||(item->>'reference'),(item->>'amount')::numeric,'Installment '||(item->>'installment_number')||'; effective '||requested_effective::text) returning id into component_id;
    insert into public.payroll_receivable_deductions(payroll_record_id,receivable_account_id,payroll_component_id,planned_deduction_amount,
      operation_id,plan_hash,status,created_by,updated_by,installment_id,installment_number,installment_due_date,original_installment_amount,outstanding_at_plan)
    values(payroll_id,(item->>'account_id')::uuid,component_id,(item->>'amount')::numeric,gen_random_uuid(),plan_hash,'draft',actor_profile_id,actor_profile_id,
      (item->>'installment_id')::uuid,(item->>'installment_number')::integer,(item->>'due_date')::date,(item->>'original_amount')::numeric,(item->>'outstanding')::numeric);
  end loop;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,old_values,new_values)
    values(actor_profile_id,'admin',case when requested_payroll_id is null then 'hr.payroll_created' else 'hr.payroll_recalculated' end,
      'hr','hr_payroll_record',payroll_id::text,'Admin confirmed effective date; Draft reserved installments without financial posting.',
      case when requested_payroll_id is not null then to_jsonb(payroll) end,
      jsonb_build_object('payment_effective_date',requested_effective,'automatic_deduction',automatic,'manual_deduction',requested_manual,'plan_hash',plan_hash,'review_reason',requested_notes));
  perform set_config('app.payroll_v1_id',previous_context,true);
  return payroll_id;
end $$;

-- Validate the pinned snapshot, not a new "earliest" installment substituted at
-- Paid time. Current balance changes fail closed; the Admin must cancel/replan.
create function public.validate_hr_payroll_plan_v1(actor_profile_id uuid, requested_payroll_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype; link public.payroll_receivable_deductions%rowtype; item jsonb; plan jsonb;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into strict payroll from public.hr_payroll_records where id=requested_payroll_id;
  if payroll.payment_effective_date is null then raise exception 'Legacy payroll requires explicit effective-date review and Draft recalculation'; end if;
  perform 1 from public.receivable_accounts where employee_record_id=payroll.employee_record_id
    and category in ('employee_loan','salary_advance') order by id for update;
  plan:=public.hr_payroll_plan_v1(actor_profile_id,payroll.employee_record_id,payroll.payment_effective_date,payroll.currency,payroll.id);
  if jsonb_array_length(plan)<>(select count(*) from public.payroll_receivable_deductions where payroll_record_id=payroll.id and status in ('draft','approved')) then
    raise exception 'Payroll deduction eligibility changed: cancel/recalculate before proceeding'; end if;
  for link in select * from public.payroll_receivable_deductions where payroll_record_id=payroll.id order by receivable_account_id for update loop
    select value into item from jsonb_array_elements(plan) where value->>'account_id'=link.receivable_account_id::text;
    if item is null or link.installment_id is distinct from (item->>'installment_id')::uuid
      or link.planned_deduction_amount is distinct from (item->>'amount')::numeric
      or link.installment_due_date is distinct from (item->>'due_date')::date
      or link.installment_number is distinct from (item->>'installment_number')::integer then
      raise exception 'The employee loan balance or pinned installment changed: cancel/recalculate payroll'; end if;
  end loop;
  if payroll.gross_pay<>payroll.base_salary+coalesce((select sum(amount) from public.hr_payroll_components where payroll_record_id=payroll.id and component_type='earning'),0)
    or payroll.deductions<>coalesce((select sum(amount) from public.hr_payroll_components where payroll_record_id=payroll.id and component_type='deduction'),0)
    or payroll.net_pay<>payroll.gross_pay-payroll.deductions then raise exception 'Payroll financial snapshot is inconsistent'; end if;
end $$;

-- Retire the former non-atomic, caller-supplied plan entry point safely.
create or replace function public.prepare_hr_payroll_receivable_plan(actor_profile_id uuid, requested_payroll_id uuid, requested_plan jsonb, requested_plan_hash text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform public.assert_hr_admin(actor_profile_id);
  raise exception 'Use the confirmed effective-date atomic Draft payroll workflow';
end $$;

create or replace function public.approve_hr_payroll_with_receivables(actor_profile_id uuid, requested_payroll_id uuid, requested_plan_hash text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if current_setting('app.payroll_v1_confirmation',true) is distinct from requested_payroll_id::text then raise exception 'Explicitly confirm the payment effective date before approval'; end if;
  select * into strict payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.status<>'draft' then raise exception 'Only Draft payroll can be approved'; end if;
  perform public.validate_hr_payroll_plan_v1(actor_profile_id,payroll.id);
  update public.payroll_receivable_deductions set status='approved',updated_by=actor_profile_id where payroll_record_id=payroll.id;
  update public.hr_payroll_records set status='approved',approved_by=actor_profile_id,updated_at=clock_timestamp() where id=payroll.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values)
    values(actor_profile_id,'admin','hr.payroll_approved','hr','hr_payroll_record',payroll.id::text,'Payroll approved without repayment posting.',jsonb_build_object('payment_effective_date',payroll.payment_effective_date));
  return jsonb_build_object('payroll_id',payroll.id,'status','approved');
end $$;

create function public.confirm_hr_payroll_approval_v1(actor_profile_id uuid, requested_payroll_id uuid, confirmed_date date, date_confirmed boolean, expected_updated_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype; old_context text; old_confirmation text; result jsonb; employee_id uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select employee_record_id into employee_id from public.hr_payroll_records where id=requested_payroll_id;
  perform 1 from public.hr_employee_records where id=employee_id for update;
  select * into strict payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if date_confirmed is distinct from true or confirmed_date is null or confirmed_date is distinct from payroll.payment_effective_date then raise exception 'Explicitly confirm the current payment effective date'; end if;
  if expected_updated_at is distinct from payroll.updated_at then raise exception 'Payroll changed: refresh and review before approval'; end if;
  old_context:=coalesce(current_setting('app.payroll_v1_id',true),''); old_confirmation:=coalesce(current_setting('app.payroll_v1_confirmation',true),'');
  perform set_config('app.payroll_v1_id',payroll.id::text,true);
  perform set_config('app.payroll_v1_confirmation',payroll.id::text,true);
  result:=public.approve_hr_payroll_with_receivables(actor_profile_id,payroll.id,null);
  perform set_config('app.payroll_v1_id',old_context,true); perform set_config('app.payroll_v1_confirmation',old_confirmation,true);
  return result;
end $$;

create function public.cancel_hr_payroll_v1(actor_profile_id uuid, requested_payroll_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype; old_context text; employee_id uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select employee_record_id into employee_id from public.hr_payroll_records where id=requested_payroll_id;
  perform 1 from public.hr_employee_records where id=employee_id for update;
  select * into strict payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.status not in ('draft','approved') then raise exception 'Paid or cancelled payroll is final'; end if;
  old_context:=coalesce(current_setting('app.payroll_v1_id',true),''); perform set_config('app.payroll_v1_id',payroll.id::text,true);
  update public.payroll_receivable_deductions set status='voided',voided_at=clock_timestamp(),voided_by=actor_profile_id,void_reason='Payroll cancelled',updated_by=actor_profile_id
    where payroll_record_id=payroll.id and status in ('draft','approved');
  update public.hr_payroll_records set status='cancelled',updated_at=clock_timestamp() where id=payroll.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description)
    values(actor_profile_id,'admin','hr.payroll_cancelled','hr','hr_payroll_record',payroll.id::text,'Payroll cancelled; reservations released without balance movement.');
  perform set_config('app.payroll_v1_id',old_context,true);
  return jsonb_build_object('payroll_id',payroll.id,'status','cancelled');
end $$;

-- Same operational ledger, stable account locks and one atomic transaction as
-- Phase 4. paid_at stays the real posting instant, never the confirmed date.
create or replace function public.mark_hr_payroll_paid_with_receivables(actor_profile_id uuid, requested_payroll_id uuid, requested_operation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payroll public.hr_payroll_records%rowtype; link public.payroll_receivable_deductions%rowtype;
  account public.receivable_accounts%rowtype; repayment_id uuid; outstanding_after numeric;
  marked_paid_at timestamptz:=clock_timestamp(); repayment_count integer:=0; old_context text; employee_id uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_operation_id is null then raise exception 'Payroll Paid operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  select employee_record_id into employee_id from public.hr_payroll_records where id=requested_payroll_id;
  perform 1 from public.hr_employee_records where id=employee_id for update;
  select * into payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.id is null then raise exception 'Payroll record not found'; end if;
  if payroll.status='paid' then return jsonb_build_object('payroll_id',payroll.id,'status','paid','replayed',true); end if;
  if payroll.status<>'approved' then raise exception 'Only approved payroll can be marked paid'; end if;
  if exists(select 1 from public.payroll_receivable_deductions where payroll_record_id=payroll.id and status<>'approved') then raise exception 'Approved payroll deduction plan is incomplete'; end if;
  perform public.validate_hr_payroll_plan_v1(actor_profile_id,payroll.id);
  old_context:=coalesce(current_setting('app.payroll_v1_id',true),''); perform set_config('app.payroll_v1_id',payroll.id::text,true);
  for link in select * from public.payroll_receivable_deductions where payroll_record_id=payroll.id order by receivable_account_id for update loop
    select * into strict account from public.receivable_accounts where id=link.receivable_account_id for update;
    -- An operation collision is never silently attached to unrelated payroll.
    if exists(select 1 from public.receivable_transactions where operation_id=link.operation_id) then raise exception 'Repayment operation already exists without an atomic Paid payroll'; end if;
    outstanding_after:=public.receivable_current_outstanding(account.id)-link.planned_deduction_amount;
    repayment_id:=gen_random_uuid();
    insert into public.receivable_transactions(id,receivable_account_id,transaction_type,direction,amount,effective_date,payment_method,source,operation_id,payroll_record_id,notes,metadata,created_by)
      values(repayment_id,account.id,'repayment','decrease',link.planned_deduction_amount,payroll.payment_effective_date,'salary_deduction','payroll',link.operation_id,payroll.id,
        'Payroll salary deduction',jsonb_build_object('payroll_record_id',payroll.id,'payroll_link_id',link.id,'installment_id',link.installment_id,'installment_number',link.installment_number),actor_profile_id);
    update public.payroll_receivable_deductions set status='paid',repayment_transaction_id=repayment_id,updated_by=actor_profile_id where id=link.id;
    update public.receivable_accounts set status=case when outstanding_after=0 then 'fully_repaid' else 'active' end,updated_by=actor_profile_id,updated_at=clock_timestamp() where id=account.id;
    insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
      values(actor_profile_id,'admin','hr.payroll_receivable_repayment','hr','receivable_transaction',repayment_id::text,'Payroll salary-deduction repayment committed atomically.',
        jsonb_build_object('amount',link.planned_deduction_amount,'payroll_record_id',payroll.id,'receivable_account_id',account.id,'payment_effective_date',payroll.payment_effective_date),jsonb_build_object('operation_id',link.operation_id));
    repayment_count:=repayment_count+1;
  end loop;
  update public.hr_payroll_records set status='paid',paid_at=marked_paid_at,updated_at=marked_paid_at where id=payroll.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
    values(actor_profile_id,'admin','hr.payroll_paid','hr','hr_payroll_record',payroll.id::text,'Payroll and reserved receivable repayments committed atomically.',
      jsonb_build_object('status','paid','paid_at',marked_paid_at,'repayment_count',repayment_count,'payment_effective_date',payroll.payment_effective_date),jsonb_build_object('operation_id',requested_operation_id));
  perform set_config('app.payroll_v1_id',old_context,true);
  return jsonb_build_object('payroll_id',payroll.id,'status','paid','replayed',false,'repayment_count',repayment_count);
end $$;

-- Direct compatibility: retain the existing loan start-date guard and also
-- consider the separately confirmed payment date. No historical date changes.
create or replace function public.edit_employee_loan_start_date(
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
      and greatest(payroll.period_end,coalesce(payroll.payment_effective_date,payroll.period_end))>=least(coalesce(account.first_due_date,detail.preferred_start_date),requested_start_date)) then
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

-- All new and replaced payroll boundaries are trusted-server only. The public
-- browser API cannot choose an actor ID to impersonate an administrator.
revoke all on function public.hr_payroll_next_period_v1(date,jsonb),public.hr_payroll_autofill_v1(uuid,uuid),
  public.hr_payroll_quote_v1(uuid,uuid,date,text,numeric,numeric,numeric,numeric,uuid),
  public.hr_payroll_plan_v1(uuid,uuid,date,text,uuid),public.save_hr_payroll_draft_v1(uuid,uuid,date,date,numeric,numeric,numeric,numeric,text,date,boolean,text,uuid,timestamptz),
  public.validate_hr_payroll_plan_v1(uuid,uuid),public.confirm_hr_payroll_approval_v1(uuid,uuid,date,boolean,timestamptz),public.cancel_hr_payroll_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.hr_payroll_autofill_v1(uuid,uuid),public.hr_payroll_plan_v1(uuid,uuid,date,text,uuid),
  public.hr_payroll_quote_v1(uuid,uuid,date,text,numeric,numeric,numeric,numeric,uuid),
  public.save_hr_payroll_draft_v1(uuid,uuid,date,date,numeric,numeric,numeric,numeric,text,date,boolean,text,uuid,timestamptz),
  public.confirm_hr_payroll_approval_v1(uuid,uuid,date,boolean,timestamptz),public.cancel_hr_payroll_v1(uuid,uuid) to service_role;
select pg_notify('pgrst','reload schema');
commit;
