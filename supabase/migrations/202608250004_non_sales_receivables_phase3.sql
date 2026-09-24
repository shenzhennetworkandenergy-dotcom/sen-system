begin;

-- Phase 3 extends the generic operational Receivables foundation only.
-- It deliberately does not create Accounting, Cash Book, Payroll, Sales,
-- purchasing, or inventory movements.

insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select module.id,entry.key,entry.name,entry.description,entry.action,true,entry.sort_order
from public.app_modules module
cross join (values
  ('receivables.approve','Approve Loans and Advances','Review, approve, reject, or cancel non-Sales receivable requests.','approve',60),
  ('receivables.disburse','Confirm Receivable Disbursement','Record the operational disbursement that activates an approved receivable.','disburse',70),
  ('receivables.record_repayment','Record Receivable Repayment','Record an operational manual repayment without posting Accounting.','record_repayment',80),
  ('receivables.adjust','Adjust or Reverse Receivables','Create controlled operational adjustments and immutable reversals.','adjust',90)
) as entry(key,name,description,action,sort_order)
where module.key='receivables'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=true,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

alter table public.receivable_accounts
  drop constraint if exists receivable_accounts_category_check;

alter table public.receivable_accounts
  add constraint receivable_accounts_category_check check(category in (
    'employee_loan','salary_advance','customer_loan','company_loan','individual_loan',
    'supplier_refundable_advance','security_deposit','rent_advance',
    'recoverable_advance','other'
  )),
  add column approved_at timestamptz,
  add column disbursed_by uuid references public.profiles(id) on delete set null,
  add column disbursed_at timestamptz;

create table public.receivable_installments (
  id uuid primary key default gen_random_uuid(),
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  installment_number integer not null check(installment_number>0),
  due_date date not null,
  amount_due numeric(18,4) not null check(amount_due>0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(receivable_account_id,installment_number)
);

create index receivable_installments_due_idx
  on public.receivable_installments(due_date,receivable_account_id);

create unique index receivable_transactions_one_reversal_idx
  on public.receivable_transactions(reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;

create or replace function public.validate_receivable_category_borrower()
returns trigger language plpgsql set search_path='' as $$
declare external_type text;
begin
  if new.borrower_type='external_party' then
    select party.party_type into external_type
    from public.receivable_external_parties party where party.id=new.external_party_id;
  end if;

  if new.category in ('employee_loan','salary_advance') and new.borrower_type<>'employee' then
    raise exception 'Employee loans and salary advances require an employee borrower';
  elsif new.category='customer_loan' and new.borrower_type<>'customer' then
    raise exception 'Customer loans require a customer borrower';
  elsif new.category='supplier_refundable_advance' and new.borrower_type<>'supplier' then
    raise exception 'Supplier refundable advances require a supplier borrower';
  elsif new.category='company_loan' and not (
    new.borrower_type='crm_company' or
    (new.borrower_type='external_party' and external_type='company')
  ) then
    raise exception 'Company loans require a company borrower';
  elsif new.category='individual_loan' and not (
    new.borrower_type='crm_contact' or
    (new.borrower_type='external_party' and external_type='individual')
  ) then
    raise exception 'Individual loans require an individual borrower';
  end if;
  return new;
end $$;

create trigger receivable_accounts_category_borrower_check
before insert or update of category,borrower_type,employee_record_id,customer_profile_id,
  supplier_id,crm_company_id,crm_contact_id,external_party_id
on public.receivable_accounts
for each row execute function public.validate_receivable_category_borrower();

create or replace function public.protect_receivable_installment_schedule()
returns trigger language plpgsql set search_path='' as $$
declare account_status text;
begin
  select account.status into account_status
  from public.receivable_accounts account
  where account.id=coalesce(new.receivable_account_id,old.receivable_account_id);
  if account_status not in ('requested','under_review') then
    raise exception 'Approved installment schedules are immutable';
  end if;
  return coalesce(new,old);
end $$;

create trigger receivable_installments_schedule_freeze
before insert or update or delete on public.receivable_installments
for each row execute function public.protect_receivable_installment_schedule();

create or replace function public.receivable_current_outstanding(requested_account_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(sum(
    case transaction.direction when 'increase' then transaction.amount else -transaction.amount end
  ),0::numeric)
  from public.receivable_transactions transaction
  where transaction.receivable_account_id=requested_account_id;
$$;

create or replace function public.rebuild_receivable_installments(
  requested_account_id uuid,
  requested_principal numeric,
  requested_count integer,
  requested_regular_amount numeric,
  requested_first_due_date date,
  actor_profile_id uuid
)
returns void language plpgsql volatile security definer set search_path='' as $$
declare regular_amount numeric(18,4);
declare last_amount numeric(18,4);
begin
  delete from public.receivable_installments where receivable_account_id=requested_account_id;
  if requested_count is null then return; end if;
  if requested_count<=0 or requested_first_due_date is null or coalesce(requested_principal,0)<=0 then
    raise exception 'Installment count, principal, and first due date are required';
  end if;
  regular_amount:=coalesce(round(requested_regular_amount,4),trunc(requested_principal/requested_count,4));
  if regular_amount<=0 then raise exception 'Installment amount must be greater than zero'; end if;
  last_amount:=round(requested_principal-(regular_amount*(requested_count-1)),4);
  if last_amount<=0 then raise exception 'Installment amounts exceed the approved principal'; end if;

  insert into public.receivable_installments(
    receivable_account_id,installment_number,due_date,amount_due,created_by
  )
  select
    requested_account_id,
    item.number,
    (
      (date_trunc('month',requested_first_due_date)::date+make_interval(months=>item.number-1))+
      make_interval(days=>(
        least(
          extract(day from requested_first_due_date)::integer,
          extract(day from (
            date_trunc('month',requested_first_due_date)::date+
            make_interval(months=>item.number)+interval '-1 day'
          ))::integer
        )-1
      ))
    )::date,
    case when item.number=requested_count then last_amount else regular_amount end,
    actor_profile_id
  from generate_series(1,requested_count) as item(number);
end $$;

create or replace function public.transition_receivable_account(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_action text,
  requested_approved_amount numeric,
  requested_reason text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare old_status text;
declare new_status text;
declare operation_hash text;
declare existing_hash text;
declare permission_key text;
begin
  permission_key:=case when requested_action='submit_review' then 'receivables.create' else 'receivables.approve' end;
  perform public.assert_actor_permission(actor_profile_id,permission_key);
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'action',requested_action,
    'approved_amount',case when requested_approved_amount is null then null else round(requested_approved_amount,4) end,
    'reason',nullif(trim(requested_reason),'')
  )::text);

  select log.metadata->>'operation_hash' into existing_hash
  from public.audit_logs log
  where log.module='receivables' and log.metadata->>'operation_id'=requested_operation_id::text
  order by log.created_at desc limit 1;
  if existing_hash is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return requested_account_id;
  end if;

  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  old_status:=account.status;

  case requested_action
    when 'submit_review' then
      if account.status<>'requested' then raise exception 'Only requested accounts can be submitted for review'; end if;
      new_status:='under_review';
    when 'approve' then
      if account.status<>'under_review' then raise exception 'Only accounts under review can be approved'; end if;
      if coalesce(requested_approved_amount,0)<=0 then raise exception 'Approved amount must be greater than zero'; end if;
      perform public.rebuild_receivable_installments(
        account.id,round(requested_approved_amount,4),account.installment_count,
        account.installment_amount,account.first_due_date,actor_profile_id
      );
      update public.receivable_accounts set
        approved_amount=round(requested_approved_amount,4),approved_by=actor_profile_id,
        approved_at=now(),updated_by=actor_profile_id,status='approved',
        final_due_date=(select max(due_date) from public.receivable_installments where receivable_account_id=account.id)
      where id=account.id;
      new_status:='approved';
    when 'reject' then
      if account.status not in ('requested','under_review') then raise exception 'This account cannot be rejected'; end if;
      if char_length(coalesce(trim(requested_reason),''))<2 then raise exception 'Reason is required'; end if;
      new_status:='rejected';
    when 'cancel' then
      if account.status not in ('requested','under_review','approved') then raise exception 'This account cannot be cancelled'; end if;
      if exists(select 1 from public.receivable_transactions transaction where transaction.receivable_account_id=account.id) then
        raise exception 'Accounts with balance movements cannot be cancelled';
      end if;
      if char_length(coalesce(trim(requested_reason),''))<2 then raise exception 'Reason is required'; end if;
      new_status:='cancelled';
    else raise exception 'Invalid lifecycle action';
  end case;

  if requested_action<>'approve' then
    update public.receivable_accounts set status=new_status,updated_by=actor_profile_id where id=account.id;
  end if;

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,
    old_values,new_values,metadata
  ) values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.'||requested_action,'receivables','receivable_account',account.id::text,
    'Receivable lifecycle updated.',jsonb_build_object('status',old_status),
    jsonb_build_object('status',new_status,'approved_amount',requested_approved_amount,'reason',nullif(trim(requested_reason),'')),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash)
  );
  return account.id;
end $$;

create or replace function public.set_receivable_installment_schedule(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_count integer,
  requested_installment_amount numeric,
  requested_first_due_date date
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare operation_hash text;
declare existing_hash text;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.create');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'count',requested_count,
    'amount',case when requested_installment_amount is null then null else round(requested_installment_amount,4) end,
    'first_due_date',requested_first_due_date
  )::text);
  select log.metadata->>'operation_hash' into existing_hash from public.audit_logs log
  where log.module='receivables' and log.metadata->>'operation_id'=requested_operation_id::text
  order by log.created_at desc limit 1;
  if existing_hash is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return requested_account_id;
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  if account.status not in ('requested','under_review') then raise exception 'Approved installment schedules are immutable'; end if;
  if requested_count is not null and requested_count<=0 then raise exception 'Installment count must be positive'; end if;
  if requested_count is not null and requested_first_due_date is null then raise exception 'First due date is required'; end if;
  if requested_installment_amount is not null and requested_installment_amount<=0 then raise exception 'Installment amount must be positive'; end if;

  update public.receivable_accounts set
    installment_count=requested_count,
    installment_amount=case when requested_installment_amount is null then null else round(requested_installment_amount,4) end,
    first_due_date=requested_first_due_date,updated_by=actor_profile_id
  where id=account.id;
  perform public.rebuild_receivable_installments(
    account.id,account.requested_amount,requested_count,requested_installment_amount,
    requested_first_due_date,actor_profile_id
  );
  update public.receivable_accounts set
    final_due_date=(select max(due_date) from public.receivable_installments where receivable_account_id=account.id)
  where id=account.id;

  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.schedule_updated','receivables','receivable_account',account.id::text,
    'Receivable installment schedule updated before approval.',
    jsonb_build_object('count',requested_count,'installment_amount',requested_installment_amount,'first_due_date',requested_first_due_date),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash)
  );
  return account.id;
end $$;

create or replace function public.confirm_receivable_disbursement(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_amount numeric,
  requested_effective_date date,
  requested_payment_method text,
  requested_note text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare transaction_id uuid;
declare existing_hash text;
declare operation_hash text;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.disburse');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'amount',round(coalesce(requested_amount,0),4),
    'effective_date',requested_effective_date,'payment_method',requested_payment_method,
    'note',nullif(trim(requested_note),'')
  )::text);
  select transaction.id,transaction.metadata->>'operation_hash' into transaction_id,existing_hash
  from public.receivable_transactions transaction where transaction.operation_id=requested_operation_id;
  if transaction_id is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return transaction_id;
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  if account.status<>'approved' then raise exception 'Only approved accounts can be disbursed'; end if;
  if account.is_opening_balance then raise exception 'Opening receivables cannot be disbursed'; end if;
  if round(coalesce(requested_amount,0),4)<>round(coalesce(account.approved_amount,0),4) then
    raise exception 'Disbursement amount must equal the approved amount';
  end if;
  if requested_effective_date is null then raise exception 'Effective date is required'; end if;
  if requested_payment_method not in ('cash','bank','mfs','other') then raise exception 'Invalid operational disbursement method'; end if;
  if exists(select 1 from public.receivable_transactions transaction where transaction.receivable_account_id=account.id and transaction.transaction_type='disbursement') then
    raise exception 'This receivable has already been disbursed';
  end if;
  if account.installment_count is not null and account.installment_count<>(
    select count(*) from public.receivable_installments installment where installment.receivable_account_id=account.id
  ) then raise exception 'Approved installment schedule is incomplete'; end if;

  transaction_id:=gen_random_uuid();
  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    payment_method,source,operation_id,notes,metadata,created_by
  ) values(
    transaction_id,account.id,'disbursement','increase',round(requested_amount,4),requested_effective_date,
    requested_payment_method,'manual',requested_operation_id,nullif(left(trim(requested_note),2000),''),
    jsonb_build_object('operation_hash',operation_hash,'accounting_posted',false,'cashbook_posted',false),actor_profile_id
  );
  update public.receivable_accounts set
    status='active',disbursement_date=requested_effective_date,
    disbursed_by=actor_profile_id,disbursed_at=now(),updated_by=actor_profile_id
  where id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.disbursed','receivables','receivable_account',account.id::text,
    'Receivable disbursement recorded operationally without Accounting posting.',
    jsonb_build_object('status','active','amount',round(requested_amount,4),'currency',account.currency,'effective_date',requested_effective_date),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash,'transaction_id',transaction_id,'accounting_posted',false)
  );
  return transaction_id;
end $$;

create or replace function public.record_receivable_repayment(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_amount numeric,
  requested_effective_date date,
  requested_payment_method text,
  requested_note text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare transaction_id uuid;
declare existing_hash text;
declare operation_hash text;
declare outstanding numeric;
declare remaining numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.record_repayment');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'amount',round(coalesce(requested_amount,0),4),
    'effective_date',requested_effective_date,'payment_method',requested_payment_method,
    'note',nullif(trim(requested_note),'')
  )::text);
  select transaction.id,transaction.metadata->>'operation_hash' into transaction_id,existing_hash
  from public.receivable_transactions transaction where transaction.operation_id=requested_operation_id;
  if transaction_id is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return transaction_id;
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  if account.status<>'active' then raise exception 'Only active receivables can receive repayment'; end if;
  if coalesce(requested_amount,0)<=0 then raise exception 'Repayment amount must be greater than zero'; end if;
  if requested_effective_date is null then raise exception 'Effective date is required'; end if;
  if requested_payment_method='salary_deduction' then raise exception 'Salary deduction is reserved for Phase 4 Payroll integration'; end if;
  if requested_payment_method not in ('cash','bank','mfs','other') then raise exception 'Invalid operational repayment method'; end if;
  outstanding:=public.receivable_current_outstanding(account.id);
  if round(requested_amount,4)>round(outstanding,4) then raise exception 'Repayment cannot exceed current outstanding'; end if;
  remaining:=round(outstanding-requested_amount,4);
  transaction_id:=gen_random_uuid();
  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    payment_method,source,operation_id,notes,metadata,created_by
  ) values(
    transaction_id,account.id,'repayment','decrease',round(requested_amount,4),requested_effective_date,
    requested_payment_method,'manual',requested_operation_id,nullif(left(trim(requested_note),2000),''),
    jsonb_build_object('operation_hash',operation_hash,'accounting_posted',false,'cashbook_posted',false),actor_profile_id
  );
  update public.receivable_accounts set
    status=case when remaining=0 then 'fully_repaid' else 'active' end,updated_by=actor_profile_id
  where id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.repayment_recorded','receivables','receivable_account',account.id::text,
    'Receivable repayment recorded operationally without Accounting posting.',
    jsonb_build_object('amount',round(requested_amount,4),'currency',account.currency,'outstanding_after',remaining,'effective_date',requested_effective_date),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash,'transaction_id',transaction_id,'accounting_posted',false)
  );
  return transaction_id;
end $$;

create or replace function public.record_receivable_adjustment(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_direction text,
  requested_amount numeric,
  requested_effective_date date,
  requested_reason text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare transaction_id uuid;
declare existing_hash text;
declare operation_hash text;
declare outstanding numeric;
declare remaining numeric;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.adjust');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'direction',requested_direction,
    'amount',round(coalesce(requested_amount,0),4),'effective_date',requested_effective_date,
    'reason',nullif(trim(requested_reason),'')
  )::text);
  select transaction.id,transaction.metadata->>'operation_hash' into transaction_id,existing_hash
  from public.receivable_transactions transaction where transaction.operation_id=requested_operation_id;
  if transaction_id is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return transaction_id;
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  if account.status not in ('active','fully_repaid') then raise exception 'Only active or fully repaid receivables can be adjusted'; end if;
  if requested_direction not in ('increase','decrease') then raise exception 'Invalid adjustment direction'; end if;
  if coalesce(requested_amount,0)<=0 then raise exception 'Adjustment amount must be greater than zero'; end if;
  if requested_effective_date is null then raise exception 'Effective date is required'; end if;
  if char_length(coalesce(trim(requested_reason),''))<2 then raise exception 'Reason is required'; end if;
  if requested_direction='increase' and exists(
    select 1 from public.receivable_installments installment where installment.receivable_account_id=account.id
  ) then raise exception 'An increase cannot change an approved installment schedule'; end if;
  outstanding:=public.receivable_current_outstanding(account.id);
  if requested_direction='decrease' and round(requested_amount,4)>round(outstanding,4) then
    raise exception 'Adjustment decrease cannot exceed current outstanding';
  end if;
  remaining:=round(outstanding+(case when requested_direction='increase' then requested_amount else -requested_amount end),4);
  transaction_id:=gen_random_uuid();
  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    source,operation_id,notes,metadata,created_by
  ) values(
    transaction_id,account.id,'adjustment_'||requested_direction,requested_direction,
    round(requested_amount,4),requested_effective_date,'manual',requested_operation_id,
    left(trim(requested_reason),2000),
    jsonb_build_object('operation_hash',operation_hash,'accounting_posted',false,'cashbook_posted',false),actor_profile_id
  );
  update public.receivable_accounts set
    status=case when remaining=0 then 'fully_repaid' else 'active' end,updated_by=actor_profile_id
  where id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.adjustment_recorded','receivables','receivable_account',account.id::text,
    'Controlled operational receivable adjustment recorded.',
    jsonb_build_object('direction',requested_direction,'amount',round(requested_amount,4),'currency',account.currency,'outstanding_after',remaining,'reason',trim(requested_reason)),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash,'transaction_id',transaction_id,'accounting_posted',false)
  );
  return transaction_id;
end $$;

create or replace function public.reverse_receivable_transaction(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_transaction_id uuid,
  requested_operation_id uuid,
  requested_effective_date date,
  requested_reason text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account public.receivable_accounts%rowtype;
declare original public.receivable_transactions%rowtype;
declare transaction_id uuid;
declare existing_hash text;
declare operation_hash text;
declare reversal_direction text;
declare outstanding numeric;
declare remaining numeric;
declare next_status text;
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.adjust');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  operation_hash:=md5(jsonb_build_object(
    'account_id',requested_account_id,'transaction_id',requested_transaction_id,
    'effective_date',requested_effective_date,'reason',nullif(trim(requested_reason),'')
  )::text);
  select transaction.id,transaction.metadata->>'operation_hash' into transaction_id,existing_hash
  from public.receivable_transactions transaction where transaction.operation_id=requested_operation_id;
  if transaction_id is not null then
    if existing_hash<>operation_hash then raise exception 'This operation ID was already used with different values'; end if;
    return transaction_id;
  end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  select * into original from public.receivable_transactions
  where id=requested_transaction_id and receivable_account_id=account.id for update;
  if original.id is null then raise exception 'Receivable transaction not found'; end if;
  if original.transaction_type='reversal' then raise exception 'A reversal transaction cannot be reversed'; end if;
  if exists(select 1 from public.receivable_transactions transaction where transaction.reversal_of_transaction_id=original.id) then
    raise exception 'This transaction has already been reversed';
  end if;
  if requested_effective_date is null then raise exception 'Effective date is required'; end if;
  if char_length(coalesce(trim(requested_reason),''))<2 then raise exception 'Reason is required'; end if;
  outstanding:=public.receivable_current_outstanding(account.id);
  reversal_direction:=case original.direction when 'increase' then 'decrease' else 'increase' end;
  remaining:=round(outstanding+(case when reversal_direction='increase' then original.amount else -original.amount end),4);
  if remaining<0 then raise exception 'Reversal would make outstanding negative'; end if;
  next_status:=case
    when original.transaction_type='disbursement' and remaining=0 then 'approved'
    when remaining=0 then 'fully_repaid'
    else 'active'
  end;
  transaction_id:=gen_random_uuid();
  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    source,operation_id,reversal_of_transaction_id,notes,metadata,created_by
  ) values(
    transaction_id,account.id,'reversal',reversal_direction,original.amount,
    requested_effective_date,'manual',requested_operation_id,original.id,
    left(trim(requested_reason),2000),
    jsonb_build_object('operation_hash',operation_hash,'original_transaction_type',original.transaction_type,'accounting_posted',false),actor_profile_id
  );
  update public.receivable_accounts set status=next_status,updated_by=actor_profile_id where id=account.id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.transaction_reversed','receivables','receivable_account',account.id::text,
    'Receivable transaction reversed with an immutable correcting transaction.',
    jsonb_build_object('original_transaction_id',original.id,'amount',original.amount,'direction',reversal_direction,'status',next_status,'reason',trim(requested_reason)),
    jsonb_build_object('operation_id',requested_operation_id,'operation_hash',operation_hash,'transaction_id',transaction_id,'accounting_posted',false)
  );
  return transaction_id;
end $$;

create or replace view public.non_sales_receivable_details_v as
with movement as (
  select
    transaction.receivable_account_id,
    coalesce(sum(case transaction.direction when 'increase' then transaction.amount else -transaction.amount end),0::numeric) as outstanding_amount,
    coalesce(sum(case
      when transaction.transaction_type='opening_balance' then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type='opening_balance' then -transaction.amount
      else 0::numeric end),0::numeric) as opening_amount,
    coalesce(sum(case
      when transaction.transaction_type='disbursement' then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type='disbursement' then -transaction.amount
      else 0::numeric end),0::numeric) as disbursed_amount,
    coalesce(sum(case
      when transaction.transaction_type='repayment' then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type='repayment' then -transaction.amount
      else 0::numeric end),0::numeric) as repaid_amount,
    coalesce(sum(case
      when transaction.transaction_type='adjustment_decrease' then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type='adjustment_decrease' then -transaction.amount
      else 0::numeric end),0::numeric) as adjustment_decrease_amount,
    coalesce(sum(case
      when transaction.transaction_type='adjustment_increase' then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type='adjustment_increase' then -transaction.amount
      else 0::numeric end),0::numeric) as adjustment_increase_amount,
    max(transaction.effective_date) as last_activity_date
  from public.receivable_transactions transaction
  left join public.receivable_transactions original on original.id=transaction.reversal_of_transaction_id
  group by transaction.receivable_account_id
)
select
  account.*,
  greatest(coalesce(movement.opening_amount,0),0::numeric) as opening_principal,
  greatest(coalesce(movement.disbursed_amount,0),0::numeric) as disbursed_amount,
  greatest(coalesce(movement.repaid_amount,0),0::numeric) as repaid_amount,
  greatest(coalesce(movement.adjustment_decrease_amount,0),0::numeric) as adjustment_decrease_amount,
  greatest(coalesce(movement.adjustment_increase_amount,0),0::numeric) as adjustment_increase_amount,
  greatest(coalesce(movement.outstanding_amount,0),0::numeric) as outstanding_amount,
  greatest(coalesce(movement.repaid_amount,0)+coalesce(movement.adjustment_decrease_amount,0),0::numeric) as recovered_amount,
  movement.last_activity_date
from public.receivable_accounts account
left join movement on movement.receivable_account_id=account.id;

create or replace view public.receivable_installment_status_v as
with ranked as (
  select
    installment.*,
    detail.currency,
    detail.status as account_status,
    detail.recovered_amount,
    coalesce(sum(installment.amount_due) over(
      partition by installment.receivable_account_id
      order by installment.installment_number
      rows between unbounded preceding and 1 preceding
    ),0::numeric) as amount_due_before
  from public.receivable_installments installment
  join public.non_sales_receivable_details_v detail on detail.id=installment.receivable_account_id
),allocated as (
  select ranked.*,
    least(ranked.amount_due,greatest(ranked.recovered_amount-ranked.amount_due_before,0::numeric)) as paid_amount
  from ranked
)
select
  allocated.id,allocated.receivable_account_id,allocated.installment_number,
  allocated.due_date,allocated.amount_due,allocated.currency,
  greatest(allocated.paid_amount,0::numeric) as paid_amount,
  greatest(allocated.amount_due-allocated.paid_amount,0::numeric) as remaining_amount,
  case
    when allocated.paid_amount>=allocated.amount_due then 'paid'
    when allocated.due_date<timezone('Asia/Dhaka',now())::date then 'overdue'
    when allocated.paid_amount>0 then 'partial'
    else 'unpaid'
  end as installment_status,
  case
    when allocated.paid_amount<allocated.amount_due and allocated.due_date<timezone('Asia/Dhaka',now())::date
      then timezone('Asia/Dhaka',now())::date-allocated.due_date
    else null end as days_overdue,
  allocated.created_by,allocated.created_at
from allocated;

create or replace view public.non_sales_receivables_v as
select
  'non_sales'::text as source_type,
  detail.id as source_id,
  detail.receivable_number as reference_number,
  null::text as invoice_number,
  detail.category as receivable_type,
  detail.borrower_type as party_type,
  coalesce(detail.employee_record_id,detail.customer_profile_id,detail.supplier_id,
    detail.crm_company_id,detail.crm_contact_id,detail.external_party_id) as party_id,
  detail.borrower_display_name_snapshot as party_name,
  detail.currency,
  detail.original_amount,
  greatest(detail.opening_previously_repaid+detail.recovered_amount,0::numeric) as paid_amount,
  detail.outstanding_amount,
  detail.status as receivable_status,
  detail.created_at::date as issue_date,
  next_installment.due_date,
  case when next_installment.due_date<timezone('Asia/Dhaka',now())::date
    then timezone('Asia/Dhaka',now())::date-next_installment.due_date else null end as days_overdue,
  detail.created_by as responsible_profile_id,
  detail.last_activity_date,
  detail.is_opening_balance
from public.non_sales_receivable_details_v detail
left join lateral (
  select installment.due_date
  from public.receivable_installment_status_v installment
  where installment.receivable_account_id=detail.id and installment.remaining_amount>0
  order by installment.installment_number limit 1
) next_installment on true;

create or replace view public.receivables_overview_v as
select * from public.customer_receivables_v
union all
select * from public.non_sales_receivables_v;

create or replace view public.non_sales_receivable_metrics_v as
with installment_metrics as (
  select
    installment.receivable_account_id,
    coalesce(sum(installment.remaining_amount) filter(where installment.due_date=timezone('Asia/Dhaka',now())::date),0::numeric) as due_today,
    coalesce(sum(installment.remaining_amount) filter(where installment.due_date>timezone('Asia/Dhaka',now())::date and installment.due_date<=timezone('Asia/Dhaka',now())::date+7),0::numeric) as due_next_7_days,
    coalesce(sum(installment.remaining_amount) filter(where installment.due_date<timezone('Asia/Dhaka',now())::date),0::numeric) as overdue_amount
  from public.receivable_installment_status_v installment
  group by installment.receivable_account_id
),month_recovery as (
  select transaction.receivable_account_id,
    coalesce(sum(case
      when transaction.transaction_type in ('repayment','adjustment_decrease') then transaction.amount
      when transaction.transaction_type='reversal' and original.transaction_type in ('repayment','adjustment_decrease') then -transaction.amount
      else 0::numeric end),0::numeric) as recovered_this_month
  from public.receivable_transactions transaction
  left join public.receivable_transactions original on original.id=transaction.reversal_of_transaction_id
  where date_trunc('month',transaction.effective_date::timestamp)=date_trunc('month',timezone('Asia/Dhaka',now()))
  group by transaction.receivable_account_id
)
select
  detail.currency,detail.category,
  count(*) filter(where detail.outstanding_amount>0) as account_count,
  coalesce(sum(detail.outstanding_amount),0::numeric) as outstanding_amount,
  coalesce(sum(installment_metrics.due_today),0::numeric) as due_today,
  coalesce(sum(installment_metrics.due_next_7_days),0::numeric) as due_next_7_days,
  coalesce(sum(installment_metrics.overdue_amount),0::numeric) as overdue_amount,
  coalesce(sum(month_recovery.recovered_this_month),0::numeric) as recovered_this_month
from public.non_sales_receivable_details_v detail
left join installment_metrics on installment_metrics.receivable_account_id=detail.id
left join month_recovery on month_recovery.receivable_account_id=detail.id
group by detail.currency,detail.category;

alter table public.receivable_installments enable row level security;

create policy "authorized staff read receivable installments"
on public.receivable_installments for select to authenticated
using(public.is_current_user_admin() or public.current_user_has_permission('receivables.view_loans'));

revoke all on public.receivable_installments from public,anon,authenticated;
grant select on public.receivable_installments to authenticated;
grant all on public.receivable_installments to service_role;

revoke all on public.non_sales_receivable_details_v,public.receivable_installment_status_v,
  public.non_sales_receivable_metrics_v from public,anon,authenticated;
grant select on public.non_sales_receivable_details_v,public.receivable_installment_status_v,
  public.non_sales_receivable_metrics_v to service_role;

revoke all on function public.validate_receivable_category_borrower(),
  public.protect_receivable_installment_schedule(),
  public.receivable_current_outstanding(uuid),
  public.rebuild_receivable_installments(uuid,numeric,integer,numeric,date,uuid),
  public.transition_receivable_account(uuid,uuid,uuid,text,numeric,text),
  public.set_receivable_installment_schedule(uuid,uuid,uuid,integer,numeric,date),
  public.confirm_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text),
  public.record_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text),
  public.record_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text),
  public.reverse_receivable_transaction(uuid,uuid,uuid,uuid,date,text)
from public,anon,authenticated;

grant execute on function public.validate_receivable_category_borrower(),
  public.protect_receivable_installment_schedule(),
  public.receivable_current_outstanding(uuid),
  public.rebuild_receivable_installments(uuid,numeric,integer,numeric,date,uuid),
  public.transition_receivable_account(uuid,uuid,uuid,text,numeric,text),
  public.set_receivable_installment_schedule(uuid,uuid,uuid,integer,numeric,date),
  public.confirm_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text),
  public.record_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text),
  public.record_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text),
  public.reverse_receivable_transaction(uuid,uuid,uuid,uuid,date,text)
to service_role;

commit;
