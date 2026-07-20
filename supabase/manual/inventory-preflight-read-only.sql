-- Read-only prerequisite report. Safe to run before Inventory migrations.
select object_name, object_exists from (values
  ('public.profiles',to_regclass('public.profiles') is not null),
  ('public.audit_logs',to_regclass('public.audit_logs') is not null),
  ('public.app_modules',to_regclass('public.app_modules') is not null),
  ('public.permissions',to_regclass('public.permissions') is not null),
  ('public.effective_permissions_for_profile(uuid)',to_regprocedure('public.effective_permissions_for_profile(uuid)') is not null),
  ('public.current_user_has_permission(text)',to_regprocedure('public.current_user_has_permission(text)') is not null)
) checks(object_name,object_exists) order by object_name;

select required.key as missing_permission
from unnest(array[
  'products.view','products.create','products.edit','products.archive','products.import','products.export',
  'inventory.view','inventory.receive','inventory.adjust_stock','inventory.transfer','inventory.count','inventory.export',
  'warehouses.view','warehouses.create','warehouses.edit','warehouses.manage_locations',
  'serials.view','serials.assign','serials.receive','serials.trace','serials.correct'
]) required(key)
where not exists(select 1 from public.permissions p where p.key=required.key and p.is_active)
order by required.key;
