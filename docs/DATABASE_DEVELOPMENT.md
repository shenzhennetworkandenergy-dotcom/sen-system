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

1. Obtain explicit approval, back up the production database, and review migrations `202607200002_inventory_foundation.sql` and `202607200003_inventory_reporting.sql` after the already-applied Phase 3B migration.
2. Confirm the Supabase CLI is linked to the intended SEN project with an authorized administrator present.
3. Run `supabase db push --dry-run` and review the planned migration.
4. Run `supabase db push` once during the approved deployment window.
5. Verify all catalogue/inventory tables, indexes, constraints, RLS policies, function grants, module implemented flags, and the private Storage bucket.
6. In a non-production test account, verify admin and employee permission cases, a simple product, variable product, opening balance, negative-stock rejection, warehouse transfer, serialized adjustment, duplicate-serial rejection, and matching balance/movement/audit rows.

The reporting migration depends on the inventory foundation and must run second. Vercel Preview inventory routes cannot be treated as operationally verified until both migrations have been applied to its connected database. Never apply either migration to production without the user's explicit approval.

Do not paste service-role keys into commands, source files, issue comments or screenshots.
