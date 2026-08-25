import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.RECEIVABLES_DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error(`Receivables verification refused non-local database host ${parsedDatabaseUrl.hostname}.`);
}

const client = new pg.Client({ connectionString: databaseUrl });
const query = (text, values = []) => client.query(text, values);
const one = async (text, values = []) => (await query(text, values)).rows[0];
let savepointCounter = 0;

async function expectDatabaseError(work, pattern) {
  const savepoint = `receivables_expected_failure_${++savepointCounter}`;
  await query(`savepoint ${savepoint}`);
  try {
    await work();
    assert.fail("Expected the database operation to fail.");
  } catch (error) {
    assert.match(String(error?.message ?? error), pattern);
  } finally {
    await query(`rollback to savepoint ${savepoint}`);
    await query(`release savepoint ${savepoint}`);
  }
}

async function createRequested(actorId, operationId, amount = 50000) {
  return (await one(`
    select public.create_receivable_account(
      $1::uuid,$2::uuid,'employee_loan'::text,'external_party'::text,null::uuid,$3::jsonb,
      $4::numeric,'BDT'::text,'other'::text,5::integer,10000::numeric,
      current_date::date,(current_date+interval '4 months')::date,'Rollback-only requested account test'::text
    ) id
  `, [actorId, operationId, JSON.stringify({
    party_type: "individual",
    display_name: "Receivables Test Borrower",
  }), amount])).id;
}

async function createOpening(actorId, operationId, outstanding = 80000) {
  return (await one(`
    select public.create_opening_receivable(
      $1::uuid,$2::uuid,'security_deposit'::text,'external_party'::text,null::uuid,$3::jsonb,
      200000::numeric,$4::numeric,$5::numeric,(current_date-interval '1 day')::date,
      'BDT'::text,'other'::text,8::integer,10000::numeric,current_date::date,
      (current_date+interval '7 months')::date,'Rollback-only opening balance test'::text
    ) id
  `, [actorId, operationId, JSON.stringify({
    party_type: "company",
    display_name: "Receivables Test Landlord",
  }), 200000 - outstanding, outstanding])).id;
}

await client.connect();
try {
  const capabilities = await one(`
    select
      to_regclass('public.receivable_accounts') is not null as accounts,
      to_regclass('public.receivable_transactions') is not null as transactions,
      to_regclass('public.receivables_overview_v') is not null as overview,
      to_regprocedure('public.create_receivable_account(uuid,uuid,text,text,uuid,jsonb,numeric,text,text,integer,numeric,date,date,text)') is not null as create_account,
      to_regprocedure('public.create_opening_receivable(uuid,uuid,text,text,uuid,jsonb,numeric,numeric,numeric,date,text,text,integer,numeric,date,date,text)') is not null as create_opening
  `);
  assert.deepEqual(capabilities, {
    accounts: true,
    transactions: true,
    overview: true,
    create_account: true,
    create_opening: true,
  }, "Apply the additive Receivables migration to the local database before verification.");

  await query("begin");
  await query("select set_config('request.jwt.claim.role','service_role',true)");

  const fixture = {
    admin: randomUUID(),
    employee: randomUUID(),
    customer: randomUUID(),
    sale: randomUUID(),
    payment: randomUUID(),
    invoice: randomUUID(),
  };
  const stamp = fixture.admin.slice(0, 8);

  await query(`insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
    ($1,$2,jsonb_build_object('full_name','Receivables Test Admin'),now(),now()),
    ($3,$4,jsonb_build_object('full_name','Receivables Test Employee'),now(),now()),
    ($5,$6,jsonb_build_object('full_name','Receivables Test Customer'),now(),now())`, [
    fixture.admin, `receivables-admin-${stamp}@local.test`,
    fixture.employee, `receivables-employee-${stamp}@local.test`,
    fixture.customer, `receivables-customer-${stamp}@local.test`,
  ]);
  await query(`update public.profiles
    set role=case
      when id=$1 then 'admin'::public.account_role
      when id=$2 then 'employee'::public.account_role
      else 'customer'::public.account_role
    end,
    status='active'
    where id=any($3::uuid[])`, [
    fixture.admin, fixture.employee, [fixture.admin, fixture.employee, fixture.customer],
  ]);

  const receivablesPermissions = await one(`
    select count(*)::integer count
    from public.permissions where key=any($1::text[])
  `, [[
    "receivables.view",
    "receivables.view_customer",
    "receivables.view_loans",
    "receivables.create",
    "receivables.manage_opening",
  ]]);
  assert.equal(receivablesPermissions.count, 5);
  assert.equal(Number((await one(`
    select count(*) count from public.effective_permissions_for_profile($1)
    where permission_key like 'receivables.%'
  `, [fixture.employee])).count), 0, "Standard Employee must receive no Receivables permission by default.");

  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,status,currency,
    subtotal,total_amount,created_by,updated_by
  ) values($1,$2,$3,'{}'::jsonb,'confirmed','BDT',500000,500000,$4,$4)`, [
    fixture.sale, `REC-SALE-${stamp}`, fixture.customer, fixture.admin,
  ]);
  await query(`insert into public.sale_payments(
    id,order_id,amount,payment_date,method,status,received_by
  ) values($1,$2,200000,current_date,'cash','received',$3)`, [
    fixture.payment, fixture.sale, fixture.admin,
  ]);
  await query("select public.refresh_sale_payment_totals($1)", [fixture.sale]);
  await query(`insert into public.sale_documents(
    id,order_id,document_number,document_type,status,snapshot,generated_by
  ) values($1,$2,$3,'invoice','generated','{}'::jsonb,$4)`, [
    fixture.invoice, fixture.sale, `REC-INV-${stamp}`, fixture.admin,
  ]);
  const customerReceivable = await one(`
    select original_amount,paid_amount,outstanding_amount,receivable_status,invoice_number
    from public.customer_receivables_v where source_id=$1
  `, [fixture.sale]);
  assert.equal(Number(customerReceivable.original_amount), 500000);
  assert.equal(Number(customerReceivable.paid_amount), 200000);
  assert.equal(Number(customerReceivable.outstanding_amount), 300000);
  assert.equal(customerReceivable.receivable_status, "partially_paid");
  assert.equal(customerReceivable.invoice_number, `REC-INV-${stamp}`);

  const financialCountsBefore = await one(`
    select
      (select count(*)::integer from public.sale_payments) sale_payments,
      (select count(*)::integer from public.journal_entries) journal_entries,
      (select count(*)::integer from public.cashbook_entries) cashbook_entries,
      (select count(*)::integer from public.hr_payroll_records) hr_payroll_records
  `);

  await expectDatabaseError(
    () => createRequested(fixture.employee, randomUUID()),
    /permission denied|does not have permission receivables\.create/i,
  );
  await expectDatabaseError(
    () => createOpening(fixture.employee, randomUUID()),
    /permission denied|does not have permission receivables\.manage_opening/i,
  );

  const requestedOperation = randomUUID();
  const requestedId = await createRequested(fixture.admin, requestedOperation);
  assert.equal(await createRequested(fixture.admin, requestedOperation), requestedId,
    "Retrying the same operation must return the existing requested account.");
  await expectDatabaseError(
    () => createRequested(fixture.admin, requestedOperation, 60000),
    /same operation ID|different values/i,
  );
  const requestedRead = await one(`
    select paid_amount,outstanding_amount,receivable_status
    from public.non_sales_receivables_v where source_id=$1
  `, [requestedId]);
  assert.equal(Number(requestedRead.paid_amount), 0);
  assert.equal(Number(requestedRead.outstanding_amount), 0);
  assert.equal(requestedRead.receivable_status, "requested");
  assert.equal(Number((await one(
    "select count(*) count from public.receivable_transactions where receivable_account_id=$1",
    [requestedId],
  )).count), 0, "A requested account must not fabricate a disbursement or repayment.");

  const openingOperation = randomUUID();
  const openingId = await createOpening(fixture.admin, openingOperation);
  assert.equal(await createOpening(fixture.admin, openingOperation), openingId,
    "Retrying the same operation must return the existing opening account.");
  await expectDatabaseError(
    () => createOpening(fixture.admin, openingOperation, 70000),
    /same operation ID|different values/i,
  );
  const openingRead = await one(`
    select original_amount,paid_amount,outstanding_amount,receivable_status,is_opening_balance
    from public.non_sales_receivables_v where source_id=$1
  `, [openingId]);
  assert.equal(Number(openingRead.original_amount), 200000);
  assert.equal(Number(openingRead.paid_amount), 120000);
  assert.equal(Number(openingRead.outstanding_amount), 80000);
  assert.equal(openingRead.receivable_status, "active");
  assert.equal(openingRead.is_opening_balance, true);
  const openingTransaction = await one(`
    select id,transaction_type,direction,amount,source,metadata
    from public.receivable_transactions where receivable_account_id=$1
  `, [openingId]);
  assert.equal(openingTransaction.transaction_type, "opening_balance");
  assert.equal(openingTransaction.direction, "increase");
  assert.equal(Number(openingTransaction.amount), 80000);
  assert.equal(openingTransaction.source, "opening_balance");
  assert.equal(openingTransaction.metadata.historical_accounting_posted, false);
  assert.equal(Number((await one(
    "select count(*) count from public.receivable_transactions where receivable_account_id=$1",
    [openingId],
  )).count), 1, "Idempotent opening retry must not duplicate the immutable transaction.");
  await expectDatabaseError(
    () => query("update public.receivable_transactions set amount=1 where id=$1", [openingTransaction.id]),
    /immutable/i,
  );
  await expectDatabaseError(
    () => query("delete from public.receivable_transactions where id=$1", [openingTransaction.id]),
    /immutable/i,
  );
  assert.equal(Number((await one(`
    select count(*) count from public.audit_logs
    where module='receivables' and entity_id=any($1::text[])
  `, [[requestedId, openingId]])).count), 2);

  await query("set local role authenticated");
  await query("select set_config('request.jwt.claim.sub',$1,true)", [fixture.employee]);
  await query("select set_config('request.jwt.claim.role','authenticated',true)");
  assert.equal(Number((await one("select count(*) count from public.receivable_accounts")).count), 0,
    "RLS must hide non-Sales receivables from an employee without receivables.view_loans.");
  await query("reset role");
  await query("select set_config('request.jwt.claim.role','service_role',true)");

  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Receivables rollback-only verification',$2,true
    from public.permissions where key=any($3::text[])`, [
    fixture.employee,
    fixture.admin,
    ["receivables.view_loans", "receivables.create"],
  ]);
  assert.equal(Number((await one(`
    select count(*) count from public.effective_permissions_for_profile($1)
    where permission_key=any($2::text[])
  `, [fixture.employee, ["receivables.view_loans", "receivables.create"]])).count), 2);
  const employeeCreatedId = await createRequested(fixture.employee, randomUUID());
  assert.ok(employeeCreatedId);

  await query("set local role authenticated");
  await query("select set_config('request.jwt.claim.sub',$1,true)", [fixture.employee]);
  await query("select set_config('request.jwt.claim.role','authenticated',true)");
  assert.ok(Number((await one("select count(*) count from public.receivable_accounts")).count) >= 3,
    "RLS must allow an explicitly authorized employee to read non-Sales receivables.");
  await expectDatabaseError(
    () => query("select * from public.receivables_overview_v limit 1"),
    /permission denied/i,
  );
  await query("reset role");
  await query("select set_config('request.jwt.claim.role','service_role',true)");

  const financialCountsAfter = await one(`
    select
      (select count(*)::integer from public.sale_payments) sale_payments,
      (select count(*)::integer from public.journal_entries) journal_entries,
      (select count(*)::integer from public.cashbook_entries) cashbook_entries,
      (select count(*)::integer from public.hr_payroll_records) hr_payroll_records
  `);
  assert.deepEqual(financialCountsAfter, financialCountsBefore,
    "Phase 1 operational accounts/opening balances must not change Sales payments, Accounting, cashbook, or Payroll.");

  console.log("Receivables local database verification passed (rollback-only; no data retained)." );
} finally {
  try {
    await query("reset role");
  } catch {}
  try {
    await query("rollback");
  } finally {
    await client.end();
  }
}
