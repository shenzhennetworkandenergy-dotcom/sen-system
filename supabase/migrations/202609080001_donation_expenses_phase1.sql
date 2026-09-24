begin;

create sequence if not exists public.donation_beneficiary_reference_seq;
create sequence if not exists public.donation_expense_reference_seq;

create table public.donation_relationship_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint donation_relationship_types_name_not_blank check (btrim(name) <> '')
);

create unique index donation_relationship_types_name_unique
  on public.donation_relationship_types (lower(btrim(name)));

create table public.donation_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint donation_expense_categories_name_not_blank check (btrim(name) <> '')
);

create unique index donation_expense_categories_name_unique
  on public.donation_expense_categories (lower(btrim(name)));

create table public.donation_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint donation_payment_methods_name_not_blank check (btrim(name) <> '')
);

create unique index donation_payment_methods_name_unique
  on public.donation_payment_methods (lower(btrim(name)));

create table public.donation_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  beneficiary_reference text not null default (
    'BEN-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.donation_beneficiary_reference_seq')::text, 6, '0')
  ),
  beneficiary_type text not null,
  name text not null,
  phone text,
  alternate_phone text,
  address text,
  city_district text,
  country text,
  whatsapp text,
  notes text,
  relationship_group text,
  relationship_type_id uuid references public.donation_relationship_types(id) on delete restrict,
  relationship_note text,
  referred_by_name text,
  referred_by_phone text,
  referred_by_note text,
  monthly_support_enabled boolean not null default false,
  default_monthly_amount numeric(18,2),
  reminder_day_of_month smallint,
  support_start_date date,
  support_end_date date,
  default_purpose text,
  default_category_id uuid references public.donation_expense_categories(id) on delete restrict,
  default_payment_method_id uuid references public.donation_payment_methods(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_beneficiaries_reference_unique unique (beneficiary_reference),
  constraint donation_beneficiaries_type_valid check (
    beneficiary_type in ('INDIVIDUAL','FAMILY','INSTITUTION','MADRASA_MOSQUE','OTHER')
  ),
  constraint donation_beneficiaries_name_not_blank check (btrim(name) <> ''),
  constraint donation_beneficiaries_monthly_amount_valid check (
    default_monthly_amount is null or default_monthly_amount > 0
  ),
  constraint donation_beneficiaries_reminder_day_valid check (
    reminder_day_of_month is null or reminder_day_of_month between 1 and 28
  ),
  constraint donation_beneficiaries_support_dates_valid check (
    support_end_date is null or support_start_date is null or support_end_date >= support_start_date
  ),
  constraint donation_beneficiaries_monthly_settings_complete check (
    not monthly_support_enabled or (
      default_monthly_amount is not null and reminder_day_of_month is not null and support_start_date is not null
    )
  )
);

create index donation_beneficiaries_name_idx on public.donation_beneficiaries (lower(name));

create table public.donation_monthly_support (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.donation_beneficiaries(id) on delete restrict,
  support_month date not null,
  reminder_day_of_month smallint not null,
  amount numeric(18,2) not null,
  category_id uuid references public.donation_expense_categories(id) on delete restrict,
  payment_method_id uuid references public.donation_payment_methods(id) on delete restrict,
  purpose text,
  status text not null default 'PENDING',
  expense_id uuid,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_monthly_support_month_start check (support_month = date_trunc('month', support_month)::date),
  constraint donation_monthly_support_amount_positive check (amount > 0),
  constraint donation_monthly_support_day_valid check (reminder_day_of_month between 1 and 28),
  constraint donation_monthly_support_status_valid check (status in ('PENDING','COMPLETED','SKIPPED')),
  constraint donation_monthly_support_unique_month unique (beneficiary_id, support_month)
);

create table public.donation_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_reference text not null default (
    'DON-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.donation_expense_reference_seq')::text, 6, '0')
  ),
  beneficiary_id uuid not null references public.donation_beneficiaries(id) on delete restrict,
  category_id uuid not null references public.donation_expense_categories(id) on delete restrict,
  amount numeric(18,2) not null,
  donation_date date not null,
  payment_method_id uuid not null references public.donation_payment_methods(id) on delete restrict,
  payment_reference text,
  purpose text not null,
  note text,
  proof_path text,
  proof_file_name text,
  proof_mime_type text,
  monthly_support_id uuid references public.donation_monthly_support(id) on delete restrict,
  status text not null default 'DRAFT',
  completed_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_expenses_reference_unique unique (expense_reference),
  constraint donation_expenses_amount_positive check (amount > 0),
  constraint donation_expenses_purpose_not_blank check (btrim(purpose) <> ''),
  constraint donation_expenses_status_valid check (status in ('DRAFT','COMPLETED','CLOSED'))
);

alter table public.donation_monthly_support
  add constraint donation_monthly_support_expense_fk
  foreign key (expense_id) references public.donation_expenses(id) on delete restrict;

create unique index donation_expenses_monthly_support_unique
  on public.donation_expenses (monthly_support_id)
  where monthly_support_id is not null;
create index donation_expenses_beneficiary_date_idx
  on public.donation_expenses (beneficiary_id, donation_date desc, created_at desc);

create table public.donation_expense_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.donation_expenses(id) on delete restrict,
  status text not null,
  event_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  constraint donation_expense_events_status_valid check (status in ('DRAFT','COMPLETED','CLOSED'))
);

create index donation_expense_events_history_idx
  on public.donation_expense_events (expense_id, event_at desc, id desc);

create or replace function public.set_donation_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger donation_beneficiaries_updated_at
before update on public.donation_beneficiaries
for each row execute function public.set_donation_updated_at();

create trigger donation_monthly_support_updated_at
before update on public.donation_monthly_support
for each row execute function public.set_donation_updated_at();

create trigger donation_expenses_updated_at
before update on public.donation_expenses
for each row execute function public.set_donation_updated_at();

create or replace function public.guard_donation_expense_status()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if not ((old.status = 'DRAFT' and new.status = 'COMPLETED') or
          (old.status = 'COMPLETED' and new.status = 'CLOSED')) then
    raise exception 'Invalid donation expense status transition from % to %', old.status, new.status
      using errcode = '22023';
  end if;
  if new.status = 'COMPLETED' then new.completed_at = coalesce(new.completed_at, now()); end if;
  if new.status = 'CLOSED' then new.closed_at = coalesce(new.closed_at, now()); end if;
  return new;
end;
$$;

create trigger donation_expenses_status_guard
before update of status on public.donation_expenses
for each row execute function public.guard_donation_expense_status();

create or replace function public.keep_donation_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Donation expense events are immutable' using errcode = '55000';
end;
$$;

create trigger donation_expense_events_immutable
before update or delete on public.donation_expense_events
for each row execute function public.keep_donation_events_immutable();

create or replace function public.create_donation_expense(
  requested_beneficiary_id uuid,
  requested_category_id uuid,
  requested_amount numeric,
  requested_donation_date date,
  requested_payment_method_id uuid,
  requested_payment_reference text,
  requested_purpose text,
  requested_note text,
  requested_monthly_support_id uuid,
  requested_actor_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  reminder record;
begin
  if requested_amount is null or requested_amount <= 0 then
    raise exception 'Donation amount must be greater than zero' using errcode = '22023';
  end if;
  if requested_donation_date is null then
    raise exception 'Donation date is required' using errcode = '22023';
  end if;
  if btrim(coalesce(requested_purpose, '')) = '' then
    raise exception 'Purpose is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.donation_beneficiaries where id = requested_beneficiary_id and is_active) then
    raise exception 'Active beneficiary not found' using errcode = '23503';
  end if;
  if not exists (select 1 from public.donation_expense_categories where id = requested_category_id and is_active) then
    raise exception 'Active donation category not found' using errcode = '23503';
  end if;
  if not exists (select 1 from public.donation_payment_methods where id = requested_payment_method_id and is_active) then
    raise exception 'Active donation payment method not found' using errcode = '23503';
  end if;
  if requested_monthly_support_id is not null then
    select * into reminder from public.donation_monthly_support where id = requested_monthly_support_id for update;
    if not found or reminder.beneficiary_id <> requested_beneficiary_id or reminder.status <> 'PENDING' then
      raise exception 'Monthly support reminder is not available for this beneficiary' using errcode = '23514';
    end if;
  end if;

  insert into public.donation_expenses (
    beneficiary_id, category_id, amount, donation_date, payment_method_id,
    payment_reference, purpose, note, monthly_support_id, created_by, updated_by
  ) values (
    requested_beneficiary_id, requested_category_id, round(requested_amount, 2), requested_donation_date,
    requested_payment_method_id, nullif(btrim(coalesce(requested_payment_reference, '')), ''),
    btrim(requested_purpose), nullif(btrim(coalesce(requested_note, '')), ''),
    requested_monthly_support_id, requested_actor_id, requested_actor_id
  ) returning id into new_id;

  insert into public.donation_expense_events (expense_id, status, actor_id, note)
  values (new_id, 'DRAFT', requested_actor_id, 'Donation expense created');
  return new_id;
end;
$$;

create or replace function public.advance_donation_expense_status(
  requested_expense_id uuid,
  requested_status text,
  requested_actor_id uuid,
  requested_note text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  current_row record;
  expected_status text;
begin
  select * into current_row from public.donation_expenses where id = requested_expense_id for update;
  if not found then raise exception 'Donation expense not found' using errcode = 'P0002'; end if;
  expected_status := case current_row.status when 'DRAFT' then 'COMPLETED' when 'COMPLETED' then 'CLOSED' else null end;
  if expected_status is null then raise exception 'Closed donation expense is terminal' using errcode = '22023'; end if;
  if requested_status <> expected_status then
    raise exception 'Invalid donation expense status transition. Expected %', expected_status using errcode = '22023';
  end if;

  update public.donation_expenses set status = requested_status, updated_by = requested_actor_id where id = requested_expense_id;
  insert into public.donation_expense_events (expense_id, status, actor_id, note)
  values (requested_expense_id, requested_status, requested_actor_id, nullif(btrim(coalesce(requested_note, '')), ''));

  if requested_status = 'COMPLETED' and current_row.monthly_support_id is not null then
    update public.donation_monthly_support
      set status = 'COMPLETED', expense_id = requested_expense_id, completed_at = now()
      where id = current_row.monthly_support_id and status = 'PENDING';
  end if;
  return requested_status;
end;
$$;

create or replace function public.ensure_donation_monthly_support_reminders(requested_date date default current_date)
returns integer
language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  insert into public.donation_monthly_support (
    beneficiary_id, support_month, reminder_day_of_month, amount, category_id, payment_method_id, purpose
  )
  select id, date_trunc('month', requested_date)::date, reminder_day_of_month,
         default_monthly_amount, default_category_id, default_payment_method_id, default_purpose
  from public.donation_beneficiaries
  where is_active and monthly_support_enabled
    and support_start_date <= requested_date
    and (support_end_date is null or support_end_date >= date_trunc('month', requested_date)::date)
  on conflict (beneficiary_id, support_month) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

insert into public.donation_relationship_types (name) values
  ('Mother'),('Father'),('Brother'),('Sister'),('Uncle'),('Aunt'),('Cousin'),
  ('Nephew'),('Niece'),('In-law'),('Extended Relative'),('Other')
on conflict do nothing;

insert into public.donation_expense_categories (name) values
  ('Sadaqah'),('Donation'),('Charity'),('Family Support'),('Welfare Support'),
  ('Medical Assistance'),('Education Support'),('Emergency Support'),
  ('Religious Contribution'),('Other')
on conflict do nothing;

insert into public.donation_payment_methods (name) values
  ('Cash'),('Bank Transfer'),('bKash'),('Nagad'),('Other')
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'donation-expense-proofs', 'donation-expense-proofs', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.donation_relationship_types enable row level security;
alter table public.donation_expense_categories enable row level security;
alter table public.donation_payment_methods enable row level security;
alter table public.donation_beneficiaries enable row level security;
alter table public.donation_monthly_support enable row level security;
alter table public.donation_expenses enable row level security;
alter table public.donation_expense_events enable row level security;

grant usage on sequence public.donation_beneficiary_reference_seq to service_role;
grant usage on sequence public.donation_expense_reference_seq to service_role;
grant select, insert, update on public.donation_relationship_types to service_role;
grant select, insert, update on public.donation_expense_categories to service_role;
grant select, insert, update on public.donation_payment_methods to service_role;
grant select, insert, update on public.donation_beneficiaries to service_role;
grant select, insert, update on public.donation_monthly_support to service_role;
grant select, insert, update on public.donation_expenses to service_role;
grant select, insert on public.donation_expense_events to service_role;
grant execute on function public.create_donation_expense(uuid,uuid,numeric,date,uuid,text,text,text,uuid,uuid) to service_role;
grant execute on function public.advance_donation_expense_status(uuid,text,uuid,text) to service_role;
grant execute on function public.ensure_donation_monthly_support_reminders(date) to service_role;

commit;
