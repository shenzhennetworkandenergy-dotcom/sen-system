create table if not exists public.work_scheduler_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  normalized_title text not null unique check (length(normalized_title) between 1 and 160),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_scheduler_titles_active_idx
  on public.work_scheduler_titles(is_active, title);

insert into public.work_scheduler_titles(title, normalized_title, created_by)
select title, normalized_title, created_by
from (
  select distinct on (lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')))
    title,
    lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')) as normalized_title,
    created_by
  from public.work_scheduler_items
  order by lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')), created_at, id
) seeded_titles
on conflict (normalized_title) do nothing;

alter table public.work_scheduler_titles enable row level security;

drop policy if exists "work scheduler title admin" on public.work_scheduler_titles;
create policy "work scheduler title admin"
  on public.work_scheduler_titles
  for all to authenticated
  using (public.current_user_has_permission('work_scheduler.manage'))
  with check (public.current_user_has_permission('work_scheduler.manage'));

grant select, insert, update on public.work_scheduler_titles to authenticated;
grant all on public.work_scheduler_titles to service_role;

notify pgrst, 'reload schema';
