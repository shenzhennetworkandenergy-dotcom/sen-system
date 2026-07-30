# Production Readiness and Vercel Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically audit, repair, document, deploy, and live-verify the complete SEN System after the dynamic category feature is accepted.

**Architecture:** Use automated repository, route, migration, environment, dependency, and build checks as the repeatable backbone, then targeted browser acceptance for public and authenticated workflows. Production uses Vercel for the Next.js runtime and Supabase for database/auth/storage; the release blocks on migration and smoke-test success.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript, ESLint, Node test runner, Supabase CLI/PostgreSQL, Vercel CLI, browser automation.

## Global Constraints

- Do not expose, copy, commit, or print production secrets.
- Do not remove data, dependencies, routes, or files solely because a static scan cannot identify their consumer.
- The application is server-rendered and cannot be shipped as a static-only archive.
- Every repair follows a failing reproduction/test before implementation.
- Production promotion requires clean lint, tests, build, database checks, deployment completion, and live smoke checks.
- Existing user changes outside this release must be preserved.

---

### Task 1: Production manifest and environment contract

**Files:**
- Create: `.env.example`
- Replace: `README.md`
- Create: `docs/DEPLOYMENT.md`
- Create: `scripts/verify-production-structure.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: documented required/optional environment names, install/build/start/migrate/deploy commands, required directory checks, and release script entry points.

- [ ] Write the structure verifier against required source, public assets, API routes, migrations, package lock, configuration, and environment-name contract.
- [ ] Run it and verify it fails for current missing/placeholder production documentation.
- [ ] Add sanitized environment template and Vercel/Supabase deployment guide.
- [ ] Run verifier and ensure no secret-looking values are present.
- [ ] Commit as `docs: add production deployment contract`.

### Task 2: Automated code and dependency audit

**Files:**
- Create: `scripts/audit-production-code.mjs`
- Create or modify focused tests for each discovered defect
- Modify only confirmed defective runtime files

**Interfaces:**
- Produces: checks for unresolved relative assets, unsafe server/client imports, debug statements in runtime routes, duplicate route ownership, missing package imports, deprecated patterns identified by local Next docs, and actionable dependency audit results.

- [ ] Run lint, TypeScript build, all existing scripts/tests, `npm audit --omit=dev`, and the new audit script; record concrete failures.
- [ ] For each runtime defect, add a focused failing test or reproducible verifier.
- [ ] Repair one defect at a time and rerun its reproducer.
- [ ] Rerun the complete audit matrix until clean or document a verified upstream-only advisory with mitigation.
- [ ] Commit as `fix: resolve production audit findings`.

### Task 3: Database, CRUD, storage, and permissions audit

**Files:**
- Create: `scripts/verify-production-database.mjs`
- Modify migrations/actions/policies only for reproduced defects

**Interfaces:**
- Produces: schema/migration presence checks, RLS/policy inventory, FK/orphan checks, storage-bucket checks, and CRUD permission smoke results.

- [ ] Verify local migration ordering and production migration state.
- [ ] Run read-only orphan/count/RLS/storage queries without printing credentials.
- [ ] Exercise create/read/update/archive/permanent-delete validation in each admin module using safe temporary records.
- [ ] Add failing tests and fix every reproduced permission, storage, or transaction defect.
- [ ] Remove only the temporary records using the application's authorized cleanup path and commit as `fix: harden production data workflows`.

### Task 4: Route, form, asset, and responsive acceptance

**Files:**
- Create: `scripts/production-smoke-routes.mjs`
- Create or modify focused tests for discovered issues
- Modify runtime files only for reproduced defects

**Interfaces:**
- Produces: public/authenticated route matrix with expected statuses/content, asset checks, upload/download checks, and responsive browser screenshots/results.

- [ ] Start the production build locally and smoke every discoverable public route/API.
- [ ] Use authenticated browser state to check admin menus, forms, search/filter, uploads, downloads, permissions, notifications, and representative CRUD.
- [ ] Check key pages at mobile, tablet, laptop, and desktop widths; record console/network errors and broken assets.
- [ ] Reproduce each problem in an automated check, repair it, and repeat the matrix.
- [ ] Commit as `fix: complete production workflow acceptance`.

### Task 5: Release gate, push, Vercel deployment, and live verification

**Files:**
- Create: `scripts/release-gate.mjs`
- Modify: `package.json`
- Update: `docs/DEPLOYMENT.md`

**Interfaces:**
- Produces: one release-gate command and verified Git/Vercel release evidence.

- [ ] Run the release gate: structure, feature, module tests, audit, lint, and production build.
- [ ] Review the diff for secrets, generated outputs, temporary files, migrations, and unrelated user work.
- [ ] Merge the verified feature branch into `main`, push to the configured origin, and confirm the expected commit exists remotely.
- [ ] Deploy the exact commit to Vercel production and wait for a Ready state.
- [ ] Run public and authenticated smoke checks against `https://sen-system.vercel.app`, inspect function/build logs, and repeat fixes/redeployment until every release gate passes.
- [ ] Record final commit, migration, deployment URL, and verification results in the handoff.

