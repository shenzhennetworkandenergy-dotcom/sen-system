create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('sen.actor_id', true), '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  )
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('sen.actor_role', true), ''),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    current_user
  )
$$;
