-- Add the shared Purchasing carrier reference to isolated Cargo Tracking jobs.

begin;

alter table public.cargo_shipping_jobs
  add column carrier_id uuid references public.purchase_carriers(id) on delete restrict,
  add column carrier_reference text;

create index cargo_shipping_jobs_carrier_idx
  on public.cargo_shipping_jobs(carrier_id) where carrier_id is not null;

create function public.create_cargo_shipping_job(
  actor_profile_id uuid,
  requested_customer_id uuid,
  requested_tracking_number text,
  requested_goods_summary text,
  requested_shipping_method text,
  requested_charge_basis text,
  requested_rate numeric,
  requested_china_warehouse_id uuid,
  requested_bangladesh_warehouse_id uuid,
  requested_note text,
  requested_packages jsonb,
  requested_carrier_id uuid,
  requested_carrier_reference text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
begin
  if requested_carrier_id is not null and not exists (
    select 1 from public.purchase_carriers
    where id = requested_carrier_id and status = 'active'
  ) then
    raise exception 'Choose an active carrier';
  end if;

  job_id := public.create_cargo_shipping_job(
    actor_profile_id,
    requested_customer_id,
    requested_tracking_number,
    requested_goods_summary,
    requested_shipping_method,
    requested_charge_basis,
    requested_rate,
    requested_china_warehouse_id,
    requested_bangladesh_warehouse_id,
    requested_note,
    requested_packages
  );

  update public.cargo_shipping_jobs
  set carrier_id = requested_carrier_id,
      carrier_reference = nullif(left(btrim(coalesce(requested_carrier_reference, '')), 200), '')
  where id = job_id;

  return job_id;
end;
$$;

revoke all on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.create_cargo_shipping_job(uuid,uuid,text,text,text,text,numeric,uuid,uuid,text,jsonb,uuid,text) to service_role;

commit;
