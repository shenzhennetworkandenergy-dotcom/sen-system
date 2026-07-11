-- Optional demo homepage content only. Replace with verified SEN records before production catalogue launch.
insert into public.products (slug, name, short_description, category_slug, image_url, image_alt, featured, published, display_order)
values
  ('sample-enterprise-rack-server-class', 'Enterprise rack server class', 'Sample category record for high-density compute, virtualization and data-center procurement.', 'servers', '/images/home/servers/rack-servers.svg', 'Abstract enterprise rack server infrastructure visual', true, true, 10),
  ('sample-core-switch-class', 'Enterprise core switch class', 'Sample category record for data-center, campus and ISP switching projects.', 'networking', '/images/home/networking/fibre-core.svg', 'Abstract fibre and core network infrastructure visual', true, true, 20),
  ('sample-patient-monitor-class', 'Multiparameter patient monitor class', 'Sample category record for patient monitoring and hospital technology sourcing.', 'medical', '/images/home/medical/diagnostic-suite.svg', 'Abstract medical diagnostic technology visual', true, true, 30),
  ('sample-industrial-ups-class', 'Industrial UPS and inverter class', 'Sample category record for critical power continuity and industrial energy projects.', 'energy', '/images/home/energy/power-systems.svg', 'Abstract energy and power electronics infrastructure visual', true, true, 40)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  category_slug = excluded.category_slug,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  featured = excluded.featured,
  published = excluded.published,
  display_order = excluded.display_order;
