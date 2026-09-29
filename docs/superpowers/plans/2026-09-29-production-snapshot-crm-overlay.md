# Production Snapshot CRM Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a GitHub- and Vercel-ready CRM release whose non-CRM application tree is identical to the current production source snapshot.

**Architecture:** Freeze current production as a Git baseline, port only the verified CRM delta with three-way merges, isolate preview storage by namespace, and enforce a path/content boundary before any push or deployment. Vercel receives a preview first and later a staged production build; production promotion and database migration remain separate authorization gates.

**Tech Stack:** Next.js 16.2.12, React 19.2.4, TypeScript, Node test runner, Supabase PostgreSQL/Storage, Git, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-09-29-production-snapshot-crm-overlay-design.md`

## Global Constraints

- Baseline commit is exactly `54d4ac6`.
- GitHub `main` is never merged into or deployed by this release.
- Only the CRM allowlist in the spec may differ from the baseline.
- No customer CSV, conversation, secret, environment value, generated build output, or local Supabase state may be committed.
- No production database write, Vercel production deployment, domain assignment, or promotion occurs without separate authorization.
- Existing non-CRM baseline test failures are recorded, not repaired in this CRM release; no additional failure is permitted.

## Review Focus

- A stale whole-file copy could erase newer production CRM behavior; three-way merges must preserve both sides.
- A migration identifier collision could prevent deployment; both CRM migrations must be uniquely ordered after production `202609290001`.
- A preview namespace bug could expose production CRM data; manifest keys and object paths must both be namespace-scoped.
- A hidden non-CRM change could regress production; the release gate must compare committed, staged, unstaged, and untracked paths.
- Vercel could deploy the wrong tree or environment; deployment metadata must identify the frozen release commit and preview namespace.

---

### Task 1: Release boundary gate

**Files:**
- Create: `tests/crm-production-overlay-boundary.test.mts`

**Interfaces:**
- Consumes: Git baseline `54d4ac6` and the spec allowlist.
- Produces: a release-blocking test that rejects every changed path outside CRM and detects secret/customer-data filenames.

- [ ] Write the boundary test and confirm it fails because the plan/spec paths are not yet allowed by the old guard.
- [ ] Implement the exact baseline and allowlist contract.
- [ ] Run the boundary test and confirm it passes.
- [ ] Commit the release controls.

### Task 2: Port the verified CRM application delta

**Files:**
- Create/modify only: `app/admin/crm/**`, `components/crm/**`, `lib/crm/**`, `tests/crm-*.test.mts`, `docs/CRM_FOLLOWUPS.md`.

**Interfaces:**
- Consumes: verified CRM commit `bfbfab2` and its base `573fc372`.
- Produces: the approved CRM UI, follow-ups, category CSV workspace, filesystem backend, and production storage abstraction on the live source baseline.

- [ ] Copy the CRM tests first and run them to observe expected missing-module/UI failures.
- [ ] Copy new CRM files and three-way merge each modified CRM file against the recorded base.
- [ ] Resolve only CRM conflicts while preserving current-production CRM behavior.
- [ ] Run the complete CRM suite and boundary gate.
- [ ] Commit the CRM overlay.

### Task 3: Reconcile migrations and isolate preview storage

**Files:**
- Create: `supabase/migrations/202609290002_crm_followups_phase1_phase2.sql`
- Create: `supabase/migrations/202609290003_crm_whatsapp_private_storage.sql`
- Modify: `lib/crm/whatsapp-workspace-storage.ts`
- Modify: `lib/crm/whatsapp-workspace-supabase.ts`
- Test: `tests/crm-whatsapp-production-migration.test.mts`
- Test: `tests/crm-whatsapp-storage-selector.test.mts`
- Test: `tests/crm-whatsapp-storage-supabase.test.mts`

**Interfaces:**
- Consumes: `CRM_WHATSAPP_STORAGE_BACKEND`, `CRM_WHATSAPP_STORAGE_NAMESPACE`, Supabase service client.
- Produces: validated namespace selection, namespaced manifest/object storage, and collision-free migrations.

- [ ] Add failing tests for invalid namespace rejection and distinct preview/production manifest keys and paths.
- [ ] Rename the migrations and update the CAS SQL to validate and scope by namespace.
- [ ] Implement namespace validation/defaulting and namespaced storage calls.
- [ ] Run focused migration/storage tests, then the full CRM suite and boundary gate.
- [ ] Commit the production storage reconciliation.

### Task 4: Full release verification

**Files:**
- Modify only tests/docs if verification exposes a CRM defect; every fix follows RED→GREEN.

**Interfaces:**
- Consumes: complete release candidate.
- Produces: test, lint, TypeScript, build, source-boundary, and browser evidence.

- [ ] Run all CRM tests and the boundary gate.
- [ ] Run the complete baseline suite and prove there are no failures beyond the three recorded baseline failures.
- [ ] Run ESLint, TypeScript, and production build.
- [ ] Compare all non-CRM paths byte-for-byte with `54d4ac6`.
- [ ] Start the isolated server and smoke-test public, account, representative non-CRM admin, CRM, follow-up, CSV preview, edit, save, download, and category routes.
- [ ] Perform a fresh whole-branch review and fix every Critical/Important finding using RED→GREEN.

### Task 5: Publish safe branches and Vercel Preview

**Files:**
- No source changes permitted.

**Interfaces:**
- Consumes: frozen, verified release commit.
- Produces: two new GitHub branches and a non-production Vercel Preview URL.

- [ ] Re-run the boundary, secret, customer-data, status, and commit checks.
- [ ] Push `production/live-baseline-20260927` and `release/whatsapp-messenger-crm` without changing `main`.
- [ ] Link only this isolated worktree to the existing Vercel project and configure preview-scoped CRM variables without printing values.
- [ ] Deploy a Preview, inspect metadata/logs, and run preview smoke checks.
- [ ] Stop before production database migration, staged production deployment, domain assignment, or promotion and report the exact remaining authorization gate.

