import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/202608230004_quotation_to_sale.sql";
const migration = await readFile(migrationPath, "utf8").catch(() => "");

function functionDefinition(name: string) {
  const match = migration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?\\bas\\s+\\$\\$[\\s\\S]*?\\$\\$\\s*;`,
      "i",
    ),
  );
  assert.ok(match, `${name} must be defined by the additive migration.`);
  return match[0];
}

function functionBody(name: string) {
  const definition = functionDefinition(name);
  const match = definition.match(/\bas\s+\$\$([\s\S]*?)\$\$\s*;/i);
  assert.ok(match, `${name} must have a dollar-quoted body.`);
  return match[1];
}

function occurs(source: string, pattern: RegExp) {
  return [...source.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))]
    .length;
}

test("adds one backward-compatible quotation workflow migration", async () => {
  const migrations = (await readdir("supabase/migrations")).filter((name) =>
    name.startsWith("202608230004"),
  );

  assert.deepEqual(migrations, ["202608230004_quotation_to_sale.sql"]);
  assert.ok(migration, `${migrationPath} must exist.`);
  const expectedStatuses = [
    "draft",
    "submitted",
    "reviewing",
    "additional_info_required",
    "quoted",
    "approved",
    "rejected",
    "accepted",
    "declined",
    "closed",
    "expired",
    "converted_to_invoice",
    "converted_to_sale",
  ];
  const statusConstraint = migration.match(
    /add\s+constraint\s+quotation_requests_status_check\s+check\s*\(\s*status\s+in\s*\(([\s\S]*?)\)\s*\)/i,
  );
  assert.ok(statusConstraint, "the quotation status constraint must be recreated");
  const constrainedStatuses = [...statusConstraint[1].matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(constrainedStatuses, [...expectedStatuses].sort());
  for (const column of [
    "issued_at",
    "issued_by",
    "customer_accepted_at",
    "customer_accepted_by",
    "customer_declined_at",
    "customer_declined_by",
    "customer_decline_reason",
  ]) {
    assert.match(
      migration,
      new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, "i"),
      `${column} must be added without rewriting existing rows.`,
    );
  }
  assert.doesNotMatch(migration, /\bupdate\s+public\.quotation_requests\s+set\s+created_by\b/i);
  assert.doesNotMatch(migration, /\bsource_quotation_id\b/i);
});

test("every privileged quotation function pins an empty search path", () => {
  for (const name of [
    "notify_quotation_change",
    "transition_quotation_business_status",
    "search_eligible_quotations_for_sale",
    "create_sale_from_quotation",
  ]) {
    const definition = functionDefinition(name);
    assert.match(
      definition,
      /security\s+definer[\s\S]{0,80}set\s+search_path\s*=\s*''[\s\S]{0,80}\bas\s+\$\$/i,
      `${name} must not inherit a caller-controlled search path`,
    );
  }
});

test("adds independent outcome and conversion permissions without assigning them", () => {
  assert.match(migration, /'quotations\.record_customer_outcome'/);
  assert.match(migration, /'record_customer_outcome'\s*,\s*true\s*,\s*45/i);
  assert.match(migration, /'quotations\.convert_to_sale'/);
  assert.match(migration, /'convert_to_sale'\s*,\s*true\s*,\s*72/i);
  assert.doesNotMatch(
    migration,
    /permission_template_items[\s\S]{0,600}quotations\.(?:record_customer_outcome|convert_to_sale)/i,
  );
});

test("extends customer notifications for issued and recorded customer outcomes only", () => {
  for (const notification of [
    "quotation_issued",
    "quotation_accepted",
    "quotation_declined",
    "quotation_converted_to_sale",
  ]) {
    assert.match(migration, new RegExp(`'${notification}'`));
  }

  const notify = functionBody("notify_quotation_change");
  assert.match(notify, /tg_op\s*=\s*'INSERT'[\s\S]{0,180}new\.status\s*=\s*'submitted'/i);
  assert.match(notify, /when\s+'draft'\s+then\s+null/i);
  assert.match(notify, /when\s+'approved'\s+then\s+'quotation_approved'/i);
  assert.match(notify, /when\s+'accepted'\s+then\s+'quotation_accepted'/i);
  assert.doesNotMatch(notify, /when\s+'approved'\s+then\s+'quotation_accepted'/i);
});

test("business transitions lock, authorize, scope, validate, update metadata, and audit atomically", () => {
  const body = functionBody("transition_quotation_business_status");

  assert.match(body, /from\s+public\.quotation_requests[\s\S]{0,160}for\s+update/i);
  assert.match(body, /quotations\.view_own/);
  assert.match(body, /quotations\.view_all/);
  assert.match(body, /quotations\.view/);
  assert.match(body, /quotation\.created_by\s*(?:=|<>)\s*actor_profile_id/i);
  assert.match(
    body,
    /coalesce\s*\(\s*quotation\.created_by\s*=\s*actor_profile_id\s*,\s*false\s*\)/i,
    "a null historical owner must not satisfy own-only scope",
  );
  for (const permission of [
    "quotations.approve",
    "quotations.reject",
    "quotations.send",
    "quotations.record_customer_outcome",
  ]) {
    assert.match(body, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(body, /requested_transition\s*=\s*'accept'[\s\S]{0,500}quotation\.status\s*<>\s*'quoted'/i);
  assert.match(body, /requested_transition\s*=\s*'decline'[\s\S]{0,500}quotation\.status\s*<>\s*'quoted'/i);
  assert.match(body, /expiration_date\s*<\s*current_date/i);
  assert.match(body, /requested_reason[\s\S]{0,180}(?:is\s+null|=\s*'')/i);
  assert.match(body, /issued_at\s*=\s*now\(\)[\s\S]{0,100}issued_by\s*=\s*actor_profile_id/i);
  assert.match(body, /customer_accepted_at\s*=\s*now\(\)[\s\S]{0,120}customer_accepted_by\s*=\s*actor_profile_id/i);
  assert.match(body, /customer_declined_at\s*=\s*now\(\)[\s\S]{0,160}customer_declined_by\s*=\s*actor_profile_id[\s\S]{0,160}customer_decline_reason/i);
  assert.match(body, /insert\s+into\s+public\.audit_logs/i);
  assert.doesNotMatch(body, /status\s*=\s*'accepted'[\s\S]{0,120}approved_by/i);
});

test("eligible search requires conversion and Sale creation access within quotation scope", () => {
  const body = functionBody("search_eligible_quotations_for_sale");

  assert.match(body, /quotations\.convert_to_sale/);
  assert.match(body, /sales\.create/);
  assert.match(body, /quotations\.view_own/);
  assert.match(body, /quotations\.view_all/);
  assert.match(body, /q\.created_by\s*=\s*actor_profile_id/i);
  assert.match(body, /q\.status\s*=\s*'accepted'/i);
  assert.match(body, /q\.expiration_date\s+is\s+null\s+or\s+q\.expiration_date\s*>=\s*current_date/i);
  assert.match(body, /q\.converted_order_id\s+is\s+null/i);
  assert.match(body, /p\.role\s*=\s*'customer'[\s\S]{0,100}p\.status\s*=\s*'active'/i);
  for (const field of ["reference", "full_name", "company_name", "email"]) {
    assert.match(body, new RegExp(`${field}[\\s\\S]{0,80}ilike`, "i"));
  }
  assert.match(body, /order\s+by[\s\S]{0,120}lower\(q\.reference\)\s*=\s*lower\(/i);
  assert.match(
    body,
    /result_limit\s+integer\s*:=\s*least\s*\(\s*greatest\s*\(\s*coalesce\s*\(\s*requested_limit\s*,\s*20\s*\)\s*,\s*1\s*\)\s*,\s*20\s*\)/i,
  );
  assert.match(body, /limit\s+result_limit/i);
});

test("eligible search bounds input and treats wildcard characters literally", () => {
  const body = functionBody("search_eligible_quotations_for_sale");

  assert.match(
    body,
    /search_query\s+text\s*:=\s*left\s*\(\s*btrim\s*\(\s*coalesce\s*\(\s*requested_query\s*,\s*''\s*\)\s*\)\s*,\s*80\s*\)/i,
  );
  assert.match(body, /if\s+search_query\s*=\s*''\s+then\s+return/i);
  assert.match(body, /replace\s*\(\s*search_query\s*,\s*e?'\\\\'\s*,\s*e?'\\\\\\\\'\s*\)/i);
  assert.match(body, /replace\s*\([\s\S]{0,120}'%'\s*,\s*e?'\\\\%'\s*\)/i);
  assert.match(body, /replace\s*\([\s\S]{0,160}'_'\s*,\s*e?'\\\\_'\s*\)/i);
  assert.equal(
    occurs(body, /\bilike\s+search_pattern\s+escape\s+e?'\\\\'/i),
    4,
    "each searched field must use the explicit literal-pattern escape",
  );
  assert.match(
    body,
    /case\s+when\s+lower\(q\.reference\)\s*=\s*lower\(search_query\)\s+then\s+0\s+else\s+1\s+end/i,
  );
});

test("conversion locks once, returns an existing link, and creates one draft Sale before linking and auditing", () => {
  const body = functionBody("create_sale_from_quotation");
  const lockAt = body.search(/from\s+public\.quotation_requests[\s\S]{0,160}for\s+update/i);
  const retryAt = body.search(/converted_order_id\s+is\s+not\s+null/i);
  const createAt = body.search(/public\.create_minimal_sale\s*\(/i);
  const linkAt = body.search(/update\s+public\.quotation_requests[\s\S]{0,240}converted_order_id\s*=/i);
  const auditAt = body.search(/insert\s+into\s+public\.audit_logs/i);

  assert.ok(lockAt >= 0, "the quotation row must be locked");
  assert.ok(retryAt > lockAt, "retry handling must inspect the locked quotation");
  assert.ok(createAt > retryAt, "an existing link must return before Sale creation");
  assert.ok(linkAt > createAt, "the quotation must link only after Sale creation succeeds");
  assert.ok(auditAt > linkAt, "conversion audit must follow the successful link");
  assert.equal(occurs(body, /public\.create_minimal_sale\s*\(/i), 1);
  assert.match(body, /quotations\.convert_to_sale/);
  assert.match(body, /sales\.create/);
  assert.match(body, /quotations\.view_own/);
  assert.match(body, /quotation\.created_by\s*(?:=|<>)\s*actor_profile_id/i);
  assert.match(
    body,
    /coalesce\s*\(\s*quotation\.created_by\s*=\s*actor_profile_id\s*,\s*false\s*\)/i,
    "a null historical owner must not satisfy own-only scope",
  );
  assert.match(body, /quotation\.status\s*<>\s*'accepted'/i);
  assert.match(body, /quotation\.expiration_date\s*<\s*current_date/i);
  assert.match(body, /requested_customer_id\s*(?:<>|is\s+distinct\s+from)\s*quotation\.profile_id/i);
  assert.match(body, /role\s*=\s*'customer'[\s\S]{0,100}status\s*=\s*'active'/i);
  assert.match(body, /source_quotation_item_id/);
  assert.match(body, /public\.quotation_request_items/);
  assert.match(body, /public\.products[\s\S]{0,160}status\s*(?:=\s*'active'|<>\s*'archived')/i);
  assert.match(body, /public\.product_variations[\s\S]{0,180}status\s*=\s*'active'/i);
  assert.match(body, /sales\.change_price/);
  assert.match(body, /sales\.apply_discount/);
  assert.match(body, /unit_price[\s\S]{0,240}quote_item\.unit_price/i);
  assert.match(body, /line_discount[\s\S]{0,240}quote_item\.discount_amount/i);
  assert.match(body, /line_tax[\s\S]{0,240}quote_item\.tax_amount/i);
  assert.match(body, /quantity[\s\S]{0,180}trunc\(/i);
  assert.match(body, /requested_items\s+is\s+null\s+or\s+jsonb_typeof/i);
  assert.match(body, /insert\s+into\s+public\.order_status_events/i);
  assert.match(body, /status\s*=\s*'converted_to_sale'/i);
  assert.match(body, /'order_number'/i);
});

test("conversion rejects unsupported currency and foreign customer addresses before Sale creation", () => {
  const body = functionBody("create_sale_from_quotation");
  const createAt = body.search(/public\.create_minimal_sale\s*\(/i);
  const currencyAt = body.search(
    /quotation\.currency\s+is\s+distinct\s+from\s+'BDT'/i,
  );
  const shippingAt = body.search(
    /requested_address_id\s+is\s+not\s+null\s+and\s+not\s+exists\s*\([\s\S]{0,240}public\.customer_addresses[\s\S]{0,120}a\.id\s*=\s*requested_address_id[\s\S]{0,120}a\.profile_id\s*=\s*requested_customer_id/i,
  );
  const billingAt = body.search(
    /requested_billing_address_id\s+is\s+not\s+null\s+and\s+not\s+exists\s*\([\s\S]{0,240}public\.customer_addresses[\s\S]{0,120}a\.id\s*=\s*requested_billing_address_id[\s\S]{0,120}a\.profile_id\s*=\s*requested_customer_id/i,
  );

  assert.ok(currencyAt >= 0 && currencyAt < createAt, "non-BDT must fail before Sale creation");
  assert.match(body, /Only BDT quotations can be converted to a Sale/i);
  assert.ok(shippingAt >= 0 && shippingAt < createAt, "shipping address ownership must be checked null-safely");
  assert.ok(billingAt >= 0 && billingAt < createAt, "billing address ownership must be checked null-safely");
  assert.match(body, /Shipping address does not belong to the quotation customer/i);
  assert.match(body, /Billing address does not belong to the quotation customer/i);
});

test("source-line edits use quotation baselines, reject duplicates, and record omission as an edit", () => {
  const body = functionBody("create_sale_from_quotation");
  const sourceBranchAt = body.search(/if\s+source_quotation_item_id\s+is\s+not\s+null/i);
  const addedBranchAt = body.search(/else\s+[\s\S]{0,100}catalogue_unit_price\s*:=/i);
  const sourceBaselineAt = body.search(
    /baseline_unit_price\s*:=\s*round\s*\(\s*coalesce\s*\(\s*quote_item\.unit_price\s*,\s*quote_item\.target_price\s*,\s*0\s*\)/i,
  );
  const catalogueAt = body.search(/catalogue_unit_price\s*:=/i);

  assert.ok(sourceBranchAt >= 0 && sourceBaselineAt > sourceBranchAt);
  assert.ok(addedBranchAt > sourceBaselineAt && catalogueAt >= addedBranchAt);
  assert.match(body, /source_quotation_item_id\s*=\s*any\s*\(\s*seen_source_ids\s*\)/i);
  assert.match(body, /seen_source_ids\s*:=\s*array_append\s*\(\s*seen_source_ids\s*,\s*source_quotation_item_id\s*\)/i);
  assert.match(
    body,
    /cardinality\s*\(\s*seen_source_ids\s*\)\s*<>\s*\([\s\S]{0,180}public\.quotation_request_items[\s\S]{0,120}then\s+accepted_values_edited\s*:=\s*true/i,
  );
  assert.match(body, /item_unit_price\s*<>\s*baseline_unit_price[\s\S]{0,180}sales\.change_price/i);
  assert.match(body, /item_line_discount\s*<>\s*round\s*\(\s*coalesce\s*\(\s*quote_item\.discount_amount[\s\S]{0,220}sales\.apply_discount/i);
});

test("persisted adjustments correspond one-to-one with reviewed price, discount, and service edits", () => {
  const body = functionBody("create_sale_from_quotation");

  assert.match(body, /expected_adjustments\s+jsonb\s*:=\s*'\[\]'::jsonb/i);
  for (const [condition, type] of [
    ["item_unit_price\\s*<>\\s*baseline_unit_price", "manual_unit_price"],
    ["item_line_discount\\s*<>\\s*round\\s*\\(\\s*coalesce\\s*\\(\\s*quote_item\\.discount_amount", "fixed_line_discount"],
    ["item_unit_price\\s*<>\\s*catalogue_unit_price", "manual_unit_price"],
    ["item_line_discount\\s*>\\s*0", "fixed_line_discount"],
    ["header_discount\\s*<>\\s*round\\s*\\(\\s*coalesce\\s*\\(\\s*quotation\\.discount_amount", "order_discount"],
    ["header_service\\s*>\\s*0", "service_charge"],
  ]) {
    assert.match(
      body,
      new RegExp(`if\\s+${condition}[\\s\\S]{0,700}expected_adjustments[\\s\\S]{0,350}'adjustment_type'\\s*,\\s*'${type}'`, "i"),
      `${type} must be derived only inside its corresponding edit branch`,
    );
  }
  assert.match(
    body,
    /item_unit_price\s*<>\s*baseline_unit_price[\s\S]{0,700}'adjustment_type'\s*,\s*'manual_unit_price'[\s\S]{0,180}'previous_value'\s*,\s*baseline_unit_price[\s\S]{0,120}'new_value'\s*,\s*item_unit_price/i,
  );
  assert.match(
    body,
    /item_line_discount\s*<>\s*round\s*\(\s*coalesce\s*\(\s*quote_item\.discount_amount[\s\S]{0,800}'adjustment_type'\s*,\s*'fixed_line_discount'[\s\S]{0,220}'previous_value'\s*,\s*round\s*\(\s*coalesce\s*\(\s*quote_item\.discount_amount[\s\S]{0,180}'new_value'\s*,\s*item_line_discount/i,
  );
  assert.match(
    body,
    /item_unit_price\s*<>\s*catalogue_unit_price[\s\S]{0,700}'adjustment_type'\s*,\s*'manual_unit_price'[\s\S]{0,180}'previous_value'\s*,\s*catalogue_unit_price[\s\S]{0,120}'new_value'\s*,\s*item_unit_price/i,
  );
  assert.match(
    body,
    /item_line_discount\s*>\s*0[\s\S]{0,700}'adjustment_type'\s*,\s*'fixed_line_discount'[\s\S]{0,180}'previous_value'\s*,\s*catalogue_unit_price[\s\S]{0,120}'new_value'\s*,\s*item_line_discount/i,
    "added-line discounts must use the same catalogue previous-value contract as manual Sales",
  );
  for (const type of [
    "manual_unit_price",
    "fixed_line_discount",
    "order_discount",
    "service_charge",
  ]) {
    assert.match(
      body,
      new RegExp(`expected_adjustments[\\s\\S]*?'adjustment_type'\\s*,\\s*'${type}'`, "i"),
      `${type} must be derived from an actual reviewed edit`,
    );
  }
  for (const identifier of [
    "source_quotation_item_id",
    "product_id",
    "variation_id",
    "previous_value",
    "new_value",
  ]) {
    assert.match(
      body,
      new RegExp(`expected_adjustments[\\s\\S]*?'${identifier}'`, "i"),
    );
  }
  assert.match(
    body,
    /jsonb_array_length\s*\(\s*coalesce\s*\(\s*requested_adjustments\s*,\s*'\[\]'::jsonb\s*\)\s*\)\s*<>\s*jsonb_array_length\s*\(\s*expected_adjustments\s*\)/i,
  );
  assert.match(body, /with\s+ordinality/i);
  assert.match(body, /consumed_adjustment_indexes/i);
  assert.match(body, /adjustment->>'adjustment_type'[\s\S]{0,500}expected_adjustment->>'adjustment_type'/i);
  assert.match(body, /adjustment->>'source_quotation_item_id'[\s\S]{0,500}expected_adjustment->>'source_quotation_item_id'/i);
  assert.match(body, /adjustment->>'product_id'[\s\S]{0,500}expected_adjustment->>'product_id'/i);
  assert.match(body, /adjustment->>'variation_id'[\s\S]{0,500}expected_adjustment->>'variation_id'/i);
  assert.match(body, /adjustment->>'previous_value'[\s\S]{0,500}expected_adjustment->>'previous_value'/i);
  assert.match(body, /adjustment->>'new_value'[\s\S]{0,500}expected_adjustment->>'new_value'/i);
  assert.match(body, /nullif\s*\(\s*btrim\s*\(\s*coalesce\s*\(\s*adjustment->>'reason'/i);
  assert.match(body, /normalized_items\s*,\s*validated_adjustments/i);
});

test("new RPCs are service-role only", () => {
  for (const signature of [
    "transition_quotation_business_status\\(uuid,uuid,text,text\\)",
    "search_eligible_quotations_for_sale\\(uuid,text,integer\\)",
    "create_sale_from_quotation\\(uuid,uuid,uuid,uuid,jsonb,uuid,jsonb,uuid,text,date,numeric,numeric,numeric,numeric,text,text,jsonb,jsonb\\)",
  ]) {
    const flexibleSignature = signature
      .replace("\\(", "\\(\\s*")
      .replaceAll(",", "\\s*,\\s*")
      .replace("\\)", "\\s*\\)");
    assert.match(
      migration,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${flexibleSignature}[\\s\\S]{0,100}from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${flexibleSignature}[\\s\\S]{0,80}to\\s+service_role`, "i"),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${flexibleSignature}[\\s\\S]{0,80}to\\s+(?:authenticated|anon|public)`, "i"),
    );
  }
});

test("conversion cannot confirm, reserve, invoice, finalize, release stock, take payment, or ship", () => {
  const body = functionBody("create_sale_from_quotation");

  assert.doesNotMatch(
    body,
    /\b(?:confirm_sales_order|generate_sale_document|finalize_sale_invoice|record_sale_payment|dispatch_order_shipment|create_order_shipment|release_sales_stock)\s*\(/i,
  );
  assert.doesNotMatch(
    body,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:inventory_balances|inventory_reservations|inventory_movements|sale_documents|sale_payments|sales_stock_out_requests|sales_stock_out_releases|shipments)\b/i,
  );
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.quotation_requests\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.(?:products|product_variations|inventory\w*)\b/i);
});
