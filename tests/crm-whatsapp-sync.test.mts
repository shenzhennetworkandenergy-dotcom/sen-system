import assert from "node:assert/strict";
import test from "node:test";

import { mergeWhatsappCustomer } from "../lib/crm/whatsapp-records.ts";
import {
  buildWhatsappCrmSyncPlan,
  canAccessWhatsappRecord,
  chooseWhatsappCrmMatch,
  selectWhatsappLead,
  whatsappSyncFailure,
} from "../lib/crm/whatsapp-sync.ts";

const record = mergeWhatsappCustomer(null, {
  whatsapp_name: "Offline Buyer",
  whatsapp_number: "+880 1712-345678",
  interested_products: "Cisco 24-port PoE switch",
  quantity_requirements: "2 units",
  status: "interested",
  assigned_to: "employee-1",
  conversation_history: "2026-09-28T10:15+06:00|C|Need two Cisco PoE switches",
}, new Date("2026-09-28T05:00:00.000Z"));

test("admin sees every row while employee sees only their assignment", () => {
  assert.equal(canAccessWhatsappRecord({ id: "admin-1", role: "admin" }, record), true);
  assert.equal(canAccessWhatsappRecord({ id: "employee-1", role: "employee" }, record), true);
  assert.equal(canAccessWhatsappRecord({ id: "employee-2", role: "employee" }, record), false);
});

test("normalizes CRM phone values before choosing an existing contact", () => {
  const match = chooseWhatsappCrmMatch([
    { id: "contact-1", phone: "+880 1712-345678", full_name: "Buyer", company_id: "company-1" },
    { id: "contact-2", phone: "+880 1812-345678", full_name: "Other", company_id: null },
  ], "00880 1712 345678");

  assert.equal(match.kind, "matched");
  if (match.kind === "matched") assert.equal(match.contact.id, "contact-1");

  assert.equal(chooseWhatsappCrmMatch([
    { id: "contact-1", phone: "+8801712345678", full_name: "Buyer", company_id: null },
    { id: "contact-3", phone: "880 1712 345678", full_name: "Duplicate", company_id: null },
  ], "8801712345678").kind, "manual_review");
});

test("reuses an active WhatsApp lead before creating another opportunity", () => {
  const lead = selectWhatsappLead([
    { id: "other", title: "Website enquiry", description: "Landing page", source: "website", status: "qualified" },
    { id: "whatsapp", title: "Offline Buyer - Cisco switch", description: "[WhatsApp] Cisco 24-port PoE switch", source: "social", status: "contacted" },
  ]);
  assert.equal(lead?.id, "whatsapp");
});

test("maps WhatsApp records to contact lead activity and three-day follow-up inputs", () => {
  const plan = buildWhatsappCrmSyncPlan(record, { kind: "none" });

  assert.equal(plan.contact.action, "create");
  assert.equal(plan.contact.preferred_method, "whatsapp");
  assert.equal(plan.lead.action, "create");
  assert.equal(plan.lead.source, "social");
  assert.match(plan.lead.description, /^\[WhatsApp\]/);
  assert.equal(plan.followup.action, "create");
  assert.equal(plan.followup.next_follow_up_at, "2026-10-01T04:15:00.000Z");
  assert.ok(plan.summary.length <= 2000);
  assert.doesNotMatch(plan.summary, /Company:|Budget:|Delivery:/);
  assert.doesNotMatch(plan.summary, /Need two Cisco PoE switches/);
});

test("maps purchased status to won lead and completed follow-up", () => {
  const purchased = { ...record, status: "purchased" as const, next_follow_up_at: "" };
  const plan = buildWhatsappCrmSyncPlan(purchased, {
    kind: "matched",
    contact: { id: "contact-1", phone: record.whatsapp_number, full_name: record.whatsapp_name, company_id: null },
    lead: { id: "lead-1", title: "WhatsApp sale", description: "[WhatsApp]", source: "social", status: "proposal" },
    followup: { id: "followup-1", status: "active" },
  });

  assert.equal(plan.lead.action, "win");
  assert.equal(plan.followup.action, "complete");
  assert.equal(buildWhatsappCrmSyncPlan(purchased, { kind: "none" }).lead.action, "win");
});

test("cancels paused follow-ups and applies do-not-contact at lead level", () => {
  for (const status of ["paused", "do_not_contact"] as const) {
    const stopped = { ...record, status, next_follow_up_at: "" };
    const withFollowup = buildWhatsappCrmSyncPlan(stopped, {
      kind: "matched",
      contact: { id: "contact-1", phone: record.whatsapp_number, full_name: record.whatsapp_name, company_id: null },
      lead: { id: "lead-1", title: "WhatsApp sale", description: "[WhatsApp]", source: "social", status: "contacted" },
      followup: { id: "followup-1", status: "active" },
    });

    assert.equal(withFollowup.lead.action, "reuse");
    assert.equal(withFollowup.followup.action, status === "do_not_contact" ? "do_not_contact" : "cancel");
    assert.equal(
      buildWhatsappCrmSyncPlan(stopped, { kind: "none" }).followup.action,
      status === "do_not_contact" ? "do_not_contact" : "none",
    );
  }
});

test("cancels CRM follow-ups after an explicit refusal marker", () => {
  const match = {
    kind: "matched" as const,
    contact: { id: "contact-1", phone: record.whatsapp_number, full_name: record.whatsapp_name, company_id: null },
    lead: { id: "lead-1", title: "WhatsApp sale", description: "[WhatsApp]", source: "social", status: "contacted" },
    followup: { id: "followup-1", status: "active" },
  };

  const plan = buildWhatsappCrmSyncPlan({
    ...record,
    conversation_history: "2026-09-28T10:15+06:00|C|[Do not contact] Please stop messaging me",
  }, match);
  assert.equal(plan.followup.action, "do_not_contact");
  assert.equal(plan.lead.do_not_contact_action, "enable");
});

test("clears a CRM do-not-contact restriction when the offline customer is reactivated", () => {
  const plan = buildWhatsappCrmSyncPlan(record, {
    kind: "matched",
    contact: { id: "contact-1", phone: record.whatsapp_number, full_name: record.whatsapp_name, company_id: null },
    lead: {
      id: "lead-1",
      title: "WhatsApp sale",
      description: "[WhatsApp]",
      source: "social",
      status: "contacted",
      do_not_contact: true,
    },
    followup: null,
  });

  assert.equal(plan.lead.do_not_contact_action, "disable");
  assert.equal(plan.followup.action, "create");
});

test("returns a retryable synchronization failure without logging customer content", () => {
  const failure = whatsappSyncFailure();
  assert.deepEqual(failure, { status: "retryable_error", message: "CRM synchronization needs retry." });
  assert.doesNotMatch(JSON.stringify(failure), /Offline Buyer|8801712345678|Cisco/i);
});
