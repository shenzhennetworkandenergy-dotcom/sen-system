begin;

-- Receivables Phase 1 is additive and operational only. Customer balances are
-- derived from Sales. Non-Sales opening balances do not create accounting,
-- cashbook, payroll, purchasing, or Sales payment entries.

insert into public.app_modules(
  key,name,description,icon_key,sort_order,is_active,is_implemented
)
values(
  'receivables',
  'Receivables',
  'Operational control centre for customer outstanding and non-Sales receivables.',
  'accounting',
  115,
  true,
  true
)
on conflict(key) do update set
  name=excluded.name,
  description=excluded.description,
  icon_key=excluded.icon_key,
  sort_order=excluded.sort_order,
  is_active=true,
  is_implemented=true,
  updated_at=now();

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order
)
select module.id,entry.key,entry.name,entry.description,entry.action,entry.is_sensitive,entry.sort_order
from public.app_modules module
cross join (values
  ('receivables.view','View Receivables','Open the Receivables dashboard and authorized summaries.','view',false,10),
  ('receivables.view_customer','View Customer Receivables','View customer outstanding derived from Sales and payments.','view_customer',true,20),
  ('receivables.view_loans','View Loans and Advances','View non-Sales loans, advances, deposits, and operational transaction history.','view_loans',true,30),
  ('receivables.create','Create Loans and Advances','Create a non-Sales receivable account without posting Accounting.','create',true,40),
  ('receivables.manage_opening','Manage Opening Receivables','Create migrated opening receivables without fabricating historical cash or journal entries.','manage_opening',true,50)
) as entry(key,name,description,action,is_sensitive,sort_order)
where module.key='receivables'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

create sequence if not exists public.receivable_number_seq start 1;

create table public.receivable_external_parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check(party_type in ('individual','company','other')),
  display_name text not null check(char_length(trim(display_name)) between 2 and 180),
  company_name text,
  phone text,
  email text,
  external_reference text,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receivable_external_parties_name_idx
  on public.receivable_external_parties(display_name);
create index receivable_external_parties_active_idx
  on public.receivable_external_parties(is_active,updated_at desc);

create table public.receivable_accounts (
  id uuid primary key default gen_random_uuid(),
  receivable_number text not null unique,
  category text not null check(category in (
    'employee_loan','customer_loan','company_loan','individual_loan',
    'supplier_refundable_advance','security_deposit','recoverable_advance','other'
  )),
  borrower_type text not null check(borrower_type in (
    'employee','customer','supplier','crm_company','crm_contact','external_party'
  )),
  employee_record_id uuid references public.hr_employee_records(id) on delete restrict,
  customer_profile_id uuid references public.profiles(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  crm_company_id uuid references public.crm_companies(id) on delete restrict,
  crm_contact_id uuid references public.crm_contacts(id) on delete restrict,
  external_party_id uuid references public.receivable_external_parties(id) on delete restrict,
  borrower_display_name_snapshot text not null,
  currency char(3) not null default 'BDT' check(currency ~ '^[A-Z]{3}$'),
  requested_amount numeric(18,4) not null check(requested_amount>0),
  original_amount numeric(18,4) not null check(original_amount>0),
  approved_amount numeric(18,4) check(approved_amount is null or approved_amount>=0),
  default_repayment_method text check(default_repayment_method is null or default_repayment_method in (
    'salary_deduction','cash','bank','mfs','other'
  )),
  installment_count integer check(installment_count is null or installment_count>0),
  installment_amount numeric(18,4) check(installment_amount is null or installment_amount>0),
  first_due_date date,
  final_due_date date,
  disbursement_date date,
  status text not null default 'requested' check(status in (
    'requested','under_review','approved','disbursed','active',
    'fully_repaid','rejected','cancelled'
  )),
  notes text,
  is_opening_balance boolean not null default false,
  opening_as_of_date date,
  opening_previously_repaid numeric(18,4) not null default 0 check(opening_previously_repaid>=0),
  operation_id uuid not null unique,
  operation_hash text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check(version>=1),
  constraint receivable_accounts_one_borrower_check check(
    num_nonnulls(
      employee_record_id,customer_profile_id,supplier_id,crm_company_id,
      crm_contact_id,external_party_id
    )=1
  ),
  constraint receivable_accounts_borrower_target_check check(
    (borrower_type='employee' and employee_record_id is not null) or
    (borrower_type='customer' and customer_profile_id is not null) or
    (borrower_type='supplier' and supplier_id is not null) or
    (borrower_type='crm_company' and crm_company_id is not null) or
    (borrower_type='crm_contact' and crm_contact_id is not null) or
    (borrower_type='external_party' and external_party_id is not null)
  ),
  constraint receivable_accounts_dates_check check(
    final_due_date is null or first_due_date is null or final_due_date>=first_due_date
  ),
  constraint receivable_accounts_opening_check check(
    (is_opening_balance and opening_as_of_date is not null and status='active') or
    (not is_opening_balance and opening_as_of_date is null and opening_previously_repaid=0)
  ),
  constraint receivable_accounts_opening_amount_check check(
    opening_previously_repaid<=original_amount
  )
);

create index receivable_accounts_status_idx
  on public.receivable_accounts(status,updated_at desc);
create index receivable_accounts_employee_idx
  on public.receivable_accounts(employee_record_id,status)
  where employee_record_id is not null;
create index receivable_accounts_customer_idx
  on public.receivable_accounts(customer_profile_id,status)
  where customer_profile_id is not null;
create index receivable_accounts_supplier_idx
  on public.receivable_accounts(supplier_id,status)
  where supplier_id is not null;
create index receivable_accounts_due_idx
  on public.receivable_accounts(first_due_date,status);

create table public.receivable_transactions (
  id uuid primary key default gen_random_uuid(),
  receivable_account_id uuid not null references public.receivable_accounts(id) on delete restrict,
  transaction_type text not null check(transaction_type in (
    'opening_balance','disbursement','repayment','adjustment_increase',
    'adjustment_decrease','reversal'
  )),
  direction text not null check(direction in ('increase','decrease')),
  amount numeric(18,4) not null check(amount>0),
  effective_date date not null,
  payment_method text check(payment_method is null or payment_method in (
    'salary_deduction','cash','bank','mfs','other'
  )),
  source text not null check(source in (
    'opening_balance','manual','payroll','accounting','system'
  )),
  operation_id uuid not null unique,
  payroll_record_id uuid references public.hr_payroll_records(id) on delete restrict,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  cashbook_entry_id uuid references public.cashbook_entries(id) on delete restrict,
  reversal_of_transaction_id uuid references public.receivable_transactions(id) on delete restrict,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint receivable_transactions_reversal_check check(
    (transaction_type='reversal' and reversal_of_transaction_id is not null) or
    (transaction_type<>'reversal' and reversal_of_transaction_id is null)
  )
);

create index receivable_transactions_account_idx
  on public.receivable_transactions(receivable_account_id,effective_date desc,created_at desc);
create index receivable_transactions_source_idx
  on public.receivable_transactions(source,effective_date desc);

create or replace function public.receivables_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  if tg_table_name='receivable_accounts' then
    new.version=old.version+1;
  end if;
  return new;
end $$;

create trigger receivable_external_parties_touch_updated_at
before update on public.receivable_external_parties
for each row execute function public.receivables_touch_updated_at();

create trigger receivable_accounts_touch_updated_at
before update on public.receivable_accounts
for each row execute function public.receivables_touch_updated_at();

create or replace function public.prevent_receivable_transaction_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Receivable transactions are immutable; create a reversal transaction instead';
end $$;

create trigger receivable_transactions_immutable
before update or delete on public.receivable_transactions
for each row execute function public.prevent_receivable_transaction_mutation();

create or replace function public.next_receivable_number()
returns text language sql volatile security definer set search_path='' as $$
  select 'REC-'||to_char(timezone('Asia/Dhaka',now()),'YYYY')||'-'||
    lpad(nextval('public.receivable_number_seq')::text,6,'0');
$$;

create or replace function public.resolve_receivable_borrower(
  actor_profile_id uuid,
  requested_borrower_type text,
  requested_borrower_id uuid,
  requested_external_party jsonb
)
returns table(
  employee_record_id uuid,
  customer_profile_id uuid,
  supplier_id uuid,
  crm_company_id uuid,
  crm_contact_id uuid,
  external_party_id uuid,
  display_name text
)
language plpgsql volatile security definer set search_path='' as $$
declare external_name text;
begin
  employee_record_id:=null;
  customer_profile_id:=null;
  supplier_id:=null;
  crm_company_id:=null;
  crm_contact_id:=null;
  external_party_id:=null;
  display_name:=null;

  case requested_borrower_type
    when 'employee' then
      select employee.id,
        coalesce(nullif(trim(profile.full_name),''),profile.email,employee.employee_number)
      into employee_record_id,display_name
      from public.hr_employee_records employee
      join public.profiles profile on profile.id=employee.profile_id
      where employee.id=requested_borrower_id;
    when 'customer' then
      select profile.id,
        coalesce(nullif(trim(profile.company_name),''),nullif(trim(profile.full_name),''),profile.email)
      into customer_profile_id,display_name
      from public.profiles profile
      where profile.id=requested_borrower_id and profile.role='customer';
    when 'supplier' then
      select supplier.id,supplier.name into supplier_id,display_name
      from public.suppliers supplier where supplier.id=requested_borrower_id;
    when 'crm_company' then
      select company.id,company.name into crm_company_id,display_name
      from public.crm_companies company where company.id=requested_borrower_id;
    when 'crm_contact' then
      select contact.id,contact.full_name into crm_contact_id,display_name
      from public.crm_contacts contact where contact.id=requested_borrower_id;
    when 'external_party' then
      if requested_borrower_id is not null then
        select party.id,party.display_name into external_party_id,display_name
        from public.receivable_external_parties party
        where party.id=requested_borrower_id and party.is_active;
      else
        external_name:=nullif(trim(requested_external_party->>'display_name'),'');
        if external_name is null or char_length(external_name)<2 then
          raise exception 'External party name is required';
        end if;
        insert into public.receivable_external_parties(
          party_type,display_name,company_name,phone,email,external_reference,notes,created_by
        ) values(
          coalesce(nullif(requested_external_party->>'party_type',''),'other'),
          left(external_name,180),
          nullif(left(trim(requested_external_party->>'company_name'),180),''),
          nullif(left(trim(requested_external_party->>'phone'),80),''),
          nullif(left(trim(requested_external_party->>'email'),320),''),
          nullif(left(trim(requested_external_party->>'external_reference'),180),''),
          nullif(left(trim(requested_external_party->>'notes'),2000),''),
          actor_profile_id
        ) returning id,receivable_external_parties.display_name
        into external_party_id,display_name;
      end if;
    else
      raise exception 'Invalid borrower type';
  end case;

  if display_name is null then
    raise exception 'Borrower not found';
  end if;
  return next;
end $$;

create or replace function public.create_receivable_account(
  actor_profile_id uuid,
  requested_operation_id uuid,
  requested_category text,
  requested_borrower_type text,
  requested_borrower_id uuid,
  requested_external_party jsonb,
  requested_original_amount numeric,
  requested_currency text,
  requested_default_repayment_method text,
  requested_installment_count integer,
  requested_installment_amount numeric,
  requested_first_due_date date,
  requested_final_due_date date,
  requested_notes text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
  account_id uuid;
  existing_hash text;
  operation_hash text;
  borrower record;
  currency_code text:=upper(coalesce(nullif(trim(requested_currency),''),'BDT'));
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.create');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));

  operation_hash:=md5(jsonb_build_object(
    'category',requested_category,
    'borrower_type',requested_borrower_type,
    'borrower_id',requested_borrower_id,
    'external_party',coalesce(requested_external_party,'{}'::jsonb),
    'original_amount',round(coalesce(requested_original_amount,0),4),
    'currency',currency_code,
    'repayment_method',requested_default_repayment_method,
    'installment_count',requested_installment_count,
    'installment_amount',requested_installment_amount,
    'first_due_date',requested_first_due_date,
    'final_due_date',requested_final_due_date,
    'notes',nullif(trim(requested_notes),'')
  )::text);

  select account.id,account.operation_hash into account_id,existing_hash
  from public.receivable_accounts account
  where account.operation_id=requested_operation_id;
  if account_id is not null then
    if existing_hash<>operation_hash then
      raise exception 'This operation ID was already used with different values';
    end if;
    return account_id;
  end if;

  if coalesce(requested_original_amount,0)<=0 then raise exception 'Original amount must be greater than zero'; end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if requested_installment_count is not null and requested_installment_count<=0 then raise exception 'Invalid installment count'; end if;
  if requested_installment_amount is not null and requested_installment_amount<=0 then raise exception 'Invalid installment amount'; end if;
  if requested_final_due_date is not null and requested_first_due_date is not null and requested_final_due_date<requested_first_due_date then
    raise exception 'Final due date cannot be before first due date';
  end if;

  select * into borrower from public.resolve_receivable_borrower(
    actor_profile_id,requested_borrower_type,requested_borrower_id,
    coalesce(requested_external_party,'{}'::jsonb)
  );

  account_id:=gen_random_uuid();
  insert into public.receivable_accounts(
    id,receivable_number,category,borrower_type,
    employee_record_id,customer_profile_id,supplier_id,crm_company_id,crm_contact_id,external_party_id,
    borrower_display_name_snapshot,currency,requested_amount,original_amount,
    default_repayment_method,installment_count,installment_amount,first_due_date,final_due_date,
    status,notes,is_opening_balance,operation_id,operation_hash,created_by
  ) values(
    account_id,public.next_receivable_number(),requested_category,requested_borrower_type,
    borrower.employee_record_id,borrower.customer_profile_id,borrower.supplier_id,
    borrower.crm_company_id,borrower.crm_contact_id,borrower.external_party_id,
    borrower.display_name,currency_code,round(requested_original_amount,4),round(requested_original_amount,4),
    requested_default_repayment_method,requested_installment_count,
    case when requested_installment_amount is null then null else round(requested_installment_amount,4) end,
    requested_first_due_date,requested_final_due_date,'requested',
    nullif(left(trim(requested_notes),4000),''),false,requested_operation_id,operation_hash,actor_profile_id
  );

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata
  ) values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.account_created','receivables','receivable_account',account_id::text,
    'Non-Sales receivable account created.',
    jsonb_build_object(
      'receivable_number',(select receivable_number from public.receivable_accounts where id=account_id),
      'category',requested_category,'borrower_type',requested_borrower_type,
      'borrower',borrower.display_name,'amount',round(requested_original_amount,4),
      'currency',currency_code,'status','requested'
    ),
    jsonb_build_object('operation_id',requested_operation_id)
  );
  return account_id;
end $$;

create or replace function public.create_opening_receivable(
  actor_profile_id uuid,
  requested_operation_id uuid,
  requested_category text,
  requested_borrower_type text,
  requested_borrower_id uuid,
  requested_external_party jsonb,
  requested_original_amount numeric,
  requested_previously_repaid numeric,
  requested_opening_outstanding numeric,
  requested_as_of_date date,
  requested_currency text,
  requested_default_repayment_method text,
  requested_installment_count integer,
  requested_installment_amount numeric,
  requested_first_due_date date,
  requested_final_due_date date,
  requested_notes text
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
  account_id uuid;
  existing_hash text;
  operation_hash text;
  transaction_id uuid:=gen_random_uuid();
  borrower record;
  currency_code text:=upper(coalesce(nullif(trim(requested_currency),''),'BDT'));
begin
  perform public.assert_actor_permission(actor_profile_id,'receivables.manage_opening');
  if requested_operation_id is null then raise exception 'Operation ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_operation_id::text,0));

  operation_hash:=md5(jsonb_build_object(
    'category',requested_category,
    'borrower_type',requested_borrower_type,
    'borrower_id',requested_borrower_id,
    'external_party',coalesce(requested_external_party,'{}'::jsonb),
    'original_amount',round(coalesce(requested_original_amount,0),4),
    'previously_repaid',round(coalesce(requested_previously_repaid,0),4),
    'opening_outstanding',round(coalesce(requested_opening_outstanding,0),4),
    'as_of_date',requested_as_of_date,
    'currency',currency_code,
    'repayment_method',requested_default_repayment_method,
    'installment_count',requested_installment_count,
    'installment_amount',requested_installment_amount,
    'first_due_date',requested_first_due_date,
    'final_due_date',requested_final_due_date,
    'notes',nullif(trim(requested_notes),'')
  )::text);

  select account.id,account.operation_hash into account_id,existing_hash
  from public.receivable_accounts account
  where account.operation_id=requested_operation_id;
  if account_id is not null then
    if existing_hash<>operation_hash then
      raise exception 'This operation ID was already used with different values';
    end if;
    return account_id;
  end if;

  if coalesce(requested_original_amount,0)<=0 then raise exception 'Original amount must be greater than zero'; end if;
  if coalesce(requested_previously_repaid,0)<0 then raise exception 'Previously repaid amount cannot be negative'; end if;
  if coalesce(requested_opening_outstanding,0)<=0 then raise exception 'Opening outstanding must be greater than zero'; end if;
  if round(requested_original_amount-requested_previously_repaid,4)<>round(requested_opening_outstanding,4) then
    raise exception 'Opening outstanding must equal original amount minus previously repaid amount';
  end if;
  if requested_as_of_date is null then raise exception 'Opening as-of date is required'; end if;
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if requested_installment_count is not null and requested_installment_count<=0 then raise exception 'Invalid installment count'; end if;
  if requested_installment_amount is not null and requested_installment_amount<=0 then raise exception 'Invalid installment amount'; end if;
  if requested_final_due_date is not null and requested_first_due_date is not null and requested_final_due_date<requested_first_due_date then
    raise exception 'Final due date cannot be before first due date';
  end if;

  select * into borrower from public.resolve_receivable_borrower(
    actor_profile_id,requested_borrower_type,requested_borrower_id,
    coalesce(requested_external_party,'{}'::jsonb)
  );

  account_id:=gen_random_uuid();
  insert into public.receivable_accounts(
    id,receivable_number,category,borrower_type,
    employee_record_id,customer_profile_id,supplier_id,crm_company_id,crm_contact_id,external_party_id,
    borrower_display_name_snapshot,currency,requested_amount,original_amount,approved_amount,
    default_repayment_method,installment_count,installment_amount,first_due_date,final_due_date,
    status,notes,is_opening_balance,opening_as_of_date,opening_previously_repaid,
    operation_id,operation_hash,created_by,approved_by
  ) values(
    account_id,public.next_receivable_number(),requested_category,requested_borrower_type,
    borrower.employee_record_id,borrower.customer_profile_id,borrower.supplier_id,
    borrower.crm_company_id,borrower.crm_contact_id,borrower.external_party_id,
    borrower.display_name,currency_code,round(requested_original_amount,4),round(requested_original_amount,4),
    round(requested_original_amount,4),requested_default_repayment_method,requested_installment_count,
    case when requested_installment_amount is null then null else round(requested_installment_amount,4) end,
    requested_first_due_date,requested_final_due_date,'active',
    nullif(left(trim(requested_notes),4000),''),true,requested_as_of_date,
    round(requested_previously_repaid,4),requested_operation_id,operation_hash,actor_profile_id,actor_profile_id
  );

  insert into public.receivable_transactions(
    id,receivable_account_id,transaction_type,direction,amount,effective_date,
    source,operation_id,notes,metadata,created_by
  ) values(
    transaction_id,account_id,'opening_balance','increase',round(requested_opening_outstanding,4),
    requested_as_of_date,'opening_balance',requested_operation_id,
    'Opening / migrated existing receivable balance.',
    jsonb_build_object(
      'original_amount',round(requested_original_amount,4),
      'previously_repaid',round(requested_previously_repaid,4),
      'opening_outstanding',round(requested_opening_outstanding,4),
      'as_of_date',requested_as_of_date,
      'historical_accounting_posted',false
    ),
    actor_profile_id
  );

  insert into public.audit_logs(
    actor_id,actor_role,action,module,entity_type,entity_id,description,new_values,metadata
  ) values(
    actor_profile_id,(select role from public.profiles where id=actor_profile_id),
    'receivable.opening_created','receivables','receivable_account',account_id::text,
    'Opening / existing receivable created without historical Accounting posting.',
    jsonb_build_object(
      'receivable_number',(select receivable_number from public.receivable_accounts where id=account_id),
      'category',requested_category,'borrower_type',requested_borrower_type,
      'borrower',borrower.display_name,'original_amount',round(requested_original_amount,4),
      'previously_repaid',round(requested_previously_repaid,4),
      'opening_outstanding',round(requested_opening_outstanding,4),
      'as_of_date',requested_as_of_date,'currency',currency_code
    ),
    jsonb_build_object(
      'operation_id',requested_operation_id,
      'transaction_id',transaction_id,
      'historical_accounting_posted',false
    )
  );
  return account_id;
end $$;

create or replace view public.customer_receivables_v as
select
  'customer_sale'::text as source_type,
  sale.id as source_id,
  sale.order_number as reference_number,
  invoice.document_number as invoice_number,
  'customer_receivable'::text as receivable_type,
  'customer'::text as party_type,
  customer.id as party_id,
  coalesce(
    nullif(trim(customer.company_name),''),
    nullif(trim(customer.full_name),''),
    customer.email,
    'Customer'
  ) as party_name,
  sale.currency,
  sale.total_amount as original_amount,
  sale.paid_amount,
  greatest(sale.total_amount-sale.paid_amount,0::numeric) as outstanding_amount,
  case
    when greatest(sale.total_amount-sale.paid_amount,0::numeric)=0 then 'paid'
    when sale.paid_amount>0 then 'partially_paid'
    else 'current'
  end as receivable_status,
  sale.created_at::date as issue_date,
  null::date as due_date,
  null::integer as days_overdue,
  sale.created_by as responsible_profile_id,
  last_payment.payment_date as last_activity_date,
  false as is_opening_balance
from public.sales_orders sale
join public.profiles customer on customer.id=sale.customer_profile_id
left join lateral (
  select document.document_number
  from public.sale_documents document
  where document.order_id=sale.id
    and document.document_type='invoice'
    and document.status='generated'
  order by document.revision_number desc,document.created_at desc,document.id desc
  limit 1
) invoice on true
left join lateral (
  select payment.payment_date
  from public.sale_payments payment
  where payment.order_id=sale.id and payment.status='received'
  order by payment.payment_date desc,payment.created_at desc,payment.id desc
  limit 1
) last_payment on true
where sale.status<>'cancelled';

create or replace view public.non_sales_receivables_v as
with movement as (
  select
    transaction.receivable_account_id,
    coalesce(sum(
      case transaction.direction
        when 'increase' then transaction.amount
        else -transaction.amount
      end
    ),0::numeric) as outstanding_amount,
    max(transaction.effective_date) as last_activity_date
  from public.receivable_transactions transaction
  group by transaction.receivable_account_id
)
select
  'non_sales'::text as source_type,
  account.id as source_id,
  account.receivable_number as reference_number,
  null::text as invoice_number,
  account.category as receivable_type,
  account.borrower_type as party_type,
  coalesce(
    account.employee_record_id,account.customer_profile_id,account.supplier_id,
    account.crm_company_id,account.crm_contact_id,account.external_party_id
  ) as party_id,
  account.borrower_display_name_snapshot as party_name,
  account.currency,
  account.original_amount,
  case
    when account.status in ('requested','under_review','approved')
      and movement.receivable_account_id is null then 0::numeric
    else greatest(account.original_amount-greatest(coalesce(movement.outstanding_amount,0),0),0::numeric)
  end as paid_amount,
  greatest(coalesce(movement.outstanding_amount,0),0::numeric) as outstanding_amount,
  case
    when account.status in ('rejected','cancelled') then account.status
    when account.status='requested' then 'requested'
    when greatest(coalesce(movement.outstanding_amount,0),0::numeric)=0 then 'fully_repaid'
    else account.status
  end as receivable_status,
  account.created_at::date as issue_date,
  account.first_due_date as due_date,
  case
    when account.first_due_date is null or account.first_due_date>=current_date then null
    else current_date-account.first_due_date
  end as days_overdue,
  account.created_by as responsible_profile_id,
  movement.last_activity_date,
  account.is_opening_balance
from public.receivable_accounts account
left join movement on movement.receivable_account_id=account.id;

create or replace view public.receivables_overview_v as
select * from public.customer_receivables_v
union all
select * from public.non_sales_receivables_v;

alter table public.receivable_external_parties enable row level security;
alter table public.receivable_accounts enable row level security;
alter table public.receivable_transactions enable row level security;

create policy "authorized staff read receivable external parties"
on public.receivable_external_parties for select to authenticated
using(
  public.is_current_user_admin() or
  public.current_user_has_permission('receivables.view_loans')
);

create policy "authorized staff read receivable accounts"
on public.receivable_accounts for select to authenticated
using(
  public.is_current_user_admin() or
  public.current_user_has_permission('receivables.view_loans')
);

create policy "authorized staff read receivable transactions"
on public.receivable_transactions for select to authenticated
using(
  public.is_current_user_admin() or
  public.current_user_has_permission('receivables.view_loans')
);

revoke all on table public.receivable_external_parties from anon,authenticated;
revoke all on table public.receivable_accounts from anon,authenticated;
revoke all on table public.receivable_transactions from anon,authenticated;
grant select on table public.receivable_external_parties to authenticated;
grant select on table public.receivable_accounts to authenticated;
grant select on table public.receivable_transactions to authenticated;
grant all on table public.receivable_external_parties to service_role;
grant all on table public.receivable_accounts to service_role;
grant all on table public.receivable_transactions to service_role;
grant usage,select on sequence public.receivable_number_seq to service_role;

revoke all on public.customer_receivables_v from public,anon,authenticated;
revoke all on public.non_sales_receivables_v from public,anon,authenticated;
revoke all on public.receivables_overview_v from public,anon,authenticated;
grant select on public.customer_receivables_v to service_role;
grant select on public.non_sales_receivables_v to service_role;
grant select on public.receivables_overview_v to service_role;

revoke all on function public.next_receivable_number() from public,anon,authenticated;
revoke all on function public.resolve_receivable_borrower(uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.create_receivable_account(
  uuid,uuid,text,text,uuid,jsonb,numeric,text,text,integer,numeric,date,date,text
) from public,anon,authenticated;
revoke all on function public.create_opening_receivable(
  uuid,uuid,text,text,uuid,jsonb,numeric,numeric,numeric,date,text,text,integer,numeric,date,date,text
) from public,anon,authenticated;
grant execute on function public.next_receivable_number() to service_role;
grant execute on function public.resolve_receivable_borrower(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.create_receivable_account(
  uuid,uuid,text,text,uuid,jsonb,numeric,text,text,integer,numeric,date,date,text
) to service_role;
grant execute on function public.create_opening_receivable(
  uuid,uuid,text,text,uuid,jsonb,numeric,numeric,numeric,date,text,text,integer,numeric,date,date,text
) to service_role;

select pg_notify('pgrst','reload schema');

commit;
