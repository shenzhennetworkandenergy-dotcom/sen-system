-- Register opt-in Employee Recruitment access in the existing permission catalogue.
insert into public.permissions(
  module_id,
  key,
  name,
  description,
  action,
  is_sensitive,
  sort_order
)
select
  module.id,
  'hr.access_recruitment',
  'Recruitment access',
  'Access Employee My HR Recruitment Terms.',
  'access_recruitment',
  true,
  90
from public.app_modules module
where module.key = 'hr'
on conflict (key) do update set
  module_id = excluded.module_id,
  name = excluded.name,
  description = excluded.description,
  action = excluded.action,
  is_sensitive = excluded.is_sensitive,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Keep direct authenticated-table reads fail-closed as well as server routes/actions.
drop policy if exists "employees read own recruitment process"
  on public.hr_recruitment_processes;
create policy "employees read own recruitment process"
  on public.hr_recruitment_processes for select to authenticated
  using (
    profile_id = auth.uid()
    and public.current_user_has_permission('hr.access_recruitment')
  );

drop policy if exists "employees read own recruitment terms"
  on public.hr_recruitment_term_acceptances;
create policy "employees read own recruitment terms"
  on public.hr_recruitment_term_acceptances for select to authenticated
  using (
    profile_id = auth.uid()
    and public.current_user_has_permission('hr.access_recruitment')
  );

notify pgrst, 'reload schema';
