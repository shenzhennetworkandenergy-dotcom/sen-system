-- Monthly warehouse expense vouchers. Document-only; no accounting posting.

create table if not exists public.warehouse_expense_templates (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null unique references public.warehouses(id) on delete restrict,
  payee_organization text not null,
  contact_person text,
  payee_address text,
  payee_phone text,
  default_rent_amount numeric(14,2) not null default 0 check (default_rent_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_expense_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_month date not null check (voucher_month = date_trunc('month', voucher_month)::date),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  template_id uuid references public.warehouse_expense_templates(id) on delete set null,
  payee_organization text not null,
  contact_person text,
  payee_address text,
  payee_phone text,
  rent_amount numeric(14,2) not null default 0 check (rent_amount >= 0),
  electricity_amount numeric(14,2) not null default 0 check (electricity_amount >= 0),
  staff_food_amount numeric(14,2) not null default 0 check (staff_food_amount >= 0),
  other_amount numeric(14,2) not null default 0 check (other_amount >= 0),
  total_amount numeric(14,2) generated always as
    (rent_amount + electricity_amount + staff_food_amount + other_amount) stored,
  status text not null default 'draft' check (status in ('draft','paid')),
  payment_date date,
  payment_method text,
  payment_reference text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, voucher_month)
);

create index if not exists warehouse_expense_vouchers_month_idx
  on public.warehouse_expense_vouchers(voucher_month desc);

alter table public.warehouse_expense_templates enable row level security;
alter table public.warehouse_expense_vouchers enable row level security;

grant select, insert, update on table public.warehouse_expense_templates to service_role;
grant select, insert, update on table public.warehouse_expense_vouchers to service_role;

insert into public.warehouse_expense_templates (
  warehouse_id,
  payee_organization,
  contact_person,
  payee_address,
  default_rent_amount
)
select
  warehouse.id,
  'Data Recovery Planet',
  'Mr. Abdullah Al Mamun',
  warehouse.address,
  25000
from public.warehouses warehouse
where warehouse.is_active
  and (warehouse.name ilike '%dhaka%' or coalesce(warehouse.address, '') ilike '%dhaka%')
order by case when warehouse.name ilike '%dhaka%' then 0 else 1 end, warehouse.created_at
limit 1
on conflict (warehouse_id) do nothing;
