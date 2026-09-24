create table if not exists public.local_user_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_hash text,
  password_reset_required boolean not null default false,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  source_provider text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local_user_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent_hash text,
  ip_address inet
);

create index if not exists local_user_sessions_profile_idx on public.local_user_sessions(profile_id, expires_at desc);
create index if not exists local_user_sessions_active_idx on public.local_user_sessions(token_hash) where revoked_at is null;

comment on table public.local_user_credentials is 'Native SEN credentials. Password hashes are never selected by UI data loaders or audit pages.';
comment on table public.local_user_sessions is 'Hash-only native browser sessions for Windows/LAN operation.';

revoke all on public.local_user_credentials, public.local_user_sessions from public;
