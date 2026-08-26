import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.RECEIVABLES_DATABASE_URL
  ?? process.env.DATABASE_URL
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
      $1::uuid,$2::uuid,'individual_loan'::text,'external_party'::text,null::uuid,$3::jsonb,
      $4::numeric,'BDT'::text,'other'::text,5::integer,10000::numeric,
      current_date::date,(current_date+interval '4 months')::date,'Rollback-only requested account test'::text
    ) id
  `, [actorId, operationId, JSON.stringify({
    party_type: "individual",
    display_name: "Receivables Test Borrower",
  }), amount])).id;
}

async function createEmployeeLoan(actorId, employeeRecordId, operationId, amount = 50000) {
  return (await one(`
    select public.create_receivable_account(
      $1::uuid,$2::uuid,'employee_loan'::text,'employee'::text,$3::uuid,null::jsonb,
      $4::numeric,'BDT'::text,'bank'::text,5::integer,10000::numeric,
      current_date::date,(current_date+interval '4 months')::date,'Rollback-only employee loan test'::text
    ) id
  `, [actorId, operationId, employeeRecordId, amount])).id;
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
      to_regclass('public.customer_receivables_detail_v') is not null as customer_detail,
      to_regclass('public.customer_receivables_summary_v') is not null as customer_summary,
      to_regclass('public.customer_receivables_metrics_v') is not null as customer_metrics,
      to_regclass('public.receivable_installments') is not null as installments,
      to_regclass('public.non_sales_receivable_details_v') is not null as non_sales_details,
      to_regclass('public.receivable_installment_status_v') is not null as installment_status,
      to_regclass('public.non_sales_receivable_metrics_v') is not null as non_sales_metrics,
      to_regclass('public.receivable_accounting_postings') is not null as accounting_postings,
      to_regclass('public.receivable_accounting_reconciliation_v') is not null as accounting_reconciliation,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='receivable_transactions' and column_name='accounting_treatment') as accounting_treatment,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='sales_orders' and column_name='payment_terms_type') as payment_terms,
      to_regprocedure('public.create_receivable_account(uuid,uuid,text,text,uuid,jsonb,numeric,text,text,integer,numeric,date,date,text)') is not null as create_account,
      to_regprocedure('public.create_opening_receivable(uuid,uuid,text,text,uuid,jsonb,numeric,numeric,numeric,date,text,text,integer,numeric,date,date,text)') is not null as create_opening,
      to_regprocedure('public.update_sale_commercial_terms(uuid,uuid,uuid,text,integer,date,text)') is not null as update_terms
      ,to_regprocedure('public.transition_receivable_account(uuid,uuid,uuid,text,numeric,text)') is not null as transition_account
      ,to_regprocedure('public.confirm_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text)') is not null as disburse_account
      ,to_regprocedure('public.record_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text)') is not null as record_repayment
      ,to_regprocedure('public.record_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text)') is not null as record_adjustment
      ,to_regprocedure('public.reverse_receivable_transaction(uuid,uuid,uuid,uuid,date,text)') is not null as reverse_transaction
      ,to_regprocedure('public.post_receivable_disbursement(uuid,uuid,uuid,numeric,date,text,text)') is not null as post_disbursement
      ,to_regprocedure('public.post_receivable_repayment(uuid,uuid,uuid,numeric,date,text,text)') is not null as post_repayment
      ,to_regprocedure('public.post_receivable_adjustment(uuid,uuid,uuid,text,numeric,date,text,text,text)') is not null as post_adjustment
      ,to_regprocedure('public.reverse_receivable_accounting_posting(uuid,uuid,uuid,uuid,date,text)') is not null as reverse_accounting
  `);
  assert.deepEqual(capabilities, {
    accounts: true,
    transactions: true,
    overview: true,
    customer_detail: true,
    customer_summary: true,
    customer_metrics: true,
    installments: true,
    non_sales_details: true,
    installment_status: true,
    non_sales_metrics: true,
    accounting_postings: true,
    accounting_reconciliation: true,
    accounting_treatment: true,
    payment_terms: true,
    create_account: true,
    create_opening: true,
    update_terms: true,
    transition_account: true,
    disburse_account: true,
    record_repayment: true,
    record_adjustment: true,
    reverse_transaction: true,
    post_disbursement: true,
    post_repayment: true,
    post_adjustment: true,
    reverse_accounting: true,
  }, "Apply the additive Receivables migration to the local database before verification.");

  await query("begin");
  await query("select set_config('request.jwt.claim.role','service_role',true)");

  const { authUsersAvailable } = await one(`
    select to_regclass('auth.users') is not null as "authUsersAvailable"
  `);

  const fixture = {
    admin: randomUUID(),
    employee: randomUUID(),
    customer: randomUUID(),
    sale: randomUUID(),
    payment: randomUUID(),
    invoice: randomUUID(),
    creditSale: randomUUID(),
    creditInvoice: randomUUID(),
    creditInvoiceRevision: randomUUID(),
    voidInvoice: randomUUID(),
    draftSale: randomUUID(),
    employeeSale: randomUUID(),
    employeeRecord: randomUUID(),
  };
  const stamp = fixture.admin.slice(0, 8);

  const fixtureProfiles = [
    fixture.admin, `receivables-admin-${stamp}@local.test`, "Receivables Test Admin",
    fixture.employee, `receivables-employee-${stamp}@local.test`, "Receivables Test Employee",
    fixture.customer, `receivables-customer-${stamp}@local.test`, "Receivables Test Customer",
  ];
  if (authUsersAvailable) {
    await query(`insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
      ($1,$2,jsonb_build_object('full_name',$3::text),now(),now()),
      ($4,$5,jsonb_build_object('full_name',$6::text),now(),now()),
      ($7,$8,jsonb_build_object('full_name',$9::text),now(),now())`, fixtureProfiles);
  } else {
    await query(`insert into public.profiles(id,email,full_name) values
      ($1,$2,$3),($4,$5,$6),($7,$8,$9)`, fixtureProfiles);
  }
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
  await query(`insert into public.hr_employee_records(
    id,profile_id,employee_number,job_title,employment_type,employment_status,hire_date,created_by,updated_by
  ) values($1,$2,$3,'Receivables Test Employee','full_time','active',current_date,$4,$4)`, [
    fixture.employeeRecord, fixture.employee, `REC-EMP-${stamp}`, fixture.admin,
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
    "receivables.approve",
    "receivables.disburse",
    "receivables.record_repayment",
    "receivables.adjust",
  ]]);
  assert.equal(receivablesPermissions.count, 9);
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
    select original_amount,paid_amount,outstanding_amount,receivables_status,
      aging_bucket,due_date,invoice_number
    from public.customer_receivables_detail_v where source_id=$1
  `, [fixture.sale]);
  assert.equal(Number(customerReceivable.original_amount), 500000);
  assert.equal(Number(customerReceivable.paid_amount), 200000);
  assert.equal(Number(customerReceivable.outstanding_amount), 300000);
  assert.equal(customerReceivable.receivables_status, "no_due_date");
  assert.equal(customerReceivable.aging_bucket, "no_due_date");
  assert.equal(customerReceivable.due_date, null);
  assert.equal(customerReceivable.invoice_number, `REC-INV-${stamp}`);

  await query(`insert into public.sales_orders(
    id,order_number,customer_profile_id,shipping_address_snapshot,status,currency,
    subtotal,total_amount,created_by,updated_by
  ) values
    ($1,$2,$3,'{}'::jsonb,'draft','BDT',39500,39500,$4,$4),
    ($5,$6,$3,'{}'::jsonb,'confirmed','BDT',100000,100000,$4,$4),
    ($7,$8,$3,'{}'::jsonb,'confirmed','BDT',25000,25000,$9,$9)`, [
    fixture.draftSale, `REC-DRAFT-${stamp}`, fixture.customer, fixture.admin,
    fixture.creditSale, `REC-CREDIT-${stamp}`,
    fixture.employeeSale, `REC-OWN-${stamp}`, fixture.employee,
  ]);
  assert.equal(Number((await one(`
    select count(*) count from public.customer_receivables_detail_v where source_id=$1
  `, [fixture.draftSale])).count), 0, "Draft Sales must not create derived Customer Receivables exposure.");
  assert.equal((await one("select status from public.sales_orders where id=$1", [fixture.draftSale])).status, "draft",
    "Draft exposure correction must never mutate the Sale.");

  const creditTermsOperation = randomUUID();
  const creditTerms = async (operationId) => (await one(`
    select public.update_sale_commercial_terms(
      $1::uuid,$2::uuid,$3::uuid,'credit'::text,30::integer,null::date,'Rollback-only credit terms'::text
    ) id
  `, [fixture.admin, fixture.creditSale, operationId])).id;
  assert.equal(await creditTerms(creditTermsOperation), fixture.creditSale);
  assert.equal(await creditTerms(creditTermsOperation), fixture.creditSale,
    "Retrying the same commercial terms operation must remain idempotent.");
  await query(`insert into public.sale_documents(
    id,order_id,document_number,document_type,status,revision_number,snapshot,generated_by,created_at
  ) values
    ($1,$2,$3,'invoice','voided',1,'{}'::jsonb,$4,now()-interval '20 days'),
    ($5,$2,$6,'invoice','superseded',1,'{}'::jsonb,$4,now()-interval '10 days'),
    ($7,$2,$8,'invoice','generated',2,'{}'::jsonb,$4,now())`, [
    fixture.voidInvoice, fixture.creditSale, `REC-VOID-${stamp}`, fixture.admin,
    fixture.creditInvoice, `REC-CREDIT-INV-1-${stamp}`,
    fixture.creditInvoiceRevision, `REC-CREDIT-INV-2-${stamp}`,
  ]);
  const creditReceivable = await one(`
    select invoice_number,invoice_anchor_date,due_date,credit_period_days,
      receivables_status,aging_bucket
    from public.customer_receivables_detail_v where source_id=$1
  `, [fixture.creditSale]);
  assert.equal(creditReceivable.invoice_number, `REC-CREDIT-INV-2-${stamp}`,
    "The latest valid invoice number must remain visible.");
  assert.equal(
    String(creditReceivable.due_date),
    String((await one(`select ($1::date+30)::date due`, [creditReceivable.invoice_anchor_date])).due),
    "The earliest valid non-void invoice must remain the credit anchor after revision.",
  );
  assert.equal(Number(creditReceivable.credit_period_days), 30);

  const dueCorrectionOperation = randomUUID();
  const correctedDueDate = (await one(`select (timezone('Asia/Dhaka',now())::date+45)::date due`)).due;
  const correctDueDate = async (operationId) => (await one(`
    select public.update_sale_commercial_terms(
      $1::uuid,$2::uuid,$3::uuid,null::text,null::integer,$4::date,'Customer-approved rollback-only correction'::text
    ) id
  `, [fixture.admin, fixture.sale, operationId, correctedDueDate])).id;
  assert.equal(await correctDueDate(dueCorrectionOperation), fixture.sale);
  assert.equal(await correctDueDate(dueCorrectionOperation), fixture.sale);
  assert.equal((await one(`select due_date from public.customer_receivables_detail_v where source_id=$1`, [fixture.sale])).due_date.toISOString().slice(0, 10), correctedDueDate.toISOString().slice(0, 10));
  assert.equal(Number((await one(`
    select count(*) count from public.audit_logs
    where module='sales' and action='sale.commercial_terms_updated'
      and entity_id=any($1::text[])
  `, [[fixture.sale, fixture.creditSale]])).count), 2,
    "Commercial terms retries must not duplicate audit entries.");

  await expectDatabaseError(
    () => one(`select public.update_sale_commercial_terms(
      $1::uuid,$2::uuid,$3::uuid,'immediate'::text,null::integer,null::date,null::text
    )`, [fixture.employee, fixture.employeeSale, randomUUID()]),
    /permission denied|sales\.edit/i,
  );
  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Receivables Phase 2 rollback-only verification',$2,true
    from public.permissions where key=any($3::text[])
  on conflict(profile_id,permission_id) do update set
    effect='allow',reason=excluded.reason,assigned_by=excluded.assigned_by,is_active=true`, [
    fixture.employee,
    fixture.admin,
    ["sales.edit", "sales.view_own"],
  ]);
  assert.equal((await one(`select public.update_sale_commercial_terms(
    $1::uuid,$2::uuid,$3::uuid,'immediate'::text,null::integer,null::date,null::text
  ) id`, [fixture.employee, fixture.employeeSale, randomUUID()])).id, fixture.employeeSale,
  "An own-Sales editor may update only an owned Sale.");
  await expectDatabaseError(
    () => one(`select public.update_sale_commercial_terms(
      $1::uuid,$2::uuid,$3::uuid,null::text,null::integer,$4::date,'Unauthorized correction'::text
    )`, [fixture.employee, fixture.sale, randomUUID(), correctedDueDate]),
    /Sales access denied/i,
  );

  const scopedSummary = await one(`
    select total_outstanding,total_overdue
    from public.customer_receivables_summary_v
    where customer_id=$1 and currency='BDT' and responsible_profile_id=$2
  `, [fixture.customer, fixture.employee]);
  assert.equal(Number(scopedSummary.total_outstanding), 25000);
  const scopedMetrics = await one(`
    select customer_outstanding,open_record_count
    from public.customer_receivables_metrics_v
    where currency='BDT' and responsible_profile_id=$1
  `, [fixture.employee]);
  assert.equal(Number(scopedMetrics.customer_outstanding), 25000);
  assert.equal(Number(scopedMetrics.open_record_count), 1);

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

  await expectDatabaseError(
    () => one(`select public.create_receivable_account(
      $1::uuid,$2::uuid,'employee_loan'::text,'external_party'::text,null::uuid,$3::jsonb,
      50000::numeric,'BDT'::text,'bank'::text,null::integer,null::numeric,
      null::date,null::date,'Invalid borrower pairing'::text
    )`, [fixture.admin, randomUUID(), JSON.stringify({ party_type: "individual", display_name: "Wrong Borrower" })]),
    /employee borrower/i,
  );

  const employeeLoanId = await createEmployeeLoan(
    fixture.admin, fixture.employeeRecord, randomUUID(), 50000,
  );
  const secondEmployeeLoanId = await createEmployeeLoan(
    fixture.admin, fixture.employeeRecord, randomUUID(), 25000,
  );
  assert.notEqual(employeeLoanId, secondEmployeeLoanId,
    "One employee must retain multiple independent receivable accounts.");

  const reviewOperation = randomUUID();
  const reviewAccount = async (operationId) => (await one(`
    select public.transition_receivable_account(
      $1::uuid,$2::uuid,$3::uuid,'submit_review'::text,null::numeric,null::text
    ) id
  `, [fixture.admin, employeeLoanId, operationId])).id;
  assert.equal(await reviewAccount(reviewOperation), employeeLoanId);
  assert.equal(await reviewAccount(reviewOperation), employeeLoanId,
    "Lifecycle retries must not duplicate audit history.");

  const approveOperation = randomUUID();
  const approveAccount = async (operationId) => (await one(`
    select public.transition_receivable_account(
      $1::uuid,$2::uuid,$3::uuid,'approve'::text,50000::numeric,'Approved for rollback-only verification'::text
    ) id
  `, [fixture.admin, employeeLoanId, operationId])).id;
  assert.equal(await approveAccount(approveOperation), employeeLoanId);
  assert.equal(await approveAccount(approveOperation), employeeLoanId);
  assert.equal(Number((await one(`
    select public.receivable_current_outstanding($1) amount
  `, [employeeLoanId])).amount), 0, "Approval must not create a balance movement.");
  assert.equal(Number((await one(`
    select count(*) count from public.receivable_installments where receivable_account_id=$1
  `, [employeeLoanId])).count), 5);
  assert.equal(Number((await one(`
    select sum(amount_due) amount from public.receivable_installments where receivable_account_id=$1
  `, [employeeLoanId])).amount), 50000);
  await expectDatabaseError(
    () => query(`update public.receivable_installments set amount_due=9999
      where receivable_account_id=$1 and installment_number=1`, [employeeLoanId]),
    /immutable/i,
  );

  const disbursementOperation = randomUUID();
  const disburse = async (operationId, amount = 50000) => (await one(`
    select public.confirm_receivable_disbursement(
      $1::uuid,$2::uuid,$3::uuid,$4::numeric,current_date::date,'bank'::text,'Rollback-only disbursement'::text
    ) id
  `, [fixture.admin, employeeLoanId, operationId, amount])).id;
  const disbursementId = await disburse(disbursementOperation);
  assert.equal(await disburse(disbursementOperation), disbursementId,
    "Disbursement retry must return the original immutable transaction.");
  await expectDatabaseError(
    () => disburse(disbursementOperation, 49000),
    /different values/i,
  );
  assert.equal(Number((await one(`select public.receivable_current_outstanding($1) amount`, [employeeLoanId])).amount), 50000);
  assert.equal((await one(`select status from public.receivable_accounts where id=$1`, [employeeLoanId])).status, "active");

  await expectDatabaseError(
    () => one(`select public.transition_receivable_account(
      $1::uuid,$2::uuid,$3::uuid,'cancel'::text,null::numeric,'Cannot erase movements'::text
    )`, [fixture.admin, employeeLoanId, randomUUID()]),
    /cannot be cancelled|balance movements/i,
  );
  await expectDatabaseError(
    () => one(`select public.record_receivable_repayment(
      $1::uuid,$2::uuid,$3::uuid,1000::numeric,current_date::date,'salary_deduction'::text,'Not payroll'::text
    )`, [fixture.admin, employeeLoanId, randomUUID()]),
    /Phase 4 Payroll/i,
  );
  await expectDatabaseError(
    () => one(`select public.record_receivable_repayment(
      $1::uuid,$2::uuid,$3::uuid,50001::numeric,current_date::date,'cash'::text,'Overpayment'::text
    )`, [fixture.admin, employeeLoanId, randomUUID()]),
    /exceed current outstanding/i,
  );

  const repaymentOperation = randomUUID();
  const repay = async (operationId, amount = 12000) => (await one(`
    select public.record_receivable_repayment(
      $1::uuid,$2::uuid,$3::uuid,$4::numeric,current_date::date,'cash'::text,'Rollback-only repayment'::text
    ) id
  `, [fixture.admin, employeeLoanId, operationId, amount])).id;
  const repaymentId = await repay(repaymentOperation);
  assert.equal(await repay(repaymentOperation), repaymentId);
  assert.equal(Number((await one(`select public.receivable_current_outstanding($1) amount`, [employeeLoanId])).amount), 38000);
  const fifoInstallments = (await query(`
    select installment_number,paid_amount,remaining_amount,installment_status
    from public.receivable_installment_status_v
    where receivable_account_id=$1 order by installment_number
  `, [employeeLoanId])).rows;
  assert.equal(Number(fifoInstallments[0].paid_amount), 10000);
  assert.equal(fifoInstallments[0].installment_status, "paid");
  assert.equal(Number(fifoInstallments[1].paid_amount), 2000);
  assert.equal(fifoInstallments[1].installment_status, "partial");

  await expectDatabaseError(
    () => one(`select public.record_receivable_adjustment(
      $1::uuid,$2::uuid,$3::uuid,'increase'::text,1000::numeric,current_date::date,'Unsafe schedule increase'::text
    )`, [fixture.admin, employeeLoanId, randomUUID()]),
    /approved installment schedule/i,
  );
  const adjustmentOperation = randomUUID();
  const adjustmentId = (await one(`select public.record_receivable_adjustment(
    $1::uuid,$2::uuid,$3::uuid,'decrease'::text,5000::numeric,current_date::date,'Operational rent-style adjustment'::text
  ) id`, [fixture.admin, employeeLoanId, adjustmentOperation])).id;
  assert.equal(Number((await one(`select public.receivable_current_outstanding($1) amount`, [employeeLoanId])).amount), 33000);

  const adjustmentReversalOperation = randomUUID();
  const adjustmentReversalId = (await one(`select public.reverse_receivable_transaction(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,current_date::date,'Correct rollback-only adjustment'::text
  ) id`, [fixture.admin, employeeLoanId, adjustmentId, adjustmentReversalOperation])).id;
  assert.ok(adjustmentReversalId);
  assert.equal(Number((await one(`select public.receivable_current_outstanding($1) amount`, [employeeLoanId])).amount), 38000);
  await expectDatabaseError(
    () => one(`select public.reverse_receivable_transaction(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,current_date::date,'Duplicate reversal'::text
    )`, [fixture.admin, employeeLoanId, adjustmentId, randomUUID()]),
    /already been reversed/i,
  );

  const finalRepaymentId = (await one(`select public.record_receivable_repayment(
    $1::uuid,$2::uuid,$3::uuid,38000::numeric,current_date::date,'bank'::text,'Final rollback-only repayment'::text
  ) id`, [fixture.admin, employeeLoanId, randomUUID()])).id;
  assert.equal((await one(`select status from public.receivable_accounts where id=$1`, [employeeLoanId])).status, "fully_repaid");
  await one(`select public.reverse_receivable_transaction(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,current_date::date,'Reopen after repayment correction'::text
  )`, [fixture.admin, employeeLoanId, finalRepaymentId, randomUUID()]);
  assert.equal((await one(`select status from public.receivable_accounts where id=$1`, [employeeLoanId])).status, "active");
  assert.equal(Number((await one(`select public.receivable_current_outstanding($1) amount`, [employeeLoanId])).amount), 38000);

  assert.equal(Number((await one(`
    select count(*) count from public.receivable_transactions
    where receivable_account_id=$1 and operation_id=$2
  `, [employeeLoanId, disbursementOperation])).count), 1);
  assert.ok(Number((await one(`
    select count(*) count from public.audit_logs
    where module='receivables' and entity_id=$1
  `, [employeeLoanId])).count) >= 7);

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

  const phase5Permissions = [
    "receivables.record_repayment",
    "receivables.adjust",
    "accounting.create_entry",
    "accounting.approve_entry",
    "accounting.manage_cashbook",
  ];
  await query(`insert into public.profile_permission_overrides(
    profile_id,permission_id,effect,reason,assigned_by,is_active
  ) select $1,id,'allow','Rollback-only Phase 5 verification',$1,true
    from public.permissions where key=any($2::text[])`, [fixture.admin, phase5Permissions]);
  const phase5FinancialCountsBefore = await one(`
    select
      (select count(*)::integer from public.sale_payments) sale_payments,
      (select count(*)::integer from public.journal_entries) journal_entries,
      (select count(*)::integer from public.cashbook_entries) cashbook_entries,
      (select count(*)::integer from public.hr_payroll_records) hr_payroll_records
  `);
  const phase5Operation = randomUUID();
  const phase5First = await one(`select public.post_receivable_repayment(
    $1::uuid,$2::uuid,$3::uuid,100::numeric,current_date::date,'bank'::text,
    'Rollback-only Phase 5 accounting repayment'
  ) result`, [fixture.admin, employeeLoanId, phase5Operation]);
  assert.equal(phase5First.result.replayed, false);
  const phase5Retry = await one(`select public.post_receivable_repayment(
    $1::uuid,$2::uuid,$3::uuid,100::numeric,current_date::date,'bank'::text,
    'Rollback-only Phase 5 accounting repayment'
  ) result`, [fixture.admin, employeeLoanId, phase5Operation]);
  assert.equal(phase5Retry.result.replayed, true, "Posting retry must replay the original result.");
  assert.equal(Number((await one(`select count(*) count from public.receivable_accounting_postings
    where operation_id=$1`, [phase5Operation])).count), 1);
  assert.equal(Number((await one(`select count(*) count from public.journal_entries
    where id=$1::uuid`, [phase5First.result.journal_entry_id])).count), 1);
  assert.equal(Number((await one(`select count(*) count from public.cashbook_entries
    where id=$1::uuid`, [phase5First.result.cashbook_entry_id])).count), 1);
  await expectDatabaseError(
    () => one(`select public.post_receivable_repayment(
      $1::uuid,$2::uuid,$3::uuid,101::numeric,current_date::date,'bank'::text,
      'Rollback-only Phase 5 mismatched retry'
    ) result`, [fixture.admin, employeeLoanId, phase5Operation]),
    /different (?:values|posting data)/i,
  );

  const nonCashOperation = randomUUID();
  const nonCashResult = await one(`select public.post_receivable_adjustment(
    $1::uuid,$2::uuid,$3::uuid,'decrease'::text,50::numeric,current_date::date,
    'other'::text,'rent_expense_offset'::text,'Rollback-only rent offset'
  ) result`, [fixture.admin, employeeLoanId, nonCashOperation]);
  assert.equal(nonCashResult.result.posting_status, "posted");
  assert.equal(nonCashResult.result.cashbook_entry_id, null,
    "Non-cash rent offsets must not create Cash Book entries.");
  assert.equal(Number((await one(`select count(*) count from public.receivable_accounting_postings
    where operation_id=$1 and posting_status='posted'`, [nonCashOperation])).count), 1);

  await query(`select public.reverse_receivable_accounting_posting(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,current_date::date,'Rollback-only Phase 5 reversal'
  )`, [fixture.admin, employeeLoanId, phase5First.result.posting_id, randomUUID()]);
  await expectDatabaseError(
    () => one(`select public.reverse_receivable_accounting_posting(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,current_date::date,'Duplicate Phase 5 reversal'
    )`, [fixture.admin, employeeLoanId, phase5First.result.posting_id, randomUUID()]),
    /already been reversed/i,
  );

  const financialCountsAfter = await one(`
    select
      (select count(*)::integer from public.sale_payments) sale_payments,
      (select count(*)::integer from public.journal_entries) journal_entries,
      (select count(*)::integer from public.cashbook_entries) cashbook_entries,
      (select count(*)::integer from public.hr_payroll_records) hr_payroll_records
  `);
  assert.equal(financialCountsAfter.sale_payments, financialCountsBefore.sale_payments,
    "Receivables accounting must not create or modify Sales payments.");
  assert.equal(financialCountsAfter.hr_payroll_records, financialCountsBefore.hr_payroll_records,
    "Receivables accounting must not create or modify Payroll records.");
  assert.equal(financialCountsAfter.journal_entries, phase5FinancialCountsBefore.journal_entries + 3,
    "Phase 5 rollback-only posting test should create exactly three journals.");
  assert.equal(financialCountsAfter.cashbook_entries, phase5FinancialCountsBefore.cashbook_entries + 2,
    "Phase 5 rollback-only posting test should create Cash Book rows only for cash movements.");

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
