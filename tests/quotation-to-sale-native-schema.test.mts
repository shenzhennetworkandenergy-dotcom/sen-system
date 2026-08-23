import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = await readFile("scripts/build-native-schema.mjs", "utf8");
const schema = await readFile("database/native/schema.sql", "utf8");
const seed = await readFile("database/native/seed.sql", "utf8");

test("native builder applies View Own before quotation-to-Sale conversion", () => {
  const viewOwnReference = builder.indexOf("202608230003_quotation_view_own.sql");
  const conversionReference = builder.indexOf("202608230004_quotation_to_sale.sql");
  const viewOwnApplication = builder.indexOf("quotationViewOwnMigration.trim()");
  const conversionApplication = builder.indexOf("quotationToSaleMigration.trim()");

  assert.ok(viewOwnReference >= 0, "builder must read the View Own migration");
  assert.ok(conversionReference > viewOwnReference, "builder must reference the conversion migration after View Own");
  assert.ok(viewOwnApplication >= 0, "builder must apply the View Own migration");
  assert.ok(conversionApplication > viewOwnApplication, "builder must apply the conversion migration after View Own");
});

test("native schema preserves quotation ownership, outcome, and conversion behavior", () => {
  const viewOwnPosition = schema.indexOf("quotations.view_own");
  const conversionPosition = schema.indexOf("create or replace function public.create_sale_from_quotation");

  assert.match(schema, /alter table public\.quotation_requests\s+add column if not exists created_by uuid/i);
  assert.ok(viewOwnPosition >= 0, "native schema must include the View Own permission");
  assert.ok(conversionPosition > viewOwnPosition, "conversion migration must follow View Own in the native schema");

  for (const column of [
    "issued_at",
    "issued_by",
    "customer_accepted_at",
    "customer_accepted_by",
    "customer_declined_at",
    "customer_declined_by",
    "customer_decline_reason",
  ]) {
    assert.match(schema, new RegExp(`add column if not exists ${column}\\b`, "i"));
  }

  assert.match(schema, /quotations\.record_customer_outcome/i);
  assert.match(schema, /quotations\.convert_to_sale/i);
  assert.match(schema, /converted_to_sale/i);
  assert.match(schema, /create or replace function public\.transition_quotation_business_status/i);
  assert.match(schema, /create or replace function public\.search_eligible_quotations_for_sale/i);
  assert.match(schema, /create or replace function public\.create_sale_from_quotation/i);
  assert.match(
    schema,
    /grant execute on function public\.create_sale_from_quotation\([\s\S]*?\) to service_role;/i,
  );
});

test("native seed includes quotation outcome and conversion permissions", () => {
  assert.match(seed, /\tquotations\.record_customer_outcome\t/);
  assert.match(seed, /\tquotations\.convert_to_sale\t/);
});
