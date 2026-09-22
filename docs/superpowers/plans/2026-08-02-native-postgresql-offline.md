# Native PostgreSQL Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run SEN on a Windows office server over LAN using native PostgreSQL, local authentication, and local filesystem storage without Supabase, Docker, or internet access.

**Architecture:** Preserve the PostgreSQL business schema and introduce a server-only compatibility adapter behind existing centralized client factories. Replace Supabase Auth and Storage with local session and filesystem services, then provide guarded export/import and Windows service operations.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 5, PostgreSQL 17, Node 24, Windows PowerShell, Node test runner.

## Global Constraints

- Preserve existing business data, profile UUIDs, permissions, audit history, and file ownership.
- PostgreSQL accepts connections only from the application server unless an administrator explicitly changes it.
- Browser code receives no database credentials, session secrets, filesystem paths, or privileged APIs.
- Existing uncommitted user work remains untouched.
- Every behavior change follows a red-green TDD cycle.
- Hosted Supabase remains read-only during export and validation.

---

### Task 1: Native backend configuration and PostgreSQL pool

**Files:** Create `lib/backend/config.ts`, `lib/postgres/pool.ts`, `tests/native-backend-config.test.mts`; modify `.env.example`, `package.json`.

**Interfaces:** Produce `backendMode()`, `localDatabaseConfig()`, `queryLocal<T>()`, and `withLocalTransaction<T>()` for all later tasks.

- [ ] Write tests that reject missing native secrets, non-PostgreSQL URLs, and public database hosts while accepting localhost configuration.
- [ ] Run the focused test and confirm failure because the modules do not exist.
- [ ] Add the `pg` driver and implement validated configuration plus a lazy server-only connection pool.
- [ ] Re-run focused tests, lint, and TypeScript.

### Task 2: Supabase-compatible local data adapter

**Files:** Create `lib/postgres/adapter.ts`, `lib/postgres/query-builder.ts`, `lib/postgres/rpc.ts`, `tests/postgres-adapter.test.mts`; modify `lib/supabase/admin.ts`.

**Interfaces:** Produce a local client supporting the repository's used `from().select/insert/update/delete/upsert`, filters, ordering, range, count, single/maybeSingle, and `rpc()` contracts.

- [ ] Write integration tests against a disposable PostgreSQL schema for reads, filters, relational error handling, mutations, and RPC calls.
- [ ] Run tests and confirm they fail because native mode is unavailable.
- [ ] Implement parameterized SQL compilation, normalized result/error objects, transaction-aware RPC execution, and the admin factory switch.
- [ ] Re-run adapter tests and representative Accounting, HR, Purchasing, Inventory, Sales, and CRM tests.

### Task 3: Local authentication and sessions

**Files:** Create `lib/auth/local-password.ts`, `lib/auth/local-session.ts`, `lib/auth/local-client.ts`, `app/login/local-actions.ts`, `supabase/native/001_local_auth.sql`, `tests/local-auth.test.mts`; modify `lib/auth/session.ts`, login/register/logout/password-reset routes.

**Interfaces:** Produce `authenticateLocal()`, `createLocalSession()`, `getLocalSession()`, `revokeLocalSession()`, `hashLocalPassword()`, and `verifyLocalPassword()` while preserving `getCurrentProfile()` and `requireProfile()` call signatures.

- [ ] Write tests for password verification, hashed tokens, expiry, revocation, lockout, role/profile resolution, and reset-required accounts.
- [ ] Confirm focused tests fail before implementation.
- [ ] Add auth schema and implement secure local cookies and server actions.
- [ ] Verify admin, employee, customer, disabled, expired, and logout behavior.

### Task 4: Application authorization without Supabase RLS

**Files:** Create `lib/auth/request-context.ts`, `lib/postgres/authorization.ts`, `tests/local-authorization.test.mts`; modify permission helpers and local adapter factory.

**Interfaces:** Produce an actor-bound database context that enforces module permissions and customer ownership before queries leave the server layer.

- [ ] Write tests proving cross-customer reads, employee overreach, and unauthenticated mutations are rejected.
- [ ] Confirm tests fail with the unbound adapter.
- [ ] Implement request-scoped actor context and allowlisted table/RPC policies.
- [ ] Run permission, deletion, inventory, order, HR, CRM, and accounting suites.

### Task 5: Local filesystem storage

**Files:** Create `lib/storage/local.ts`, `lib/storage/paths.ts`, authorized media/document route handlers, `tests/local-storage.test.mts`; modify centralized upload/download callers.

**Interfaces:** Produce `putLocalObject()`, `readLocalObject()`, `removeLocalObject()`, `signedLocalDownloadPath()`, and hash-verified manifests.

- [ ] Write tests for traversal rejection, MIME and size checks, atomic writes, private authorization, public media, and deletion jobs.
- [ ] Confirm tests fail before storage implementation.
- [ ] Implement protected paths, atomic temporary writes, authorized streaming, and caller migration.
- [ ] Run product media, HR document, support attachment, and deletion tests.

### Task 6: Native PostgreSQL schema baseline

**Files:** Create `database/native/schema.sql`, `database/native/bootstrap.sql`, `scripts/build-native-schema.mjs`, `scripts/verify-native-schema.mjs`, `tests/native-schema.test.mts`.

**Interfaces:** Produce a reproducible PostgreSQL 17 schema without `auth.*`, Storage, PostgREST role assumptions, or Supabase helper dependencies.

- [ ] Write static and live disposable-database tests for required tables, functions, indexes, triggers, permissions, and local auth tables.
- [ ] Confirm tests fail because the baseline is absent.
- [ ] Build the baseline from versioned migrations plus native compatibility definitions.
- [ ] Apply it to a disposable empty database and run all database workflow probes.

### Task 7: Supabase export and native import

**Files:** Create `scripts/native/export-supabase.mjs`, `scripts/native/import-postgres.mjs`, `scripts/native/migrate-storage.mjs`, `scripts/native/verify-migration.mjs`, `tests/native-migration.test.mts`.

**Interfaces:** Produce read-only export artifacts, resumable import, credential compatibility classification, storage hashes, row-count checks, and a final migration report.

- [ ] Write fixture-based tests for UUID preservation, dependency order, sequence resets, unsupported credentials, missing files, resume behavior, and mismatch failure.
- [ ] Confirm tests fail before utilities exist.
- [ ] Implement guarded export/import with explicit source and destination checks.
- [ ] Verify against a disposable copy, never the hosted source database.

### Task 8: Windows installation and service operation

**Files:** Create `scripts/windows/install.ps1`, `start.ps1`, `stop.ps1`, `status.ps1`, `backup.ps1`, `restore.ps1`, `update.ps1`, `uninstall.ps1`, `docs/NATIVE_WINDOWS_OFFLINE.md`, `tests/windows-offline-scripts.test.mts`.

**Interfaces:** Produce idempotent native installation, service lifecycle, diagnostics, atomic backups, guarded restores, and non-destructive uninstall defaults.

- [ ] Write static tests for required checks, quoting, secret generation, service recovery, backup checksums, restore confirmation, and safe paths.
- [ ] Confirm tests fail before scripts exist.
- [ ] Implement PowerShell scripts with resolved absolute paths and no broad destructive operations.
- [ ] Run scripts against a disposable Windows test installation and verify restart recovery.

### Task 9: Remove runtime Supabase requirements

**Files:** Modify `package.json`, `.env.example`, `README.md`, deployment and architecture docs, release scripts, and remaining runtime imports; create `scripts/verify-no-supabase-runtime.mjs`.

**Interfaces:** Final native startup requires only PostgreSQL, local secrets, local storage, and the Next.js service.

- [ ] Write a repository audit that fails on runtime Supabase packages, environment variables, browser clients, or network endpoints in native mode.
- [ ] Confirm the audit fails on the current runtime.
- [ ] Remove Supabase runtime dependencies and update operational documentation while retaining historical migrations and export tooling.
- [ ] Run the audit and complete test suite.

### Task 10: End-to-end offline acceptance

**Files:** Modify release gate and native diagnostics as failures reveal; create `scripts/native-release-gate.mjs`.

**Interfaces:** Produce one command that proves fresh install, migration, authentication, storage, feature workflows, service restart, LAN binding, and backup/restore.

- [ ] Start from a disposable empty PostgreSQL database and storage directory.
- [ ] Install schema, import sanitized fixtures, and run the native release gate.
- [ ] Browser-test public, administrator, employee, and customer routes with network access disabled.
- [ ] Restart PostgreSQL and SEN services, repeat smoke tests, perform backup/restore, and compare checksums and business totals.
- [ ] Run lint, TypeScript, all tests, production build, and `git diff --check`; report only with fresh zero-failure evidence.
