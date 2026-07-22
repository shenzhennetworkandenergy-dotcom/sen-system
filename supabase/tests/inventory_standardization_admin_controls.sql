begin;

do $$
declare
  product_count integer;
  standardized_count integer;
  serialized_product_count integer;
  stocked_serial_count integer;
begin
  select count(*) into product_count from public.products where status = 'active';
  select count(*) into standardized_count
  from public.products
  where status = 'active'
    and currency = 'BDT'
    and model_number is not null
    and nullif(trim(short_description), '') is not null
    and nullif(trim(description), '') is not null
    and specifications <> '{}'::jsonb
    and default_warehouse_id is not null;
  if standardized_count <> product_count then raise exception 'Not every active product is standardized: % of %', standardized_count, product_count; end if;

  if not exists (
    select 1 from public.products p join public.brands b on b.id = p.brand_id
    where p.sku = 'SEN-CISCO-N3K-C3172PQ' and b.name = 'Cisco' and p.model_number = 'N3K-C3172PQ-10GE'
  ) then raise exception 'Cisco Nexus standardization is missing or incorrect'; end if;

  select count(*) into serialized_product_count from public.products where status = 'active' and serial_tracking_required;
  select count(distinct p.id) into stocked_serial_count
  from public.products p
  join public.serial_numbers s on s.product_id = p.id
  join public.inventory_balances b on b.product_id = p.id and b.warehouse_id = s.warehouse_id
  where p.status = 'active' and p.serial_tracking_required and s.status = 'available' and b.on_hand > 0;
  if stocked_serial_count <> serialized_product_count then raise exception 'Not every serialized product has a traceable test unit: % of %', stocked_serial_count, serialized_product_count; end if;

  if exists (select 1 from public.products where currency <> 'BDT') then raise exception 'A non-BDT product remains'; end if;
end $$;

rollback;
