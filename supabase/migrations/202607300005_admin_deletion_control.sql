-- Administrator-controlled archive/permanent deletion policy.

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint system_settings_key_length check (char_length(key) between 1 and 100)
);

insert into public.system_settings (key, value)
values ('admin_deletion', '{"permanent_deletion_enabled": false}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.archive_entries (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product', 'user', 'brand', 'attribute')),
  entity_id uuid not null,
  display_name text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz not null default now(),
  unique (entity_type, entity_id),
  constraint archive_entries_display_name_length
    check (char_length(display_name) between 1 and 200),
  constraint archive_entries_reason_length
    check (reason is null or char_length(reason) <= 500)
);

create index if not exists archive_entries_type_time_idx
  on public.archive_entries (entity_type, archived_at desc);

alter table public.system_settings enable row level security;
alter table public.archive_entries enable row level security;

revoke all on public.system_settings from anon, authenticated;
revoke all on public.archive_entries from anon, authenticated;
grant select, insert, update, delete on public.system_settings to service_role;
grant select, insert, update, delete on public.archive_entries to service_role;

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey,
  add constraint audit_logs_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.audit_logs
  drop constraint if exists audit_logs_target_profile_id_fkey,
  add constraint audit_logs_target_profile_id_fkey
    foreign key (target_profile_id) references public.profiles(id) on delete set null;
