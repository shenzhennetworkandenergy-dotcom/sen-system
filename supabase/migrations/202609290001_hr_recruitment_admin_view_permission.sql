-- Register read-only Admin/HR Recruitment viewer access in the existing permission catalogue.
insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order)
select module.id,'hr.manage_recruitment','Manage Recruitment','View submitted Recruitment applications and their private documents.','manage_recruitment',true,91
from public.app_modules module
where module.key='hr'
on conflict(key) do update set module_id=excluded.module_id,name=excluded.name,description=excluded.description,
  action=excluded.action,is_sensitive=excluded.is_sensitive,sort_order=excluded.sort_order,is_active=true,updated_at=now();

notify pgrst,'reload schema';
