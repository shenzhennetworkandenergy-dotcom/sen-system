import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const files = {
  migration: "supabase/migrations/202607240002_accounting_hr_modules.sql",
  accountingPage: "app/admin/accounting/page.tsx",
  accountingActions: "app/admin/accounting/actions.ts",
  hrPage: "app/admin/hr/page.tsx",
  hrActions: "app/admin/hr/actions.ts",
  navigation: "lib/navigation/dashboard.ts",
};

const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])));
const checks = [
  ["double-entry tables", /create table public\.journal_entries/.test(content.migration) && /create table public\.journal_lines/.test(content.migration)],
  ["balanced journal enforcement", /debit_total<>credit_total/.test(content.migration)],
  ["posting permission", /accounting\.approve_entry/.test(content.migration) && /requirePermission\("accounting\.approve_entry"\)/.test(content.accountingActions)],
  ["HR profile integration", /profile_id uuid not null unique references public\.profiles/.test(content.migration)],
  ["HR department and leave tables", /create table public\.hr_departments/.test(content.migration) && /create table public\.hr_leave_requests/.test(content.migration)],
  ["HR permissions", /hr\.manage_employees/.test(content.migration) && /hr\.manage_leave/.test(content.hrActions)],
  ["RLS enabled", /enable row level security/.test(content.migration)],
  ["service-role-only mutations", /revoke all on function public\.create_journal_entry/.test(content.migration)],
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

const envText = await readFile(".env.local", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,"")];}));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i, "Accounting/HR verification refuses to mutate a non-local database.");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
for (const table of ["accounting_accounts","journal_entries","journal_lines","hr_departments","hr_employee_records","hr_leave_requests","hr_attendance"]) {
  const probe=await db.from(table).select("id").limit(1);
  assert.equal(probe.error,null,`${table} is unavailable locally: ${probe.error?.message}`);
}
const actor=await db.from("profiles").select("id").eq("role","admin").eq("status","active").limit(1).single();
assert.equal(actor.error,null,actor.error?.message);
const accounts=await db.from("accounting_accounts").select("id").eq("is_active",true).order("code").limit(2);
assert.equal(accounts.error,null,accounts.error?.message); assert.equal(accounts.data.length,2,"At least two local accounting accounts are required.");
let journalId;
let departmentId;
let employeeRecordId;
try {
  const created=await db.rpc("create_journal_entry",{actor_profile_id:actor.data.id,requested_date:new Date().toISOString().slice(0,10),requested_description:"Automated local accounting verification",requested_reference_type:"manual",requested_reference_id:null,requested_currency:"BDT",requested_lines:[{account_id:accounts.data[0].id,debit:1,credit:0,description:"Verification debit"},{account_id:accounts.data[1].id,debit:0,credit:1,description:"Verification credit"}]});
  assert.equal(created.error,null,created.error?.message); journalId=created.data;
  const posted=await db.rpc("post_journal_entry",{actor_profile_id:actor.data.id,requested_entry_id:journalId});
  assert.equal(posted.error,null,posted.error?.message);
  const checked=await db.from("journal_entries").select("status,journal_lines(debit,credit)").eq("id",journalId).single();
  assert.equal(checked.error,null,checked.error?.message); assert.equal(checked.data.status,"posted"); assert.equal(checked.data.journal_lines.length,2);

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
  if(journalId){await db.from("journal_lines").delete().eq("journal_entry_id",journalId);await db.from("journal_entries").delete().eq("id",journalId);}
}
console.log("Accounting/HR local database probes, balanced journal workflow, and HR employee workflow passed.");
