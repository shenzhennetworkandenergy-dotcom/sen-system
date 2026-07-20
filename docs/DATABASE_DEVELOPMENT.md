# Database Development

Production Supabase and local Supabase are separate databases. Local development does not mirror production data automatically.

## Local workflow

1. Install the Supabase CLI and Docker Desktop.
2. Run `supabase start` from the repository.
3. Run `supabase status` and confirm every URL is local (`127.0.0.1` or `localhost`).
4. Apply pending migrations with `supabase migration up`.
5. Open the local Studio URL shown by `supabase status` and inspect the Phase 3B tables and Standard Employee template.

`supabase db reset` destroys and rebuilds a database. Use it only after confirming the target is the disposable local instance. Never run a reset against a linked production project.

## Post-merge production migration

1. Back up the production database and review `supabase/migrations/202607200001_phase_3b_permissions_activity.sql`.
2. Confirm the Supabase CLI is linked to the intended SEN project with an authorized administrator present.
3. Run `supabase db push --dry-run` and review the planned migration.
4. Run `supabase db push` once during the approved deployment window.
5. Verify the six new tables, Standard Employee template, RLS policies, functions and audit columns in Supabase.
6. Promote a test customer to employee, verify only the two default permissions, test allow/deny precedence, then restore the test account.

Do not paste service-role keys into commands, source files, issue comments or screenshots.
