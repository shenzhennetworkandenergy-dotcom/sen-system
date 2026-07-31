import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const files = {
  migration: "supabase/migrations/202607240002_accounting_hr_modules.sql",
  cashbookMigration: "supabase/migrations/202607310013_accounting_quick_cashbook.sql",
  accountingPage: "app/admin/accounting/page.tsx",
  accountingActions: "app/admin/accounting/actions.ts",
  cashbookComponent: "components/accounting/QuickCashbook.tsx",
  hrPage: "app/admin/hr/page.tsx",
  hrActions: "app/admin/hr/actions.ts",
  navigation: "lib/navigation/dashboard.ts",
};

const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8").catch(() => "")])));
const checks = [
  ["double-entry tables", /create table public\.journal_entries/.test(content.migration) && /create table public\.journal_lines/.test(content.migration)],
  ["balanced journal enforcement", /debit_total<>credit_total/.test(content.migration)],
  ["posting permission", /accounting\.approve_entry/.test(content.migration) && /requirePermission\("accounting\.approve_entry"\)/.test(content.accountingActions)],
  ["HR profile integration", /profile_id uuid not null unique references public\.profiles/.test(content.migration)],
  ["HR department and leave tables", /create table public\.hr_departments/.test(content.migration) && /create table public\.hr_leave_requests/.test(content.migration)],
  ["HR permissions", /hr\.manage_employees/.test(content.migration) && /hr\.manage_leave/.test(content.hrActions)],
  ["RLS enabled", /enable row level security/.test(content.migration)],
  ["service-role-only mutations", /revoke all on function public\.create_journal_entry/.test(content.migration)],
  ["cashbook tables", /create table public\.cashbook_days/.test(content.cashbookMigration) && /create table public\.cashbook_descriptions/.test(content.cashbookMigration) && /create table public\.cashbook_entries/.test(content.cashbookMigration)],
  ["cashbook ledger posting", /create or replace function public\.create_cashbook_entry/.test(content.cashbookMigration) && /insert into public\.journal_lines/.test(content.cashbookMigration)],
  ["cashbook opening and closing", /create or replace function public\.set_cashbook_opening_balance/.test(content.cashbookMigration) && /create or replace function public\.close_cashbook_day/.test(content.cashbookMigration) && /opening_balance\+income_total-expense_total/.test(content.cashbookMigration)],
  ["cashbook timeline serialization", /pg_advisory_xact_lock/.test(content.cashbookMigration) && /assert_cashbook_predecessor_closed/.test(content.cashbookMigration)],
  ["cashbook permissions and RLS", /accounting\.create_entry/.test(content.cashbookMigration) && /cashbook entries read/.test(content.cashbookMigration) && /revoke all on function public\.create_cashbook_entry/.test(content.cashbookMigration) && /revoke insert,update,delete on public\.cashbook_days/.test(content.cashbookMigration)],
  ["cashbook accounting UI", /QuickCashbook/.test(content.accountingPage) && /খাত\/বিবরণ/.test(content.cashbookComponent)],
  ["cashbook daily balance selector", /cashbook_date/.test(content.accountingPage) && /View daily balance/.test(content.cashbookComponent)],
  ["cashbook server actions", /createCashbookDescriptionAction/.test(content.accountingActions) && /createCashbookEntryAction/.test(content.accountingActions)],
  ["cashbook close and print", /setCashbookOpeningBalanceAction/.test(content.accountingActions) && /closeCashbookDayAction/.test(content.accountingActions) && /Print Sheet/.test(content.cashbookComponent) && /DAILY CASH STATEMENT/.test(content.cashbookComponent)],
  ["cashbook payment methods", /"cash".*"bank".*"mfs"/s.test(content.cashbookComponent)],
  ["accounting route", /routes\.adminAccounting/.test(content.navigation) && /Accounting/.test(content.accountingPage)],
  ["HR route", /routes\.adminHr/.test(content.navigation) && /Human Resources/.test(content.hrPage)],
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  failed ||= !passed;
}
if (failed) process.exitCode = 1;
if (failed) process.exit();

const envText = await readFile(".env.local", "utf8").catch(()=>"");
const fileEnv = Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,"")];}));
const env = {...fileEnv,...process.env};
assert.match(env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i, "Accounting/HR verification refuses to mutate a non-local database.");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
for (const table of ["accounting_accounts","journal_entries","journal_lines","cashbook_days","cashbook_descriptions","cashbook_entries","hr_departments","hr_employee_records","hr_leave_requests","hr_attendance"]) {
  const probe=await db.from(table).select(table==="cashbook_days" ? "business_date" : "id").limit(1);
  assert.equal(probe.error,null,`${table} is unavailable locally: ${probe.error?.message}`);
}
const actor=await db.from("profiles").select("id").eq("role","admin").eq("status","active").limit(1).single();
assert.equal(actor.error,null,actor.error?.message);
const accounts=await db.from("accounting_accounts").select("id").eq("is_active",true).order("code").limit(2);
assert.equal(accounts.error,null,accounts.error?.message); assert.equal(accounts.data.length,2,"At least two local accounting accounts are required.");
let journalId;
let cashbookDescriptionId;
let cashbookEntryId;
let cashbookJournalId;
let cashbookDay;
let carryEntryId;
let carryJournalId;
let carryDay;
let departmentId;
let employeeRecordId;
try {
  const created=await db.rpc("create_journal_entry",{actor_profile_id:actor.data.id,requested_date:new Date().toISOString().slice(0,10),requested_description:"Automated local accounting verification",requested_reference_type:"manual",requested_reference_id:null,requested_currency:"BDT",requested_lines:[{account_id:accounts.data[0].id,debit:1,credit:0,description:"Verification debit"},{account_id:accounts.data[1].id,debit:0,credit:1,description:"Verification credit"}]});
  assert.equal(created.error,null,created.error?.message); journalId=created.data;
  const posted=await db.rpc("post_journal_entry",{actor_profile_id:actor.data.id,requested_entry_id:journalId});
  assert.equal(posted.error,null,posted.error?.message);
  const checked=await db.from("journal_entries").select("status,journal_lines(debit,credit)").eq("id",journalId).single();
  assert.equal(checked.error,null,checked.error?.message); assert.equal(checked.data.status,"posted"); assert.equal(checked.data.journal_lines.length,2);

  const cashbookDescription=await db.rpc("create_cashbook_description",{
    actor_profile_id:actor.data.id,
    requested_name:`Verification income ${Date.now()}`,
    requested_transaction_type:"income",
  });
  assert.equal(cashbookDescription.error,null,cashbookDescription.error?.message);
  cashbookDescriptionId=cashbookDescription.data;

  const stamp=Date.now();
  cashbookDay=`${2080+(stamp%20)}-${String(1+(Math.floor(stamp/20)%12)).padStart(2,"0")}-${String(1+(Math.floor(stamp/240)%27)).padStart(2,"0")}`;
  const openingBalance=await db.rpc("set_cashbook_opening_balance",{
    actor_profile_id:actor.data.id,
    requested_business_date:cashbookDay,
    requested_opening_balance:100,
  });
  assert.equal(openingBalance.error,null,openingBalance.error?.message);

  const cashbookEntry=await db.rpc("create_cashbook_entry",{
    actor_profile_id:actor.data.id,
    requested_description_id:cashbookDescriptionId,
    requested_remark:"Automated verification remark",
    requested_amount:25,
    requested_payment_method:"cash",
    requested_occurred_at:`${cashbookDay}T09:30:00+06:00`,
    requested_business_date:cashbookDay,
  });
  assert.equal(cashbookEntry.error,null,cashbookEntry.error?.message);
  cashbookEntryId=cashbookEntry.data;

  const checkedCashbook=await db.from("cashbook_entries")
    .select("transaction_type,amount,payment_method,business_date,journal_entry_id,remark,cashbook_descriptions(name)")
    .eq("id",cashbookEntryId)
    .single();
  assert.equal(checkedCashbook.error,null,checkedCashbook.error?.message);
  assert.equal(checkedCashbook.data.transaction_type,"income");
  assert.equal(Number(checkedCashbook.data.amount),25);
  assert.equal(checkedCashbook.data.payment_method,"cash");
  assert.equal(checkedCashbook.data.business_date,cashbookDay);
  assert.equal(checkedCashbook.data.remark,"Automated verification remark");
  cashbookJournalId=checkedCashbook.data.journal_entry_id;

  const checkedCashbookJournal=await db.from("journal_entries")
    .select("status,reference_id,journal_lines(debit,credit)")
    .eq("id",cashbookJournalId)
    .single();
  assert.equal(checkedCashbookJournal.error,null,checkedCashbookJournal.error?.message);
  assert.equal(checkedCashbookJournal.data.status,"posted");
  assert.equal(checkedCashbookJournal.data.reference_id,cashbookEntryId);
  assert.equal(checkedCashbookJournal.data.journal_lines.reduce((sum,line)=>sum+Number(line.debit),0),25);
  assert.equal(checkedCashbookJournal.data.journal_lines.reduce((sum,line)=>sum+Number(line.credit),0),25);

  const nextDate=new Date(`${cashbookDay}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate()+1);
  carryDay=nextDate.toISOString().slice(0,10);
  const rejectedMismatchedDate=await db.rpc("create_cashbook_entry",{
    actor_profile_id:actor.data.id,
    requested_description_id:cashbookDescriptionId,
    requested_remark:"",
    requested_amount:1,
    requested_payment_method:"cash",
    requested_occurred_at:`${carryDay}T10:00:00+06:00`,
    requested_business_date:cashbookDay,
  });
  assert.ok(rejectedMismatchedDate.error,"An entry timestamp must match its selected cashbook date.");

  const rejectedBeforePreviousClose=await db.rpc("create_cashbook_entry",{
    actor_profile_id:actor.data.id,
    requested_description_id:cashbookDescriptionId,
    requested_remark:"",
    requested_amount:5,
    requested_payment_method:"cash",
    requested_occurred_at:`${carryDay}T09:00:00+06:00`,
    requested_business_date:carryDay,
  });
  assert.ok(rejectedBeforePreviousClose.error,"A later day must wait until the preceding cashbook day is closed.");
  assert.match(rejectedBeforePreviousClose.error.message,/close the previous cashbook day/i);

  const closedCashbook=await db.rpc("close_cashbook_day",{
    actor_profile_id:actor.data.id,
    requested_business_date:cashbookDay,
  });
  assert.equal(closedCashbook.error,null,closedCashbook.error?.message);
  assert.equal(Number(closedCashbook.data),125);
  const checkedDay=await db.from("cashbook_days").select("opening_balance,closing_balance,is_closed").eq("business_date",cashbookDay).single();
  assert.equal(checkedDay.error,null,checkedDay.error?.message);
  assert.equal(Number(checkedDay.data.opening_balance),100);
  assert.equal(Number(checkedDay.data.closing_balance),125);
  assert.equal(checkedDay.data.is_closed,true);

  const rejectedClosedEntry=await db.rpc("create_cashbook_entry",{
    actor_profile_id:actor.data.id,
    requested_description_id:cashbookDescriptionId,
    requested_remark:"",
    requested_amount:1,
    requested_payment_method:"cash",
    requested_occurred_at:`${cashbookDay}T10:00:00+06:00`,
    requested_business_date:cashbookDay,
  });
  assert.ok(rejectedClosedEntry.error,"Closed cashbook days must reject new entries.");

  const carryEntry=await db.rpc("create_cashbook_entry",{
    actor_profile_id:actor.data.id,
    requested_description_id:cashbookDescriptionId,
    requested_remark:"",
    requested_amount:5,
    requested_payment_method:"cash",
    requested_occurred_at:`${carryDay}T09:00:00+06:00`,
    requested_business_date:carryDay,
  });
  assert.equal(carryEntry.error,null,carryEntry.error?.message);
  carryEntryId=carryEntry.data;
  const checkedCarry=await db.from("cashbook_entries").select("journal_entry_id").eq("id",carryEntryId).single();
  assert.equal(checkedCarry.error,null,checkedCarry.error?.message);
  carryJournalId=checkedCarry.data.journal_entry_id;
  const carriedDay=await db.from("cashbook_days").select("opening_balance,is_closed").eq("business_date",carryDay).single();
  assert.equal(carriedDay.error,null,carriedDay.error?.message);
  assert.equal(Number(carriedDay.data.opening_balance),125,"The previous closing balance must carry into a new day atomically.");
  const closedCarry=await db.rpc("close_cashbook_day",{actor_profile_id:actor.data.id,requested_business_date:carryDay});
  assert.equal(closedCarry.error,null,closedCarry.error?.message);
  assert.equal(Number(closedCarry.data),130);

  const existingRecords=await db.from("hr_employee_records").select("profile_id");
  assert.equal(existingRecords.error,null,existingRecords.error?.message);
  const assignedProfiles=new Set((existingRecords.data ?? []).map((record)=>record.profile_id));
  const staff=await db.from("profiles").select("id").in("role",["admin","employee"]).eq("status","active").limit(100);
  assert.equal(staff.error,null,staff.error?.message);
  const availableStaff=(staff.data ?? []).find((profile)=>!assignedProfiles.has(profile.id));
  assert.ok(availableStaff,"At least one active local admin or employee without an HR record is required.");

  const departmentCode=`QA-${Date.now().toString().slice(-8)}`;
  const department=await db.from("hr_departments").insert({
    code:departmentCode,
    name:`Verification ${departmentCode}`,
    created_by:actor.data.id,
  }).select("id").single();
  assert.equal(department.error,null,department.error?.message);
  departmentId=department.data.id;

  const employee=await db.rpc("create_hr_employee",{
    actor_profile_id:actor.data.id,
    requested_profile_id:availableStaff.id,
    requested_department_id:departmentId,
    requested_job_title:"Verification Specialist",
    requested_employment_type:"full_time",
    requested_hire_date:new Date().toISOString().slice(0,10),
    requested_work_location_id:null,
    requested_manager_profile_id:null,
    requested_base_salary:1,
    requested_currency:"BDT",
  });
  assert.equal(employee.error,null,employee.error?.message);
  employeeRecordId=employee.data;

  const checkedEmployee=await db.from("hr_employee_records")
    .select("profile_id,department_id,job_title,employment_status,salary_currency")
    .eq("id",employeeRecordId)
    .single();
  assert.equal(checkedEmployee.error,null,checkedEmployee.error?.message);
  assert.equal(checkedEmployee.data.profile_id,availableStaff.id);
  assert.equal(checkedEmployee.data.department_id,departmentId);
  assert.equal(checkedEmployee.data.job_title,"Verification Specialist");
  assert.equal(checkedEmployee.data.employment_status,"active");
  assert.equal(checkedEmployee.data.salary_currency,"BDT");
} finally {
  if(employeeRecordId){
    await db.from("audit_logs").delete().eq("entity_id",employeeRecordId);
    await db.from("hr_employee_records").delete().eq("id",employeeRecordId);
  }
  if(departmentId) await db.from("hr_departments").delete().eq("id",departmentId);
  if(carryEntryId) await db.from("cashbook_entries").delete().eq("id",carryEntryId);
  if(carryJournalId){await db.from("journal_lines").delete().eq("journal_entry_id",carryJournalId);await db.from("journal_entries").delete().eq("id",carryJournalId);}
  if(carryDay) await db.from("cashbook_days").delete().eq("business_date",carryDay);
  if(cashbookEntryId) await db.from("cashbook_entries").delete().eq("id",cashbookEntryId);
  if(cashbookJournalId){await db.from("journal_lines").delete().eq("journal_entry_id",cashbookJournalId);await db.from("journal_entries").delete().eq("id",cashbookJournalId);}
  if(cashbookDay) await db.from("cashbook_days").delete().eq("business_date",cashbookDay);
  if(cashbookDescriptionId) await db.from("cashbook_descriptions").delete().eq("id",cashbookDescriptionId);
  for(const entityId of [cashbookEntryId,carryEntryId,cashbookDescriptionId,cashbookDay,carryDay].filter(Boolean)) await db.from("audit_logs").delete().eq("entity_id",entityId);
  if(journalId){await db.from("journal_lines").delete().eq("journal_entry_id",journalId);await db.from("journal_entries").delete().eq("id",journalId);}
}
console.log("Accounting/HR local database probes, balanced journal and cashbook workflows, and HR employee workflow passed.");
