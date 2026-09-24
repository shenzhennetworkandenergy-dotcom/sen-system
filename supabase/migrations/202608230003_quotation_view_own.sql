begin;

alter table public.quotation_requests
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists quotation_requests_created_by_idx
  on public.quotation_requests(created_by, created_at desc);

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order,is_active
)
select
  m.id,
  'quotations.view_own',
  'View own quotations',
  'View only quotations created by this employee.',
  'view_own',
  false,
  9,
  true
from public.app_modules m
where m.key='quotations'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

commit;
