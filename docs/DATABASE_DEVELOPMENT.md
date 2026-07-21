# Database Development

Production Supabase and local Supabase are separate databases. Local development does not mirror production data automatically.

## Local workflow

1. Install the Supabase CLI and Docker Desktop.
2. Run `supabase start` from the repository.
3. Run `supabase status` and confirm every URL is local (`127.0.0.1` or `localhost`).
4. Apply pending migrations with `supabase migration up`.
5. Open the local Studio URL shown by `supabase status` and inspect the Phase 3B and inventory tables, permission catalogue, RPC grants, policies, and private `product-media` bucket.

`supabase db reset` destroys and rebuilds a database. Use it only after confirming the target is the disposable local instance. Never run a reset against a linked production project.

## Post-merge production migration

1. Run the read-only `supabase/manual/inventory-preflight-read-only.sql` report and resolve every missing prerequisite.
2. Obtain explicit approval, back up the production database, and review migrations `202607200002_inventory_foundation.sql`, `202607200003_inventory_reporting.sql`, and `202607200004_inventory_integrity_hardening.sql` after the already-applied Phase 3B migration.
3. Confirm the Supabase CLI is linked to the intended SEN project with an authorized administrator present.
4. Run `supabase db push --dry-run` and verify that the migrations will run exactly in `002`, `003`, `004` order.
5. Run `supabase db push` once during the approved deployment window.
6. Run the complete read-only `supabase/manual/inventory-post-migration-verification-read-only.sql` report. Every object must exist, every listed table must have RLS enabled, hardening constraints must be validated, mutation RPCs must be executable only by `service_role`, all triggers must exist, and every invariant count must be zero.
7. In a non-production test account, verify admin and employee permission cases, a simple product, variable product, global duplicate-SKU rejection, stock-model rejection, atomic category reassignment, reason-direction rejection, opening balance, negative-stock rejection, opposite-direction warehouse transfers, serialized adjustment, duplicate-serial rejection, and matching balance/movement/audit rows.

The reporting migration depends on the inventory foundation and must run second; integrity hardening must run third. Vercel Preview inventory routes cannot be treated as operationally verified until all three migrations have been applied to its connected database. Never apply any migration to production without the user's explicit approval.

Rollback requires a verified pre-deployment backup and a forward repair migration. Do not drop the new constraints, triggers, or RPCs blindly after writes have used them; restore the backup if an emergency rollback is approved.

Do not paste service-role keys into commands, source files, issue comments or screenshots.
