begin;

-- Phase 5 is an additive, non-Sales financial boundary. Phase 3 remains the
-- operational Receivables source of truth; this migration adds only the
-- accounting linkage and trusted posting/reversal functions.

alter table public.receivable_transactions
  add column if not exists accounting_treatment text;

alter table public.receivable_transactions
  drop constraint if exists receivable_transactions_accounting_treatment_check;

alter table public.receivable_transactions
  add constraint receivable_transactions_accounting_treatment_check check(
    accounting_treatment is null or accounting_treatment in (
      'cash_disbursement','cash_repayment','cash_recovery','rent_expense_offset',
      'payable_offset','write_off','non_cash_correction','historical_opening'
    )
  );

create table public.receivable_accounting_postings (
  id uuid primary key default gen_random_uuid(),
  receivable_transaction_id uuid not null unique references public.receivable_transactions(id) on delete restrict,
  journal_entry_id uuid unique references public.journal_entries(id) on delete restrict,
  cashbook_entry_id uuid unique references public.cashbook_entries(id) on delete restrict,
  posting_type text not null check(posting_type in ('disbursement','repayment','adjustment','reversal')),
  accounting_treatment text not null check(accounting_treatment in (
    'cash_disbursement','cash_repayment','cash_recovery','rent_expense_offset',
    'payable_offset','write_off','non_cash_correction','historical_opening'
  )),
  operation_id uuid not null unique,
  payload_hash text not null check(char_length(trim(payload_hash)) between 16 and 128),
  posting_status text not null check(posting_status in ('posted','needs_review')),
  accounting_date date,
  posted_by uuid references public.profiles(id) on delete set null,
  posted_at timestamptz,
  reversal_of_posting_id uuid references public.receivable_accounting_postings(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint receivable_accounting_postings_posted_fields_check check(
    (posting_status='posted' and journal_entry_id is not null and accounting_date is not null and posted_at is not null)
    or
    (posting_status='needs_review' and journal_entry_id is null and cashbook_entry_id is null)
  )
);

create unique index receivable_accounting_postings_one_reversal_idx
  on public.receivable_accounting_postings(reversal_of_posting_id)
  where reversal_of_posting_id is not null;
create index receivable_accounting_postings_status_idx
  on public.receivable_accounting_postings(posting_status,created_at desc);
create index receivable_accounting_postings_account_idx
  on public.receivable_accounting_postings(receivable_transaction_id);

insert into public.cashbook_descriptions(name,transaction_type)
values
  ('Receivable disbursement','expense'),
  ('Receivable repayment','income'),
  ('Receivable cash recovery','income'),
  ('Receivable disbursement reversal','income'),
  ('Receivable repayment reversal','expense'),
  ('Receivable cash recovery reversal','expense')
on conflict do nothing;

create or replace view public.receivable_accounting_reconciliation_v as
select
  account.id as receivable_account_id,
  account.receivable_number,
  account.borrower_type,
  account.borrower_display_name_snapshot as borrower_name,
  account.category,
  account.currency,
  transaction.id as receivable_transaction_id,
  transaction.transaction_type,
  transaction.direction,
  transaction.amount,
  transaction.effective_date,
  transaction.payment_method,
  transaction.source,
  transaction.accounting_treatment,
  transaction.operation_id as receivable_operation_id,
  posting.id as posting_id,
  case
    when transaction.transaction_type='opening_balance' then 'historical_opening'
    when posting.id is null then 'not_posted'
    when exists(
      select 1 from public.receivable_accounting_postings reversal
      where reversal.reversal_of_posting_id=posting.id
    ) then 'reversed'
    when posting.posting_status='needs_review' then 'needs_review'
    else 'posted'
  end as posting_status,
  posting.posting_type,
  posting.operation_id as posting_operation_id,
  posting.journal_entry_id,
  journal.entry_number as journal_entry_number,
  posting.cashbook_entry_id,
  posting.accounting_date,
  posting.posted_by,
  posting.posted_at,
  posting.reversal_of_posting_id,
  posting.metadata as posting_metadata,
  transaction.notes,
  transaction.created_at
from public.receivable_accounts account
join public.receivable_transactions transaction
  on transaction.receivable_account_id=account.id
left join public.receivable_accounting_postings posting
  on posting.receivable_transaction_id=transaction.id
left join public.journal_entries journal
  on journal.id=posting.journal_entry_id;

create or replace function public.receivable_accounting_payload_hash(
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_posting_type text,
  requested_amount numeric,
  requested_effective_date date,
  requested_payment_method text,
  requested_accounting_treatment text,
  requested_source_transaction_id uuid,
  requested_note text
)
returns text language sql immutable set search_path=public
as $$
  select encode(extensions.digest(concat_ws('|',
    requested_account_id::text,
    requested_operation_id::text,
    lower(trim(coalesce(requested_posting_type,''))),
    round(coalesce(requested_amount,0),4)::text,
    coalesce(requested_effective_date::text,''),
    lower(trim(coalesce(requested_payment_method,''))),
    lower(trim(coalesce(requested_accounting_treatment,''))),
    coalesce(requested_source_transaction_id::text,''),
    coalesce(trim(requested_note),'')
  ),'sha256'),'hex');
$$;

create or replace function public.receivable_accounting_payment_account(
  requested_payment_method text
)
returns uuid language sql stable security definer set search_path=public
as $$
  select id
  from public.accounting_accounts
  where code=case lower(trim(coalesce(requested_payment_method,'')))
    when 'cash' then '1010'
    when 'bank' then '1020'
    when 'mfs' then '1030'
    else ''
  end
    and currency='BDT' and is_active=true;
$$;

create or replace function public.receivable_accounting_control_account()
returns uuid language sql stable security definer set search_path=public
as $$
  select id from public.accounting_accounts
  where code='1100' and currency='BDT' and is_active=true;
$$;

create or replace function public.receivable_accounting_expense_account(
  requested_treatment text
)
returns uuid language sql stable security definer set search_path=public
as $$
  select id from public.accounting_accounts
  where code=case lower(trim(coalesce(requested_treatment,'')))
    when 'payable_offset' then '2000'
    when 'rent_expense_offset' then '6000'
    when 'write_off' then '6000'
    else ''
  end
    and currency='BDT' and is_active=true;
$$;

create or replace function public.receivable_accounting_assert_authority(
  actor_profile_id uuid,
  required_receivable_permission text,
  requires_cashbook boolean
)
returns void language plpgsql security definer set search_path=public
as $$
begin
  perform public.assert_actor_permission(actor_profile_id,required_receivable_permission);
  perform public.assert_actor_permission(actor_profile_id,'accounting.create_entry');
  perform public.assert_actor_permission(actor_profile_id,'accounting.approve_entry');
  if requires_cashbook then
    perform public.assert_actor_permission(actor_profile_id,'accounting.manage_cashbook');
  end if;
end $$;

create or replace function public.post_receivable_accounting_operation(
  actor_profile_id uuid,
  requested_account_id uuid,
  requested_operation_id uuid,
  requested_posting_type text,
  requested_amount numeric,
  requested_effective_date date,
  requested_payment_method text,
  requested_accounting_treatment text,
  requested_note text,
  requested_source_transaction_id uuid default null,
  requested_direction text default null
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare
  account public.receivable_accounts%rowtype;
  existing_link public.receivable_accounting_postings%rowtype;
  transaction_id uuid:=gen_random_uuid();
  posting_id uuid:=gen_random_uuid();
  journal_id uuid:=gen_random_uuid();
  cashbook_id uuid;
  journal_line_debit_account uuid;
  journal_line_credit_account uuid;
  cashbook_description_id uuid;
  normalized_type text:=lower(trim(coalesce(requested_posting_type,'')));
  normalized_method text:=lower(trim(coalesce(requested_payment_method,'')));
  normalized_treatment text:=lower(trim(coalesce(requested_accounting_treatment,'')));
  normalized_direction text:=lower(trim(coalesce(requested_direction,'')));
  payload_hash text;
  posting_status text:='posted';
  requires_cashbook boolean:=false;
  journal_description text;
  actor_role public.account_role;
  outstanding numeric;
  outstanding_after numeric;
  transaction_type text;
  payment_description text;
  metadata jsonb;
begin
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  if normalized_type not in ('disbursement','repayment','adjustment') then
    raise exception 'Unsupported Receivable posting type';
  end if;
  if requested_amount is null or requested_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  requested_amount:=round(requested_amount,2);
  if requested_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if requested_effective_date is null then raise exception 'Accounting date is required'; end if;
  if normalized_method not in ('cash','bank','mfs','other') then raise exception 'Invalid payment method'; end if;
  if normalized_treatment not in (
    'cash_disbursement','cash_repayment','cash_recovery','rent_expense_offset',
    'payable_offset','write_off','non_cash_correction'
  ) then raise exception 'Unsupported Accounting treatment'; end if;

  requires_cashbook:=normalized_treatment in ('cash_disbursement','cash_repayment','cash_recovery');
  perform public.receivable_accounting_assert_authority(
    actor_profile_id,
    case normalized_type when 'disbursement' then 'receivables.disburse'
      when 'repayment' then 'receivables.record_repayment'
      else 'receivables.adjust' end,
    requires_cashbook and normalized_method<>'other'
  );
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));

  payload_hash:=public.receivable_accounting_payload_hash(
    requested_account_id,requested_operation_id,normalized_type,requested_amount,
    requested_effective_date,normalized_method,normalized_treatment,
    requested_source_transaction_id,requested_note
  );
  select * into existing_link from public.receivable_accounting_postings
  where operation_id=requested_operation_id;
  if existing_link.id is not null then
    if existing_link.payload_hash<>payload_hash then raise exception 'Operation ID was already used with different posting data'; end if;
    return jsonb_build_object(
      'posting_id',existing_link.id,'receivable_transaction_id',existing_link.receivable_transaction_id,
      'journal_entry_id',existing_link.journal_entry_id,'cashbook_entry_id',existing_link.cashbook_entry_id,
      'posting_status',existing_link.posting_status,'replayed',true
    );
  end if;

  if normalized_method='salary_deduction' then raise exception 'Salary deduction is reserved for Payroll'; end if;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null then raise exception 'Receivable account not found'; end if;
  if account.currency<>'BDT' then
    posting_status:='needs_review';
    requires_cashbook:=false;
  end if;

  if normalized_type='disbursement' then
    if account.status<>'approved' then raise exception 'Only approved Receivables can be disbursed'; end if;
    if requested_amount>coalesce(account.approved_amount,account.requested_amount) then
      raise exception 'Disbursement exceeds approved amount';
    end if;
    transaction_type:='disbursement';
    normalized_direction:='increase';
  elsif normalized_type='repayment' then
    if account.status not in ('active','disbursed') then raise exception 'Only active Receivables can be repaid'; end if;
    outstanding:=public.receivable_current_outstanding(account.id);
    if requested_amount>outstanding then raise exception 'Repayment exceeds current outstanding'; end if;
    transaction_type:='repayment';
    normalized_direction:='decrease';
  else
    if normalized_direction not in ('increase','decrease') then raise exception 'Adjustment direction is required'; end if;
    if normalized_direction='increase' and account.installment_count is not null then
      raise exception 'An increase cannot change an approved installment schedule';
    end if;
    if normalized_direction='decrease' then
      outstanding:=public.receivable_current_outstanding(account.id);
      if requested_amount>outstanding then raise exception 'Adjustment exceeds current outstanding'; end if;
      transaction_type:='adjustment_decrease';
    else
      transaction_type:='adjustment_increase';
    end if;
  end if;

  if (
    normalized_treatment in ('cash_disbursement','cash_repayment','cash_recovery')
    and normalized_method='other'
  ) or normalized_treatment='non_cash_correction' or account.currency<>'BDT' then
    posting_status:='needs_review';
    requires_cashbook:=false;
  end if;

  if posting_status='needs_review' then
    journal_id:=null;
    cashbook_id:=null;
  end if;

  if posting_status='posted' then
    if requires_cashbook then
      perform public.lock_cashbook_timeline();
      perform public.assert_cashbook_predecessor_closed(requested_effective_date);
      insert into public.cashbook_days(business_date,opening_balance,updated_by)
      values(requested_effective_date,public.cashbook_opening_balance_for(requested_effective_date),actor_profile_id)
      on conflict(business_date) do nothing;
      perform 1 from public.cashbook_days where business_date=requested_effective_date for update;
      if (select is_closed from public.cashbook_days where business_date=requested_effective_date) then
        raise exception 'This cashbook day is closed';
      end if;
    end if;

    journal_line_debit_account:=public.receivable_accounting_control_account();
    journal_line_credit_account:=null;
    if normalized_treatment in ('cash_disbursement') then
      journal_line_credit_account:=public.receivable_accounting_payment_account(normalized_method);
    elsif normalized_treatment in ('cash_repayment','cash_recovery') then
      journal_line_debit_account:=public.receivable_accounting_payment_account(normalized_method);
      journal_line_credit_account:=public.receivable_accounting_control_account();
    elsif normalized_treatment in ('rent_expense_offset','payable_offset','write_off') then
      journal_line_debit_account:=public.receivable_accounting_expense_account(normalized_treatment);
      journal_line_credit_account:=public.receivable_accounting_control_account();
    else
      posting_status:='needs_review';
    end if;
    if posting_status='posted' and (journal_line_debit_account is null or journal_line_credit_account is null) then
      raise exception 'Required Accounting account is unavailable';
    end if;
  end if;

  metadata:=jsonb_build_object(
    'phase','5','accounting_posted',posting_status='posted',
    'cashbook_posted',requires_cashbook and posting_status='posted',
    'accounting_treatment',normalized_treatment
  );
  if posting_status='posted' then
    journal_description:=case normalized_type
      when 'disbursement' then 'Receivable disbursement'
      when 'repayment' then 'Receivable repayment'
      else 'Receivable adjustment' end;
    insert into public.journal_entries(
      id,entry_number,entry_date,description,reference_type,reference_id,status,
      currency,created_by,posted_by,posted_at
    ) values(
      journal_id,public.next_journal_entry_number(),requested_effective_date,
      journal_description,'adjustment',transaction_id,'posted','BDT',
      actor_profile_id,actor_profile_id,now()
    );
    insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
    values
      (journal_id,journal_line_debit_account,journal_description,round(requested_amount,2),0),
      (journal_id,journal_line_credit_account,journal_description,0,round(requested_amount,2));

    if requires_cashbook then
      payment_description:=case normalized_treatment
        when 'cash_disbursement' then 'Receivable disbursement'
        when 'cash_recovery' then 'Receivable cash recovery'
        else 'Receivable repayment' end;
      select cd.id into cashbook_description_id from public.cashbook_descriptions cd
      where lower(cd.name)=lower(payment_description) and cd.transaction_type=case
        when normalized_treatment='cash_disbursement' then 'expense' else 'income' end
        and is_active=true;
      if cashbook_description_id is null then raise exception 'Receivable Cash Book description is unavailable'; end if;
      cashbook_id:=gen_random_uuid();
      insert into public.cashbook_entries(
        id,description_id,transaction_type,amount,payment_method,transaction_at,
        business_date,journal_entry_id,created_by
      ) values(
        cashbook_id,cashbook_description_id,
        case when normalized_treatment='cash_disbursement' then 'expense' else 'income' end,
        round(requested_amount,2),normalized_method,
        (requested_effective_date::timestamp at time zone 'Asia/Dhaka'),
        requested_effective_date,journal_id,actor_profile_id
      );
    end if;
  end if;

  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    payment_method,source,operation_id,journal_entry_id,cashbook_entry_id,
    accounting_treatment,notes,metadata,created_by
  ) values(
    transaction_id,account.id,transaction_type,normalized_direction,requested_amount,
    requested_effective_date,normalized_method,case when normalized_type='repayment' then 'accounting' else 'accounting' end,
    requested_operation_id,journal_id,cashbook_id,normalized_treatment,requested_note,metadata,actor_profile_id
  );

  insert into public.receivable_accounting_postings(
    id,receivable_transaction_id,journal_entry_id,cashbook_entry_id,posting_type,
    accounting_treatment,operation_id,payload_hash,posting_status,accounting_date,
    posted_by,posted_at,metadata
  ) values(
    posting_id,transaction_id,journal_id,cashbook_id,normalized_type,
    normalized_treatment,requested_operation_id,payload_hash,posting_status,
    case when posting_status='posted' then requested_effective_date else null end,
    case when posting_status='posted' then actor_profile_id else null end,
    case when posting_status='posted' then now() else null end,metadata
  );

  if normalized_type='disbursement' then
    update public.receivable_accounts set status='active',disbursement_date=requested_effective_date,
      disbursed_by=actor_profile_id,disbursed_at=now(),updated_by=actor_profile_id,updated_at=now()
    where id=account.id;
  elsif normalized_type in ('repayment','adjustment') and normalized_direction='decrease' then
    outstanding_after:=round(public.receivable_current_outstanding(account.id),4);
    update public.receivable_accounts set status=case when outstanding_after=0 then 'fully_repaid' else 'active' end,
      updated_by=actor_profile_id,updated_at=now() where id=account.id;
  end if;

  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(
    actor_profile_id,actor_role,'receivables.accounting_posted','receivables',
    'receivable_accounting_posting',posting_id,
    case when posting_status='posted' then 'Receivable Accounting and Cash Book posting committed atomically.'
      else 'Receivable operation recorded and marked for Accounting review.' end,
    jsonb_build_object('posting_status',posting_status,'amount',requested_amount,'currency',account.currency),
    jsonb_build_object('receivable_account_id',account.id,'receivable_transaction_id',transaction_id,
      'journal_entry_id',journal_id,'cashbook_entry_id',cashbook_id,'operation_id',requested_operation_id,
      'accounting_treatment',normalized_treatment)
  );
  return jsonb_build_object(
    'posting_id',posting_id,'receivable_transaction_id',transaction_id,
    'journal_entry_id',journal_id,'cashbook_entry_id',cashbook_id,
    'posting_status',posting_status,'replayed',false
  );
end $$;

create or replace function public.post_receivable_disbursement(
  actor_profile_id uuid, requested_account_id uuid, requested_operation_id uuid,
  requested_amount numeric, requested_effective_date date, requested_payment_method text,
  requested_note text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$ begin
  return public.post_receivable_accounting_operation(actor_profile_id,requested_account_id,
    requested_operation_id,'disbursement',requested_amount,requested_effective_date,
    requested_payment_method,'cash_disbursement',requested_note,null,'increase');
end $$;

create or replace function public.post_receivable_repayment(
  actor_profile_id uuid, requested_account_id uuid, requested_operation_id uuid,
  requested_amount numeric, requested_effective_date date, requested_payment_method text,
  requested_note text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$ begin
  return public.post_receivable_accounting_operation(actor_profile_id,requested_account_id,
    requested_operation_id,'repayment',requested_amount,requested_effective_date,
    requested_payment_method,'cash_repayment',requested_note,null,'decrease');
end $$;

create or replace function public.post_receivable_adjustment(
  actor_profile_id uuid, requested_account_id uuid, requested_operation_id uuid,
  requested_direction text, requested_amount numeric, requested_effective_date date,
  requested_payment_method text, requested_accounting_treatment text, requested_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$ begin
  return public.post_receivable_accounting_operation(actor_profile_id,requested_account_id,
    requested_operation_id,'adjustment',requested_amount,requested_effective_date,
    requested_payment_method,requested_accounting_treatment,requested_reason,null,requested_direction);
end $$;

create or replace function public.reverse_receivable_accounting_posting(
  actor_profile_id uuid, requested_account_id uuid, requested_posting_id uuid,
  requested_operation_id uuid, requested_effective_date date, requested_reason text
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare
  original public.receivable_accounting_postings%rowtype;
  original_transaction public.receivable_transactions%rowtype;
  account public.receivable_accounts%rowtype;
  existing_link public.receivable_accounting_postings%rowtype;
  reversal_transaction_id uuid:=gen_random_uuid();
  reversal_posting_id uuid:=gen_random_uuid();
  reversal_journal_id uuid:=gen_random_uuid();
  reversal_cashbook_id uuid;
  debit_account uuid;
  credit_account uuid;
  cashbook_description_id uuid;
  normalized_treatment text;
  normalized_method text;
  payload_hash text;
  journal_description text:='Receivable posting reversal';
  actor_role public.account_role;
  outstanding_after numeric;
  reversed_direction text;
  reversed_transaction_type text:='reversal';
  cashbook_is_expense boolean:=false;
begin
  perform public.receivable_accounting_assert_authority(actor_profile_id,'receivables.adjust',false);
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  if requested_effective_date is null then raise exception 'Reversal date is required'; end if;
  if char_length(trim(coalesce(requested_reason,'')))<2 then raise exception 'Reversal reason is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));
  select * into existing_link from public.receivable_accounting_postings where operation_id=requested_operation_id;
  payload_hash:=encode(extensions.digest(concat_ws('|',requested_account_id::text,requested_posting_id::text,requested_operation_id::text,requested_effective_date::text,trim(requested_reason)),'sha256'),'hex');
  if existing_link.id is not null then
    if existing_link.payload_hash<>payload_hash then raise exception 'Operation ID was already used with different reversal data'; end if;
    return jsonb_build_object('posting_id',existing_link.id,'receivable_transaction_id',existing_link.receivable_transaction_id,
      'journal_entry_id',existing_link.journal_entry_id,'cashbook_entry_id',existing_link.cashbook_entry_id,
      'posting_status','posted','replayed',true);
  end if;

  select * into original from public.receivable_accounting_postings where id=requested_posting_id for update;
  if original.id is null then raise exception 'Accounting posting not found'; end if;
  if original.reversal_of_posting_id is not null then raise exception 'A reversal cannot itself be reversed'; end if;
  if exists(select 1 from public.receivable_accounting_postings where reversal_of_posting_id=original.id) then
    raise exception 'This Accounting posting has already been reversed';
  end if;
  if original.posting_status<>'posted' or original.journal_entry_id is null then raise exception 'Only posted Accounting entries can be reversed'; end if;
  select * into original_transaction from public.receivable_transactions where id=original.receivable_transaction_id for update;
  select * into account from public.receivable_accounts where id=requested_account_id for update;
  if account.id is null or original_transaction.receivable_account_id<>account.id then raise exception 'Posting/account mismatch'; end if;
  normalized_treatment:=original.accounting_treatment;
  normalized_method:=coalesce(original_transaction.payment_method,'other');
  reversed_direction:=case original_transaction.direction when 'increase' then 'decrease' else 'increase' end;

  if normalized_treatment in ('cash_disbursement','cash_repayment','cash_recovery') then
    if normalized_method='other' then raise exception 'Cash posting reversal requires a mapped payment method'; end if;
    perform public.lock_cashbook_timeline();
    perform public.assert_cashbook_predecessor_closed(requested_effective_date);
    insert into public.cashbook_days(business_date,opening_balance,updated_by)
    values(requested_effective_date,public.cashbook_opening_balance_for(requested_effective_date),actor_profile_id)
    on conflict(business_date) do nothing;
    perform 1 from public.cashbook_days where business_date=requested_effective_date for update;
    if (select is_closed from public.cashbook_days where business_date=requested_effective_date) then raise exception 'This cashbook day is closed'; end if;
  end if;

  if normalized_treatment='cash_disbursement' then
    debit_account:=public.receivable_accounting_payment_account(normalized_method);
    credit_account:=public.receivable_accounting_control_account();
    cashbook_is_expense:=false;
  elsif normalized_treatment in ('cash_repayment','cash_recovery') then
    debit_account:=public.receivable_accounting_control_account();
    credit_account:=public.receivable_accounting_payment_account(normalized_method);
    cashbook_is_expense:=true;
  elsif normalized_treatment in ('rent_expense_offset','payable_offset','write_off') then
    debit_account:=public.receivable_accounting_control_account();
    credit_account:=public.receivable_accounting_expense_account(normalized_treatment);
  else
    raise exception 'Unsupported reversal treatment';
  end if;
  if debit_account is null or credit_account is null then raise exception 'Required Accounting account is unavailable'; end if;

  insert into public.journal_entries(
    id,entry_number,entry_date,description,reference_type,reference_id,status,currency,created_by,posted_by,posted_at,reversal_of
  ) values(
    reversal_journal_id,public.next_journal_entry_number(),requested_effective_date,journal_description,
    'adjustment',reversal_transaction_id,'posted','BDT',actor_profile_id,actor_profile_id,now(),original.journal_entry_id
  );
  insert into public.journal_lines(journal_entry_id,account_id,description,debit,credit)
  values
    (reversal_journal_id,debit_account,journal_description,round(original_transaction.amount,2),0),
    (reversal_journal_id,credit_account,journal_description,0,round(original_transaction.amount,2));

  if normalized_treatment in ('cash_disbursement','cash_repayment','cash_recovery') then
    select cd.id into cashbook_description_id from public.cashbook_descriptions cd
    where lower(cd.name)=lower(case when normalized_treatment='cash_disbursement' then 'Receivable disbursement reversal'
      when normalized_treatment='cash_recovery' then 'Receivable cash recovery reversal' else 'Receivable repayment reversal' end)
      and cd.transaction_type=case when cashbook_is_expense then 'expense' else 'income' end and cd.is_active=true;
    if cashbook_description_id is null then raise exception 'Receivable Cash Book description is unavailable'; end if;
    reversal_cashbook_id:=gen_random_uuid();
    insert into public.cashbook_entries(
      id,description_id,transaction_type,amount,payment_method,transaction_at,business_date,journal_entry_id,created_by
    ) values(
      reversal_cashbook_id,cashbook_description_id,case when cashbook_is_expense then 'expense' else 'income' end,
      round(original_transaction.amount,2),normalized_method,(requested_effective_date::timestamp at time zone 'Asia/Dhaka'),
      requested_effective_date,reversal_journal_id,actor_profile_id
    );
  end if;

  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,payment_method,source,
    operation_id,journal_entry_id,cashbook_entry_id,reversal_of_transaction_id,accounting_treatment,notes,metadata,created_by
  ) values(
    reversal_transaction_id,account.id,reversed_transaction_type,reversed_direction,original_transaction.amount,
    requested_effective_date,normalized_method,'accounting',requested_operation_id,reversal_journal_id,reversal_cashbook_id,
    original_transaction.id,normalized_treatment,requested_reason,jsonb_build_object('reversal_of_posting_id',original.id),actor_profile_id
  );
  insert into public.receivable_accounting_postings(
    id,receivable_transaction_id,journal_entry_id,cashbook_entry_id,posting_type,accounting_treatment,
    operation_id,payload_hash,posting_status,accounting_date,posted_by,posted_at,reversal_of_posting_id,metadata
  ) values(
    reversal_posting_id,reversal_transaction_id,reversal_journal_id,reversal_cashbook_id,'reversal',normalized_treatment,
    requested_operation_id,payload_hash,'posted',requested_effective_date,actor_profile_id,now(),original.id,
    jsonb_build_object('phase','5','reversal_of_posting_id',original.id)
  );
  outstanding_after:=public.receivable_current_outstanding(account.id);
  update public.receivable_accounts set status=case when outstanding_after<=0 then 'fully_repaid' else 'active' end,
    updated_by=actor_profile_id,updated_at=now() where id=account.id;
  select role into actor_role from public.profiles where id=actor_profile_id;
  insert into public.audit_logs(actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata)
  values(actor_profile_id,actor_role,'receivables.accounting_reversal','receivables','receivable_accounting_posting',reversal_posting_id,
    'Receivable Accounting posting reversed immutably.',jsonb_build_object('reversal_of_posting_id',original.id,'amount',original_transaction.amount),
    jsonb_build_object('receivable_account_id',account.id,'operation_id',requested_operation_id));
  return jsonb_build_object('posting_id',reversal_posting_id,'receivable_transaction_id',reversal_transaction_id,
    'journal_entry_id',reversal_journal_id,'cashbook_entry_id',reversal_cashbook_id,'posting_status','posted','replayed',false);
end $$;

alter table public.receivable_accounting_postings enable row level security;
create policy "authorized finance reads receivable accounting postings"
on public.receivable_accounting_postings for select to authenticated
using(
  public.is_current_user_admin()
  or (
    public.current_user_has_permission('receivables.view_loans')
    and public.current_user_has_permission('accounting.view')
  )
);

revoke all on public.receivable_accounting_postings from public,anon,authenticated;
grant select on public.receivable_accounting_postings to authenticated;
grant all on public.receivable_accounting_postings to service_role;
revoke all on public.receivable_accounting_reconciliation_v from public,anon,authenticated;
grant select on public.receivable_accounting_reconciliation_v to service_role;

revoke all on function public.receivable_accounting_payload_hash(uuid,uuid,text,numeric,date,text,text,uuid,text),
  public.receivable_accounting_payment_account(text),
  public.receivable_accounting_control_account(),
  public.receivable_accounting_expense_account(text),
  public.receivable_accounting_assert_authority(uuid,text,boolean),
  public.post_receivable_accounting_operation(uuid,uuid,uuid,text,numeric,date,text,text,text,uuid,text),
  public.post_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text),
  public.post_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text),
  public.post_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text,text,text),
  public.reverse_receivable_accounting_posting(uuid,uuid,uuid,uuid,date,text)
from public,anon,authenticated;

grant execute on function public.receivable_accounting_payload_hash(uuid,uuid,text,numeric,date,text,text,uuid,text),
  public.receivable_accounting_payment_account(text),
  public.receivable_accounting_control_account(),
  public.receivable_accounting_expense_account(text),
  public.receivable_accounting_assert_authority(uuid,text,boolean),
  public.post_receivable_accounting_operation(uuid,uuid,uuid,text,numeric,date,text,text,text,uuid,text),
  public.post_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text),
  public.post_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text),
  public.post_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text,text,text),
  public.reverse_receivable_accounting_posting(uuid,uuid,uuid,uuid,date,text)
to service_role;

-- Explicit wrapper grants keep the trusted boundary obvious to migration auditors.
revoke all on function public.post_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text) from public,anon,authenticated;
revoke all on function public.post_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text) from public,anon,authenticated;
revoke all on function public.post_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text,text,text) from public,anon,authenticated;
revoke all on function public.reverse_receivable_accounting_posting(uuid,uuid,uuid,uuid,date,text) from public,anon,authenticated;
grant execute on function public.post_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text) to service_role;
grant execute on function public.post_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text) to service_role;
grant execute on function public.post_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text,text,text) to service_role;
grant execute on function public.reverse_receivable_accounting_posting(uuid,uuid,uuid,uuid,date,text) to service_role;

select pg_notify('pgrst','reload schema');

commit;
