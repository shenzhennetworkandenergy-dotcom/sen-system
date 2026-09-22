import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.SALES_MONEY_RECEIPT_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SALES_MONEY_RECEIPT_TEST_DATABASE_URL is required for the rollback-only Money Receipt database verification.",
  );
}

const databaseUrl = new URL(connectionString);
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !localHosts.has(databaseUrl.hostname) ||
  !/(?:test|receipt|local|dev)/i.test(databaseName)
) {
  throw new Error(
    "Money Receipt database verification is restricted to an explicitly named local test database.",
  );
}

const fixture = await readFile(
  new URL("../supabase/tests/sales_money_receipt.sql", import.meta.url),
  "utf8",
);
if (!/^\s*--[^\n]*\n\s*begin;/i.test(fixture) || !/rollback;\s*$/i.test(fixture)) {
  throw new Error("Money Receipt database verification must remain rollback-only.");
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(fixture);
  console.log("Sales money receipt rollback-only database verification passed.");

  // The browser/server application uses the controlled generator RPC.  Keep
  // generic table writes closed for every API role, even if an older local
  // schema granted broad service_role privileges before this migration.
  const privileges = await client.query(`
    select
      has_table_privilege('service_role','public.sale_money_receipts','insert') as service_insert,
      has_table_privilege('service_role','public.sale_money_receipts','update') as service_update,
      has_table_privilege('service_role','public.sale_money_receipts','delete') as service_delete,
      has_table_privilege('service_role','public.sale_money_receipts','truncate') as service_truncate,
      has_table_privilege('anon','public.sale_money_receipts','insert') as anon_insert,
      has_table_privilege('anon','public.sale_money_receipts','update') as anon_update,
      has_table_privilege('anon','public.sale_money_receipts','delete') as anon_delete,
      has_table_privilege('anon','public.sale_money_receipts','truncate') as anon_truncate,
      has_table_privilege('authenticated','public.sale_money_receipts','insert') as authenticated_insert,
      has_table_privilege('authenticated','public.sale_money_receipts','update') as authenticated_update,
      has_table_privilege('authenticated','public.sale_money_receipts','delete') as authenticated_delete,
      has_table_privilege('authenticated','public.sale_money_receipts','truncate') as authenticated_truncate,
      has_function_privilege('service_role','public.next_sale_money_receipt_number()','execute') as service_number_execute,
      has_function_privilege('service_role','public.sale_money_receipt_amount_in_words(numeric,text)','execute') as service_words_execute,
      has_function_privilege('service_role','public.build_sale_money_receipt_snapshot(uuid,uuid,text,date,timestamptz)','execute') as service_builder_execute,
      has_function_privilege('service_role','public.generate_sale_money_receipt(uuid,uuid)','execute') as service_generator_execute,
      has_sequence_privilege('service_role','public.sale_money_receipt_number_seq','select') as service_sequence_select,
      has_sequence_privilege('service_role','public.sale_money_receipt_number_seq','update') as service_sequence_update,
      has_sequence_privilege('service_role','public.sale_money_receipt_number_seq','usage') as service_sequence_usage,
      has_sequence_privilege('anon','public.sale_money_receipt_number_seq','select') as anon_sequence_select,
      has_sequence_privilege('anon','public.sale_money_receipt_number_seq','update') as anon_sequence_update,
      has_sequence_privilege('anon','public.sale_money_receipt_number_seq','usage') as anon_sequence_usage,
      has_sequence_privilege('authenticated','public.sale_money_receipt_number_seq','select') as authenticated_sequence_select,
      has_sequence_privilege('authenticated','public.sale_money_receipt_number_seq','update') as authenticated_sequence_update,
      has_sequence_privilege('authenticated','public.sale_money_receipt_number_seq','usage') as authenticated_sequence_usage
  `);
  const privilegeRow = privileges.rows[0];
  for (const key of [
    "service_insert",
    "service_update",
    "service_delete",
    "service_truncate",
    "anon_insert",
    "anon_update",
    "anon_delete",
    "anon_truncate",
    "authenticated_insert",
    "authenticated_update",
    "authenticated_delete",
    "authenticated_truncate",
    "service_number_execute",
    "service_words_execute",
    "service_builder_execute",
    "service_sequence_select",
    "service_sequence_update",
    "service_sequence_usage",
    "anon_sequence_select",
    "anon_sequence_update",
    "anon_sequence_usage",
    "authenticated_sequence_select",
    "authenticated_sequence_update",
    "authenticated_sequence_usage",
  ]) {
    if (privilegeRow[key]) {
      throw new Error(`Unexpected Money Receipt application privilege remains enabled: ${key}`);
    }
  }
  if (!privilegeRow.service_generator_execute) {
    throw new Error("The controlled Money Receipt generator RPC is not executable by service_role");
  }

  for (const role of ["service_role", "authenticated"]) {
    for (const [operation, statement] of [
      [
        "insert",
        `insert into public.sale_money_receipts(
          id,payment_id,order_id,receipt_number,receipt_date,snapshot,generated_by
        ) values(
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003',
          'SEN-MR-20990101-99999',current_date,
          jsonb_build_object(
            'payment',jsonb_build_object('amount',999),
            'customer',jsonb_build_object('full_name','FORGED'),
            'summary',jsonb_build_object('remaining',999999),
            'amount_in_words','FORGED WORDS'
          ),
          '00000000-0000-0000-0000-000000000004'
        )`,
      ],
      ["update", "update public.sale_money_receipts set snapshot='{}'::jsonb where false"],
      ["delete", "delete from public.sale_money_receipts where false"],
    ]) {
      let denied = false;
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        await client.query(statement);
      } catch (error) {
        denied = true;
        if (error?.code !== "42501") {
          throw new Error(`${role} ${operation} failed with unexpected error: ${error?.message ?? error}`);
        }
      } finally {
        await client.query("rollback").catch(() => undefined);
      }
      if (!denied) {
        throw new Error(`${role} ${operation} unexpectedly succeeded against immutable Money Receipts`);
      }
    }
  }

  // Exercise the trigger guard independently of ACLs: this protects the
  // boundary if a generated/native schema happens to re-grant INSERT later.
  let guardRejected = false;
  await client.query("begin");
  try {
    await client.query("grant insert on public.sale_money_receipts to service_role");
    await client.query("set local role service_role");
    await client.query(`insert into public.sale_money_receipts(
      id,payment_id,order_id,receipt_number,receipt_date,snapshot,generated_by
    ) values(
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000013',
      'SEN-MR-20990101-99999',current_date,'{}'::jsonb,
      '00000000-0000-0000-0000-000000000014'
    )`);
  } catch (error) {
    if (error?.code !== "P0001" || !/controlled generator/i.test(error?.message ?? "")) {
      throw new Error(`Unexpected controlled-writer guard response: ${error?.message ?? error}`);
    }
    guardRejected = true;
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
  if (!guardRejected) {
    throw new Error("A direct service_role Money Receipt insert bypassed the controlled-writer guard");
  }
  console.log("Sales money receipt application-role write boundary passed.");

  // Two simultaneous retries against an already-issued payment must converge
  // on the same immutable row.  This exercises the RPC's lock/unique-conflict
  // path without creating a new business transaction in the local database.
  const existingReceipt = (await client.query(`
    select payment_id,generated_by
    from public.sale_money_receipts
    order by created_at,id
    limit 1
  `)).rows[0];
  if (existingReceipt) {
    const callGenerator = async () => {
      const concurrentClient = new pg.Client({ connectionString });
      await concurrentClient.connect();
      try {
        await concurrentClient.query("begin");
        await concurrentClient.query("set local role service_role");
        await concurrentClient.query("select set_config('request.jwt.claim.role','service_role',true)");
        const result = await concurrentClient.query(
          "select public.generate_sale_money_receipt($1,$2) as id",
          [existingReceipt.generated_by, existingReceipt.payment_id],
        );
        await concurrentClient.query("commit");
        return result.rows[0].id;
      } catch (error) {
        await concurrentClient.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        await concurrentClient.end();
      }
    };
    const [firstId, secondId] = await Promise.all([callGenerator(), callGenerator()]);
    const count = (await client.query(
      "select count(*)::int as count from public.sale_money_receipts where payment_id=$1",
      [existingReceipt.payment_id],
    )).rows[0].count;
    if (firstId !== secondId || count !== 1) {
      throw new Error("Concurrent Money Receipt generation did not converge to one receipt");
    }
    console.log("Sales money receipt concurrent idempotency check passed.");
  } else {
    console.log("Sales money receipt concurrent idempotency check skipped: no local receipt fixture row.");
  }
} finally {
  await client.end();
}
