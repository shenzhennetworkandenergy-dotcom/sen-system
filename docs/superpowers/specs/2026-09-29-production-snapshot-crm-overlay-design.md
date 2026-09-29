# Production Snapshot CRM Overlay Design

## Goal

Release the approved WhatsApp/Messenger CRM workspace without deploying the stale GitHub `main` tree and without changing any current production behavior outside CRM.

## Source authority

- Current production deployment: `dpl_Hhf2Nt12Wju2EJbmkPzcG5Azibpi`.
- Verified application source snapshot: `D:/sen Website/sen-system/.vercel/recruitment-job-application-v1-candidate-dpl_2He2atTwthskD8bVE4uofSo7vVUC`.
- Frozen Git baseline commit: `54d4ac6` on `production/live-baseline-20260927`.
- Release branch: `release/whatsapp-messenger-crm`.
- GitHub `main` is not a deployment base and must not be merged into this release.

## Hard boundary

Relative to `54d4ac6`, the release may change only:

- `app/admin/crm/**`;
- `components/crm/**`;
- `lib/crm/**`;
- `tests/crm-*.test.mts`;
- `docs/CRM_FOLLOWUPS.md`;
- this specification and its implementation plan;
- new CRM migrations `202609290002_crm_followups_phase1_phase2.sql` and `202609290003_crm_whatsapp_private_storage.sql`.

Public routes, account routes, employee routes, non-CRM admin routes, global CSS, assets, package manifests, dependencies, existing migrations, and current customer data must remain byte-for-byte unchanged from `54d4ac6`.

## Overlay method

Port the already tested CRM branch `bfbfab2a9aebebbbbdf523df3573643a06ffc3c4` by copying new CRM files and three-way merging only its five modified CRM files against their recorded base `573fc3725ac7ee6ff7f803dd58b9c7c5327274c1`. Never copy an entire stale directory over the production snapshot.

Rename the two CRM migrations to the next verified production-safe sequence after `202609290001`; do not edit any historical migration.

## Storage isolation

Production continues to use private Supabase storage. Add `CRM_WHATSAPP_STORAGE_NAMESPACE` so preview and production use different manifest keys and object prefixes inside the same Supabase project. Accepted namespaces are lowercase alphanumeric slugs with hyphens, 1–48 characters. Production defaults to `production`; a Vercel preview uses a unique value such as `preview-crm-release`.

The database compare-and-swap function accepts a validated namespace and updates only that namespace's manifest. The private bucket remains shared, but every object path begins with the namespace. No preview request may read or write production CRM records.

## Git and Vercel workflow

1. Push `production/live-baseline-20260927` and `release/whatsapp-messenger-crm`; do not merge either into `main`.
2. Link the isolated release directory to the existing `sen-system` Vercel project.
3. Configure only preview-scoped CRM namespace/backend variables and deploy a Vercel Preview.
4. Verify the preview, logs, protected routes, CRM functions, and representative unchanged routes.
5. After separate authorization for the production database change, apply only the two CRM migrations.
6. Create a staged production deployment with `vercel --prod --skip-domain`, verify it, then request final production-promotion approval.
7. Promote the exact staged deployment. Preserve `dpl_Hhf2Nt12Wju2EJbmkPzcG5Azibpi` as the rollback target.

## Stop conditions

Stop before push if the boundary gate reports any non-CRM path, secrets, customer CSV data, dependency change, historical migration edit, failing CRM test, TypeScript error, lint error, or production build failure. Stop before database migration or production promotion until those external operations are explicitly authorized.
