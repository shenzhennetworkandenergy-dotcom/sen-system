-- Backfill model identifiers for serial-tracked catalogue records that predate
-- the Phase 1 model requirement. Existing SKUs are authoritative and remain
-- unchanged. The generated model tokens are distinct for the two R640 builds.

update public.products
set model_number = case
  when sku ~ '^SEN-DELL-' then regexp_replace(sku, '^SEN-DELL-', '')
  when sku ~ '^SEN-SM-' then regexp_replace(sku, '^SEN-SM-', '')
  else nullif(trim(manufacturer_part_number), '')
end
where serial_tracking_required
  and nullif(trim(model_number), '') is null
  and brand_id is not null
  and (
    sku ~ '^SEN-DELL-'
    or sku ~ '^SEN-SM-'
    or nullif(trim(manufacturer_part_number), '') is not null
  );
