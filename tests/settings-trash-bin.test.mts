import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseTrashSelection,
  summarizeTrashResult,
  trashEntityLabels,
} from "../lib/deletion/trash-policy.ts";

const firstEntryId = "4ec9e2ef-17c8-4df5-a4fd-817027ca4c4d";
const secondEntryId = "dfe8c8d5-1530-4e20-a3cc-bc4abbf7f895";

test("normalizes selected Trash Bin identifiers without processing duplicates", () => {
  assert.deepEqual(
    parseTrashSelection([firstEntryId, firstEntryId, secondEntryId]),
    [firstEntryId, secondEntryId],
  );
});

test("rejects empty, malformed, and oversized Trash Bin selections", () => {
  assert.throws(() => parseTrashSelection([]), /Select at least one/);
  assert.throws(
    () => parseTrashSelection(["not-an-entry-id"]),
    /invalid Trash Bin item/i,
  );
  assert.throws(
    () => parseTrashSelection([firstEntryId], 0),
    /positive selection limit/i,
  );
  assert.throws(
    () => parseTrashSelection([firstEntryId, secondEntryId], 1),
    /up to 1 Trash Bin item/i,
  );
});

test("provides a safe operator summary without exposing unbounded failures", () => {
  assert.equal(
    summarizeTrashResult({
      succeeded: 2,
      failures: ["Protected product"],
    }),
    "2 item(s) processed. 1 failed: Protected product",
  );

  const summary = summarizeTrashResult({
    succeeded: 0,
    failures: ["A".repeat(1_000), "Second failure"],
  });
  assert.ok(summary.length <= 500);
  assert.match(summary, /^0 item\(s\) processed\. 2 failed:/);
});

test("labels every supported archived record type for administrators", () => {
  assert.deepEqual(trashEntityLabels, {
    product: "Product",
    user: "User",
    brand: "Brand",
    attribute: "Attribute",
    business_category: "Business category",
    employee: "Employee",
  });
});

test("restores every supported Trash Bin type in one guarded transaction", async () => {
  const migration = await readFile(
    "supabase/migrations/202607310011_settings_trash_bin.sql",
    "utf8",
  );

  assert.match(migration, /admin_restore_trash_entries/);
  assert.match(migration, /assert_hr_admin/);
  assert.match(
    migration,
    /cardinality\(requested_entry_ids\)[\s\S]*1 and 100/,
  );
  assert.match(migration, /count\(distinct selected_id\)/);
  for (const entityType of [
    "product",
    "user",
    "brand",
    "attribute",
    "business_category",
    "employee",
  ]) {
    assert.match(migration, new RegExp(`'${entityType}'`));
  }
  assert.match(migration, /delete from public\.archive_entries/);
  assert.match(migration, /insert into public\.audit_logs/);
  assert.match(
    migration,
    /revoke all on function public\.admin_restore_trash_entries\(uuid,uuid\[\]\)/,
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_restore_trash_entries\(uuid,uuid\[\]\)\s+to service_role/,
  );
});

test("the bulk action rechecks deletion mode and reloads trusted archive rows", async () => {
  const [action, purgeService, atomicMigration] = await Promise.all([
    readFile("app/admin/settings/trash-bin/actions.ts", "utf8"),
    readFile("lib/deletion/trash-server.ts", "utf8"),
    readFile(
      "supabase/migrations/202607310012_atomic_trash_bin_purge.sql",
      "utf8",
    ),
  ]);

  assert.match(action, /requireProfile\(\["admin"\]\)/);
  assert.match(action, /getDeletionMode\(\)/);
  assert.match(action, /permanentEnabled/);
  assert.match(action, /archive_entries/);
  assert.match(action, /\.in\("id", selectedIds\)/);
  assert.match(action, /admin_restore_trash_entries/);
  assert.match(action, /permanentlyDeleteTrashEntry/);
  assert.match(purgeService, /auth\.admin\.deleteUser/);
  assert.match(purgeService, /admin_prepare_trash_user_purge/);
  assert.match(purgeService, /admin_finalize_trash_user_purge/);
  assert.match(purgeService, /admin_prepare_trash_product_purge/);
  assert.match(purgeService, /admin_finalize_trash_product_purge/);
  assert.match(purgeService, /cleanup remains in the Trash Bin for retry/);
  assert.match(purgeService, /admin_purge_trash_database_entry/);
  assert.match(atomicMigration, /for update/);
  assert.match(atomicMigration, /inventory_movement_items/);
  assert.match(atomicMigration, /purchase_order_items/);
  assert.match(atomicMigration, /product_categories/);
  assert.match(atomicMigration, /hr_attendance/);
  assert.match(atomicMigration, /hr_employee_document_deletion_jobs/);
  assert.match(atomicMigration, /insert into public\.audit_logs/);
  assert.match(atomicMigration, /delete from public\.archive_entries/);
  assert.match(atomicMigration, /purge_storage_paths/);
});

test("Settings exposes a selectable Trash Bin and preserves the legacy URL", async () => {
  const [page, legacyPage, settingsPage, routes, navigation, hrActions] =
    await Promise.all([
      readFile("app/admin/settings/trash-bin/page.tsx", "utf8"),
      readFile("app/admin/archive/page.tsx", "utf8"),
      readFile("app/admin/settings/data-management/page.tsx", "utf8"),
      readFile("lib/constants/routes.ts", "utf8"),
      readFile("lib/navigation/dashboard.ts", "utf8"),
      readFile("app/admin/hr/hr-actions.ts", "utf8"),
    ]);

  assert.match(page, /Search Trash Bin/);
  assert.match(page, /All record types/);
  assert.match(page, /name="trash_entry_ids"/);
  assert.match(page, /Restore selected/);
  assert.match(page, /Delete permanently/);
  assert.match(page, /processTrashSelectionAction/);
  assert.match(legacyPage, /redirect\(routes\.adminTrashBin\)/);
  assert.match(settingsPage, /routes\.adminTrashBin/);
  assert.match(routes, /adminTrashBin: "\/admin\/settings\/trash-bin"/);
  assert.match(navigation, /label:"Trash Bin"/);
  assert.match(navigation, /route:routes\.adminTrashBin/);
  assert.match(hrActions, /rpc\("hr_archive_employee"/);
  const atomicMigration = await readFile(
    "supabase/migrations/202607310012_atomic_trash_bin_purge.sql",
    "utf8",
  );
  assert.match(atomicMigration, /insert into public\.archive_entries/);
  assert.match(atomicMigration, /entity_type='employee'/);
});
