create table murshida_manzil.units (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null check (char_length(btrim(unit_code)) between 1 and 120),
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index units_unit_code_lower_idx
  on murshida_manzil.units (lower(btrim(unit_code)));

alter table murshida_manzil.tenants add column unit_id uuid references murshida_manzil.units(id) on delete restrict;

create index tenants_unit_id_idx on murshida_manzil.tenants(unit_id);

revoke all on table murshida_manzil.units from public, anon, authenticated;
grant all privileges on table murshida_manzil.units to service_role;
