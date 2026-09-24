-- RMB Phase 1 operational corrections: dynamic setup, private proofs and payment destination snapshots.

begin;

create table public.rmb_currencies (
  code text primary key check (code ~ '^[A-Z]{3,5}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  symbol text not null check (length(btrim(symbol)) between 1 and 12),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.rmb_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  context text not null check (context in ('CUSTOMER_PAYMENT', 'CHINA_PAYMENT', 'BOTH')),
  method_type text not null check (method_type in ('BANK', 'WECHAT', 'ALIPAY', 'CASH', 'OTHER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create unique index rmb_payment_methods_name_key on public.rmb_payment_methods(lower(name));

insert into public.rmb_currencies(code, name, symbol) values
  ('RMB', 'Chinese Renminbi', '¥'),
  ('USD', 'US Dollar', '$'),
  ('SAR', 'Saudi Riyal', 'SAR'),
  ('INR', 'Indian Rupee', '₹'),
  ('AED', 'UAE Dirham', 'AED'),
  ('EUR', 'Euro', '€');

insert into public.rmb_payment_methods(name, context, method_type) values
  ('bKash', 'CUSTOMER_PAYMENT', 'OTHER'),
  ('Nagad', 'CUSTOMER_PAYMENT', 'OTHER'),
  ('Bank Transfer', 'CUSTOMER_PAYMENT', 'BANK'),
  ('BRAC Bank', 'CUSTOMER_PAYMENT', 'BANK'),
  ('WeChat', 'CHINA_PAYMENT', 'WECHAT'),
  ('Alipay', 'CHINA_PAYMENT', 'ALIPAY'),
  ('Bank', 'CHINA_PAYMENT', 'BANK'),
  ('Bank of China', 'CHINA_PAYMENT', 'BANK'),
  ('ABC Bank', 'CHINA_PAYMENT', 'BANK'),
  ('Cash', 'BOTH', 'CASH');

alter table public.rmb_payment_jobs
  add column customer_payment_method_id uuid references public.rmb_payment_methods(id),
  add column china_payment_method_id uuid references public.rmb_payment_methods(id),
  add column customer_payment_proof_path text,
  add column china_payment_proof_path text,
  add column china_destination_type text check (china_destination_type in ('BANK', 'WECHAT', 'ALIPAY', 'CASH', 'OTHER')),
  add column china_bank_name text,
  add column china_account_name text,
  add column china_account_number text,
  add column china_bank_branch text,
  add column china_bank_code text,
  add column china_wallet_id text,
  add column china_destination_qr_path text,
  add column china_cash_recipient_name text,
  add column china_cash_recipient_contact text,
  add column china_cash_instruction_note text;

alter table public.rmb_payment_jobs drop constraint if exists rmb_payment_jobs_foreign_currency_check;
alter table public.rmb_payment_jobs
  add constraint rmb_payment_jobs_currency_fk foreign key (foreign_currency) references public.rmb_currencies(code);

alter table public.rmb_currencies enable row level security;
alter table public.rmb_payment_methods enable row level security;
revoke all on public.rmb_currencies from public, anon, authenticated;
revoke all on public.rmb_payment_methods from public, anon, authenticated;
grant select, insert, update on public.rmb_currencies to service_role;
grant select, insert, update on public.rmb_payment_methods to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'rmb-payment-proofs',
  'rmb-payment-proofs',
  false,
  900000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create or replace function public.create_rmb_payment_job_v2(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_customer_id uuid,
  requested_foreign_currency text,
  requested_foreign_amount numeric,
  requested_agreed_bdt_rate numeric,
  requested_customer_payment_date date,
  requested_customer_payment_method_id uuid,
  requested_customer_payment_reference text,
  requested_customer_payment_note text,
  requested_payee_organization text,
  requested_payee_name text,
  requested_payee_address text,
  requested_payee_phone text,
  requested_payee_account_details text,
  requested_china_payment_method_id uuid,
  requested_china_destination_type text,
  requested_china_bank_name text,
  requested_china_account_name text,
  requested_china_account_number text,
  requested_china_bank_branch text,
  requested_china_bank_code text,
  requested_china_wallet_id text,
  requested_china_destination_qr_path text,
  requested_china_cash_recipient_name text,
  requested_china_cash_recipient_contact text,
  requested_china_cash_instruction_note text,
  requested_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_method_name text;
  china_method_name text;
  china_method_type text;
begin
  if not exists (
    select 1 from public.profiles where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;
  if not exists (
    select 1 from public.profiles where id = requested_customer_id and role = 'customer' and status = 'active'
  ) then raise exception 'Choose an active customer'; end if;
  if not exists (
    select 1 from public.rmb_currencies where code = requested_foreign_currency and is_active
  ) then raise exception 'Choose an active currency'; end if;
  if requested_foreign_amount is null or requested_foreign_amount <= 0 then
    raise exception 'Foreign amount must be greater than zero';
  end if;
  if requested_agreed_bdt_rate is null or requested_agreed_bdt_rate <= 0 then
    raise exception 'Agreed BDT rate must be greater than zero';
  end if;

  if requested_customer_payment_method_id is not null then
    select name into customer_method_name from public.rmb_payment_methods
    where id = requested_customer_payment_method_id and is_active
      and context in ('CUSTOMER_PAYMENT', 'BOTH');
    if customer_method_name is null then raise exception 'Choose a valid Bangladesh customer payment method'; end if;
  end if;

  select name, method_type into china_method_name, china_method_type
  from public.rmb_payment_methods
  where id = requested_china_payment_method_id and is_active
    and context in ('CHINA_PAYMENT', 'BOTH');
  if china_method_name is null then raise exception 'Choose a valid China payment method'; end if;
  if requested_china_destination_type is distinct from china_method_type then
    raise exception 'China payment destination does not match the selected method';
  end if;

  if china_method_type = 'BANK' and (
    nullif(btrim(coalesce(requested_china_bank_name, '')), '') is null or
    nullif(btrim(coalesce(requested_china_account_name, '')), '') is null or
    nullif(btrim(coalesce(requested_china_account_number, '')), '') is null or
    nullif(btrim(coalesce(requested_china_bank_branch, '')), '') is null or
    nullif(btrim(coalesce(requested_china_bank_code, '')), '') is null
  ) then raise exception 'Complete all China bank destination fields'; end if;
  if china_method_type in ('WECHAT', 'ALIPAY') and (
    nullif(btrim(coalesce(requested_china_wallet_id, '')), '') is null or
    nullif(btrim(coalesce(requested_china_destination_qr_path, '')), '') is null
  ) then raise exception 'Wallet ID/phone and QR image are required'; end if;
  if china_method_type = 'CASH' and
    nullif(btrim(coalesce(requested_china_cash_recipient_name, '')), '') is null
  then raise exception 'Cash recipient name is required'; end if;

  insert into public.rmb_payment_jobs (
    id, customer_id, foreign_currency, foreign_amount, agreed_bdt_rate,
    customer_payment_date, customer_payment_method, customer_payment_method_id,
    customer_payment_reference, customer_payment_note,
    payee_organization, payee_name, payee_address, payee_phone, payee_account_details,
    china_payment_method, china_payment_method_id, china_destination_type,
    china_bank_name, china_account_name, china_account_number, china_bank_branch,
    china_bank_code, china_wallet_id, china_destination_qr_path,
    china_cash_recipient_name, china_cash_recipient_contact, china_cash_instruction_note,
    note, created_by, updated_by
  ) values (
    requested_job_id, requested_customer_id, requested_foreign_currency,
    requested_foreign_amount, requested_agreed_bdt_rate,
    requested_customer_payment_date, customer_method_name, requested_customer_payment_method_id,
    nullif(left(btrim(coalesce(requested_customer_payment_reference, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_customer_payment_note, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payee_organization, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payee_name, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payee_address, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payee_phone, '')), 100), ''),
    nullif(left(btrim(coalesce(requested_payee_account_details, '')), 2000), ''),
    china_method_name, requested_china_payment_method_id, china_method_type,
    nullif(left(btrim(coalesce(requested_china_bank_name, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_account_name, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_account_number, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_bank_branch, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_bank_code, '')), 100), ''),
    nullif(left(btrim(coalesce(requested_china_wallet_id, '')), 200), ''),
    requested_china_destination_qr_path,
    nullif(left(btrim(coalesce(requested_china_cash_recipient_name, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_cash_recipient_contact, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_cash_instruction_note, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_note, '')), 2000), ''),
    actor_profile_id, actor_profile_id
  );

  insert into public.rmb_payment_events(job_id, status, actor_id, note)
  values (requested_job_id, 'AWAITING_CUSTOMER_PAYMENT', actor_profile_id, 'RMB payment job created.');
  return requested_job_id;
end;
$$;

create or replace function public.advance_rmb_payment_job(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_status text,
  requested_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_value text;
  expected_next text;
  job_row public.rmb_payment_jobs%rowtype;
begin
  if not exists (
    select 1 from public.profiles where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select * into job_row from public.rmb_payment_jobs where id = requested_job_id for update;
  current_value := job_row.current_status;
  if current_value is null then raise exception 'RMB payment job not found'; end if;
  expected_next := case current_value
    when 'AWAITING_CUSTOMER_PAYMENT' then 'CUSTOMER_PAID'
    when 'CUSTOMER_PAID' then 'CHINA_PAYMENT_PENDING'
    when 'CHINA_PAYMENT_PENDING' then 'PAYEE_PAID'
    when 'PAYEE_PAID' then 'COMPLETED'
    when 'COMPLETED' then 'CLOSED'
    else null
  end;
  if expected_next is null or requested_status <> expected_next then
    raise exception 'Invalid next RMB payment status';
  end if;
  if requested_status = 'CUSTOMER_PAID' and job_row.customer_payment_proof_path is null then
    raise exception 'Customer payment evidence is required';
  end if;
  if requested_status = 'PAYEE_PAID' and (
    job_row.china_payment_proof_path is null or
    job_row.china_payment_date is null or
    nullif(btrim(coalesce(job_row.china_payment_reference, '')), '') is null
  ) then raise exception 'China payment date, reference and evidence are required'; end if;

  update public.rmb_payment_jobs
  set current_status = requested_status, updated_by = actor_profile_id, updated_at = now()
  where id = requested_job_id;
  insert into public.rmb_payment_events(job_id, status, actor_id, note)
  values (requested_job_id, requested_status, actor_profile_id,
    nullif(left(btrim(coalesce(requested_note, '')), 1000), ''));
end;
$$;

revoke all on function public.create_rmb_payment_job_v2(
  uuid, uuid, uuid, text, numeric, numeric, date, uuid, text, text, text, text,
  text, text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.create_rmb_payment_job_v2(
  uuid, uuid, uuid, text, numeric, numeric, date, uuid, text, text, text, text,
  text, text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text
) to service_role;

commit;
