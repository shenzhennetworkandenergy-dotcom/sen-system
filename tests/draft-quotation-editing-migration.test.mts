import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/202608250003_draft_quotation_editing.sql";
const migration = await readFile(migrationPath, "utf8").catch(() => "");

function functionDefinition(name: string) {
  const match = migration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?\\bas\\s+\\$\\$[\\s\\S]*?\\$\\$\\s*;`,
      "i",
    ),
  );
  assert.ok(match, `${name} must be defined by the Draft-edit migration.`);
  return match[0];
}

function functionBody(name: string) {
  const definition = functionDefinition(name);
  const match = definition.match(/\bas\s+\$\$([\s\S]*?)\$\$\s*;/i);
  assert.ok(match, `${name} must have a dollar-quoted body.`);
  return match[1];
}

test("adds only the approved Draft quotation editing migration", async () => {
  const migrations = (await readdir("supabase/migrations")).filter((name) =>
    name.startsWith("202608250003"),
  );

  assert.deepEqual(migrations, ["202608250003_draft_quotation_editing.sql"]);
  assert.ok(migration, `${migrationPath} must exist.`);
  assert.doesNotMatch(
    migration,
    /\b(?:create\s+table|alter\s+table|create\s+trigger|drop\s+trigger|insert\s+into\s+public\.(?:permissions|customer_notifications))\b/i,
    "the edit migration must not change schema, permissions, triggers, or notifications",
  );
});

test("legacy commercial details RPC is locked to an expected current Draft", () => {
  const definition = functionDefinition("update_quotation_details_and_totals");
  const body = functionBody("update_quotation_details_and_totals");

  assert.match(
    definition,
    /actor_profile_id\s+uuid[\s\S]*requested_quotation_id\s+uuid[\s\S]*requested_expected_status\s+text[\s\S]*requested_tax_amount\s+numeric/i,
  );
  assert.match(definition, /security\s+definer[\s\S]{0,80}set\s+search_path\s*=\s*''/i);
  assert.match(body, /assert_actor_permission\(\s*actor_profile_id\s*,\s*'quotations\.edit'\s*\)/i);
  assert.match(body, /from\s+public\.quotation_requests[\s\S]{0,160}for\s+update/i);
  assert.match(body, /quotations\.view_own/i);
  assert.match(body, /quotations\.view_all/i);
  assert.match(body, /coalesce\s*\(\s*quotation\.created_by\s*=\s*actor_profile_id\s*,\s*false\s*\)/i);
  assert.match(
    body,
    /requested_expected_status\s+is\s+distinct\s+from\s+'draft'/i,
    "a null expected status must be rejected rather than bypassing Draft-only protection",
  );
  assert.match(body, /quotation\.status\s+is\s+distinct\s+from\s+'draft'/i);
  assert.match(body, /perform\s+public\.refresh_quotation_totals\s*\(\s*quotation\.id\s*\)/i);
});

test("Draft update RPC atomically authorizes, locks, validates, replaces lines, and refreshes totals", () => {
  const definition = functionDefinition("update_draft_quotation");
  const body = functionBody("update_draft_quotation");
  const lockAt = body.search(/from\s+public\.quotation_requests[\s\S]{0,160}for\s+update/i);
  const deleteAt = body.search(/delete\s+from\s+public\.quotation_request_items/i);
  const insertAt = body.search(/insert\s+into\s+public\.quotation_request_items/i);
  const totalsAt = body.search(/perform\s+public\.refresh_quotation_totals\s*\(\s*quotation\.id\s*\)/i);
  const headerUpdate = body.slice(body.search(/update\s+public\.quotation_requests\s+set/i), deleteAt);
  const headerAssignments = headerUpdate.slice(0, headerUpdate.search(/\bwhere\s+id\s*=\s*quotation\.id/i));

  assert.match(
    definition,
    /actor_profile_id\s+uuid[\s\S]*requested_quotation_id\s+uuid[\s\S]*requested_expected_updated_at\s+timestamp\s+with\s+time\s+zone[\s\S]*requested_items\s+jsonb/i,
  );
  assert.match(definition, /returns\s+uuid[\s\S]*security\s+definer[\s\S]{0,80}set\s+search_path\s*=\s*''/i);
  assert.match(body, /assert_actor_permission\(\s*actor_profile_id\s*,\s*'quotations\.edit'\s*\)/i);
  assert.match(body, /from\s+public\.profiles[\s\S]{0,120}status\s*=\s*'active'/i);
  assert.match(body, /quotations\.view_own/i);
  assert.match(body, /quotations\.view_all/i);
  assert.match(body, /coalesce\s*\(\s*quotation\.created_by\s*=\s*actor_profile_id\s*,\s*false\s*\)/i);
  assert.match(body, /quotation\.status\s+is\s+distinct\s+from\s+'draft'/i);
  assert.match(body, /quotation\.updated_at\s+is\s+distinct\s+from\s+requested_expected_updated_at/i);
  assert.match(body, /requested_items\s+is\s+null\s+or\s+jsonb_typeof\s*\(\s*requested_items\s*\)\s*<>\s*'array'/i);
  assert.match(body, /jsonb_array_length\s*\(\s*requested_items\s*\)\s*<\s*1[\s\S]{0,100}>\s*50/i);
  assert.match(body, /seen_line_keys/i);
  assert.match(body, /item_quantity\s*<\s*1[\s\S]{0,100}item_quantity\s*<>\s*trunc\s*\(\s*item_quantity\s*\)/i);
  assert.match(body, /item_unit_price\s*<\s*0[\s\S]{0,180}item_line_discount\s*>\s*round\s*\(\s*item_quantity\s*\*\s*item_unit_price\s*,\s*2\s*\)/i);
  assert.match(body, /public\.products[\s\S]{0,120}status\s*=\s*'active'/i);
  assert.match(body, /public\.product_variations[\s\S]{0,200}pv\.product_id\s*=\s*requested_product_id[\s\S]{0,100}status\s*=\s*'active'/i);
  assert.match(
    body,
    /requested_variation_id\s+is\s+not\s+null[\s\S]{0,500}public\.product_variations[\s\S]{0,180}pv\.id\s*=\s*requested_variation_id[\s\S]{0,180}pv\.product_id\s*=\s*requested_product_id[\s\S]{0,260}requested_line_key\s*<>\s*all/i,
    "every submitted variation must belong to its product before the legacy-inactive exception is considered",
  );
  assert.match(body, /existing_line_keys/i, "legacy inactive catalogue lines may remain");
  assert.match(body, /requested_line_key\s*<>\s*all\s*\(\s*existing_line_keys\s*\)/i);
  assert.match(body, /update\s+public\.quotation_requests\s+set/i);
  assert.match(body, /subject\s*=\s*requested_subject/i);
  assert.match(body, /customer_notes\s*=\s*requested_customer_notes/i);
  assert.match(body, /where\s+id\s*=\s*quotation\.id/i);
  assert.doesNotMatch(
    headerAssignments,
    /\b(?:id|reference|profile_id|created_by|status|approved_at|approved_by|rejected_at|rejected_by|converted_at|converted_by|converted_order_id|converted_invoice_id|billing_address_id|shipping_address_id)\s*=/i,
    "the header update must retain quotation identity, customer, ownership, workflow, and addresses",
  );
  assert.ok(lockAt >= 0, "the quotation must be locked before mutation");
  assert.ok(deleteAt > lockAt, "old lines must be deleted only after locking the quotation");
  assert.ok(insertAt > deleteAt, "replacement lines must be inserted after the old lines are removed");
  assert.ok(totalsAt > insertAt, "totals must refresh after line replacement");
  assert.match(body, /delete\s+from\s+public\.quotation_request_items[\s\S]{0,120}quotation_id\s*=\s*quotation\.id/i);
  for (const column of [
    "product_name_snapshot",
    "sku_snapshot",
    "quantity",
    "target_price",
    "unit_price",
    "discount_amount",
    "tax_amount",
    "currency",
  ]) {
    assert.match(body, new RegExp(`\\b${column}\\b`, "i"), column);
  }
  assert.doesNotMatch(
    body,
    /item_total|['"]line_total['"]\s*,\s*item_/i,
    "the Draft RPC must leave persisted line-total calculation to refresh_quotation_totals",
  );
  assert.match(body, /return\s+quotation\.id/i);
  assert.doesNotMatch(
    body,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:sales|inventory|stock_out|receivable|accounting|cashbook|customer_notifications)\w*/i,
    "Draft editing must not directly write Sale, inventory, Stock Out, receivable, accounting, cashbook, or notification records",
  );
});

test("both Draft update RPCs are executable only by service_role", () => {
  for (const name of [
    "update_quotation_details_and_totals",
    "update_draft_quotation",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]{0,600}from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]{0,600}to\\s+service_role`, "i"),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]{0,600}to\\s+(?:public|anon|authenticated)`, "i"),
    );
  }
});
