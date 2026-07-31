# Settings Trash Bin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centralized Settings Trash Bin with searchable archived records, multi-select restore, and permission-gated permanent deletion.

**Architecture:** Keep `archive_entries` as the single recoverable-deletion index. Add transactional restore and database-purge RPCs, leased two-phase claims for Auth and Storage operations, a focused server orchestrator, and a new Settings page that preserves the legacy Archive URL.

**Tech Stack:** Next.js 16 server components and server actions, TypeScript, Supabase PostgreSQL/Auth/Storage, Node test runner.

## Global Constraints

- Preserve existing authentication, RLS, archive, product, user, HR, audit, and deletion-toggle behavior.
- Do not expose or execute permanent purge while Permanent Deletion Mode is disabled.
- Accept at most 100 unique strict UUID selections.
- Keep `/admin/archive` compatible.
- Do not refactor unrelated modules.

---

### Task 1: Trash Bin selection policy

**Files:**
- Create: `lib/deletion/trash-policy.ts`
- Create: `tests/settings-trash-bin.test.mts`

**Interfaces:**
- Produces: `parseTrashSelection(values: unknown[], maximum?: number): string[]`
- Produces: `trashEntityLabels: Record<ArchiveEntityType, string>`
- Produces: `summarizeTrashResult(result: TrashOperationResult): string`

- [ ] **Step 1: Write failing parser and summary tests**

```ts
assert.deepEqual(parseTrashSelection([entryId, entryId, secondId]), [
  entryId,
  secondId,
]);
assert.throws(() => parseTrashSelection([]), /Select at least one/);
assert.throws(() => parseTrashSelection(["bad"]), /invalid Trash Bin item/);
assert.equal(
  summarizeTrashResult({ succeeded: 2, failures: ["Protected product"] }),
  "2 item(s) processed. 1 failed: Protected product",
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --experimental-strip-types tests/settings-trash-bin.test.mts`

Expected: FAIL because `lib/deletion/trash-policy.ts` does not exist.

- [ ] **Step 3: Implement strict normalization and bounded summaries**

Implement strict UUID validation, stable deduplication, a default maximum of
100, positive-limit validation, entity labels, and a summary that truncates
failure details to safe message lengths.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types tests/settings-trash-bin.test.mts`

Expected: PASS.

### Task 2: Transactional multi-record restore

**Files:**
- Create: `supabase/migrations/202607310011_settings_trash_bin.sql`
- Modify: `tests/settings-trash-bin.test.mts`

**Interfaces:**
- Consumes: `archive_entries.id uuid[]`
- Produces: `admin_restore_trash_entries(actor_profile_id uuid, requested_entry_ids uuid[]) returns integer`
- Extends: `archive_entries.entity_type` to include `employee`

- [ ] **Step 1: Add failing migration assertions**

Assert the migration contains the employee entity type, administrator guard,
all six restore branches, archive-entry deletion, per-item audit insertion,
service-role-only grants, and an exact selected-row count check.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because the migration and RPC are absent.

- [ ] **Step 3: Implement the restore migration**

The PL/pgSQL function must:

```sql
perform public.assert_hr_admin(actor_profile_id);
if cardinality(requested_entry_ids) not between 1 and 100 then
  raise exception 'Select between 1 and 100 Trash Bin items';
end if;
```

It then locks all requested `archive_entries`, rejects incomplete selections,
updates the target table by entity type, inserts one `audit_logs` row per
entry using the saved metadata, deletes the selected archive entries, and
returns the restored count. Revoke public/authenticated execution and grant
only to `service_role`.

- [ ] **Step 4: Apply locally and verify restore rollback behavior**

Run: `npx supabase migration up --local`

Use temporary local brand/product records to prove a two-entry restore clears
archive state and removes both index rows. Run the verification in a rollback or
clean up every temporary row.

### Task 3: Guarded permanent purge service

**Files:**
- Create: `lib/deletion/trash-server.ts`
- Create: `app/admin/settings/trash-bin/actions.ts`
- Modify: `tests/settings-trash-bin.test.mts`

**Interfaces:**
- Consumes: `ArchiveEntityType`, archive entry snapshot, actor profile
- Produces: `permanentlyDeleteTrashEntry(entry, actor): Promise<void>`
- Produces: `processTrashSelectionAction(form: FormData): Promise<never>`

- [ ] **Step 1: Add failing wiring and guard tests**

Assert the server action calls `getDeletionMode()`, rejects permanent operation
when `permanentEnabled` is false, loads selected entries by archive-entry ID,
and calls the restore RPC for restore operations.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because the action and purge service do not exist.

- [ ] **Step 3: Implement entity-specific preflight and purge**

Implement the exact protections from the design:

- product dependency counts and product-media Storage cleanup;
- user self/final-admin checks, operational dependency counts, and
  `auth.admin.deleteUser`;
- brand/attribute assignment counts;
- business-category product/classification counts;
- employee HR-history and document counts.

Database-only purges remove the target, matching `archive_entries` row, and
write audit in one transaction. User Auth deletion uses a leased prepare /
finalize / release claim. Product Storage cleanup retains its path snapshot and
claim in Trash Bin until Storage succeeds and finalization writes audit. Return
safe dependency messages for failures.

- [ ] **Step 4: Implement the bulk action**

Read `operation` and `trash_entry_ids`, normalize with
`parseTrashSelection`, require an administrator, and reload the deletion mode.
Restore calls the RPC once for all selected entries. Permanent purge processes
each entry independently, accumulates safe failures, revalidates Trash Bin,
affected admin lists, public product routes, and redirects with the bounded
summary.

- [ ] **Step 5: Run focused tests**

Run: `node --test --experimental-strip-types tests/settings-trash-bin.test.mts`

Expected: PASS.

### Task 4: Settings UI, navigation, and employee indexing

**Files:**
- Create: `app/admin/settings/trash-bin/page.tsx`
- Modify: `app/admin/archive/page.tsx`
- Modify: `app/admin/settings/data-management/page.tsx`
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `app/admin/hr/hr-actions.ts`
- Modify: `tests/settings-trash-bin.test.mts`

**Interfaces:**
- Route: `/admin/settings/trash-bin`
- Legacy route: `/admin/archive` redirects to the Trash Bin
- Form fields: `trash_entry_ids`, `operation`

- [ ] **Step 1: Add failing UI and integration assertions**

Assert the new page renders search, type filter, checkboxes, `Restore selected`,
and `Delete permanently`; Settings links to the route; navigation labels it
Trash Bin; the legacy page redirects; and employee archive/restore updates the
central archive index.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because the route and wiring are absent.

- [ ] **Step 3: Build the Trash Bin page**

Load up to 200 filtered archive entries and actor names. Render one table with
selection checkboxes, archived metadata, a restore submit button, and a
conditional permanent-delete submit button using `ConfirmSubmitButton`.
Show the current deletion mode and a link back to Data Management.

- [ ] **Step 4: Update routes and backward compatibility**

Add `routes.adminTrashBin`, point the Settings card and top-level Trash Bin
navigation item to it, and make `/admin/archive` issue a server redirect.

- [ ] **Step 5: Register employee archive entries**

Update `hr_archive_employee` so the employee lifecycle and its `employee`
archive entry change in the same database transaction. The server action only
invokes that RPC and revalidates Trash Bin.

- [ ] **Step 6: Run focused tests and production build**

Run:

```text
node --test --experimental-strip-types tests/settings-trash-bin.test.mts
npm run lint
npm run build
```

Expected: all pass.

### Task 5: Release verification and deployment

**Files:**
- Verify every modified file.

- [ ] **Step 1: Run the complete release gate**

Run: `npm run test:release`

Expected: every structure, database, standalone, lint, TypeScript, and build
check passes.

- [ ] **Step 2: Request independent review**

Review authorization, permanent-mode enforcement, user/product dependency
checks, storage cleanup ordering, audit completeness, batch partial-failure
copy, route compatibility, and unrelated regressions. Fix every Critical or
Important finding and rerun affected checks.

- [ ] **Step 3: Commit, push, and merge**

Commit the verified files on `codex/settings-trash-bin`, push, open a pull
request against `main`, and wait for GitHub/Vercel checks.

- [ ] **Step 4: Apply production migration and verify**

Apply only `202607310011_settings_trash_bin.sql` from the isolated linked
worktree. Confirm the production migration list, Vercel success for merged
`main`, authenticated Trash Bin rendering, disabled/enabled button behavior,
and the legacy Archive redirect without deleting production records.
