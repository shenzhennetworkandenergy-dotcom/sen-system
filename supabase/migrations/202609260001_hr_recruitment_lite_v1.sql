create table if not exists public.hr_recruitment_processes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  status text not null default 'terms_in_progress'
    check (status in ('terms_in_progress', 'terms_completed')),
  current_step smallint not null default 1 check (current_step between 1 and 7),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, terms_version)
);

create table if not exists public.hr_recruitment_term_acceptances (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.hr_recruitment_processes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  step_number smallint not null check (step_number between 1 and 7),
  opened_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (process_id, step_number)
);

create index if not exists hr_recruitment_processes_profile_idx
  on public.hr_recruitment_processes(profile_id, updated_at desc);
create index if not exists hr_recruitment_acceptances_process_idx
  on public.hr_recruitment_term_acceptances(process_id, step_number);

alter table public.hr_recruitment_processes enable row level security;
alter table public.hr_recruitment_term_acceptances enable row level security;

drop policy if exists "employees read own recruitment process" on public.hr_recruitment_processes;
create policy "employees read own recruitment process"
  on public.hr_recruitment_processes for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "employees read own recruitment terms" on public.hr_recruitment_term_acceptances;
create policy "employees read own recruitment terms"
  on public.hr_recruitment_term_acceptances for select to authenticated
  using (profile_id = auth.uid());

grant select on public.hr_recruitment_processes to authenticated;
grant select on public.hr_recruitment_term_acceptances to authenticated;
grant all on public.hr_recruitment_processes to service_role;
grant all on public.hr_recruitment_term_acceptances to service_role;

notify pgrst, 'reload schema';
