import assert from "node:assert/strict";
import test from "node:test";

import {
  deletionActionCopy,
  normalizeArchiveRecord,
  parsePermanentDeletionSetting,
  resolveDeletionOperation,
} from "../lib/deletion/policy.ts";

test("uses archive deletion while permanent deletion mode is disabled", () => {
  assert.equal(resolveDeletionOperation(false), "archive");
});

test("uses permanent deletion while permanent deletion mode is enabled", () => {
  assert.equal(resolveDeletionOperation(true), "permanent");
});

test("normalizes an archive record without accepting unbounded labels or reasons", () => {
  assert.deepEqual(
    normalizeArchiveRecord({
      entityType: " product ",
      entityId: "4ec9e2ef-17c8-4df5-a4fd-817027ca4c4d",
      displayName: `  ${"A".repeat(250)}  `,
      reason: `  ${"B".repeat(600)}  `,
      metadata: { sku: "SEN-TEST-1" },
    }),
    {
      entityType: "product",
      entityId: "4ec9e2ef-17c8-4df5-a4fd-817027ca4c4d",
      displayName: "A".repeat(200),
      reason: "B".repeat(500),
      metadata: { sku: "SEN-TEST-1" },
    },
  );
});

test("rejects unsupported archive entity types and invalid identifiers", () => {
  assert.throws(
    () =>
      normalizeArchiveRecord({
        entityType: "audit_log",
        entityId: "not-a-uuid",
        displayName: "Audit",
      }),
    /Unsupported archive entity type/,
  );
  assert.throws(
    () =>
      normalizeArchiveRecord({
        entityType: "product",
        entityId: "not-a-uuid",
        displayName: "Product",
      }),
    /Invalid archive entity identifier/,
  );
});

test("accepts only the submitted enabled value for permanent deletion mode", () => {
  assert.equal(parsePermanentDeletionSetting("enabled"), true);
  assert.equal(parsePermanentDeletionSetting("on"), false);
  assert.equal(parsePermanentDeletionSetting(null), false);
});

test("provides unambiguous archive and permanent deletion copy", () => {
  assert.deepEqual(deletionActionCopy(false), {
    button: "Move to archive",
    confirmation: "Move this record to the archive?",
  });
  assert.deepEqual(deletionActionCopy(true), {
    button: "Delete permanently",
    confirmation:
      "Permanently delete this record? This action cannot be undone.",
  });
});

test("accepts business categories as recoverable archive records", () => {
  assert.equal(
    normalizeArchiveRecord({
      entityType: "business_category",
      entityId: "4ec9e2ef-17c8-4df5-a4fd-817027ca4c4d",
      displayName: "Clothing",
    }).entityType,
    "business_category",
  );
});
