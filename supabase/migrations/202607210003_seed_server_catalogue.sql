-- Seed the initial public SEN server catalogue. This migration is idempotent so
-- catalogue copy and pricing can be corrected safely in later deployments.

insert into public.brands (name, slug, description, is_active)
values
  ('Dell', 'dell', 'Dell enterprise server systems', true),
  ('Supermicro', 'supermicro', 'Supermicro enterprise and GPU server systems', true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.product_categories
  (name, slug, description, sen_business_category, is_active, sort_order)
values
  ('Servers', 'servers', 'Enterprise rack, storage, compute and GPU servers', 'Networking', true, 10)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sen_business_category = excluded.sen_business_category,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.products
  (name, slug, sku, product_type, status, featured, sen_business_category,
   brand_id, short_description, description, specifications, regular_price,
   currency, manage_stock, stock_status, serial_tracking_required,
   public_catalogue_visible)
values
  (
    'Dell PowerEdge R630 Server',
    'dell-poweredge-r630-e5-2680-v4',
    'SEN-DELL-R630-E52680V4',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Dual Xeon rack server with 56 CPU threads and 10G connectivity',
    'Dell PowerEdge R630 Server with 2× Intel Xeon E5-2680 v4 processors, 56 CPU threads, 16GB RAM, 2×750W power supplies, SSD caddy, iDRAC, 2×1G Ethernet, 2×10G SFP, bezel and rail kit.',
    '{"processor":"2× Intel Xeon E5-2680 v4","cpu_threads":"56","memory":"16GB RAM","power_supply":"2×750W PSU","storage":"SSD caddy included","management":"iDRAC","network":"2×1G Ethernet + 2×10G SFP","included":"Bezel and rail kit"}'::jsonb,
    65000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R640 Server – Xeon Gold 6138',
    'dell-poweredge-r640-xeon-gold-6138',
    'SEN-DELL-R640-G6138',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Dual Xeon Gold server with 80 CPU threads and NVMe support',
    'Dell PowerEdge R640 Server with 2× Intel Xeon Gold 6138 processors, 80 CPU threads, 16GB RAM, NVMe support, 2×750W power supplies, 2×10G SFP, bezel and rail kit.',
    '{"processor":"2× Intel Xeon Gold 6138","cpu_threads":"80","memory":"16GB RAM","storage":"NVMe supported","power_supply":"2×750W PSU","network":"2×10G SFP","included":"Bezel and rail kit"}'::jsonb,
    145000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R640 Server – Xeon Platinum 8160',
    'dell-poweredge-r640-xeon-platinum-8160',
    'SEN-DELL-R640-P8160',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Dual Xeon Platinum server with 96 CPU threads and 10G connectivity',
    'Dell PowerEdge R640 Server with 2× Intel Xeon Platinum 8160 processors, 96 CPU threads, 16GB RAM, 2×750W power supplies, iDRAC, 2×1G Ethernet, 2×10G SFP, bezel and rail kit.',
    '{"processor":"2× Intel Xeon Platinum 8160","cpu_threads":"96","memory":"16GB RAM","power_supply":"2×750W PSU","management":"iDRAC","network":"2×1G Ethernet + 2×10G SFP","included":"Bezel and rail kit"}'::jsonb,
    110000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R730xd Server',
    'dell-poweredge-r730xd',
    'SEN-DELL-R730XD',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Storage and enterprise workload optimized 2U rack server',
    'Dell PowerEdge R730xd Server for storage and enterprise workloads, with 2×750W power supplies, iDRAC, 4×1G Ethernet, bezel and rail kit.',
    '{"workload":"Storage and enterprise workloads","power_supply":"2×750W PSU","management":"iDRAC","network":"4×1G Ethernet","included":"Bezel and rail kit"}'::jsonb,
    78000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R740xd Server',
    'dell-poweredge-r740xd',
    'SEN-DELL-R740XD',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Heavy storage, virtualization and business workload server',
    'Dell PowerEdge R740xd Server for heavy storage, virtualization and business workloads, with 2×750W power supplies, iDRAC, 4×1G Ethernet, bezel and rail kit.',
    '{"workload":"Heavy storage, virtualization and business workloads","power_supply":"2×750W PSU","management":"iDRAC","network":"4×1G Ethernet","included":"Bezel and rail kit"}'::jsonb,
    140000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Supermicro SYS-2029GP-TR Server',
    'supermicro-sys-2029gp-tr',
    'SEN-SM-2029GP-TR',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'supermicro'),
    'Enterprise GPU and data-center workload server',
    'Supermicro SYS-2029GP-TR high-performance enterprise server for data-center and GPU workloads.',
    '{"workload":"Enterprise, data center and GPU workloads","form_factor":"2U rack server"}'::jsonb,
    180000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Supermicro SYS-2028TP-HTTR 2U 4-Node Server',
    'supermicro-sys-2028tp-httr-4-node',
    'SEN-SM-2028TP-HTTR',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'supermicro'),
    'High-density 2U four-node compute platform',
    'Supermicro SYS-2028TP-HTTR 2U 4-Node Server with 2×2000W power supplies and rail kit, designed for high-density multi-node computing.',
    '{"nodes":"4 nodes","form_factor":"2U","power_supply":"2×2000W PSU","included":"Rail kit","workload":"High-density multi-node computing"}'::jsonb,
    120000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R750 Server',
    'dell-poweredge-r750',
    'SEN-DELL-R750',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Modern enterprise, virtualization and scalable infrastructure server',
    'Dell PowerEdge R750 Server for modern enterprise workloads, virtualization and scalable infrastructure.',
    '{"workload":"Modern enterprise, virtualization and scalable infrastructure","form_factor":"2U rack server"}'::jsonb,
    380000, 'BDT', true, 'in_stock', true, true
  ),
  (
    'Dell PowerEdge R760 Server',
    'dell-poweredge-r760',
    'SEN-DELL-R760',
    'simple', 'active', true, 'Networking',
    (select id from public.brands where slug = 'dell'),
    'Latest-generation high-end mission-critical data-center server',
    'Dell PowerEdge R760 latest-generation high-end server for mission-critical workloads and advanced data-center infrastructure.',
    '{"workload":"Mission-critical and advanced data-center workloads","form_factor":"2U rack server"}'::jsonb,
    880000, 'BDT', true, 'in_stock', true, true
  )
on conflict (slug) do update
set name = excluded.name,
    sku = excluded.sku,
    product_type = excluded.product_type,
    status = excluded.status,
    featured = excluded.featured,
    sen_business_category = excluded.sen_business_category,
    brand_id = excluded.brand_id,
    short_description = excluded.short_description,
    description = excluded.description,
    specifications = excluded.specifications,
    regular_price = excluded.regular_price,
    currency = excluded.currency,
    manage_stock = excluded.manage_stock,
    stock_status = excluded.stock_status,
    serial_tracking_required = excluded.serial_tracking_required,
    public_catalogue_visible = excluded.public_catalogue_visible,
    updated_at = now();

insert into public.product_category_assignments (product_id, category_id, is_primary)
select p.id, c.id, true
from public.products p
cross join public.product_categories c
where c.slug = 'servers'
  and p.slug in (
    'dell-poweredge-r630-e5-2680-v4',
    'dell-poweredge-r640-xeon-gold-6138',
    'dell-poweredge-r640-xeon-platinum-8160',
    'dell-poweredge-r730xd',
    'dell-poweredge-r740xd',
    'supermicro-sys-2029gp-tr',
    'supermicro-sys-2028tp-httr-4-node',
    'dell-poweredge-r750',
    'dell-poweredge-r760'
  )
on conflict (product_id, category_id) do update
set is_primary = excluded.is_primary;
