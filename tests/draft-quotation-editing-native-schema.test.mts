import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

test("native schema applies the Draft quotation edit migration in exact order", async () => {
  const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
  const schema = normalizeNewlines(await readFile("database/native/schema.sql", "utf8"));
  const migration = normalizeNewlines(
    await readFile(
      "supabase/migrations/202608250003_draft_quotation_editing.sql",
      "utf8",
    ),
  ).trim();

  assert.match(
    builder,
    /customerReceivablesMigrationUrl[\s\S]{0,300}draftQuotationEditingMigrationUrl/i,
  );
  assert.match(
    builder,
    /customerReceivablesMigration,\s*\n\s*draftQuotationEditingMigration,/i,
  );
  const migrationPosition = schema.indexOf(migration);
  const nativeGrantsPosition = schema.indexOf(
    "-- Native application service access. Browser users never receive this role.",
  );
  assert.ok(migrationPosition >= 0, "native schema must contain the complete Draft-edit migration");
  assert.ok(migrationPosition < nativeGrantsPosition, "Draft-edit migration must precede native grants");
  assert.equal(
    [...schema.matchAll(/create or replace function public\.update_draft_quotation\(/g)].length,
    1,
    "native schema must expose exactly one Draft-edit RPC",
  );
});
