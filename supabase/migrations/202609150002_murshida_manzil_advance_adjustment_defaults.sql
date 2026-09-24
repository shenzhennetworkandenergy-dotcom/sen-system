alter table murshida_manzil.tenants
  add column default_monthly_advance_adjustment numeric(18,2) not null default 0
  check (default_monthly_advance_adjustment >= 0);

alter table murshida_manzil.advance_payments
  add column default_monthly_advance_adjustment numeric(18,2) not null default 0
  check (default_monthly_advance_adjustment >= 0);
