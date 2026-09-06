-- Isolated RMB / China Payment Service Phase 1 operational records.

begin;

create table public.rmb_payment_jobs (
  id uuid primary key default gen_random_uuid(),
  job_reference text not null default (
    'RMB-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  customer_id uuid not null references public.profiles(id),
  foreign_currency text not null check (foreign_currency in ('RMB', 'USD')),
  foreign_amount numeric(18,4) not null check (foreign_amount > 0),
  agreed_bdt_rate numeric(18,6) not null check (agreed_bdt_rate > 0),
  calculated_bdt_payable numeric(20,2) generated always as (round(foreign_amount * agreed_bdt_rate, 2)) stored,
  customer_payment_date date,
  customer_payment_method text,
  customer_payment_reference text,
  customer_payment_note text,
  payee_organization text,
  payee_name text,
  payee_address text,
  payee_phone text,
  payee_account_details text,
  china_payment_date date,
  china_payment_method text,
  china_payment_reference text,
  china_payment_note text,
  note text,
  current_status text not null default 'AWAITING_CUSTOMER_PAYMENT' check (
    current_status in (
      'AWAITING_CUSTOMER_PAYMENT', 'CUSTOMER_PAID', 'CHINA_PAYMENT_PENDING',
      'PAYEE_PAID', 'COMPLETED', 'CLOSED'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  constraint rmb_payment_jobs_reference_key unique (job_reference)
);

create table public.rmb_payment_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.rmb_payment_jobs(id) on delete restrict,
  status text not null check (
    status in (
      'AWAITING_CUSTOMER_PAYMENT', 'CUSTOMER_PAID', 'CHINA_PAYMENT_PENDING',
      'PAYEE_PAID', 'COMPLETED', 'CLOSED'
    )
  ),
  event_at timestamptz not null default now(),
  actor_id uuid not null references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index rmb_payment_jobs_customer_updated_idx
  on public.rmb_payment_jobs(customer_id, updated_at desc);
create index rmb_payment_jobs_status_updated_idx
  on public.rmb_payment_jobs(current_status, updated_at desc);
create index rmb_payment_events_job_event_idx
  on public.rmb_payment_events(job_id, event_at desc, created_at desc);

alter table public.rmb_payment_jobs enable row level security;
alter table public.rmb_payment_events enable row level security;

create or replace function public.create_rmb_payment_job(
  actor_profile_id uuid,
  requested_customer_id uuid,
  requested_foreign_currency text,
  requested_foreign_amount numeric,
  requested_agreed_bdt_rate numeric,
  requested_customer_payment_date date,
  requested_customer_payment_method text,
  requested_customer_payment_reference text,
  requested_customer_payment_note text,
  requested_payee_organization text,
  requested_payee_name text,
  requested_payee_address text,
  requested_payee_phone text,
  requested_payee_account_details text,
  requested_china_payment_date date,
  requested_china_payment_method text,
  requested_china_payment_reference text,
  requested_china_payment_note text,
  requested_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  if not exists (
    select 1 from public.profiles
    where id = requested_customer_id and role = 'customer' and status = 'active'
  ) then raise exception 'Choose an active customer'; end if;

  if requested_foreign_currency not in ('RMB', 'USD') then
    raise exception 'Choose RMB or USD';
  end if;
  if requested_foreign_amount is null or requested_foreign_amount <= 0 then
    raise exception 'Foreign amount must be greater than zero';
  end if;
  if requested_agreed_bdt_rate is null or requested_agreed_bdt_rate <= 0 then
    raise exception 'Agreed BDT rate must be greater than zero';
  end if;

  insert into public.rmb_payment_jobs (
    customer_id, foreign_currency, foreign_amount, agreed_bdt_rate,
    customer_payment_date, customer_payment_method, customer_payment_reference,
    customer_payment_note, payee_organization, payee_name, payee_address,
    payee_phone, payee_account_details, china_payment_date, china_payment_method,
    china_payment_reference, china_payment_note, note, created_by, updated_by
  ) values (
    requested_customer_id, requested_foreign_currency, requested_foreign_amount,
    requested_agreed_bdt_rate, requested_customer_payment_date,
    nullif(left(btrim(coalesce(requested_customer_payment_method, '')), 100), ''),
    nullif(left(btrim(coalesce(requested_customer_payment_reference, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_customer_payment_note, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payee_organization, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payee_name, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_payee_address, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_payee_phone, '')), 100), ''),
    nullif(left(btrim(coalesce(requested_payee_account_details, '')), 2000), ''),
    requested_china_payment_date,
    nullif(left(btrim(coalesce(requested_china_payment_method, '')), 100), ''),
    nullif(left(btrim(coalesce(requested_china_payment_reference, '')), 200), ''),
    nullif(left(btrim(coalesce(requested_china_payment_note, '')), 1000), ''),
    nullif(left(btrim(coalesce(requested_note, '')), 2000), ''),
    actor_profile_id, actor_profile_id
  ) returning id into job_id;

  insert into public.rmb_payment_events(job_id, status, actor_id, note)
  values (job_id, 'AWAITING_CUSTOMER_PAYMENT', actor_profile_id, 'RMB payment job created.');

  return job_id;
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
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_profile_id and role = 'admin' and status = 'active'
  ) then raise exception 'Permission denied'; end if;

  select current_status into current_value
  from public.rmb_payment_jobs
  where id = requested_job_id
  for update;
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

  update public.rmb_payment_jobs
  set current_status = requested_status,
      updated_by = actor_profile_id,
      updated_at = now()
  where id = requested_job_id;

  insert into public.rmb_payment_events(job_id, status, actor_id, note)
  values (
    requested_job_id,
    requested_status,
    actor_profile_id,
    nullif(left(btrim(coalesce(requested_note, '')), 1000), '')
  );
end;
$$;

create or replace function public.prevent_rmb_payment_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RMB payment event history is immutable';
end;
$$;

create trigger rmb_payment_events_immutable
before update or delete on public.rmb_payment_events
for each row execute function public.prevent_rmb_payment_event_mutation();

revoke all on public.rmb_payment_jobs from public, anon, authenticated;
revoke all on public.rmb_payment_events from public, anon, authenticated;
grant select, insert, update on public.rmb_payment_jobs to service_role;
grant select, insert on public.rmb_payment_events to service_role;

revoke all on function public.create_rmb_payment_job(
  uuid, uuid, text, numeric, numeric, date, text, text, text, text,
  text, text, text, text, date, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.advance_rmb_payment_job(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_rmb_payment_job(
  uuid, uuid, text, numeric, numeric, date, text, text, text, text,
  text, text, text, text, date, text, text, text, text
) to service_role;
grant execute on function public.advance_rmb_payment_job(uuid, uuid, text, text)
  to service_role;

commit;
