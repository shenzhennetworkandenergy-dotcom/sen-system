-- PostgREST roles still require PostgreSQL object privileges even when RLS
-- policies (or the service-role RLS bypass) authorize a request.
grant usage on schema public to authenticated, service_role;

-- Authenticated users can only see rows allowed by the existing RLS policies.
grant select on all tables in schema public to authenticated;
grant update on table public.profiles to authenticated;

-- Server-only application clients use service_role for trusted administration.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
