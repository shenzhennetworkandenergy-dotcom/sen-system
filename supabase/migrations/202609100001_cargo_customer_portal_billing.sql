-- Cargo customer portal and Cargo-owned billing only.
begin;

alter table public.cargo_shipping_jobs
  add column if not exists customer_reference text,
  add column if not exists customer_contact_person text,
  add column if not exists customer_contact_phone text,
  add column if not exists customer_service_location text,
  add column if not exists customer_preferred_date date,
  add column if not exists customer_instruction text,
  add column if not exists final_billable_weight_kg numeric(18,3)
    check (final_billable_weight_kg is null or final_billable_weight_kg > 0);

-- Required Cargo-only relaxation: unknown courier tracking is stored as NULL.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cargo_shipping_jobs' and column_name='courier_tracking_number' and is_nullable='NO') then
    alter table public.cargo_shipping_jobs alter column courier_tracking_number drop not null;
  end if;
end $$;

-- Required Cargo-only relaxation: zero-value invoices may use a zero billable weight.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid='public.cargo_shipping_jobs'::regclass and conname='cargo_shipping_jobs_final_billable_weight_kg_check') then
    if position('>=' in (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.cargo_shipping_jobs'::regclass and conname='cargo_shipping_jobs_final_billable_weight_kg_check')) = 0 then
      alter table public.cargo_shipping_jobs drop constraint cargo_shipping_jobs_final_billable_weight_kg_check;
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.cargo_shipping_jobs'::regclass and conname='cargo_shipping_jobs_final_billable_weight_kg_check') then
    alter table public.cargo_shipping_jobs add constraint cargo_shipping_jobs_final_billable_weight_kg_check check (final_billable_weight_kg is null or final_billable_weight_kg >= 0);
  end if;
end $$;

create table if not exists public.cargo_rates (
  id uuid primary key default gen_random_uuid(),
  shipping_method text not null check (shipping_method in ('air','sea','hand_carry')),
  rate_bdt_per_kg numeric(18,4) not null check (rate_bdt_per_kg > 0),
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists cargo_rates_one_active_method
  on public.cargo_rates(shipping_method) where is_active;

create table if not exists public.cargo_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('CINV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  cargo_job_id uuid not null unique references public.cargo_shipping_jobs(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  invoice_date date not null default current_date,
  currency text not null default 'BDT' check (currency = 'BDT'),
  final_billable_weight_kg numeric(18,3) not null check (final_billable_weight_kg > 0),
  applied_rate_per_kg numeric(18,4) not null check (applied_rate_per_kg > 0),
  base_cargo_charge numeric(20,2) generated always as (round(final_billable_weight_kg * applied_rate_per_kg, 2)) stored,
  total_amount numeric(20,2) generated always as (round(final_billable_weight_kg * applied_rate_per_kg, 2)) stored,
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PAID')),
  customer_visible boolean not null default false,
  payment_method text,
  payment_reference text,
  payment_note text,
  payment_proof_path text,
  generated_at timestamptz not null default now(),
  generated_by uuid not null references public.profiles(id),
  paid_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if exists (select 1 from pg_constraint where conrelid='public.cargo_invoices'::regclass and conname='cargo_invoices_final_billable_weight_kg_check') then
    if position('>=' in (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.cargo_invoices'::regclass and conname='cargo_invoices_final_billable_weight_kg_check')) = 0 then
      alter table public.cargo_invoices drop constraint cargo_invoices_final_billable_weight_kg_check;
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.cargo_invoices'::regclass and conname='cargo_invoices_final_billable_weight_kg_check') then
    alter table public.cargo_invoices add constraint cargo_invoices_final_billable_weight_kg_check check (final_billable_weight_kg >= 0);
  end if;
end $$;
create index if not exists cargo_invoices_customer_idx on public.cargo_invoices(customer_id, created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('cargo-invoice-proofs','cargo-invoice-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.cargo_rates enable row level security;
alter table public.cargo_invoices enable row level security;
alter table public.cargo_shipping_jobs enable row level security;
alter table public.cargo_shipping_packages enable row level security;
alter table public.cargo_shipping_events enable row level security;
do $$ begin if exists (select 1 from pg_policies where schemaname='public' and tablename='cargo_shipping_jobs' and policyname='cargo owners read own jobs') then drop policy "cargo owners read own jobs" on public.cargo_shipping_jobs; end if; end $$;
create policy "cargo owners read own jobs" on public.cargo_shipping_jobs for select to authenticated using (customer_id = auth.uid());
do $$ begin if exists (select 1 from pg_policies where schemaname='public' and tablename='cargo_shipping_packages' and policyname='cargo owners read own packages') then drop policy "cargo owners read own packages" on public.cargo_shipping_packages; end if; end $$;
create policy "cargo owners read own packages" on public.cargo_shipping_packages for select to authenticated using (exists(select 1 from public.cargo_shipping_jobs j where j.id=job_id and j.customer_id=auth.uid()));
do $$ begin if exists (select 1 from pg_policies where schemaname='public' and tablename='cargo_shipping_events' and policyname='cargo owners read own events') then drop policy "cargo owners read own events" on public.cargo_shipping_events; end if; end $$;
create policy "cargo owners read own events" on public.cargo_shipping_events for select to authenticated using (exists(select 1 from public.cargo_shipping_jobs j where j.id=job_id and j.customer_id=auth.uid()));
do $$ begin if exists (select 1 from pg_policies where schemaname='public' and tablename='cargo_invoices' and policyname='cargo owners read visible invoices') then drop policy "cargo owners read visible invoices" on public.cargo_invoices; end if; end $$;
create policy "cargo owners read visible invoices" on public.cargo_invoices for select to authenticated
  using (customer_id = auth.uid() and customer_visible = true);
grant select on public.cargo_rates, public.cargo_invoices to authenticated;
grant select on public.cargo_shipping_jobs, public.cargo_shipping_packages, public.cargo_shipping_events to authenticated;
grant all on public.cargo_rates, public.cargo_invoices to service_role;

create or replace function public.create_cargo_customer_request(
  actor_profile_id uuid,
  requested_payload jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  job_id uuid := gen_random_uuid();
  tracking text := nullif(left(btrim(coalesce(requested_payload->>'tracking_number','')),160),'');
  package_row jsonb;
  package_number integer := 0;
begin
  if actor_profile_id is null or actor_profile_id <> auth.uid() or not exists (
    select 1 from public.profiles where id=actor_profile_id and role='customer' and status='active'
  ) then raise exception 'Customer authentication required'; end if;
  if nullif(btrim(coalesce(requested_payload->>'goods_summary','')), '') is null then raise exception 'Goods description is required'; end if;
  if coalesce(requested_payload->>'shipping_method','air') not in ('air','sea','hand_carry') then raise exception 'Invalid shipping method'; end if;
  if jsonb_typeof(coalesce(requested_payload->'packages','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(requested_payload->'packages','[]'::jsonb)) = 0 then raise exception 'Add at least one package'; end if;
  insert into public.cargo_shipping_jobs(
    id,customer_id,courier_tracking_number,goods_summary,shipping_method,charge_basis,rate,note,
    customer_reference,customer_contact_person,customer_contact_phone,customer_service_location,customer_preferred_date,customer_instruction,
    created_by,updated_by
  ) values (
    job_id,actor_profile_id,tracking,left(btrim(requested_payload->>'goods_summary'),2000),coalesce(requested_payload->>'shipping_method','air'),'per_kg',0,
    nullif(left(btrim(coalesce(requested_payload->>'note','')),3000),''),
    nullif(left(btrim(coalesce(requested_payload->>'customer_reference','')),200),''),
    nullif(left(btrim(coalesce(requested_payload->>'contact_person','')),200),''),
    nullif(left(btrim(coalesce(requested_payload->>'contact_phone','')),80),''),
    nullif(left(btrim(coalesce(requested_payload->>'service_location','')),500),''),
    nullif(requested_payload->>'preferred_date','')::date,
    nullif(left(btrim(coalesce(requested_payload->>'customer_instruction','')),2000),''),
    actor_profile_id,actor_profile_id
  );
  for package_row in select value from jsonb_array_elements(requested_payload->'packages') loop
    package_number := package_number + 1;
    if nullif(btrim(package_row->>'description'),'') is null then raise exception 'Package description is required'; end if;
    insert into public.cargo_shipping_packages(job_id,sequence_number,description,quantity,unit,weight,dimensions,cbm)
    values(job_id,package_number,left(btrim(package_row->>'description'),1000),greatest(coalesce((package_row->>'quantity')::numeric,1),1),left(coalesce(package_row->>'unit','Piece'),40),nullif(package_row->>'weight','')::numeric,nullif(left(btrim(coalesce(package_row->>'dimensions','')),200),''),nullif(package_row->>'cbm','')::numeric);
  end loop;
  insert into public.cargo_shipping_events(job_id,status,note,actor_id) values(job_id,'requested','Customer cargo request submitted.',actor_profile_id);
  return job_id;
exception when invalid_text_representation then raise exception 'Invalid request data';
end;
$$;

create or replace function public.set_cargo_active_rate(actor_profile_id uuid, requested_shipping_method text, requested_rate numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rate_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin' and status='active') then raise exception 'Permission denied'; end if;
  if requested_shipping_method not in ('air','sea','hand_carry') or requested_rate is null or requested_rate <= 0 then raise exception 'Rate must be greater than zero'; end if;
  update public.cargo_rates set is_active=false where shipping_method=requested_shipping_method and is_active;
  insert into public.cargo_rates(shipping_method,rate_bdt_per_kg,created_by) values(requested_shipping_method,requested_rate,actor_profile_id) returning id into rate_id;
  return rate_id;
end;
$$;

create or replace function public.generate_cargo_invoice(actor_profile_id uuid, requested_job_id uuid, requested_weight numeric, requested_rate_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare job_row public.cargo_shipping_jobs%rowtype; rate_row public.cargo_rates%rowtype; invoice_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin' and status='active') then raise exception 'Permission denied'; end if;
  if requested_weight is null or requested_weight < 0 then raise exception 'Final billable weight cannot be negative'; end if;
  select * into job_row from public.cargo_shipping_jobs where id=requested_job_id for update;
  if job_row.id is null then raise exception 'Cargo job not found'; end if;
  if job_row.current_status not in ('received_bd_warehouse','ready_for_customer') then raise exception 'Invoice can be generated after Bangladesh warehouse receipt'; end if;
  select * into rate_row from public.cargo_rates where id=requested_rate_id and is_active for update;
  if rate_row.id is null then raise exception 'Choose an active Cargo rate'; end if;
  update public.cargo_shipping_jobs set final_billable_weight_kg=requested_weight, updated_by=actor_profile_id, updated_at=now() where id=requested_job_id;
  insert into public.cargo_invoices(cargo_job_id,customer_id,final_billable_weight_kg,applied_rate_per_kg,generated_by)
  values(requested_job_id,job_row.customer_id,requested_weight,rate_row.rate_bdt_per_kg,actor_profile_id)
  on conflict(cargo_job_id) do update set final_billable_weight_kg=excluded.final_billable_weight_kg,applied_rate_per_kg=excluded.applied_rate_per_kg,updated_at=now()
  returning id into invoice_id;
  return invoice_id;
end;
$$;

create or replace function public.set_cargo_invoice_visibility(actor_profile_id uuid, requested_invoice_id uuid, requested_visible boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin' and status='active') then raise exception 'Permission denied'; end if;
  update public.cargo_invoices set customer_visible=requested_visible,updated_at=now() where id=requested_invoice_id;
end;
$$;

create or replace function public.confirm_cargo_invoice_payment(actor_profile_id uuid, requested_invoice_id uuid, requested_method text, requested_reference text, requested_note text, requested_proof_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=actor_profile_id and role='admin' and status='active') then raise exception 'Permission denied'; end if;
  update public.cargo_invoices set payment_status='PAID',payment_method=nullif(left(btrim(coalesce(requested_method,'')),100),''),payment_reference=nullif(left(btrim(coalesce(requested_reference,'')),200),''),payment_note=nullif(left(btrim(coalesce(requested_note,'')),1000),''),payment_proof_path=nullif(left(btrim(coalesce(requested_proof_path,'')),500),''),paid_at=now(),confirmed_at=now(),updated_at=now() where id=requested_invoice_id;
end;
$$;

create or replace function public.enforce_cargo_invoice_payment_before_handover() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.current_status in ('ready_for_customer','handed_over','delivered') and not exists(select 1 from public.cargo_invoices where cargo_job_id=new.id) then
    raise exception 'Cargo invoice must be generated before downstream progression';
  end if;
  if new.current_status in ('handed_over','delivered') and exists(select 1 from public.cargo_invoices where cargo_job_id=new.id and total_amount > 0) and not exists(select 1 from public.cargo_invoices where cargo_job_id=new.id and total_amount > 0 and payment_status='PAID') then
    raise exception 'Cargo invoice payment must be confirmed before handover';
  end if;
  return new;
end;
$$;
drop trigger if exists cargo_invoice_payment_gate on public.cargo_shipping_jobs;
create trigger cargo_invoice_payment_gate before update of current_status on public.cargo_shipping_jobs for each row execute function public.enforce_cargo_invoice_payment_before_handover();

revoke all on function public.create_cargo_customer_request(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.set_cargo_active_rate(uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.generate_cargo_invoice(uuid,uuid,numeric,uuid) from public,anon,authenticated;
revoke all on function public.set_cargo_invoice_visibility(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.confirm_cargo_invoice_payment(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_cargo_customer_request(uuid,jsonb) to authenticated;
grant execute on function public.set_cargo_active_rate(uuid,text,numeric) to service_role;
grant execute on function public.generate_cargo_invoice(uuid,uuid,numeric,uuid) to service_role;
grant execute on function public.set_cargo_invoice_visibility(uuid,uuid,boolean) to service_role;
grant execute on function public.confirm_cargo_invoice_payment(uuid,uuid,text,text,text,text) to service_role;

commit;
