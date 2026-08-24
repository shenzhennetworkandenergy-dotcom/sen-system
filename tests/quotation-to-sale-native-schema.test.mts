import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
const schema = normalizeNewlines(await readFile("database/native/schema.sql", "utf8"));
const seed = normalizeNewlines(await readFile("database/native/seed.sql", "utf8"));
const viewOwnMigration = normalizeNewlines(
  await readFile("supabase/migrations/202608230003_quotation_view_own.sql", "utf8"),
).trim();
const quotationToSaleMigration = normalizeNewlines(
  await readFile("supabase/migrations/202608230004_quotation_to_sale.sql", "utf8"),
).trim();
const stockOutReleaseQuantityMigration = normalizeNewlines(
  await readFile("supabase/migrations/202608240001_stock_out_authoritative_release_quantity.sql", "utf8"),
).trim();

const expectedMigrationOrder = [
  "202608190001_purchase_carrier_management.sql",
  "202608210002_inventory_daily_closing.sql",
  "202608220001_employee_stock_out_product_release.sql",
  "202608230003_quotation_view_own.sql",
  "202608230004_quotation_to_sale.sql",
  "202608240001_stock_out_authoritative_release_quantity.sql",
];

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function countMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].length;
}

function parsePermissionSeedRows() {
  const copy = seed.match(/COPY public\.permissions \(([^)]+)\) FROM stdin;\n([\s\S]*?)\n\\\./);
  assert.ok(copy, "native seed must contain the permissions COPY section");

  const columns = copy[1].split(",").map((column) => column.trim());
  return copy[2].split("\n").map((line) =>
    Object.fromEntries(columns.map((column, index) => [column, line.split("\t")[index]])),
  );
}

test("native builder reads and applies every established migration in exact order", () => {
  const migrationUrls = new Map(
    [...builder.matchAll(/const\s+(\w+MigrationUrl)\s*=\s*new URL\(\s*"\.\.\/supabase\/migrations\/([^"]+)"/g)].map(
      ([, variable, filename]) => [variable, filename],
    ),
  );
  assert.deepEqual([...migrationUrls.values()], expectedMigrationOrder);

  const reads = builder.match(/await Promise\.all\(\[([\s\S]*?)\]\);/);
  assert.ok(reads, "builder must read its inputs together");
  const readOrder = [...reads[1].matchAll(/readFile\((\w+MigrationUrl),\s*"utf8"\)/g)].map(
    ([, variable]) => migrationUrls.get(variable),
  );
  assert.deepEqual(readOrder, expectedMigrationOrder);

  const applyOrder = [...builder.matchAll(/\$\{(\w+Migration)\.trim\(\)\}/g)].map(
    ([, variable]) => migrationUrls.get(`${variable}Url`),
  );
  assert.deepEqual(applyOrder, expectedMigrationOrder);
});

test("native schema keeps quotation migrations together before the later Stock Out hotfix", () => {
  const viewOwnPosition = schema.indexOf(viewOwnMigration);
  const conversionPosition = schema.indexOf(quotationToSaleMigration);
  const stockOutHotfixPosition = schema.indexOf(stockOutReleaseQuantityMigration);
  const nativeGrantsPosition = schema.indexOf(
    "-- Native application service access. Browser users never receive this role.",
  );

  assert.ok(viewOwnPosition >= 0, "native schema must contain the complete View Own migration");
  assert.ok(conversionPosition > viewOwnPosition, "conversion must follow View Own");
  assert.ok(stockOutHotfixPosition > conversionPosition, "the later Stock Out hotfix must follow quotation conversion");
  assert.ok(nativeGrantsPosition > stockOutHotfixPosition, "native grants must follow every migration");
  assert.equal(countMatches(schema, /alter table public\.quotation_requests\n  add column if not exists created_by uuid/g), 1);
  assert.equal(countMatches(schema, /create or replace function public\.create_sale_from_quotation\(/g), 1);
  assert.equal(schema.slice(viewOwnPosition, stockOutHotfixPosition), `${viewOwnMigration}\n\n${quotationToSaleMigration}\n\n`);

  assert.doesNotMatch(
    schema.slice(viewOwnPosition, stockOutHotfixPosition),
    /\b(?:purchase|inventory|accounting|shipment|stock[ _-]?out|hr)\b/i,
  );
});

test("native schema contains one ownership and outcome catalogue definition and one service-only RPC grant", () => {
  assert.equal(countMatches(viewOwnMigration, /'quotations\.view_own'/g), 1);

  const permissionCatalogue = quotationToSaleMigration.match(
    /insert into public\.permissions\([\s\S]*?\)\s*select[\s\S]*?cross join \(values([\s\S]*?)\) as v\(/,
  );
  assert.ok(permissionCatalogue, "conversion migration must define its permission catalogue");
  assert.equal(countMatches(permissionCatalogue[1], /'quotations\.record_customer_outcome'/g), 1);
  assert.equal(countMatches(permissionCatalogue[1], /'quotations\.convert_to_sale'/g), 1);

  for (const column of [
    "issued_at",
    "issued_by",
    "customer_accepted_at",
    "customer_accepted_by",
    "customer_declined_at",
    "customer_declined_by",
    "customer_decline_reason",
  ]) {
    assert.equal(
      countMatches(quotationToSaleMigration, new RegExp(`add column if not exists ${column}\\b`, "g")),
      1,
      `${column} must be added exactly once`,
    );
  }

  for (const rpc of [
    "transition_quotation_business_status",
    "update_quotation_details_and_totals",
    "search_eligible_quotations_for_sale",
    "create_sale_from_quotation",
  ]) {
    assert.equal(
      countMatches(quotationToSaleMigration, new RegExp(`create or replace function public\\.${rpc}\\(`, "g")),
      1,
      `${rpc} must be defined exactly once`,
    );
    assert.equal(
      countMatches(quotationToSaleMigration, new RegExp(`revoke all on function public\\.${rpc}\\(`, "g")),
      1,
      `${rpc} must be revoked exactly once`,
    );
    assert.equal(
      countMatches(quotationToSaleMigration, new RegExp(`grant execute on function public\\.${rpc}\\(`, "g")),
      1,
      `${rpc} must be granted exactly once`,
    );
    assert.equal(
      countMatches(
        quotationToSaleMigration,
        new RegExp(`grant execute on function public\\.${rpc}\\([^;]*?\\)\\s+to service_role;`, "g"),
      ),
      1,
      `${rpc} must be granted only to service_role`,
    );
  }

  assert.equal(countMatches(quotationToSaleMigration, /\) to (?:public|anon|authenticated);/g), 0);
});

test("native seed contains exact active quotation outcome and conversion permission rows", () => {
  const rows = parsePermissionSeedRows();
  const expectations = [
    {
      module_id: "f9386705-fa4d-49e2-8b8d-33ec72c7b9f0",
      key: "quotations.record_customer_outcome",
      name: "Record customer quotation outcome",
      description: "Record customer acceptance or rejection with actor, date and reason.",
      action: "record_customer_outcome",
      is_sensitive: "t",
      sort_order: "45",
      is_active: "t",
    },
    {
      module_id: "f9386705-fa4d-49e2-8b8d-33ec72c7b9f0",
      key: "quotations.convert_to_sale",
      name: "Create Sales from Quotations",
      description: "Create one linked draft Sale from an accepted quotation.",
      action: "convert_to_sale",
      is_sensitive: "t",
      sort_order: "72",
      is_active: "t",
    },
  ];

  for (const expectation of expectations) {
    const matchingRows = rows.filter((row) => row.key === expectation.key);
    assert.equal(matchingRows.length, 1, `${expectation.key} must appear exactly once in native seed`);
    assert.deepEqual(
      Object.fromEntries(Object.keys(expectation).map((key) => [key, matchingRows[0][key]])),
      expectation,
    );
  }
});
