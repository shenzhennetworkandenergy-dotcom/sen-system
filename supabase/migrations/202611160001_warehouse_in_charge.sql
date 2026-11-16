alter table public.warehouses
  add column in_charge_name text
  check (in_charge_name is null or char_length(btrim(in_charge_name)) between 1 and 120);
