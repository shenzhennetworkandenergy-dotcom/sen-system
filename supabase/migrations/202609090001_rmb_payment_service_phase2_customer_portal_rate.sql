-- RMB Phase 2: customer requests and RMB-owned active-rate snapshots.
begin;

create table public.rmb_rate_history (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null references public.rmb_currencies(code),
  rate_bdt numeric(18,6) not null check (rate_bdt > 0 and rate_bdt <> 'NaN'::numeric),
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index rmb_rate_history_one_active_currency
  on public.rmb_rate_history(currency_code) where is_active;
create index rmb_rate_history_currency_effective_idx
  on public.rmb_rate_history(currency_code, effective_at desc);

alter table public.rmb_payment_jobs
  add column applied_rate_id uuid references public.rmb_rate_history(id),
  add column customer_instruction text;

create or replace function public.prevent_rmb_customer_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.applied_rate_id is not null and (
    new.customer_id is distinct from old.customer_id or
    new.foreign_currency is distinct from old.foreign_currency or
    new.foreign_amount is distinct from old.foreign_amount or
    new.agreed_bdt_rate is distinct from old.agreed_bdt_rate or
    new.applied_rate_id is distinct from old.applied_rate_id
  ) then
    raise exception 'RMB customer request financial snapshot is immutable';
  end if;
  return new;
end;
$$;

create trigger rmb_payment_jobs_customer_snapshot_immutable
before update on public.rmb_payment_jobs
for each row execute function public.prevent_rmb_customer_snapshot_mutation();

create or replace function public.set_rmb_active_rate(
  actor_profile_id uuid,
  requested_currency_code text,
  requested_rate numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;
  if requested_rate is null or requested_rate <= 0 or requested_rate = 'NaN'::numeric then
    raise exception 'Rate must be greater than zero';
  end if;
  if requested_rate <> round(requested_rate, 6) then
    raise exception 'Rate supports up to 6 decimal places';
  end if;
  if not exists (
    select 1 from public.rmb_currencies
    where code = upper(btrim(requested_currency_code)) and is_active
  ) then raise exception 'Choose an active RMB currency'; end if;

  perform pg_advisory_xact_lock(hashtextextended(upper(btrim(requested_currency_code)), 0));
  update public.rmb_rate_history
  set is_active = false
  where currency_code = upper(btrim(requested_currency_code)) and is_active;

  insert into public.rmb_rate_history(currency_code, rate_bdt, is_active, created_by)
  values (upper(btrim(requested_currency_code)), requested_rate, true, actor_profile_id)
  returning id into rate_id;
  return rate_id;
end;
$$;

create or replace function public.create_rmb_customer_request(
  requested_job_id uuid,
  expected_rate_id uuid,
  requested_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  requested_currency_code text := upper(btrim(coalesce(requested_payload->>'foreign_currency', '')));
  amount numeric := nullif(btrim(coalesce(requested_payload->>'foreign_amount', '')), '')::numeric;
  rate_row public.rmb_rate_history%rowtype;
  method_type text;
  customer_method_name text;
  destination_type text := upper(btrim(coalesce(requested_payload->>'china_destination_type', '')));
  customer_proof_path text := nullif(btrim(coalesce(requested_payload->>'customer_payment_proof_path', '')), '');
  destination_qr_path text := nullif(btrim(coalesce(requested_payload->>'china_destination_qr_path', '')), '');
begin
  if actor_id is null or not exists (
    select 1 from public.profiles where id = actor_id and role = 'customer' and status = 'active'
  ) then raise exception 'Customer authentication required'; end if;
  if not exists (
    select 1 from public.rmb_currencies where code = requested_currency_code and is_active
  ) then raise exception 'Choose an active currency'; end if;
  if amount is null or amount <= 0 then raise exception 'Foreign amount must be greater than zero'; end if;

  select * into rate_row
  from public.rmb_rate_history
  where id = expected_rate_id and rmb_rate_history.currency_code = requested_currency_code and is_active
  for update;
  if rate_row.id is null then raise exception 'RATE_CHANGED'; end if;

  if nullif(btrim(coalesce(requested_payload->>'payee_name', '')), '') is null then
    raise exception 'Payee name is required';
  end if;
  if nullif(btrim(coalesce(requested_payload->>'payee_account_details', '')), '') is null
    and nullif(btrim(coalesce(requested_payload->>'china_bank_account_number', '')), '') is null
    and nullif(btrim(coalesce(requested_payload->>'china_wallet_id', '')), '') is null then
    raise exception 'Payment destination details are required';
  end if;

  if nullif(btrim(coalesce(requested_payload->>'customer_payment_method_id', '')), '') is not null then
    select name into customer_method_name
    from public.rmb_payment_methods
    where id = (requested_payload->>'customer_payment_method_id')::uuid
      and is_active and context in ('CUSTOMER_PAYMENT', 'BOTH');
    if customer_method_name is null then raise exception 'Choose a valid Bangladesh customer payment method'; end if;
  end if;

  if nullif(btrim(coalesce(requested_payload->>'china_payment_method_id', '')), '') is not null then
    select pm.method_type into method_type
    from public.rmb_payment_methods as pm
    where id = (requested_payload->>'china_payment_method_id')::uuid
      and is_active and context in ('CHINA_PAYMENT', 'BOTH');
    if method_type is null then raise exception 'Choose a valid China payment method'; end if;
    if destination_type is distinct from method_type then raise exception 'China payment destination does not match the selected method'; end if;
  end if;

  if customer_proof_path is not null and position(requested_job_id::text || '/customer-payment/' || actor_id::text || '-' in customer_proof_path) <> 1 then
    raise exception 'Invalid customer proof path';
  end if;
  if destination_qr_path is not null and position(requested_job_id::text || '/destination/' || actor_id::text || '-' in destination_qr_path) <> 1 then
    raise exception 'Invalid destination proof path';
  end if;

  insert into public.rmb_payment_jobs(
    id, customer_id, foreign_currency, foreign_amount, agreed_bdt_rate, applied_rate_id,
    customer_payment_method_id, customer_payment_method, customer_payment_reference,
    customer_payment_note, customer_payment_proof_path, payee_organization, payee_name,
    payee_address, payee_phone, payee_account_details, china_payment_method_id,
    china_payment_method, china_destination_type, china_bank_name, china_account_name,
    china_account_number, china_bank_branch, china_bank_code, china_wallet_id,
    china_destination_qr_path, china_cash_recipient_name, china_cash_recipient_contact,
    china_cash_instruction_note, customer_instruction, created_by, updated_by
  ) values (
    requested_job_id, actor_id, requested_currency_code, amount, rate_row.rate_bdt, rate_row.id,
    nullif(btrim(coalesce(requested_payload->>'customer_payment_method_id', '')), '')::uuid,
    customer_method_name, nullif(left(btrim(coalesce(requested_payload->>'customer_payment_reference', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'customer_payment_note', '')), 1000), ''),
    customer_proof_path, nullif(left(btrim(coalesce(requested_payload->>'payee_organization', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'payee_name', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'payee_address', '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payload->>'payee_phone', '')), 100), ''),
    nullif(left(btrim(coalesce(requested_payload->>'payee_account_details', '')), 2000), ''),
    nullif(btrim(coalesce(requested_payload->>'china_payment_method_id', '')), '')::uuid,
    nullif(left(btrim(coalesce(requested_payload->>'china_payment_method_name', '')), 100), ''),
    nullif(left(destination_type, 20), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_bank_name', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_account_name', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_bank_account_number', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_bank_branch', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_bank_code', '')), 100), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_wallet_id', '')), 200), ''),
    destination_qr_path,
    nullif(left(btrim(coalesce(requested_payload->>'china_cash_recipient_name', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_cash_recipient_contact', '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payload->>'china_cash_instruction_note', '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payload->>'customer_instruction', '')), 2000), ''),
    actor_id, actor_id
  );
  insert into public.rmb_payment_events(job_id, status, actor_id, note)
  values (requested_job_id, 'AWAITING_CUSTOMER_PAYMENT', actor_id, 'Customer submitted RMB payment request.');
  return requested_job_id;
exception
  when invalid_text_representation then raise exception 'Invalid request data';
end;
$$;

alter table public.rmb_rate_history enable row level security;
revoke all on public.rmb_rate_history from public, anon, authenticated;
grant select on public.rmb_rate_history to service_role;
revoke all on function public.set_rmb_active_rate(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.create_rmb_customer_request(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_rmb_customer_request(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_rmb_active_rate(uuid, text, numeric) to service_role;

commit;
