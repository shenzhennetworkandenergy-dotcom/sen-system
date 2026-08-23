import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npxCli = process.platform === "win32"
  ? resolve(process.execPath, "..", "node_modules", "npm", "bin", "npx-cli.js")
  : null;
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const linkedProjectMarker = resolve(repositoryRoot, "supabase", ".temp", "project-ref");
const requestedApiUrl = process.env.QUOTATION_TO_SALE_SUPABASE_URL;
const requestedDatabaseUrl = process.env.QUOTATION_TO_SALE_DATABASE_URL;

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function requireLoopbackUrl(value, label, protocols) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${label} must use ${protocols.join(" or ")}.`);
  }
  if (!allowedHosts.has(normalizedHostname(parsed))) {
    throw new Error(`${label} refused non-local host ${parsed.hostname}.`);
  }
  return parsed;
}

function assertUnlinkedProject() {
  if (existsSync(linkedProjectMarker)) {
    const projectRef = readFileSync(linkedProjectMarker, "utf8").trim();
    if (projectRef) {
      throw new Error(`Refusing linked Supabase project ${projectRef}.`);
    }
  }
  for (const variable of ["SUPABASE_PROJECT_REF", "SUPABASE_PROJECT_ID"]) {
    if (process.env[variable]?.trim()) {
      throw new Error(`Refusing linked/remote project environment variable ${variable}.`);
    }
  }
}

function runSupabase(arguments_, options = {}) {
  if (npxCli && !existsSync(npxCli)) {
    throw new Error(`Unable to locate the local npx runner at ${npxCli}.`);
  }
  const result = spawnSync(
    npxCli ? process.execPath : "npx",
    npxCli
      ? [npxCli, "supabase", "--workdir", repositoryRoot, ...arguments_]
      : ["supabase", "--workdir", repositoryRoot, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Supabase ${arguments_.join(" ")} failed.\n${detail}`);
  }
  return result.stdout;
}

function parseStatusEnvironment(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(?:"([\s\S]*)"|'([\s\S]*)'|([^\s]+))$/.exec(line.trim());
    if (match) values[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

function checkRequestedUrlsBeforeStatus() {
  if (requestedApiUrl) requireLoopbackUrl(requestedApiUrl, "QUOTATION_TO_SALE_SUPABASE_URL", ["http:", "https:"]);
  if (requestedDatabaseUrl) requireLoopbackUrl(requestedDatabaseUrl, "QUOTATION_TO_SALE_DATABASE_URL", ["postgres:", "postgresql:"]);
  assertUnlinkedProject();
}

async function expectNoError(operation, label) {
  const { error } = await operation;
  assert.ifError(error, label);
}

async function countRows(client, table, applyFilter) {
  let query = client.from(table).select("*", { count: "exact", head: true });
  query = applyFilter(query);
  const { count, error } = await query;
  assert.ifError(error);
  return count ?? 0;
}

async function runConcurrentVerification(apiUrl, serviceRoleKey) {
  const client = createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const runId = randomUUID();
  const prefix = `q2s9-${runId.slice(0, 12)}`;
  const ids = {
    warehouse: randomUUID(),
    product: randomUUID(),
    variation: randomUUID(),
    balance: randomUUID(),
    address: randomUUID(),
    quotation: randomUUID(),
    quotationItem: randomUUID(),
  };
  let actorId;
  let customerId;
  let convertedSaleId;
  let manualSaleId;
  const cleanupErrors = [];

  const remove = async (table, applyFilter) => {
    let query = client.from(table).delete();
    query = applyFilter(query);
    const { error } = await query;
    if (error) cleanupErrors.push(`${table}: ${error.message}`);
  };

  try {
    const actorResult = await client.auth.admin.createUser({
      email: `${prefix}-actor@local.test`,
      password: `${runId}Aa1!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Actor" },
    });
    assert.ifError(actorResult.error);
    actorId = actorResult.data.user.id;
    const customerResult = await client.auth.admin.createUser({
      email: `${prefix}-customer@local.test`,
      password: `${runId}Bb2!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Customer" },
    });
    assert.ifError(customerResult.error);
    customerId = customerResult.data.user.id;

    await expectNoError(client.from("profiles").update({ role: "admin", status: "active" }).eq("id", actorId), "actor profile");
    await expectNoError(client.from("profiles").update({
      role: "customer", status: "active", phone: "01700000009", company_name: `${prefix} Customer`,
    }).eq("id", customerId), "customer profile");
    await expectNoError(client.from("warehouses").insert({
      id: ids.warehouse, code: `Q2S9-${runId.slice(0, 8)}`, name: `${prefix} Warehouse`,
      country_code: "BD", country_name: "Bangladesh", is_active: true,
    }), "warehouse fixture");
    await expectNoError(client.from("products").insert({
      id: ids.product, name: `${prefix} Variable Product`, slug: `${prefix}-variable-product`,
      sku: `Q2S9-P-${runId.slice(0, 8)}`, product_type: "variable", status: "active",
      regular_price: 999, sale_price: 888, currency: "BDT", manage_stock: false,
      serial_tracking_required: false, default_warehouse_id: ids.warehouse,
      public_catalogue_visible: true, created_by: actorId, updated_by: actorId,
    }), "product fixture");
    await expectNoError(client.from("product_variations").insert({
      id: ids.variation, product_id: ids.product, sku: `Q2S9-V-${runId.slice(0, 8)}`,
      status: "active", regular_price: 999, sale_price: 888, manage_stock: true,
      combination_key: `q2s9-${runId.slice(0, 8)}`,
    }), "variation fixture");
    await expectNoError(client.from("inventory_balances").insert({
      id: ids.balance, warehouse_id: ids.warehouse, product_id: ids.product,
      variation_id: ids.variation, on_hand: 25, reserved: 0,
    }), "inventory fixture");
    await expectNoError(client.from("customer_addresses").insert({
      id: ids.address, profile_id: customerId, recipient_name: `${prefix} Customer`,
      phone: "01700000009", address_line_1: "Concurrency Road 9", city: "Dhaka",
      country_code: "BD", created_by: actorId, updated_by: actorId,
    }), "address fixture");
    await expectNoError(client.from("quotation_requests").insert({
      id: ids.quotation, reference: `Q2S9-${runId.slice(0, 12)}`, profile_id: customerId,
      created_by: actorId, status: "accepted", subject: `${prefix} accepted quotation`,
      currency: "BDT", shipping_address_id: ids.address, billing_address_id: ids.address,
      shipping_address_snapshot: { recipient_name: `${prefix} Customer`, address_line_1: "Concurrency Road 9", city: "Dhaka", country_code: "BD" },
      billing_address_snapshot: { recipient_name: `${prefix} Customer`, address_line_1: "Concurrency Road 9", city: "Dhaka", country_code: "BD" },
      required_by: "2026-09-30", expiration_date: "2099-12-31", subtotal: 246.9,
      discount_amount: 5.55, tax_amount: 7.89, total_amount: 249.24,
      internal_notes: `${prefix} internal`, customer_notes: `${prefix} customer`,
      customer_accepted_at: new Date().toISOString(), customer_accepted_by: actorId,
    }), "quotation fixture");
    await expectNoError(client.from("quotation_request_items").insert({
      id: ids.quotationItem, quotation_id: ids.quotation, product_id: ids.product,
      variation_id: ids.variation, product_name_snapshot: `${prefix} Variable Product`,
      sku_snapshot: `Q2S9-V-${runId.slice(0, 8)}`, quantity: 2, target_price: 123.45,
      unit_price: 123.45, discount_amount: 5.55, tax_amount: 7.89,
      line_subtotal: 246.9, line_total: 249.24, currency: "BDT",
    }), "quotation item fixture");

    const rpcArguments = {
      actor_profile_id: actorId,
      requested_quotation_id: ids.quotation,
      requested_customer_id: customerId,
      requested_address_id: ids.address,
      requested_address: null,
      requested_billing_address_id: ids.address,
      requested_billing_address: null,
      requested_warehouse_id: ids.warehouse,
      requested_source: "direct_office",
      requested_expected_delivery_date: "2026-09-30",
      requested_discount: 5.55,
      requested_shipping: 0,
      requested_service: 0,
      requested_tax: 7.89,
      requested_internal_notes: `${prefix} internal`,
      requested_customer_notes: `${prefix} customer`,
      requested_items: [{
        source_quotation_item_id: ids.quotationItem,
        product_id: ids.product,
        variation_id: ids.variation,
        warehouse_id: ids.warehouse,
        quantity: 2,
        unit_price: 123.45,
        line_discount: 5.55,
        line_tax: 7.89,
      }],
      requested_adjustments: [],
    };

    const [first, second] = await Promise.all([
      client.rpc("create_sale_from_quotation", rpcArguments),
      client.rpc("create_sale_from_quotation", rpcArguments),
    ]);
    assert.ifError(first.error);
    assert.ifError(second.error);
    assert.equal(first.data.sale_id, second.data.sale_id, "Concurrent calls must resolve to one Sale.");
    assert.equal(first.data.order_number, second.data.order_number, "Concurrent calls must resolve to one Sale number.");
    assert.deepEqual([first.data.existing, second.data.existing].sort(), [false, true]);
    convertedSaleId = first.data.sale_id;

    const retry = await client.rpc("create_sale_from_quotation", rpcArguments);
    assert.ifError(retry.error);
    assert.equal(retry.data.sale_id, convertedSaleId);
    assert.equal(retry.data.existing, true);

    assert.equal(await countRows(client, "sales_orders", (query) => query.eq("id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "sales_order_items", (query) => query.eq("order_id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "audit_logs", (query) => query
      .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation)
      .eq("action", "quotation.converted_to_sale")), 1);
    assert.equal(await countRows(client, "order_status_events", (query) => query
      .eq("order_id", convertedSaleId).ilike("note", "Draft Sale created from accepted quotation%")), 1);
    assert.equal(await countRows(client, "inventory_reservations", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_documents", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_payments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sales_stock_out_requests", (query) => query.eq("sales_order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "shipments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "payment_transactions", (query) => query.eq("order_id", convertedSaleId)), 0);

    const quotation = await client.from("quotation_requests")
      .select("status,converted_order_id").eq("id", ids.quotation).single();
    assert.ifError(quotation.error);
    assert.deepEqual(quotation.data, { status: "converted_to_sale", converted_order_id: convertedSaleId });
    const balance = await client.from("inventory_balances")
      .select("on_hand,reserved,available").eq("id", ids.balance).single();
    assert.ifError(balance.error);
    assert.deepEqual(
      Object.fromEntries(Object.entries(balance.data).map(([key, value]) => [key, Number(value)])),
      { on_hand: 25, reserved: 0, available: 25 },
    );

    const manual = await client.rpc("create_minimal_sale", {
      actor_profile_id: actorId,
      requested_customer_id: customerId,
      requested_address_id: ids.address,
      requested_address: null,
      requested_billing_address_id: ids.address,
      requested_billing_address: null,
      requested_warehouse_id: ids.warehouse,
      requested_source: "phone",
      requested_expected_delivery_date: "2026-10-01",
      requested_discount: 0,
      requested_shipping: 0,
      requested_service: 0,
      requested_tax: 0,
      requested_internal_notes: `${prefix} manual`,
      requested_customer_notes: `${prefix} manual customer`,
      requested_items: [{
        product_id: ids.product, variation_id: ids.variation, warehouse_id: ids.warehouse,
        quantity: 1, unit_price: 888, line_discount: 0, line_tax: 0,
      }],
      requested_adjustments: [],
    });
    assert.ifError(manual.error);
    manualSaleId = manual.data;
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);
    await expectNoError(client.rpc("confirm_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
    }), "manual Sale confirmation");
    await expectNoError(client.rpc("cancel_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
      requested_reason: "Task 9 rollback-only manual workflow verification",
    }), "manual Sale cancellation");
    const manualOrder = await client.from("sales_orders").select("status").eq("id", manualSaleId).single();
    assert.ifError(manualOrder.error);
    assert.equal(manualOrder.data.status, "cancelled");
  } finally {
    if (manualSaleId) {
      await remove("inventory_reservations", (query) => query.eq("order_id", manualSaleId));
      await remove("order_status_events", (query) => query.eq("order_id", manualSaleId));
      await remove("sales_order_items", (query) => query.eq("order_id", manualSaleId));
      await remove("sales_orders", (query) => query.eq("id", manualSaleId));
    }
    if (convertedSaleId) {
      await remove("order_status_events", (query) => query.eq("order_id", convertedSaleId));
      await remove("sale_price_adjustments", (query) => query.eq("order_id", convertedSaleId));
      await remove("sales_order_items", (query) => query.eq("order_id", convertedSaleId));
      await remove("sales_orders", (query) => query.eq("id", convertedSaleId));
    }
    await remove("audit_logs", (query) => query.eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
    await remove("customer_notifications", (query) => query.eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
    await remove("quotation_request_items", (query) => query.eq("quotation_id", ids.quotation));
    await remove("quotation_requests", (query) => query.eq("id", ids.quotation));
    await remove("inventory_balances", (query) => query.eq("id", ids.balance));
    await remove("customer_addresses", (query) => query.eq("id", ids.address));
    await remove("product_variations", (query) => query.eq("id", ids.variation));
    await remove("product_revisions", (query) => query.eq("product_id", ids.product));
    await remove("products", (query) => query.eq("id", ids.product));
    await remove("warehouses", (query) => query.eq("id", ids.warehouse));
    if (customerId) {
      const { error } = await client.auth.admin.deleteUser(customerId);
      if (error) cleanupErrors.push(`customer auth user: ${error.message}`);
    }
    if (actorId) {
      const { error } = await client.auth.admin.deleteUser(actorId);
      if (error) cleanupErrors.push(`actor auth user: ${error.message}`);
    }
  }
  assert.deepEqual(cleanupErrors, [], `Explicit cleanup failed: ${cleanupErrors.join("; ")}`);
}

checkRequestedUrlsBeforeStatus();
const status = parseStatusEnvironment(runSupabase(["status", "-o", "env"]));
const apiUrl = requestedApiUrl ?? status.API_URL;
const databaseUrl = requestedDatabaseUrl ?? status.DB_URL;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
assert.ok(apiUrl, "Local Supabase status did not provide API_URL.");
assert.ok(databaseUrl, "Local Supabase status did not provide DB_URL.");
assert.ok(serviceRoleKey, "Local Supabase status did not provide SERVICE_ROLE_KEY.");
requireLoopbackUrl(apiUrl, "Local Supabase API URL", ["http:", "https:"]);
requireLoopbackUrl(databaseUrl, "Local Supabase database URL", ["postgres:", "postgresql:"]);
assertUnlinkedProject();

if (process.argv.includes("--apply-local-migrations")) {
  runSupabase(["db", "reset", "--local", "--no-seed", "--yes"], { stdio: "inherit" });
  assertUnlinkedProject();
}

const migrationList = JSON.parse(runSupabase([
  "migration", "list", "--local", "--output-format", "json",
]));
assert.ok(
  migrationList.migrations?.some((migration) => (
    migration.local === "202608230004" && migration.remote === "202608230004"
  )),
  "The Task 3 quotation-to-Sale migration is not applied locally.",
);
runSupabase(["test", "db", "--local", "supabase/tests/quotation_to_sale.sql"], { stdio: "inherit" });
await runConcurrentVerification(apiUrl, serviceRoleKey);

console.log("Quotation-to-Sale database verification passed: migration application, rollback, permissions, exact transfer, zero premature side effects, retry, concurrency, and manual Sales workflow.");
