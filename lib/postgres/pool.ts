import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { localDatabaseConfig } from "@/lib/backend/config";

let pool: Pool | null = null;

function localPool() {
  if (!pool) {
    const config = localDatabaseConfig();
    pool = new Pool({
      connectionString: config.databaseUrl.toString(),
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "sen-native",
    });
  }
  return pool;
}

export async function queryLocal<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return localPool().query<T>(text, values);
}

export async function withLocalTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await localPool().connect();
  try {
    await client.query("begin");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeLocalPool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
