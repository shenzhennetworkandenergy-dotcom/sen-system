import fs from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const requiredFiles = [
  "supabase/migrations/202607240003_basic_crm_module.sql",
  "app/admin/crm/page.tsx",
  "app/admin/crm/actions.ts",
  "app/admin/crm/companies/page.tsx",
  "app/admin/crm/contacts/page.tsx",
  "app/admin/crm/leads/new/page.tsx",
  "app/admin/crm/leads/[id]/page.tsx",
  "app/admin/crm/export/route.ts",
  "lib/crm/data.ts",
  "lib/crm/types.ts",
  "components/crm/CrmForms.tsx",
  "docs/CRM.md",
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing CRM file: ${file}`);
}
const migration = fs.readFileSync(requiredFiles[0], "utf8");
for (const token of [
  "crm_companies", "crm_contacts", "crm_leads", "crm_activities",
  "create_crm_company", "create_crm_contact", "create_crm_lead",
  "update_crm_lead_status", "create_crm_activity",
  "current_user_has_permission('crm.view')", "service_role",
]) {
  if (!migration.includes(token)) throw new Error(`CRM migration is missing ${token}`);
}
const navigation = fs.readFileSync("lib/navigation/dashboard.ts", "utf8");
if (!navigation.includes("route:routes.adminCrm") || !navigation.includes('requiredPermission:"crm.view"')) {
  throw new Error("CRM navigation is not permission-aware and operational.");
}
const actions = fs.readFileSync("app/admin/crm/actions.ts", "utf8");
for (const permission of ["crm.create", "crm.edit"]) {
  if (!actions.includes(`requirePermission("${permission}")`)) throw new Error(`CRM action guard missing ${permission}`);
}
console.log("CRM source and security verification passed.");

const envText=fs.readFileSync(".env.local","utf8");
const env=Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,"")];}));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL??"",/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i,"CRM verification refuses to mutate a non-local database.");
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
for(const table of ["crm_companies","crm_contacts","crm_leads","crm_activities"]){const probe=await db.from(table).select("id").limit(1);assert.equal(probe.error,null,`${table} is unavailable locally: ${probe.error?.message}`);}
const actor=await db.from("profiles").select("id").eq("role","admin").eq("status","active").limit(1).single();
assert.equal(actor.error,null,actor.error?.message);
const marker=`CRM Verify ${Date.now()}`; let companyId,contactId,leadId;
try{
  const company=await db.rpc("create_crm_company",{actor_profile_id:actor.data.id,requested_name:marker,requested_legal_name:null,requested_customer_profile_id:null,requested_industry:"Verification",requested_website_url:null,requested_email:"verify@example.test",requested_phone:null,requested_country_code:"BD",requested_country_name:"Bangladesh",requested_address:null,requested_status:"prospect",requested_notes:"Automated local verification"});
  assert.equal(company.error,null,company.error?.message);companyId=company.data;
  const contact=await db.rpc("create_crm_contact",{actor_profile_id:actor.data.id,requested_company_id:companyId,requested_profile_id:null,requested_full_name:"CRM Verification Contact",requested_job_title:"Tester",requested_email:"contact@example.test",requested_phone:null,requested_preferred_method:"email",requested_notes:null});
  assert.equal(contact.error,null,contact.error?.message);contactId=contact.data;
  const lead=await db.rpc("create_crm_lead",{actor_profile_id:actor.data.id,requested_title:"CRM verification opportunity",requested_company_id:companyId,requested_contact_id:contactId,requested_description:"Automated local verification",requested_source:"website",requested_priority:"high",requested_estimated_value:100,requested_currency:"BDT",requested_expected_close_date:null,requested_assigned_to:actor.data.id});
  assert.equal(lead.error,null,lead.error?.message);leadId=lead.data;
  const activity=await db.rpc("create_crm_activity",{actor_profile_id:actor.data.id,requested_lead_id:leadId,requested_company_id:companyId,requested_contact_id:contactId,requested_activity_type:"note",requested_subject:"Verification note",requested_details:"CRM workflow verification",requested_due_at:null,requested_completed:true});
  assert.equal(activity.error,null,activity.error?.message);
  const status=await db.rpc("update_crm_lead_status",{actor_profile_id:actor.data.id,requested_lead_id:leadId,requested_status:"qualified",requested_lost_reason:null});
  assert.equal(status.error,null,status.error?.message);
  const checked=await db.from("crm_leads").select("status,crm_companies(name),crm_contacts(full_name),crm_activities(id)").eq("id",leadId).single();
  assert.equal(checked.error,null,checked.error?.message);assert.equal(checked.data.status,"qualified");assert.equal(checked.data.crm_activities.length,1);
}finally{
  if(leadId){await db.from("crm_activities").delete().eq("lead_id",leadId);await db.from("crm_leads").delete().eq("id",leadId);}
  if(contactId)await db.from("crm_contacts").delete().eq("id",contactId);
  if(companyId)await db.from("crm_companies").delete().eq("id",companyId);
}
console.log("CRM local company, contact, lead, activity and stage workflow passed.");
