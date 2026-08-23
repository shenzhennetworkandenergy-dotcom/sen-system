import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
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
  const routingParameter = [...parsed.searchParams.keys()]
    .find((key) => ["host", "hostaddr"].includes(key.toLowerCase()));
  if (routingParameter) {
    throw new Error(`${label} refused libpq connection-routing parameters (${routingParameter}).`);
  }
  return parsed;
}

async function runWithGuaranteedCleanup(work, cleanup) {
  let result;
  let primaryError;
  let cleanupError;
  try {
    result = await work();
  } catch (error) {
    primaryError = error;
  }
  try {
    await cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Quotation-to-Sale verification failed and cleanup also failed.",
    );
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  return result;
}

async function runVerifierSelfTests() {
  for (const value of [
    "postgresql://postgres:postgres@localhost:54322/postgres?host=remote.example",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=203.0.113.9",
    "postgresql://postgres:postgres@localhost:54322/postgres?host=localhost,remote.example",
    "postgresql://postgres:postgres@localhost:54322/postgres?HOSTADDR=127.0.0.1,203.0.113.9",
  ]) {
    assert.throws(
      () => requireLoopbackUrl(value, "self-test database URL", ["postgres:", "postgresql:"]),
      /connection-routing parameters/i,
    );
  }
  const sensitiveFailure = buildSupabaseFailureMessage(
    ["status", "-o", "env"],
    'SERVICE_ROLE_KEY="self-test-secret"\nAPI_URL="http://127.0.0.1:54321"',
    'ANON_KEY="stderr-secret"',
    true,
  );
  assert.doesNotMatch(sensitiveFailure, /self-test-secret|stderr-secret|SERVICE_ROLE_KEY|ANON_KEY|API_URL/);
  assert.match(sensitiveFailure, /sensitive output omitted/i);

  const partiallyCreatedSales = new Set(["first-call-sale"]);
  await assert.rejects(
    runWithGuaranteedCleanup(
      async () => { throw new Error("second conversion failed"); },
      async () => { partiallyCreatedSales.clear(); },
    ),
    /second conversion failed/,
  );
  assert.equal(partiallyCreatedSales.size, 0, "Cleanup did not remove a partial success fixture.");

  let combinedFailure;
  try {
    await runWithGuaranteedCleanup(
      async () => { throw new Error("primary self-test failure"); },
      async () => { throw new Error("cleanup self-test failure"); },
    );
  } catch (error) {
    combinedFailure = error;
  }
  assert.ok(combinedFailure instanceof AggregateError);
  assert.match(combinedFailure.message, /verification failed and cleanup also failed/i);
  assert.match(combinedFailure.errors[0].message, /primary self-test failure/);
  assert.match(combinedFailure.errors[1].message, /cleanup self-test failure/);
  console.log("Quotation-to-Sale verifier self-tests passed.");
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

function buildSupabaseFailureMessage(arguments_, stdout, stderr, sensitiveOutput = false) {
  if (sensitiveOutput) {
    return `Supabase ${arguments_.join(" ")} failed (sensitive output omitted).`;
  }
  const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
  return `Supabase ${arguments_.join(" ")} failed.${detail ? `\n${detail}` : ""}`;
}

function runSupabase(arguments_, options = {}) {
  if (npxCli && !existsSync(npxCli)) {
    throw new Error(`Unable to locate the local npx runner at ${npxCli}.`);
  }
  const { sensitiveOutput = false, ...spawnOptions } = options;
  const result = spawnSync(
    npxCli ? process.execPath : "npx",
    npxCli
      ? [npxCli, "supabase", "--workdir", repositoryRoot, ...arguments_]
      : ["supabase", "--workdir", repositoryRoot, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      ...spawnOptions,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(buildSupabaseFailureMessage(
      arguments_, result.stdout, result.stderr, sensitiveOutput,
    ));
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

function runDockerSync(arguments_) {
  const result = spawnSync("docker", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Local Docker command failed: ${result.stderr?.trim() || "no diagnostic output"}`);
  }
  return result.stdout;
}

function validateLocalDatabaseContainer(databaseUrl) {
  const parsedDatabaseUrl = requireLoopbackUrl(
    databaseUrl,
    "Local Supabase database URL",
    ["postgres:", "postgresql:"],
  );
  const config = readFileSync(resolve(repositoryRoot, "supabase", "config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(config)?.[1];
  assert.ok(projectId, "Supabase config.toml does not contain a safe local project_id.");
  const containerName = `supabase_db_${projectId}`;
  const inspected = JSON.parse(runDockerSync(["inspect", containerName]))[0];
  assert.equal(inspected?.Name, `/${containerName}`, "Unexpected Supabase database container name.");
  assert.equal(inspected?.State?.Running, true, "Local Supabase database container is not running.");
  assert.match(inspected?.Config?.Image ?? "", /supabase\/postgres/i);
  const publishedPorts = inspected?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  assert.ok(
    publishedPorts.some(({ HostPort }) => HostPort === parsedDatabaseUrl.port),
    "Supabase database container is not published on the verified loopback database port.",
  );
  return containerName;
}

function runLocalPsql(containerName, sql) {
  return runDockerSync([
    "exec", containerName,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql,
  ]).trim();
}

async function holdQuotationLock(containerName, quotationId) {
  assert.match(quotationId, /^[0-9a-f-]{36}$/i, "Quotation lock ID must be a UUID.");
  const child = spawn(
    "docker",
    [
      "exec", "-i", containerName,
      "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt",
    ],
    { cwd: repositoryRoot, stdio: ["pipe", "pipe", "pipe"], shell: false },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitPromise = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`Local quotation lock session exited ${code}: ${stderr.trim()}`));
    });
  });
  child.stdin.write([
    "begin;",
    `select id from public.quotation_requests where id='${quotationId}'::uuid for update;`,
    "select 'Q2S9_LOCK_READY:'||pg_backend_pid();",
    "",
  ].join("\n"));
  const readyPromise = new Promise((resolveReady, rejectReady) => {
    const inspectOutput = () => {
      if (stdout.includes("Q2S9_LOCK_READY")) resolveReady();
    };
    child.stdout.on("data", inspectOutput);
    child.once("close", (code) => {
      if (!stdout.includes("Q2S9_LOCK_READY")) {
        rejectReady(new Error(`Quotation lock session closed before acquiring the lock (${code}).`));
      }
    });
    child.once("error", rejectReady);
    inspectOutput();
  });
  let readyTimeout;
  try {
    await Promise.race([
      readyPromise,
      new Promise((_, reject) => {
        readyTimeout = setTimeout(
          () => reject(new Error("Timed out acquiring the local quotation contention lock.")),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(readyTimeout);
  }
  const holderPid = Number(/Q2S9_LOCK_READY:(\d+)/.exec(stdout)?.[1]);
  assert.ok(Number.isSafeInteger(holderPid) && holderPid > 0, "Local lock session did not report its backend PID.");
  return {
    async release() {
      if (child.stdin.writable) {
        child.stdin.end("commit;\n\\q\n");
      }
      await exitPromise;
    },
  };
}

async function waitForTwoConversionWaiters(containerName) {
  const waiterSql = [
    "select count(*)",
    "from pg_stat_activity",
    "where pid <> pg_backend_pid()",
    "and state = 'active'",
    "and wait_event_type = 'Lock'",
    "and cardinality(pg_blocking_pids(pid)) > 0",
    "and usename = 'authenticator'",
    "and application_name like 'PostgREST%'",
  ].join(" ");
  const deadline = Date.now() + 10_000;
  let observed = 0;
  while (Date.now() < deadline) {
    observed = Number(runLocalPsql(containerName, waiterSql));
    if (observed === 2) return observed;
    if (observed > 2) {
      throw new Error(`Expected exactly two blocked conversion calls, observed ${observed}.`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const activity = runLocalPsql(containerName, [
    "select pid||'|'||state||'|'||coalesce(wait_event_type,'')||'|'||coalesce(wait_event,'')",
    "||'|'||pg_blocking_pids(pid)::text||'|'||left(replace(query,E'\\n',' '),180)",
    "from pg_stat_activity where pid<>pg_backend_pid() and datname=current_database() order by pid",
  ].join(" "));
  throw new Error(`Expected two blocked conversion calls, observed ${observed}. Activity: ${activity}`);
}

async function cleanupRunOwnedData(client, context) {
  const { actorId, containerName, customerId, ids } = context;
  const errors = [];
  const attempt = async (label, operation, fallback = null) => {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result?.data ?? result ?? fallback;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : (error && typeof error === "object" && "message" in error)
          ? String(error.message)
          : JSON.stringify(error);
      errors.push(`${label}: ${message}`);
      return fallback;
    }
  };
  const selectIds = async (label, table, applyFilter) => {
    const rows = await attempt(label, async () => {
      let query = client.from(table).select("id");
      query = applyFilter(query);
      return query;
    }, []);
    return (rows ?? []).map(({ id }) => id);
  };
  const removeIds = async (table, column, values) => {
    if (!values.length) return;
    await attempt(`delete ${table}`, () => client.from(table).delete().in(column, values));
  };
  const removeExact = async (label, table, applyFilter) => {
    await attempt(label, () => applyFilter(client.from(table).delete()));
  };

  const discoveredSaleIds = actorId && customerId
    ? await selectIds("discover all run-owned Sales", "sales_orders", (query) => query
      .or(`created_by.eq.${actorId},customer_profile_id.eq.${customerId}`))
    : [];
  const saleIds = [...new Set(discoveredSaleIds)];
  const orderItemIds = await selectIds(
    "discover run-owned Sale items", "sales_order_items", (query) => query.in("order_id", saleIds),
  );
  const shipmentIds = await selectIds(
    "discover run-owned shipments", "shipments", (query) => query.in("order_id", saleIds),
  );
  const shipmentItemIds = await selectIds(
    "discover run-owned shipment items", "shipment_items", (query) => query.in("shipment_id", shipmentIds),
  );
  const stockOutRequestIds = await selectIds(
    "discover run-owned Stock Out requests", "sales_stock_out_requests", (query) => query.in("sales_order_id", saleIds),
  );
  const stockOutRequestItemIds = await selectIds(
    "discover run-owned Stock Out items", "sales_stock_out_request_items", (query) => query.in("request_id", stockOutRequestIds),
  );
  const stockOutRevisionIds = await selectIds(
    "discover run-owned Stock Out revisions", "sales_stock_out_request_revisions", (query) => query.in("request_id", stockOutRequestIds),
  );
  const stockOutReleaseIds = await selectIds(
    "discover run-owned Stock Out releases", "sales_stock_out_releases", (query) => query.in("sales_order_id", saleIds),
  );
  const stockOutReleaseItemIds = await selectIds(
    "discover run-owned Stock Out release items", "sales_stock_out_release_items", (query) => query.in("release_id", stockOutReleaseIds),
  );
  const packageIds = await selectIds(
    "discover run-owned packages", "order_packages", (query) => query.in("order_id", saleIds),
  );
  const allocationIds = await selectIds(
    "discover run-owned serial allocations", "order_serial_allocations", (query) => query.in("order_id", saleIds),
  );
  const paymentIds = await selectIds(
    "discover run-owned Sale payments", "sale_payments", (query) => query.in("order_id", saleIds),
  );
  const journalIds = actorId
    ? await selectIds("discover run-owned journals", "journal_entries", (query) => query.eq("created_by", actorId))
    : [];
  const movementIds = actorId
    ? await selectIds("discover run-owned inventory movements", "inventory_movements", (query) => query.eq("initiated_by", actorId))
    : [];
  const movementItemIds = await selectIds(
    "discover run-owned movement items", "inventory_movement_items", (query) => query.in("movement_id", movementIds),
  );
  const serialNumberIds = await selectIds(
    "discover run-owned serial numbers", "serial_numbers", (query) => query.eq("product_id", ids.product),
  );
  const cartIds = customerId
    ? await selectIds("discover run-owned carts", "shopping_carts", (query) => query.eq("profile_id", customerId))
    : [];

  await removeIds("delivery_location_updates", "shipment_id", shipmentIds);
  await removeIds("delivery_location_sessions", "shipment_id", shipmentIds);
  await removeIds("shipment_serials", "shipment_item_id", shipmentItemIds);
  await removeIds("shipment_documents", "shipment_id", shipmentIds);
  await removeIds("shipment_documents", "order_id", saleIds);
  await removeIds("shipment_route_points", "shipment_id", shipmentIds);
  await removeIds("shipment_tracking_events", "shipment_id", shipmentIds);
  await removeIds("shipment_tracking_events", "order_id", saleIds);
  await removeIds("shipment_packages", "shipment_id", shipmentIds);
  await removeIds("shipment_items", "shipment_id", shipmentIds);
  await removeIds("shipments", "id", shipmentIds);

  if (saleIds.length) {
    for (const value of saleIds) assert.match(value, /^[0-9a-f-]{36}$/i, "Run-owned Sale ID must be a UUID.");
    const saleIdArray = `array[${saleIds.map((value) => `'${value}'::uuid`).join(",")}]`;
    await attempt("delete run-owned RMA return serials", () => runLocalPsql(containerName,
      `delete from public.rma_return_receipt_serials where return_receipt_id in (select id from public.rma_return_receipts where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA return receipts", () => runLocalPsql(containerName,
      `delete from public.rma_return_receipts where sales_order_id=any(${saleIdArray})`));
    await attempt("clear run-owned serial RMA links", () => runLocalPsql(containerName,
      `update public.serial_numbers set active_rma_claim_id=null where product_id='${ids.product}'::uuid and active_rma_claim_id in (select id from public.rma_claims where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA events", () => runLocalPsql(containerName,
      `delete from public.rma_events where rma_claim_id in (select id from public.rma_claims where sales_order_id=any(${saleIdArray}))`));
    await attempt("delete run-owned RMA claims", () => runLocalPsql(containerName,
      `delete from public.rma_claims where sales_order_id=any(${saleIdArray})`));
    await attempt("delete run-owned warranties", () => runLocalPsql(containerName,
      `delete from public.warranty_coverages where sales_order_id=any(${saleIdArray})`));
  }

  await removeIds("sales_stock_out_release_serials", "release_item_id", stockOutReleaseItemIds);
  await removeIds("sales_stock_out_release_items", "release_id", stockOutReleaseIds);
  await removeIds("sales_stock_out_serial_changes", "request_item_id", stockOutRequestItemIds);
  await removeIds("sales_stock_out_request_revision_items", "revision_id", stockOutRevisionIds);
  await removeIds("sales_stock_out_releases", "id", stockOutReleaseIds);
  await removeIds("sales_stock_out_request_revisions", "id", stockOutRevisionIds);
  await removeIds("sales_stock_out_request_items", "id", stockOutRequestItemIds);
  await removeIds("sales_stock_out_requests", "id", stockOutRequestIds);

  await removeIds("order_packed_items", "package_id", packageIds);
  await removeIds("shipment_serials", "allocation_id", allocationIds);
  await removeIds("sales_stock_out_release_serials", "allocation_id", allocationIds);
  await removeIds("order_serial_allocations", "id", allocationIds);
  await removeIds("order_packages", "id", packageIds);

  await removeIds("cashbook_entries", "sale_payment_id", paymentIds);
  if (actorId) {
    await removeExact("delete run actor cashbook entries", "cashbook_entries", (query) => query.eq("created_by", actorId));
  }
  await removeIds("journal_lines", "journal_entry_id", journalIds);
  await removeIds("journal_entries", "id", journalIds);
  await removeIds("sale_payments", "id", paymentIds);
  await removeIds("payment_transactions", "order_id", saleIds);

  await removeIds("serial_number_history", "movement_id", movementIds);
  await removeIds("serial_tracking_events", "movement_id", movementIds);
  await removeIds("serial_number_history", "serial_number_id", serialNumberIds);
  await removeIds("serial_tracking_events", "serial_number_id", serialNumberIds);
  await removeIds("serial_numbers", "id", serialNumberIds);
  await removeIds("sales_stock_out_release_items", "inventory_movement_item_id", movementItemIds);
  await removeIds("inventory_movement_items", "id", movementItemIds);
  await removeIds("inventory_movements", "id", movementIds);
  await removeExact("delete run-owned serial batches", "serial_generation_batches", (query) => query.eq("product_id", ids.product));

  await removeIds("inventory_reservations", "order_id", saleIds);
  await removeIds("sale_documents", "order_id", saleIds);
  await removeIds("sale_price_adjustments", "order_id", saleIds);
  await removeIds("order_status_events", "order_id", saleIds);
  await removeIds("shopping_cart_items", "cart_id", cartIds);
  await removeIds("shopping_carts", "id", cartIds);

  await attempt("clear run quotation links", () => client.from("quotation_requests")
    .update({ converted_order_id: null, converted_invoice_id: null })
    .eq("id", ids.quotation));
  await removeIds("sales_order_items", "id", orderItemIds);
  await removeIds("sales_orders", "id", saleIds);

  await removeExact("delete run quotation audits", "audit_logs", (query) => query
    .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
  if (actorId) {
    await removeExact("delete run actor audits", "audit_logs", (query) => query.eq("actor_id", actorId));
    await removeExact("delete audits targeting run actor", "audit_logs", (query) => query.eq("target_profile_id", actorId));
  }
  if (customerId) {
    await removeExact("delete audits targeting run customer", "audit_logs", (query) => query.eq("target_profile_id", customerId));
    await removeExact("delete run customer notifications", "customer_notifications", (query) => query.eq("profile_id", customerId));
  }
  await removeExact("delete run quotation notifications", "customer_notifications", (query) => query
    .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation));
  await removeExact("delete run quotation items", "quotation_request_items", (query) => query.eq("quotation_id", ids.quotation));
  await removeExact("delete run quotation", "quotation_requests", (query) => query
    .eq("id", ids.quotation));

  await removeExact("delete run balance", "inventory_balances", (query) => query.eq("id", ids.balance));
  await removeExact("delete run address", "customer_addresses", (query) => query.eq("id", ids.address));
  await removeExact("delete run variation values", "variation_attribute_values", (query) => query.eq("variation_id", ids.variation));
  await removeExact("delete run product identifiers", "product_identifier_history", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product revisions", "product_revisions", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product media", "product_media", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product category assignments", "product_category_assignments", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product tag assignments", "product_tag_assignments", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product attributes", "product_attributes", (query) => query.eq("product_id", ids.product));
  await removeExact("delete run product-owned attributes", "attributes", (query) => query.eq("owner_product_id", ids.product));
  await removeExact("delete run variation", "product_variations", (query) => query.eq("id", ids.variation));
  await removeExact("delete run product", "products", (query) => query.eq("id", ids.product));
  await removeExact("delete run warehouse", "warehouses", (query) => query.eq("id", ids.warehouse));

  if (customerId) {
    await attempt("delete run customer auth user", () => client.auth.admin.deleteUser(customerId));
  }
  if (actorId) {
    await attempt("delete run actor auth user", () => client.auth.admin.deleteUser(actorId));
  }
  if (errors.length) {
    throw new Error(`Task 9 cleanup failed for ${errors.length} operation(s): ${errors.join("; ")}`);
  }
}

async function runConcurrentVerification(apiUrl, databaseUrl, serviceRoleKey) {
  const containerName = validateLocalDatabaseContainer(databaseUrl);
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
  const context = {
    actorId: null,
    containerName,
    customerId: null,
    ids,
  };

  await runWithGuaranteedCleanup(async () => {
    const actorResult = await client.auth.admin.createUser({
      email: `${prefix}-actor@local.test`,
      password: `${runId}Aa1!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Actor" },
    });
    assert.ifError(actorResult.error);
    context.actorId = actorResult.data.user.id;
    const customerResult = await client.auth.admin.createUser({
      email: `${prefix}-customer@local.test`,
      password: `${runId}Bb2!`,
      email_confirm: true,
      user_metadata: { full_name: "Quotation Sale Concurrency Customer" },
    });
    assert.ifError(customerResult.error);
    context.customerId = customerResult.data.user.id;
    const { actorId, customerId } = context;

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
    const addressSnapshot = {
      recipient_name: `${prefix} Customer`, phone: "01700000009", alternate_phone: "01800000009",
      address_line_1: "Concurrency Road 9", address_line_2: "Concurrency Floor 9",
      area: "Task 9 Area", city: "Dhaka", region: "Dhaka Division", postal_code: "1209",
      country_code: "BD", delivery_instructions: "Concurrency delivery instructions",
      map_label: "Concurrency map label",
    };
    await expectNoError(client.from("customer_addresses").insert({
      id: ids.address, profile_id: customerId, ...addressSnapshot,
      created_by: actorId, updated_by: actorId,
    }), "address fixture");
    await expectNoError(client.from("quotation_requests").insert({
      id: ids.quotation, reference: `Q2S9-${runId.slice(0, 12)}`, profile_id: customerId,
      created_by: actorId, status: "accepted", subject: `${prefix} accepted quotation`,
      currency: "BDT", shipping_address_id: ids.address, billing_address_id: ids.address,
      shipping_address_snapshot: addressSnapshot, billing_address_snapshot: addressSnapshot,
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

    const lock = await holdQuotationLock(containerName, ids.quotation);
    const concurrentCalls = [
      Promise.resolve(client.rpc("create_sale_from_quotation", rpcArguments)),
      Promise.resolve(client.rpc("create_sale_from_quotation", rpcArguments)),
    ];
    let barrierError;
    let releaseError;
    try {
      const waiterCount = await waitForTwoConversionWaiters(containerName);
      assert.equal(waiterCount, 2, "The PostgreSQL contention barrier did not observe both conversion calls.");
      console.log("PostgreSQL contention barrier observed exactly two blocked conversion RPCs before release.");
    } catch (error) {
      barrierError = error;
    }
    try {
      await lock.release();
    } catch (error) {
      releaseError = error;
    }
    const settledCalls = await Promise.allSettled(concurrentCalls);
    for (const settled of settledCalls) {
      if (settled.status === "fulfilled" && settled.value.data?.sale_id) {
      }
    }
    const concurrentCallErrors = settledCalls.flatMap((settled, index) => {
      if (settled.status === "rejected") {
        return [new Error(`Concurrent RPC ${index + 1} rejected: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`)];
      }
      if (settled.value.error) {
        return [new Error(`Concurrent RPC ${index + 1} failed: ${settled.value.error.message}`)];
      }
      return [];
    });
    if (barrierError && releaseError) {
      throw new AggregateError([barrierError, releaseError, ...concurrentCallErrors], "Contention barrier and lock release both failed.");
    }
    if (barrierError && concurrentCallErrors.length) {
      throw new AggregateError([barrierError, ...concurrentCallErrors], "Contention barrier and concurrent RPCs failed.");
    }
    if (barrierError) throw barrierError;
    if (releaseError) throw releaseError;
    assert.ok(settledCalls.every(({ status }) => status === "fulfilled"), "A concurrent HTTP call rejected.");
    const [first, second] = settledCalls.map(({ value }) => value);
    assert.ifError(first.error);
    assert.ifError(second.error);
    assert.equal(first.data.sale_id, second.data.sale_id, "Concurrent calls must resolve to one Sale.");
    assert.equal(first.data.order_number, second.data.order_number, "Concurrent calls must resolve to one Sale number.");
    assert.deepEqual([first.data.existing, second.data.existing].sort(), [false, true]);
    const convertedSaleId = first.data.sale_id;

    const retry = await client.rpc("create_sale_from_quotation", rpcArguments);
    assert.ifError(retry.error);
    assert.equal(retry.data.sale_id, convertedSaleId);
    assert.equal(retry.data.existing, true);

    assert.equal(await countRows(client, "sales_orders", (query) => query
      .or(`created_by.eq.${actorId},customer_profile_id.eq.${customerId}`)), 1, "Run ownership query found a duplicate converted Sale.");
    assert.equal(await countRows(client, "sales_order_items", (query) => query.eq("order_id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "audit_logs", (query) => query
      .eq("entity_type", "quotation_request").eq("entity_id", ids.quotation)
      .eq("action", "quotation.converted_to_sale")), 1);
    assert.equal(await countRows(client, "order_status_events", (query) => query
      .eq("order_id", convertedSaleId).ilike("note", "Draft Sale created from accepted quotation%")), 1);
    assert.equal(await countRows(client, "quotation_requests", (query) => query
      .eq("id", ids.quotation).eq("converted_order_id", convertedSaleId)), 1);
    assert.equal(await countRows(client, "inventory_reservations", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_documents", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sale_payments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "sales_stock_out_requests", (query) => query.eq("sales_order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "shipments", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "payment_transactions", (query) => query.eq("order_id", convertedSaleId)), 0);
    assert.equal(await countRows(client, "inventory_movements", (query) => query.eq("initiated_by", actorId)), 0);

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
    const manualSaleId = manual.data;
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);
    await expectNoError(client.rpc("confirm_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
    }), "manual Sale confirmation");
    const activeReservation = await client.from("inventory_reservations")
      .select("product_id,variation_id,warehouse_id,quantity,status")
      .eq("order_id", manualSaleId).eq("status", "active").single();
    assert.ifError(activeReservation.error);
    assert.deepEqual(
      { ...activeReservation.data, quantity: Number(activeReservation.data.quantity) },
      {
        product_id: ids.product, variation_id: ids.variation, warehouse_id: ids.warehouse,
        quantity: 1, status: "active",
      },
    );
    const reservedAfterConfirmation = await client.from("inventory_balances")
      .select("reserved").eq("id", ids.balance).single();
    assert.ifError(reservedAfterConfirmation.error);
    assert.equal(Number(reservedAfterConfirmation.data.reserved), 1);
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);

    await expectNoError(client.rpc("cancel_sales_order", {
      actor_profile_id: actorId, requested_order_id: manualSaleId,
      requested_reason: "Task 9 rollback-only manual workflow verification",
    }), "manual Sale cancellation");
    const manualOrder = await client.from("sales_orders").select("status").eq("id", manualSaleId).single();
    assert.ifError(manualOrder.error);
    assert.equal(manualOrder.data.status, "cancelled");
    assert.equal(await countRows(client, "inventory_reservations", (query) => query
      .eq("order_id", manualSaleId).eq("status", "cancelled")), 1);
    const reservedAfterCancellation = await client.from("inventory_balances")
      .select("reserved").eq("id", ids.balance).single();
    assert.ifError(reservedAfterCancellation.error);
    assert.equal(Number(reservedAfterCancellation.data.reserved), 0);
    assert.equal(await countRows(client, "quotation_requests", (query) => query.eq("converted_order_id", manualSaleId)), 0);
  }, async () => cleanupRunOwnedData(client, context));
}

if (process.argv.includes("--self-test")) {
  await runVerifierSelfTests();
  process.exit(0);
}

checkRequestedUrlsBeforeStatus();
const status = parseStatusEnvironment(runSupabase(
  ["status", "-o", "env"],
  { sensitiveOutput: true },
));
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
await runConcurrentVerification(apiUrl, databaseUrl, serviceRoleKey);

console.log("Quotation-to-Sale database verification passed: migration application, rollback, permissions, exact transfer, zero premature side effects, retry, concurrency, and manual Sales workflow.");
