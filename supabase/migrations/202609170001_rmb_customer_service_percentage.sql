-- RMB-only customer defaults and immutable per-job service snapshots.

begin;

create table public.rmb_customer_preferences (
  customer_id uuid primary key references public.profiles(id),
  service_percentage numeric(7,4) not null check (
    service_percentage > 0
    and service_percentage <= 100
    and service_percentage <> 'NaN'::numeric
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);

alter table public.rmb_customer_preferences enable row level security;
revoke all on public.rmb_customer_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.rmb_customer_preferences to service_role;

alter table public.rmb_payment_jobs
  add column extra_service_applied boolean not null default false,
  add column service_percentage numeric(7,4),
  add column service_amount numeric,
  add column adjusted_rmb_amount numeric,
  add constraint rmb_payment_jobs_service_percentage_check check (
    (not extra_service_applied and service_percentage is null)
    or (
      extra_service_applied
      and service_percentage > 0
      and service_percentage <= 100
      and service_percentage <> 'NaN'::numeric
    )
  );

-- PostgreSQL 17 cannot replace a generated expression in place. Dropping only
-- the expression retains the column and every existing stored payable value.
alter table public.rmb_payment_jobs
  alter column calculated_bdt_payable drop expression if exists;

create or replace function public.set_rmb_payment_financial_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_percentage numeric;
begin
  -- Customer requests are identified by their applied active-rate snapshot.
  -- The browser never supplies or receives this percentage.
  if tg_op = 'INSERT' and new.applied_rate_id is not null then
    select preference.service_percentage
      into saved_percentage
    from public.rmb_customer_preferences as preference
    where preference.customer_id = new.customer_id;

    new.extra_service_applied := saved_percentage is not null;
    new.service_percentage := saved_percentage;
  end if;

  new.extra_service_applied := coalesce(new.extra_service_applied, false);
  if new.extra_service_applied then
    if new.service_percentage is null
      or new.service_percentage <= 0
      or new.service_percentage > 100
      or new.service_percentage = 'NaN'::numeric
      or new.service_percentage <> round(new.service_percentage, 4)
    then
      raise exception 'Service percentage must be greater than 0, no more than 100, and use up to 4 decimal places';
    end if;
    new.service_amount := new.foreign_amount * new.service_percentage / 100;
    new.adjusted_rmb_amount := new.foreign_amount + new.service_amount;
  else
    new.service_percentage := null;
    new.service_amount := 0;
    new.adjusted_rmb_amount := new.foreign_amount;
  end if;

  new.calculated_bdt_payable := round(new.adjusted_rmb_amount * new.agreed_bdt_rate, 2);
  return new;
end;
$$;

create trigger rmb_payment_jobs_set_financial_snapshot
before insert or update of foreign_amount, agreed_bdt_rate, extra_service_applied,
  service_percentage, service_amount, adjusted_rmb_amount, calculated_bdt_payable
on public.rmb_payment_jobs
for each row execute function public.set_rmb_payment_financial_snapshot();

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
    new.applied_rate_id is distinct from old.applied_rate_id or
    new.extra_service_applied is distinct from old.extra_service_applied or
    new.service_percentage is distinct from old.service_percentage or
    new.service_amount is distinct from old.service_amount or
    new.adjusted_rmb_amount is distinct from old.adjusted_rmb_amount or
    new.calculated_bdt_payable is distinct from old.calculated_bdt_payable
  ) then
    raise exception 'RMB customer request financial snapshot is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.create_rmb_payment_job_v2(
  actor_profile_id uuid,
  requested_job_id uuid,
  requested_customer_id uuid,
  requested_foreign_currency text,
  requested_foreign_amount numeric,
  requested_agreed_bdt_rate numeric,
  requested_extra_service_applied boolean,
  requested_service_percentage numeric,
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
  created_job_id uuid;
begin
  if coalesce(requested_extra_service_applied, false) and (
    requested_service_percentage is null
    or requested_service_percentage <= 0
    or requested_service_percentage > 100
    or requested_service_percentage = 'NaN'::numeric
    or requested_service_percentage <> round(requested_service_percentage, 4)
  ) then
    raise exception 'Service percentage must be greater than 0, no more than 100, and use up to 4 decimal places';
  end if;

  created_job_id := public.create_rmb_payment_job_v2(
    actor_profile_id,
    requested_job_id,
    requested_customer_id,
    requested_foreign_currency,
    requested_foreign_amount,
    requested_agreed_bdt_rate,
    requested_customer_payment_date,
    requested_customer_payment_method_id,
    requested_customer_payment_reference,
    requested_customer_payment_note,
    requested_payee_organization,
    requested_payee_name,
    requested_payee_address,
    requested_payee_phone,
    requested_payee_account_details,
    requested_china_payment_method_id,
    requested_china_destination_type,
    requested_china_bank_name,
    requested_china_account_name,
    requested_china_account_number,
    requested_china_bank_branch,
    requested_china_bank_code,
    requested_china_wallet_id,
    requested_china_destination_qr_path,
    requested_china_cash_recipient_name,
    requested_china_cash_recipient_contact,
    requested_china_cash_instruction_note,
    requested_note
  );

  update public.rmb_payment_jobs
  set extra_service_applied = coalesce(requested_extra_service_applied, false),
      service_percentage = case
        when coalesce(requested_extra_service_applied, false) then requested_service_percentage
        else null
      end
  where id = created_job_id;

  return created_job_id;
end;
$$;

revoke all on function public.create_rmb_payment_job_v2(
  uuid, uuid, uuid, text, numeric, numeric, boolean, numeric, date, uuid, text,
  text, text, text, text, text, text, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_rmb_payment_job_v2(
  uuid, uuid, uuid, text, numeric, numeric, boolean, numeric, date, uuid, text,
  text, text, text, text, text, text, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;

commit;
