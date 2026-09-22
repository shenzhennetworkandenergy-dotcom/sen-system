begin;

-- Phase 4: payroll plans are traceability records; only the trusted Paid RPC
-- creates salary-deduction receivable transactions.
create table public.payroll_receivable_deductions (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null references public.hr_payroll_records(id) on delete restrict,
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  payroll_component_id uuid references public.hr_payroll_components(id) on delete set null,
  planned_deduction_amount numeric(18,4) not null check(planned_deduction_amount>0),
  operation_id uuid not null unique,
  plan_hash text not null check(char_length(trim(plan_hash)) between 16 and 128),
  status text not null default 'draft' check(status in ('draft','approved','paid','voided')),
  repayment_transaction_id uuid unique references public.receivable_transactions(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_record_id,receivable_account_id)
);

create index payroll_receivable_deductions_payroll_idx
  on public.payroll_receivable_deductions(payroll_record_id,status);
create index payroll_receivable_deductions_account_idx
  on public.payroll_receivable_deductions(receivable_account_id,status);

create or replace function public.payroll_receivable_deductions_touch_updated_at()
returns trigger language plpgsql set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end $$;

create trigger payroll_receivable_deductions_touch_updated_at
before update on public.payroll_receivable_deductions
for each row execute function public.payroll_receivable_deductions_touch_updated_at();

create or replace function public.protect_payroll_receivable_deduction_snapshot()
returns trigger language plpgsql set search_path=public
as $$
begin
  if old.status in ('approved','paid') and (
    new.payroll_record_id<>old.payroll_record_id or
    new.receivable_account_id<>old.receivable_account_id or
    new.planned_deduction_amount<>old.planned_deduction_amount or
    new.operation_id<>old.operation_id or
    new.plan_hash<>old.plan_hash
  ) then
    raise exception 'Approved payroll deduction snapshots are immutable';
  end if;
  if old.status='paid' and new.status<>'paid' then
    raise exception 'Paid payroll deductions are final';
  end if;
  return new;
end $$;

create trigger payroll_receivable_deductions_snapshot_freeze
before update on public.payroll_receivable_deductions
for each row execute function public.protect_payroll_receivable_deduction_snapshot();

-- Draft planning is deliberately a non-financial operation. It can only be
-- called by the existing HR administrator boundary and never inserts a
-- receivable transaction.
create or replace function public.prepare_hr_payroll_receivable_plan(
  actor_profile_id uuid,
  requested_payroll_id uuid,
  requested_plan jsonb,
  requested_plan_hash text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare payroll public.hr_payroll_records%rowtype;
declare item jsonb;
declare account public.receivable_accounts%rowtype;
declare plan_count integer:=0;
declare planned numeric;
declare operation_id uuid;
declare component_id uuid;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_plan_hash is null or char_length(trim(requested_plan_hash))<16 then
    raise exception 'Payroll deduction plan hash is required';
  end if;
  select * into payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.id is null then raise exception 'Payroll record not found'; end if;
  if payroll.status<>'draft' then raise exception 'Loan deductions can only be planned for draft payroll'; end if;
  if jsonb_typeof(coalesce(requested_plan,'[]'::jsonb))<>'array' then raise exception 'Payroll deduction plan must be an array'; end if;

  delete from public.payroll_receivable_deductions
  where payroll_record_id=payroll.id and status='draft';

  for item in select * from jsonb_array_elements(coalesce(requested_plan,'[]'::jsonb)) loop
    planned:=round((item->>'amount')::numeric,4);
    operation_id:=(item->>'operation_id')::uuid;
    component_id:=nullif(item->>'payroll_component_id','')::uuid;
    if planned<=0 or operation_id is null then raise exception 'Invalid planned loan deduction'; end if;
    select * into account from public.receivable_accounts
    where id=(item->>'receivable_account_id')::uuid for update;
    if account.id is null then raise exception 'Receivable account not found for payroll plan'; end if;
    if account.employee_record_id<>payroll.employee_record_id
      or account.category not in ('employee_loan','salary_advance')
      or account.status<>'active'
      or account.default_repayment_method<>'salary_deduction'
      or account.currency<>payroll.currency
    then raise exception 'Receivable account is not eligible for this payroll'; end if;
    if planned>public.receivable_current_outstanding(account.id) then
      raise exception 'Planned payroll deduction exceeds current receivable outstanding';
    end if;
    insert into public.payroll_receivable_deductions(
      payroll_record_id,receivable_account_id,payroll_component_id,
      planned_deduction_amount,operation_id,plan_hash,status,created_by,updated_by
    ) values(
      payroll.id,account.id,component_id,planned,operation_id,requested_plan_hash,'draft',actor_profile_id,actor_profile_id
    )
    on conflict(payroll_record_id,receivable_account_id) do update set
      payroll_component_id=excluded.payroll_component_id,
      planned_deduction_amount=excluded.planned_deduction_amount,
      operation_id=excluded.operation_id,
      plan_hash=excluded.plan_hash,
      status='draft',
      repayment_transaction_id=null,
      updated_by=actor_profile_id,
      updated_at=now();
    plan_count:=plan_count+1;
  end loop;
  return jsonb_build_object('payroll_id',payroll.id,'planned_accounts',plan_count,'plan_hash',requested_plan_hash);
end $$;

-- Approval freezes the plan but does not move any receivable balance.
create or replace function public.approve_hr_payroll_with_receivables(
  actor_profile_id uuid,
  requested_payroll_id uuid,
  requested_plan_hash text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare payroll public.hr_payroll_records%rowtype;
declare link public.payroll_receivable_deductions%rowtype;
begin
  perform public.assert_hr_admin(actor_profile_id);
  select * into payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.id is null then raise exception 'Payroll record not found'; end if;
  if payroll.status<>'draft' then raise exception 'Only draft payroll can be approved'; end if;
  if requested_plan_hash is null then raise exception 'Payroll deduction plan hash is required'; end if;
  if exists(select 1 from public.payroll_receivable_deductions where payroll_record_id=payroll.id and plan_hash<>requested_plan_hash) then
    raise exception 'Payroll deduction plan changed; regenerate payroll before approval';
  end if;
  for link in
    select * from public.payroll_receivable_deductions
    where payroll_record_id=payroll.id and status='draft'
    order by receivable_account_id
    for update
  loop
    update public.payroll_receivable_deductions
    set status='approved',updated_by=actor_profile_id,updated_at=now()
    where id=link.id;
  end loop;
  update public.hr_payroll_records
  set status='approved',approved_by=actor_profile_id,updated_at=now()
  where id=payroll.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'hr.payroll_approved','hr','hr_payroll_record',payroll.id::text,
    'Payroll approved with a frozen receivable deduction plan.',
    jsonb_build_object('status','approved'),jsonb_build_object('plan_hash',requested_plan_hash)
  );
  return jsonb_build_object('payroll_id',payroll.id,'status','approved','plan_hash',requested_plan_hash);
end $$;

-- The only trusted source for salary-deduction repayments. Every balance
-- movement and the Paid state are committed or rolled back together.
create or replace function public.mark_hr_payroll_paid_with_receivables(
  actor_profile_id uuid,
  requested_payroll_id uuid,
  requested_operation_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare payroll public.hr_payroll_records%rowtype;
declare link public.payroll_receivable_deductions%rowtype;
declare account public.receivable_accounts%rowtype;
declare repayment_id uuid;
declare outstanding numeric;
declare installment_remaining numeric;
declare outstanding_after numeric;
declare marked_paid_at timestamptz:=now();
declare repayment_count integer:=0;
begin
  perform public.assert_hr_admin(actor_profile_id);
  if requested_operation_id is null then raise exception 'Payroll Paid operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  select * into payroll from public.hr_payroll_records where id=requested_payroll_id for update;
  if payroll.id is null then raise exception 'Payroll record not found'; end if;
  if payroll.status='paid' then
    return jsonb_build_object('payroll_id',payroll.id,'status','paid','replayed',true,
      'repayment_count',(select count(*) from public.payroll_receivable_deductions where payroll_record_id=payroll.id and status='paid'));
  end if;
  if payroll.status<>'approved' then raise exception 'Only approved payroll can be marked paid'; end if;
  if exists(
    select 1 from public.payroll_receivable_deductions
    where payroll_record_id=payroll.id and status<>'approved'
  ) then
    raise exception 'The approved Payroll deduction plan is incomplete. Recalculate/reapprove Payroll before payment.';
  end if;

  -- Lock links and then accounts in stable account-id order.
  for link in
    select * from public.payroll_receivable_deductions
    where payroll_record_id=payroll.id and status='approved'
    order by receivable_account_id
    for update
  loop
    select * into account from public.receivable_accounts where id=link.receivable_account_id for update;
    if account.id is null then raise exception 'Linked receivable account not found'; end if;
    if account.employee_record_id<>payroll.employee_record_id
      or account.category not in ('employee_loan','salary_advance')
      or account.status<>'active'
      or account.default_repayment_method<>'salary_deduction'
      or account.currency<>payroll.currency
    then raise exception 'Receivable deduction plan is stale or no longer eligible'; end if;
    outstanding:=public.receivable_current_outstanding(account.id);
    if outstanding<=0 or link.planned_deduction_amount>outstanding then
      raise exception 'The employee loan balance has changed since Payroll approval. Recalculate/reapprove Payroll before payment.';
    end if;
    select remaining_amount into installment_remaining
    from public.receivable_installment_status_v
    where receivable_account_id=account.id and remaining_amount>0
    order by installment_number limit 1;
    if installment_remaining is null or link.planned_deduction_amount>installment_remaining then
      raise exception 'The employee loan installment has changed since Payroll approval. Recalculate/reapprove Payroll before payment.';
    end if;
    outstanding_after:=round(outstanding-link.planned_deduction_amount,4);
    if exists(select 1 from public.receivable_transactions where operation_id=link.operation_id) then
      select id into repayment_id from public.receivable_transactions where operation_id=link.operation_id;
    else
      repayment_id:=gen_random_uuid();
      insert into public.receivable_transactions(
        id,receivable_account_id,transaction_type,direction,amount,effective_date,
        payment_method,source,operation_id,payroll_record_id,notes,metadata,created_by
      ) values(
        repayment_id,account.id,'repayment','decrease',link.planned_deduction_amount,
        timezone('Asia/Dhaka',marked_paid_at)::date,'salary_deduction','payroll',link.operation_id,
        payroll.id,'Payroll salary deduction',jsonb_build_object('payroll_record_id',payroll.id,'payroll_link_id',link.id),actor_profile_id
      );
    end if;
    update public.payroll_receivable_deductions
    set status='paid',repayment_transaction_id=repayment_id,updated_by=actor_profile_id,updated_at=now()
    where id=link.id;
    update public.receivable_accounts
    set status=case when outstanding_after=0 then 'fully_repaid' else 'active' end,
        updated_by=actor_profile_id,updated_at=now()
    where id=account.id;
    insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
    values(
      actor_profile_id,(select role from public.profiles where id=actor_profile_id),
      'hr.payroll_receivable_repayment','hr','receivable_transaction',repayment_id::text,
      'Payroll salary-deduction repayment linked to Payroll.',
      jsonb_build_object('amount',link.planned_deduction_amount,'payroll_record_id',payroll.id,'receivable_account_id',account.id),
      jsonb_build_object('payroll_link_id',link.id,'operation_id',link.operation_id)
    );
    repayment_count:=repayment_count+1;
  end loop;

  update public.hr_payroll_records
  set status='paid',paid_at=marked_paid_at,updated_at=now()
  where id=payroll.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'hr.payroll_paid','hr','hr_payroll_record',payroll.id::text,
    'Payroll marked paid and linked receivable repayments committed atomically.',
    jsonb_build_object('status','paid','paid_at',marked_paid_at,'repayment_count',repayment_count),
    jsonb_build_object('operation_id',requested_operation_id)
  );
  return jsonb_build_object('payroll_id',payroll.id,'status','paid','replayed',false,'repayment_count',repayment_count);
end $$;

alter table public.payroll_receivable_deductions enable row level security;
create policy "hr admin reads payroll receivable deductions"
on public.payroll_receivable_deductions for select to authenticated
using(public.is_hr_admin());

revoke all on public.payroll_receivable_deductions from public,anon,authenticated;
grant select on public.payroll_receivable_deductions to authenticated;
grant all on public.payroll_receivable_deductions to service_role;

revoke all on function public.prepare_hr_payroll_receivable_plan(uuid,uuid,jsonb,text),
  public.approve_hr_payroll_with_receivables(uuid,uuid,text),
  public.mark_hr_payroll_paid_with_receivables(uuid,uuid,uuid)
from public,anon,authenticated;
grant execute on function public.prepare_hr_payroll_receivable_plan(uuid,uuid,jsonb,text),
  public.approve_hr_payroll_with_receivables(uuid,uuid,text),
  public.mark_hr_payroll_paid_with_receivables(uuid,uuid,uuid)
to service_role;

select pg_notify('pgrst','reload schema');

commit;
