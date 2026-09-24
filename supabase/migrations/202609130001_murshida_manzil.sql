create schema if not exists murshida_manzil;

create table murshida_manzil.owners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  ownership_percentage numeric(7,2) not null check (ownership_percentage > 0 and ownership_percentage <= 100),
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table murshida_manzil.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  unit_description text,
  monthly_rent numeric(18,2) not null check (monthly_rent > 0),
  initial_advance_balance numeric(18,2) not null default 0 check (initial_advance_balance >= 0),
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table murshida_manzil.rent_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references murshida_manzil.tenants(id) on delete restrict,
  rent_year smallint not null check (rent_year between 2000 and 2200),
  rent_month smallint not null check (rent_month between 1 and 12),
  monthly_rent numeric(18,2) not null check (monthly_rent > 0),
  actual_money_received numeric(18,2) not null default 0 check (actual_money_received >= 0),
  advance_adjusted numeric(18,2) not null default 0 check (advance_adjusted >= 0),
  total_rent_settled numeric(18,2) not null check (total_rent_settled > 0),
  advance_balance_before numeric(18,2) not null check (advance_balance_before >= 0),
  advance_balance_after numeric(18,2) not null check (advance_balance_after >= 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('cash','bank','mfs','cheque','other')),
  notes text,
  reference_number text,
  money_receipt_number text not null unique,
  rent_receipt_number text not null unique,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_rent_settled = actual_money_received + advance_adjusted),
  check (advance_adjusted <= advance_balance_before),
  check (advance_balance_after = advance_balance_before - advance_adjusted)
);

create table murshida_manzil.rent_advance_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references murshida_manzil.tenants(id) on delete restrict,
  rent_transaction_id uuid not null references murshida_manzil.rent_transactions(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  adjustment_date date not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table murshida_manzil.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(18,2) not null check (amount > 0),
  category text,
  paid_to text,
  payment_method text not null check (payment_method in ('cash','bank','mfs','cheque','other')),
  notes text,
  voucher_number text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table murshida_manzil.owner_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references murshida_manzil.owners(id) on delete restrict,
  source_type text not null check (source_type in ('rent_income','expense')),
  source_id uuid not null,
  ownership_percentage_snapshot numeric(7,2) not null check (ownership_percentage_snapshot > 0 and ownership_percentage_snapshot <= 100),
  allocated_amount numeric(18,2) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, source_type, source_id)
);

create index rent_transactions_date_idx on murshida_manzil.rent_transactions(payment_date desc);
create index expenses_date_idx on murshida_manzil.expenses(expense_date desc);
create index owner_allocations_source_idx on murshida_manzil.owner_allocations(source_type, source_id);

revoke all on schema murshida_manzil from public, anon, authenticated;
grant usage on schema murshida_manzil to service_role;
grant all privileges on all tables in schema murshida_manzil to service_role;
grant all privileges on all sequences in schema murshida_manzil to service_role;
alter default privileges in schema murshida_manzil grant all on tables to service_role;
alter default privileges in schema murshida_manzil grant all on sequences to service_role;
