import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/202609290002_crm_followups_phase1_phase2.sql");
const actions = read("app/admin/crm/actions.ts");
const data = read("lib/crm/data.ts");
const workspace = read("app/admin/crm/follow-ups/page.tsx");
const leadPage = read("app/admin/crm/leads/[id]/page.tsx");
const crmPage = read("app/admin/crm/page.tsx");
const companies = read("app/admin/crm/companies/page.tsx");
const contacts = read("app/admin/crm/contacts/page.tsx");
const chatbot = read("app/admin/crm/chatbot/page.tsx");

test("Phase 1 extends existing CRM entities without duplicating customers", () => {
  assert.match(migration, /create table public\.crm_followups/);
  assert.match(migration, /lead_id uuid not null references public\.crm_leads/);
  assert.match(migration, /company_id uuid references public\.crm_companies/);
  assert.match(migration, /contact_id uuid references public\.crm_contacts/);
  assert.doesNotMatch(migration, /create table public\.(customers|users|employees|companies|contacts|leads)\b/);
});

test("create, edit, complete, next follow-up and reschedule operations are database-authoritative", () => {
  for (const fn of ["create_crm_followup", "update_crm_followup", "reschedule_crm_followup", "complete_crm_followup", "cancel_crm_followup", "record_crm_followup_activity", "set_crm_lead_do_not_contact"]) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\(`));
    assert.match(actions, new RegExp(`rpc\\("${fn}"`));
  }
  assert.match(migration, /previous_due_at/);
  assert.match(migration, /followup_id,activity_type,subject[\s\S]*'rescheduled'/);
  assert.match(migration, /status='completed',completed_at=now\(\)/);
  assert.match(migration, /if coalesce\(requested_schedule_next,false\) then[\s\S]*insert into public\.crm_followups/);
});

test("do-not-contact blocks active creation and removes records from normal queues", () => {
  assert.match(migration, /if lead_row\.do_not_contact then raise exception 'Do not contact is enabled for this lead'/);
  assert.match(migration, /status='do_not_contact'[\s\S]*status in \('active','waiting_customer'\)/);
  assert.match(data, /query\.in\("status", \["active", "waiting_customer"\]\)/);
});

test("permissions cover view, create, edit, complete, assignment and all-record scope", () => {
  for (const permission of ["crm.followups_view", "crm.followups_create", "crm.followups_edit", "crm.followups_complete", "crm.followups_assign", "crm.followups_view_all"]) {
    assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.match(migration, /crm_followup_actor_can_access/);
  assert.match(migration, /assigned_to=auth\.uid\(\) or created_by=auth\.uid\(\)/);
});

test("Phase 2 workspace exposes real cards, filters, actions and empty states", () => {
  for (const label of ["Due today", "Overdue", "Upcoming", "Waiting customer", "Needs attention", "Completed today"]) assert.match(workspace, new RegExp(label));
  for (const field of ['name="q"', 'name="status"', 'name="priority"', 'name="channel"', 'name="assigned_to"', 'name="from"', 'name="to"']) assert.match(workspace, new RegExp(field));
  for (const action of ["Open profile", "History", "Open WhatsApp"]) assert.match(workspace, new RegExp(action));
  assert.match(workspace, /No follow-ups due today\./);
  assert.match(workspace, /No overdue follow-ups\./);
  assert.match(workspace, /No follow-ups match these filters\./);
});

test("lead detail provides follow-up state, completion flows, restriction and chronological history", () => {
  assert.match(leadPage, />Follow-up</);
  assert.match(leadPage, /CreateFollowupForm/);
  assert.match(leadPage, /FollowupActionForms/);
  assert.match(leadPage, /DoNotContactForm/);
  assert.match(leadPage, /id="followup-history"/);
  assert.match(leadPage, /Customer response:/);
  assert.match(leadPage, /Rescheduled:/);
});

test("existing CRM leads, companies, contacts and Product Assistant remain wired", () => {
  assert.match(crmPage, /getCrmDashboard/);
  assert.match(crmPage, /Product Assistant inquiries/);
  assert.match(crmPage, /\/admin\/crm\/follow-ups/);
  assert.match(companies, /CompanyForm/);
  assert.match(contacts, /ContactForm/);
  assert.match(chatbot, /\.from\("crm_chatbot_inquiries"\)/);
});

test("follow-up query uses server-side ownership and operational filters", () => {
  assert.match(data, /query = query\.eq\("assigned_to", actorId\)/);
  assert.match(data, /query\.eq\("priority", params\.priority\)/);
  assert.match(data, /query\.eq\("preferred_channel", params\.channel\)/);
  assert.match(data, /\.gte\("next_follow_up_at", start\)\.lt\("next_follow_up_at", end\)/);
  assert.match(data, /\.limit\(500\)/);
});
