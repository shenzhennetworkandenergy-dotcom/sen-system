# Database Development

Supabase is the production database and authentication platform. Local Supabase is a separate development database for reproducing and inspecting schema changes; it is not an offline copy of production unless you explicitly restore a backup.

## Required tools

- Docker Desktop or a compatible Docker engine
- Supabase CLI
- Node.js for the Next.js app

## Local workflow

```bash
supabase start
supabase db reset
supabase status
```

`supabase db reset` rebuilds the local database from `supabase/migrations/`. Add safe development-only seed data through Supabase seed files when needed; do not commit production data.

## Inspecting data

Open Supabase Studio from `supabase status` and inspect `public.profiles` and `public.audit_logs`.

## Exporting backups

Use Supabase CLI/Postgres tools such as:

```bash
supabase db dump --schema public > schema.sql
supabase db dump --data-only > data.sql
```

Handle dumps as sensitive files and do not commit customer data or secrets.

## Production migrations

Create every schema modification as a new timestamped SQL file under `supabase/migrations/`, review it locally, then apply it to production through the approved Supabase migration workflow. Configure `SUPABASE_SERVICE_ROLE_KEY` only in local/Vercel server environments when admin server actions are used.

## Manual Auth settings

For Phase 3A, configure Supabase manually: disable mandatory email confirmation, set the site URL, add local and Vercel redirect URLs, register the first admin email, run `supabase/manual/bootstrap-first-admin.sql`, and verify the resulting profile role.
