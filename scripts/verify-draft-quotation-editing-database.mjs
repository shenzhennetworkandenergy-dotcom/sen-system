import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../../../node_modules/pg/lib/index.js";

const { Client } = pg;
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const migrationPaths = [
  "supabase/migrations/202608230003_quotation_view_own.sql",
  "supabase/migrations/202608230004_quotation_to_sale.sql",
  "supabase/migrations/202608250002_draft_quotation_editing.sql",
];
const behaviorPath = "supabase/tests/draft_quotation_editing.sql";

function requireLocalDatabaseUrl(value) {
  assert.ok(value, "DRAFT_QUOTATION_DATABASE_URL is required for the local-only verifier.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DRAFT_QUOTATION_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("DRAFT_QUOTATION_DATABASE_URL must use postgres or postgresql.");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowedHosts.has(hostname)) {
    throw new Error(`Refused non-local database host ${parsed.hostname}.`);
  }
  const routedParameter = [...parsed.searchParams.keys()].find((key) => (
    ["host", "hostaddr"].includes(key.toLowerCase())
  ));
  if (routedParameter) {
    throw new Error(`Refused libpq connection-routing parameter ${routedParameter}.`);
  }
  return parsed;
}

function migrationWithinOuterTransaction(source) {
  return source
    .replace(/\bbegin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "");
}

async function runSelfTest() {
  for (const value of [
    "postgresql://postgres:postgres@example.com:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres?host=example.com",
    "postgresql://postgres:postgres@localhost:5432/postgres?hostaddr=203.0.113.1",
  ]) {
    assert.throws(() => requireLocalDatabaseUrl(value), /refused/i);
  }
  assert.equal(
    requireLocalDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:5432/postgres").hostname,
    "127.0.0.1",
  );
  console.log("Draft quotation local-host guard self-test passed.");
}

if (process.argv.includes("--self-test")) {
  await runSelfTest();
  process.exit(0);
}

const databaseUrl = process.env.DRAFT_QUOTATION_DATABASE_URL;
requireLocalDatabaseUrl(databaseUrl);
const [migrations, behaviorSql] = await Promise.all([
  Promise.all(migrationPaths.map(async (path) => ({
    path,
    source: migrationWithinOuterTransaction(await readFile(resolve(repositoryRoot, path), "utf8")),
  }))),
  readFile(resolve(repositoryRoot, behaviorPath), "utf8"),
]);
const client = new Client({ connectionString: databaseUrl, statement_timeout: 15_000 });
let began = false;
try {
  await client.connect();
  await client.query("begin");
  began = true;
  for (const migration of migrations) {
    await client.query(migration.source);
  }
  await client.query(behaviorSql);
  console.log("Draft quotation local database behavior passed inside one rollback-only transaction.");
} finally {
  if (began) await client.query("rollback");
  await client.end();
}
