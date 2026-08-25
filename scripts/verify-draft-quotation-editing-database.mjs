import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../../../node_modules/pg/lib/index.js";
const { Client } = pg;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const timeout = 12_000;
const migrations = ["202608230003_quotation_view_own.sql", "202608230004_quotation_to_sale.sql", "202608250002_draft_quotation_editing.sql"];
const libpqRoutingVariables = ["PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGSSLMODE", "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT", "PGREQUIRESSL", "PGCHANNELBINDING", "PGTARGETSESSIONATTRS", "PGOPTIONS"];

function sanitizeLibpqEnvironment(environment) {
  for (const name of libpqRoutingVariables) delete environment[name];
  return environment;
}
// pg and psql both honour ambient libpq variables.  Clear them before any
// client is created so the explicit loopback URL is the sole routing source.
sanitizeLibpqEnvironment(process.env);

function localUrl(value) {
  assert.ok(value, "DRAFT_QUOTATION_DATABASE_URL is required for the local-only verifier.");
  let url; try { url = new URL(value); } catch { throw new Error("DRAFT_QUOTATION_DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) throw new Error("DRAFT_QUOTATION_DATABASE_URL must use postgres or postgresql.");
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname.replace(/^\[|\]$/g, "").toLowerCase())) throw new Error(`Refused non-local database host ${url.hostname}.`);
  if ([...url.searchParams].some(([key]) => ["host", "hostaddr"].includes(key.toLowerCase()))) throw new Error("Refused libpq connection-routing parameter.");
  return url;
}
function deadline(promise, label, ms = timeout) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms); })]).finally(() => clearTimeout(timer)); }
async function boundedEnd(client, label = "Client end", ms = 5000) {
  if (!client) return;
  const ending = Promise.resolve().then(() => client.end());
  try { await deadline(ending, label, ms); }
  catch {
    // A stuck socket must not keep a failed verifier alive. pg exposes this
    // stream on its client connection; destroying it makes end settle without
    // waiting on a remote peer.
    client.connection?.stream?.destroy();
    await deadline(ending.catch(() => {}), `${label} after socket destroy`, ms).catch(() => {});
  }
}
async function rollback(client, cleanupMs = 5000) { if (!client) return; try { await deadline(client.query("rollback"), "Rollback", cleanupMs); } catch {} await boundedEnd(client, "Client end", cleanupMs); }
async function lockProtocol({ wait, release, update, cancel = async () => {}, timeoutMs = 5000 }) {
  try { await deadline(wait(), "Waiting for the second database session to block", timeoutMs); await deadline(release(), "Releasing the row lock", timeoutMs); return await deadline(update(), "Completing the blocked Draft update", timeoutMs); }
  catch (error) { await deadline(Promise.resolve(cancel()), "Cancelling lock probe", timeoutMs).catch(() => {}); throw error; }
}
function migrationSql(source) { return source.replace(/\bbegin;\s*/i, "").replace(/\s*commit;\s*$/i, ""); }
function assertDisposableIdentity(row, expectedDataDirectory) {
  assert.ok(["127.0.0.1", "::1"].includes(row.address.split("/")[0]), `Disposable server was not loopback (${row.address}).`);
  assert.equal(resolve(row.data_directory), resolve(expectedDataDirectory), "Disposable server data directory did not match the newly initialized cluster.");
}
async function verifyDisposableIdentity(url, expectedDataDirectory) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000 });
  try { await client.connect(); assertDisposableIdentity((await client.query("select inet_server_addr()::text as address,current_setting('data_directory') as data_directory")).rows[0], expectedDataDirectory); }
  finally { await boundedEnd(client); }
}

async function behavior(url, applyMigrations) {
  const client = new Client({ connectionString: url, statement_timeout: timeout }); let began = false;
  try { await client.connect(); await client.query("begin; select set_config('request.jwt.claim.role','service_role',true); select set_config('sen.actor_role','service_role',true)"); began = true;
    if (applyMigrations) for (const name of migrations) await client.query(migrationSql(await readFile(resolve(root, "supabase/migrations", name), "utf8")));
    await client.query(await readFile(resolve(root, "supabase/tests/draft_quotation_editing.sql"), "utf8"));
  } finally { if (began) await deadline(client.query("rollback"), "Behavior rollback", 5000).catch(() => {}); await boundedEnd(client); }
}

async function lockProbe(url) {
  const control = new Client({ connectionString: url });
  const holder = new Client({ connectionString: url, application_name: "dqe-lock-holder", statement_timeout: 5000 });
  const updater = new Client({ connectionString: url, application_name: "dqe-lock-updater", statement_timeout: 5000 });
  const observer = new Client({ connectionString: url });
  const ids = Object.fromEntries(["admin", "actor", "customer", "product", "quote"].map((name) => [name, crypto.randomUUID()]));
  const stamp = ids.quote.replaceAll("-", "").slice(0, 12); let stopPolling = false;
  try { await Promise.all([control.connect(), holder.connect(), updater.connect(), observer.connect()]); await Promise.all([control, holder, updater, observer].map((client) => client.query("select set_config('request.jwt.claim.role','service_role',false); select set_config('sen.actor_role','service_role',false)")));
    for (const [id, email] of [[ids.admin, `dqe-admin-${stamp}@local.test`], [ids.actor, `dqe-actor-${stamp}@local.test`], [ids.customer, `dqe-customer-${stamp}@local.test`]]) await control.query("insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'offline',now(),'{}','{}',now(),now())", [id, email]);
    await control.query("insert into public.profiles(id,email,full_name,role,status) values($1,$2,'Lock admin','admin','active'),($3,$4,'Lock actor','employee','active'),($5,$6,'Lock customer','customer','active')", [ids.admin, `dqe-admin-${stamp}@local.test`, ids.actor, `dqe-actor-${stamp}@local.test`, ids.customer, `dqe-customer-${stamp}@local.test`]); await control.query("update public.profiles set phone='01700000009' where id=$1", [ids.customer]);
    await control.query("insert into public.profile_permission_overrides(profile_id,permission_id,effect,reason,assigned_by,is_active) select $1,id,'allow','Draft lock verifier',$2,true from public.permissions where key in ('quotations.edit','quotations.view_own')", [ids.actor, ids.admin]);
    const permissionRows = (await control.query("select permission_key from public.effective_permissions_for_profile($1) where permission_key in ('quotations.edit','quotations.view_own') order by permission_key", [ids.actor])).rows;
    assert.deepEqual(permissionRows.map((row) => row.permission_key), ["quotations.edit", "quotations.view_own"], "Lock-probe actor did not receive the required effective permissions.");
    await control.query("insert into public.products(id,name,slug,sku,product_type,status,regular_price,sale_price,currency,manage_stock,serial_tracking_required,public_catalogue_visible,created_by,updated_by) values($1,'Lock product',$2,$3,'simple','active',10,10,'BDT',false,false,true,$4,$4)", [ids.product, `dqe-${stamp}`, `DQE-${stamp}`, ids.admin]);
    await control.query("insert into public.quotation_requests(id,reference,profile_id,created_by,status,subject,currency) values($1,$2,$3,$4,'draft','Lock quote','BDT')", [ids.quote, `DQE-${stamp}`, ids.customer, ids.actor]); await control.query("insert into public.quotation_request_items(quotation_id,product_id,product_name_snapshot,sku_snapshot,quantity,target_price,unit_price,discount_amount,tax_amount,currency) values($1,$2,'Lock product',$3,1,10,10,0,0,'BDT')", [ids.quote, ids.product, `DQE-${stamp}`]); await control.query("select public.refresh_quotation_totals($1)", [ids.quote]);
    const lockContext = (await updater.query("select current_setting('request.jwt.claim.role',true) as request_role,current_setting('sen.actor_role',true) as actor_role")).rows[0];
    assert.deepEqual(lockContext, { request_role: "service_role", actor_role: "service_role" }, "Lock-probe updater did not retain service-role request context.");
    const expected = (await control.query("select updated_at::text as updated_at from public.quotation_requests where id=$1", [ids.quote])).rows[0].updated_at;
    await holder.query("begin"); await holder.query("select id from public.quotation_requests where id=$1 for update", [ids.quote]);
    const update = updater.query("select public.update_draft_quotation($1,$2,$3,'Locked update',null,null,null,null,null,null,null,null,null,0,0,$4) as id", [ids.actor, ids.quote, expected, JSON.stringify([{ product_id: ids.product, quantity: 1, unit_price: 10, discount_amount: 0, tax_amount: 0 }])]);
    const result = await lockProtocol({ wait: async () => { while (!stopPolling) { const rows = (await observer.query("select wait_event_type from pg_stat_activity where datname=current_database() and application_name='dqe-lock-updater'")).rows; if (rows.some((row) => row.wait_event_type === "Lock")) return; await new Promise((done) => setTimeout(done, 50)); } throw new Error("Lock polling cancelled."); }, release: () => holder.query("commit"), update: () => update, cancel: async () => { stopPolling = true; await rollback(holder); await boundedEnd(updater); } });
    assert.equal(result.rows[0].id, ids.quote); console.log("Two-session FOR UPDATE lock boundary passed.");
  } finally { stopPolling = true; await Promise.all([holder, updater, observer, control].map(rollback)); }
}

async function disposable() {
  const bin = process.env.DRAFT_QUOTATION_POSTGRES_BIN || "C:\\Program Files\\PostgreSQL\\17\\bin"; const initdb = join(bin, "initdb.exe"), postgres = join(bin, "postgres.exe"), psql = join(bin, "psql.exe"); if (!existsSync(initdb) || !existsSync(postgres) || !existsSync(psql)) throw new Error("Local PostgreSQL 17 binaries are unavailable.");
  const dir = await mkdtemp(join(tmpdir(), "dqe-pg-")); const port = await new Promise((resolvePort, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const portValue = server.address().port; server.close(() => resolvePort(portValue)); }); }); const url = `postgresql://postgres@127.0.0.1:${port}/postgres`; let server; let bootstrap;
  try { const init = spawnSync(initdb, ["-D", dir, "-A", "trust", "-U", "postgres", "--encoding=UTF8", "--locale=C", "--no-instructions"], { encoding: "utf8", timeout }); if (init.status !== 0) throw new Error(init.stderr); server = spawn(postgres, ["-D", dir, "-h", "127.0.0.1", "-p", String(port)], { stdio: "ignore", windowsHide: true });
    for (let i = 0; i < 100; i++) { let probe; try { probe = new Client({ connectionString: url, connectionTimeoutMillis: 100 }); await probe.connect(); await boundedEnd(probe); break; } catch { await boundedEnd(probe, "Startup probe end", 500).catch(() => {}); await new Promise((done) => setTimeout(done, 100)); if (i === 99) throw new Error("Disposable PostgreSQL did not start."); } }
    await verifyDisposableIdentity(url, dir);
    const schema = spawnSync(psql, [`--dbname=${url}`, "-v", "ON_ERROR_STOP=1", "-f", resolve(root, "database/native/schema.sql")], { encoding: "utf8", timeout }); if (schema.status !== 0) throw new Error(schema.stderr || schema.stdout); const seed = spawnSync(psql, [`--dbname=${url}`, "-v", "ON_ERROR_STOP=1", "-f", resolve(root, "database/native/seed.sql")], { encoding: "utf8", timeout }); if (seed.status !== 0) throw new Error(seed.stderr || seed.stdout); const auth = new Client({ connectionString: url }); try { await auth.connect(); await auth.query("create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz); insert into public.permissions(module_id,key,name,description,action,is_sensitive,sort_order,is_active) select id,'quotations.view_own','View own quotations','View only quotations created by this employee.','view_own',false,9,true from public.app_modules where key='quotations' on conflict(key) do nothing"); } finally { await boundedEnd(auth); } await behavior(url, false); await lockProbe(url); console.log("Disposable loopback PostgreSQL verification passed.");
  } finally { await bootstrap?.end().catch(() => {}); server?.kill(); await rm(dir, { recursive: true, force: true, maxRetries: 5 }); }
}

async function selfTest() { for (const value of ["postgresql://x@bad.example/postgres", "postgresql://x@127.0.0.1/postgres?host=bad.example"]) assert.throws(() => localUrl(value), /refused/i); const ambient = { PGHOST: "remote.example", PGHOSTADDR: "203.0.113.10", PGPORT: "5432", PGSERVICE: "unsafe", KEEP: "yes" }; sanitizeLibpqEnvironment(ambient); assert.deepEqual(ambient, { KEEP: "yes" }); assertDisposableIdentity({ address: "127.0.0.1/32", data_directory: "C:\\dqe\\cluster" }, "C:\\dqe\\cluster"); assert.throws(() => assertDisposableIdentity({ address: "192.0.2.10/32", data_directory: "C:\\dqe\\cluster" }, "C:\\dqe\\cluster"), /not loopback/i); let released = false; assert.equal(await lockProtocol({ wait: async () => {}, release: async () => { released = true; }, update: async () => released ? "updated" : "bad" }), "updated"); let polling = true; let pollStopped = false; await assert.rejects(lockProtocol({ wait: async () => { while (polling) await new Promise((done) => setTimeout(done, 1)); pollStopped = true; throw new Error("cancelled"); }, release: async () => {}, update: async () => {}, cancel: async () => { polling = false; }, timeoutMs: 5 }), /Waiting for the second database session to block timed out/i); await deadline(new Promise((done) => setTimeout(done, 10)), "Self-test poll settle", 50); assert.ok(pollStopped, "Timed-out lock polling was not cancelled."); let destroyed = false; await rollback({ query: async () => {}, end: () => new Promise(() => {}), connection: { stream: { destroy: () => { destroyed = true; } } } }, 5); assert.ok(destroyed, "Timed-out client end did not destroy its socket."); console.log("Draft quotation local-host guard self-test passed."); console.log("Draft quotation libpq-routing sanitization self-test passed."); console.log("Draft quotation disposable identity self-test passed."); console.log("Draft quotation bounded cleanup self-test passed."); console.log("Draft quotation two-session lock self-test passed."); }
if (process.argv.includes("--self-test")) await selfTest(); else if (process.argv.includes("--disposable-local")) await disposable(); else { const url = process.env.DRAFT_QUOTATION_DATABASE_URL; localUrl(url); await behavior(url, true); console.log("Draft quotation local database behavior passed inside one rollback-only transaction."); }
