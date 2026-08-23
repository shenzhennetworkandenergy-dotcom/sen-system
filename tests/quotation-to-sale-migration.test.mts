import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/202608230004_quotation_to_sale.sql";
const migration = await readFile(migrationPath, "utf8").catch(() => "");

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)\\$\\$\\s*;`,
      "i",
    ),
  );
  assert.ok(match, `${name} must be defined by the additive migration.`);
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
  for (const status of [
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
    "draft",
    "converted_to_sale",
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
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
  for (const field of ["reference", "full_name", "company_name", "email"]) {
    assert.match(body, new RegExp(`${field}[\\s\\S]{0,80}ilike`, "i"));
  }
  assert.match(body, /order\s+by[\s\S]{0,120}lower\(q\.reference\)\s*=\s*lower\(/i);
  assert.match(body, /least\s*\(\s*greatest\s*\([\s\S]{0,100}20/i);
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
