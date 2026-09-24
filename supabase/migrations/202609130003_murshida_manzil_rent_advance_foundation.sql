alter table murshida_manzil.rent_transactions
  add column unit_id uuid references murshida_manzil.units(id) on delete restrict,
  add column unit_code_snapshot text;

create index rent_transactions_unit_id_idx
  on murshida_manzil.rent_transactions(unit_id);

create table murshida_manzil.advance_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references murshida_manzil.tenants(id) on delete restrict,
  unit_id uuid references murshida_manzil.units(id) on delete restrict,
  unit_code_snapshot text not null check (char_length(btrim(unit_code_snapshot)) between 1 and 120),
  amount numeric(18,2) not null check (amount > 0),
  payment_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index advance_payments_tenant_date_idx
  on murshida_manzil.advance_payments(tenant_id, payment_date desc);
create index advance_payments_unit_id_idx
  on murshida_manzil.advance_payments(unit_id);

revoke all on table murshida_manzil.advance_payments from public, anon, authenticated;
grant all privileges on table murshida_manzil.advance_payments to service_role;
