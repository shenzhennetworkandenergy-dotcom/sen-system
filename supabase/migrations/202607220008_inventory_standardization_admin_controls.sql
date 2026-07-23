-- Standardize the existing local SEN catalogue for operational testing.
-- The migration is idempotent and only seeds stock for products that have no
-- existing stock balance or serialized units.

insert into public.brands(name, slug, description)
values
  ('Cisco', 'cisco', 'Cisco networking and data-centre products.'),
  ('SEN', 'sen', 'Shenzhen Energy & Networks configured products.')
on conflict(name) do update set
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.product_categories(name, slug, sen_business_category, description)
values
  ('Enterprise Servers', 'enterprise-servers', 'Networking', 'Rack, storage, compute and GPU servers.'),
  ('Data Center Switches', 'data-center-switches', 'Networking', 'High-throughput data-centre switching.'),
  ('Enterprise Routers', 'enterprise-routers', 'Networking', 'Business routing and network-edge equipment.')
on conflict(slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

update public.products
set
  name = 'SEN Enterprise Test Router',
  slug = 'sen-enterprise-test-router',
  sku = 'SEN-SEN-STR-1000',
  model_number = 'STR-1000',
  brand_id = (select id from public.brands where name = 'SEN'),
  manufacturer_part_number = 'STR-1000',
  short_description = 'SEN lab router maintained as non-serialized local test inventory.',
  description = 'A standardized SEN test router record used to validate quantities, warehouse availability, movements and catalogue administration.',
  specifications = jsonb_build_object('device_type','Enterprise router','inventory_purpose','Local workflow validation','stock_tracking','Quantity based'),
  warranty_information = 'Internal test equipment; no customer warranty is assigned.',
  country_of_origin = 'Not recorded',
  currency = 'BDT',
  low_stock_threshold = 1,
  default_warehouse_id = (select id from public.warehouses where code = 'BD-MAIN'),
  public_catalogue_visible = false,
  sku_generation_mode = 'automatic',
  updated_at = now()
where sku in ('SEN-LOCAL-001','SEN-SEN-STR-1000');

update public.products
set
  name = 'Cisco Nexus 3172PQ Data Center Switch',
  slug = 'cisco-nexus-3172pq-data-center-switch',
  sku = 'SEN-CISCO-N3K-C3172PQ',
  model_number = 'N3K-C3172PQ-10GE',
  brand_id = (select id from public.brands where name = 'Cisco'),
  manufacturer_part_number = 'N3K-C3172PQ-10GE',
  short_description = 'Low-latency 48-port 10GbE SFP+ and 6-port 40GbE QSFP+ data-centre switch.',
  description = 'Cisco Nexus 3172PQ top-of-rack switch for virtualization, cloud and spine-leaf data-centre networks.',
  specifications = jsonb_build_object('form_factor','1U','10gbe_ports','48 × SFP+','40gbe_ports','6 × QSFP+','network_role','Top-of-rack data-centre switch'),
  warranty_information = 'Warranty terms are confirmed on the customer quotation.',
  country_of_origin = 'Not recorded',
  currency = 'BDT',
  manage_stock = true,
  serial_tracking_required = true,
  low_stock_threshold = 1,
  default_warehouse_id = (select id from public.warehouses where code = 'BD-MAIN'),
  public_catalogue_visible = true,
  sku_generation_mode = 'automatic',
  updated_at = now()
where sku in ('3172PQ-48','SEN-CISCO-N3K-C3172PQ');

with details(sku, description, specifications, warranty, origin) as (
  values
    ('SEN-DELL-R630-E52680V4', 'Dell PowerEdge R630 with dual Xeon E5-2680 v4 processors for virtualization and enterprise workloads.', jsonb_build_object('processors','2 × Intel Xeon E5-2680 v4','cpu_threads',56,'memory','16 GB','power_supplies','2 × 750 W','network','2 × 1GbE + 2 × 10GbE SFP+','management','iDRAC','included','SSD caddy, bezel and rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R640-G6138', 'Dell PowerEdge R640 with dual Xeon Gold 6138 processors and NVMe support.', jsonb_build_object('processors','2 × Intel Xeon Gold 6138','cpu_threads',80,'memory','16 GB','storage_support','NVMe','power_supplies','2 × 750 W','network','2 × 10GbE SFP+','included','Bezel and rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R640-P8160', 'Dell PowerEdge R640 with dual Xeon Platinum 8160 processors for dense enterprise compute.', jsonb_build_object('processors','2 × Intel Xeon Platinum 8160','cpu_threads',96,'memory','16 GB','power_supplies','2 × 750 W','network','2 × 1GbE + 2 × 10GbE SFP+','management','iDRAC','included','Bezel and rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R730XD', 'Dell PowerEdge R730xd optimized for storage and enterprise workloads.', jsonb_build_object('form_factor','2U','workload','Storage and enterprise','power_supplies','2 × 750 W','network','4 × 1GbE','management','iDRAC','included','Bezel and rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R740XD', 'Dell PowerEdge R740xd for storage, virtualization and business workloads.', jsonb_build_object('form_factor','2U','workload','Storage, virtualization and business','power_supplies','2 × 750 W','network','4 × 1GbE','management','iDRAC','included','Bezel and rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-SM-2029GP-TR', 'Supermicro SYS-2029GP-TR enterprise server for data-centre and GPU workloads.', jsonb_build_object('form_factor','2U','workload','GPU compute and data centre','platform','Enterprise GPU server'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-SM-2028TP-HTTR', 'Supermicro SYS-2028TP-HTTR high-density four-node compute server.', jsonb_build_object('form_factor','2U','nodes',4,'power_supplies','2 × 2000 W','workload','Multi-node compute','included','Rail kit'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R750', 'Dell PowerEdge R750 for modern enterprise workloads, virtualization and scalable infrastructure.', jsonb_build_object('form_factor','2U','workload','Enterprise virtualization and scalable infrastructure','generation','15th generation PowerEdge'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded'),
    ('SEN-DELL-R760', 'Dell PowerEdge R760 for mission-critical workloads and advanced data-centre deployments.', jsonb_build_object('form_factor','2U','workload','Mission-critical and advanced data centre','generation','16th generation PowerEdge'), 'Warranty terms are confirmed on the customer quotation.', 'Not recorded')
)
update public.products p
set
  description = details.description,
  specifications = details.specifications,
  warranty_information = details.warranty,
  country_of_origin = details.origin,
  currency = 'BDT',
  manage_stock = true,
  serial_tracking_required = true,
  low_stock_threshold = 1,
  default_warehouse_id = (select id from public.warehouses where code = 'BD-MAIN'),
  public_catalogue_visible = true,
  sku_generation_mode = 'automatic',
  updated_at = now()
from details
where p.sku = details.sku;

update public.products
set currency = 'BDT', updated_at = now()
where currency <> 'BDT';

-- Clear the existing primary flag first because the partial unique index allows
-- only one primary category per product, even when a different assignment row
-- already exists.
update public.product_category_assignments assignment
set is_primary = false
from public.products product
where assignment.product_id = product.id
  and assignment.is_primary
  and product.sku in (
    'SEN-SEN-STR-1000','SEN-CISCO-N3K-C3172PQ','SEN-DELL-R630-E52680V4',
    'SEN-DELL-R640-G6138','SEN-DELL-R640-P8160','SEN-DELL-R730XD',
    'SEN-DELL-R740XD','SEN-SM-2029GP-TR','SEN-SM-2028TP-HTTR',
    'SEN-DELL-R750','SEN-DELL-R760'
  );

insert into public.product_category_assignments(product_id, category_id, is_primary)
select p.id, c.id, true
from public.products p
join public.product_categories c on c.slug = case
  when p.sku = 'SEN-SEN-STR-1000' then 'enterprise-routers'
  when p.sku = 'SEN-CISCO-N3K-C3172PQ' then 'data-center-switches'
  else 'enterprise-servers'
end
where p.sku in (
  'SEN-SEN-STR-1000','SEN-CISCO-N3K-C3172PQ','SEN-DELL-R630-E52680V4',
  'SEN-DELL-R640-G6138','SEN-DELL-R640-P8160','SEN-DELL-R730XD',
  'SEN-DELL-R740XD','SEN-SM-2029GP-TR','SEN-SM-2028TP-HTTR',
  'SEN-DELL-R750','SEN-DELL-R760'
)
on conflict(product_id, category_id) do update set is_primary = true;

do $$
declare
  actor uuid;
  warehouse uuid;
  reason uuid;
  item record;
begin
  select id into actor from public.profiles
  where role = 'admin' and status = 'active'
  order by created_at limit 1;
  select id into warehouse from public.warehouses
  where code = 'BD-MAIN' and is_active limit 1;
  select id into reason from public.stock_adjustment_reasons
  where key = 'opening_balance' and is_active limit 1;

  if actor is null or warehouse is null or reason is null then
    raise notice 'Catalogue standardized; demo physical units skipped because an active admin, BD-MAIN warehouse, or opening-balance reason is missing.';
    return;
  end if;

  for item in
    select p.id, p.sku
    from public.products p
    where p.serial_tracking_required and p.status = 'active'
      and p.sku in (
        'SEN-CISCO-N3K-C3172PQ','SEN-DELL-R630-E52680V4','SEN-DELL-R640-G6138',
        'SEN-DELL-R640-P8160','SEN-DELL-R730XD','SEN-DELL-R740XD',
        'SEN-SM-2029GP-TR','SEN-SM-2028TP-HTTR','SEN-DELL-R750','SEN-DELL-R760'
      )
      and not exists(select 1 from public.serial_numbers s where s.product_id = p.id)
      and not exists(select 1 from public.inventory_balances b where b.product_id = p.id and b.on_hand > 0)
  loop
    perform public.phase3_receive_serialized_stock(
      actor, item.id, null, warehouse, 1, 'refurbished', reason,
      'Standardized local demonstration unit for inventory workflow review.',
      array['DEMO-' || item.sku || '-001']
    );
  end loop;
end $$;

update public.products p
set stock_status = case
  when coalesce((select sum(b.available) from public.inventory_balances b where b.product_id = p.id), 0) > 0 then 'in_stock'
  else 'out_of_stock'
end,
updated_at = now();
