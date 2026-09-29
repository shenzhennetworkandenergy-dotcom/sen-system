import {
  isWhatsappFollowupAllowed,
  normalizeWhatsappNumber,
  parseWhatsappConversation,
  type WhatsappCustomerRecord,
} from "./whatsapp-records.ts";

export type WhatsappCrmContactCandidate = {
  id: string;
  phone: string | null;
  full_name: string;
  company_id: string | null;
};

export type WhatsappCrmLeadCandidate = {
  id: string;
  title: string;
  description: string | null;
  source: string;
  status: string;
  assigned_to?: string | null;
  do_not_contact?: boolean;
};

export type WhatsappCrmFollowupCandidate = { id: string; status: string };

export type WhatsappCrmMatch =
  | { kind: "none" }
  | { kind: "manual_review"; contact_ids: string[] }
  | {
      kind: "matched";
      contact: WhatsappCrmContactCandidate;
      lead?: WhatsappCrmLeadCandidate | null;
      followup?: WhatsappCrmFollowupCandidate | null;
    };

export type WhatsappCrmSyncPlan = {
  manual_review: boolean;
  summary: string;
  contact: {
    action: "create" | "reuse" | "manual_review";
    id: string | null;
    full_name: string;
    phone: string;
    company_id: string | null;
    preferred_method: "whatsapp";
  };
  lead: {
    action: "create" | "reuse" | "win" | "manual_review";
    id: string | null;
    title: string;
    description: string;
    source: "social";
    assigned_to: string | null;
    do_not_contact_action: "enable" | "disable" | "none";
  };
  followup: {
    action: "create" | "update" | "complete" | "cancel" | "do_not_contact" | "none" | "manual_review";
    id: string | null;
    status: "active" | "waiting_customer";
    next_follow_up_at: string | null;
  };
};

export type WhatsappCrmSyncResult =
  | { status: "synced"; contact_id: string; lead_id: string; followup_id: string | null }
  | { status: "manual_review"; message: string }
  | { status: "retryable_error"; message: string };

const purchasedStatuses = new Set(["purchase_confirmed", "purchased"]);

export function canAccessWhatsappRecord(
  profile: { id: string; role: string },
  record: Pick<WhatsappCustomerRecord, "assigned_to">,
) {
  return profile.role === "admin" || record.assigned_to === profile.id;
}

export function chooseWhatsappCrmMatch(
  contacts: readonly WhatsappCrmContactCandidate[],
  whatsappNumber: string,
): WhatsappCrmMatch {
  const expected = normalizeWhatsappNumber(whatsappNumber);
  const matches = contacts.filter((contact) => {
    if (!contact.phone) return false;
    try {
      return normalizeWhatsappNumber(contact.phone) === expected;
    } catch {
      return false;
    }
  });
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "manual_review", contact_ids: matches.map(({ id }) => id) };
  return { kind: "matched", contact: matches[0], lead: null, followup: null };
}

export function selectWhatsappLead(leads: readonly WhatsappCrmLeadCandidate[]) {
  return leads.find((lead) =>
    !["won", "lost"].includes(lead.status) &&
    lead.source === "social" &&
    /^\[WhatsApp\]/i.test(lead.description?.trim() ?? ""),
  ) ?? null;
}

function conciseSummary(record: WhatsappCustomerRecord) {
  const pieces = [
    `WhatsApp customer: ${record.whatsapp_name}`,
    record.interested_products && `Products: ${record.interested_products}`,
    record.quantity_requirements && `Quantity: ${record.quantity_requirements}`,
    `Status: ${record.status}`,
    `Messages retained in offline CSV: ${parseWhatsappConversation(record.conversation_history).length}`,
  ].filter(Boolean);
  return pieces.join("\n").slice(0, 2000);
}

export function buildWhatsappCrmSyncPlan(
  record: WhatsappCustomerRecord,
  match: WhatsappCrmMatch,
): WhatsappCrmSyncPlan {
  const summary = conciseSummary(record);
  const manualReview = match.kind === "manual_review";
  const matched = match.kind === "matched" ? match : null;
  const lead = matched?.lead ?? null;
  const followup = matched?.followup ?? null;
  const purchased = purchasedStatuses.has(record.status);
  const stopped = !isWhatsappFollowupAllowed(record);
  const doNotContact = record.status === "do_not_contact" || /\[do not contact\]/i.test(record.conversation_history);
  const doNotContactAction = manualReview
    ? "none"
    : doNotContact && !lead?.do_not_contact
      ? "enable"
      : !doNotContact && lead?.do_not_contact
        ? "disable"
        : "none";
  const title = `${record.whatsapp_name} - ${record.interested_products || "WhatsApp enquiry"}`.slice(0, 200);

  return {
    manual_review: manualReview,
    summary,
    contact: {
      action: manualReview ? "manual_review" : matched ? "reuse" : "create",
      id: matched?.contact.id ?? null,
      full_name: record.whatsapp_name,
      phone: record.whatsapp_number,
      company_id: matched?.contact.company_id ?? null,
      preferred_method: "whatsapp",
    },
    lead: {
      action: manualReview ? "manual_review" : purchased ? "win" : lead ? "reuse" : "create",
      id: lead?.id ?? null,
      title,
      description: `[WhatsApp]\n${summary}`.slice(0, 3000),
      source: "social",
      assigned_to: record.assigned_to || null,
      do_not_contact_action: doNotContactAction,
    },
    followup: {
      action: manualReview
        ? "manual_review"
        : doNotContact
          ? "do_not_contact"
          : purchased
            ? (followup ? "complete" : "none")
            : stopped
              ? (followup ? "cancel" : "none")
              : followup ? "update" : "create",
      id: followup?.id ?? null,
      status: record.status === "waiting_customer" ? "waiting_customer" : "active",
      next_follow_up_at: record.next_follow_up_at || null,
    },
  };
}

export async function findWhatsappCrmMatch(whatsappNumber: string): Promise<WhatsappCrmMatch> {
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const client = createSupabaseAdminClient();
  const contactsResult = await client.from("crm_contacts")
    .select("id,phone,full_name,company_id")
    .not("phone", "is", null)
    .limit(5000);
  if (contactsResult.error) throw new Error("CRM contact lookup failed.");
  const match = chooseWhatsappCrmMatch(contactsResult.data ?? [], whatsappNumber);
  if (match.kind !== "matched") return match;

  const leadsResult = await client.from("crm_leads")
    .select("id,title,description,source,status,assigned_to,do_not_contact")
    .eq("contact_id", match.contact.id)
    .in("status", ["new", "contacted", "qualified", "proposal"])
    .order("updated_at", { ascending: false });
  if (leadsResult.error) throw new Error("CRM lead lookup failed.");
  const lead = selectWhatsappLead(leadsResult.data ?? []);
  if (!lead) return { ...match, lead: null, followup: null };

  const followupsResult = await client.from("crm_followups")
    .select("id,status")
    .eq("lead_id", lead.id)
    .in("status", ["active", "waiting_customer"])
    .limit(1);
  if (followupsResult.error) throw new Error("CRM follow-up lookup failed.");
  return { ...match, lead, followup: followupsResult.data?.[0] ?? null };
}

export function whatsappSyncFailure(): WhatsappCrmSyncResult {
  return { status: "retryable_error", message: "CRM synchronization needs retry." };
}

async function rpcOrThrow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const result = await promise;
  if (result.error) throw new Error("CRM operation failed.");
  return result.data;
}

export async function syncWhatsappCustomerToCrm(
  actorId: string,
  record: WhatsappCustomerRecord,
): Promise<WhatsappCrmSyncResult> {
  try {
    const match = await findWhatsappCrmMatch(record.whatsapp_number);
    const plan = buildWhatsappCrmSyncPlan(record, match);
    if (plan.manual_review) return { status: "manual_review", message: "Multiple CRM contacts use this WhatsApp number." };

    const { createSupabaseAdminClient } = await import("../supabase/admin");
    const client = createSupabaseAdminClient();
    const contactId = plan.contact.id ?? await rpcOrThrow<string>(client.rpc("create_crm_contact", {
      actor_profile_id: actorId,
      requested_company_id: null,
      requested_profile_id: null,
      requested_full_name: plan.contact.full_name,
      requested_job_title: null,
      requested_email: null,
      requested_phone: plan.contact.phone,
      requested_preferred_method: "whatsapp",
      requested_notes: "Created from the offline WhatsApp CRM workspace.",
    }));
    if (!contactId) throw new Error("CRM contact creation failed.");

    const leadId = plan.lead.id ?? await rpcOrThrow<string>(client.rpc("create_crm_lead", {
      actor_profile_id: actorId,
      requested_title: plan.lead.title,
      requested_company_id: plan.contact.company_id,
      requested_contact_id: contactId,
      requested_description: plan.lead.description,
      requested_source: "social",
      requested_priority: record.urgency === "urgent" ? "urgent" : "medium",
      requested_estimated_value: 0,
      requested_currency: "BDT",
      requested_expected_close_date: null,
      requested_assigned_to: plan.lead.assigned_to,
    }));
    if (!leadId) throw new Error("CRM lead creation failed.");

    if (plan.lead.action === "win") {
      await rpcOrThrow(client.rpc("update_crm_lead_status", {
        actor_profile_id: actorId,
        requested_lead_id: leadId,
        requested_status: "won",
        requested_lost_reason: null,
      }));
    }

    if (plan.lead.do_not_contact_action !== "none") {
      await rpcOrThrow(client.rpc("set_crm_lead_do_not_contact", {
        actor_profile_id: actorId,
        requested_lead_id: leadId,
        requested_enabled: plan.lead.do_not_contact_action === "enable",
        requested_reason: plan.lead.do_not_contact_action === "enable"
          ? "Customer requested no further WhatsApp contact."
          : "WhatsApp customer follow-up reactivated.",
      }));
    }

    let followupId = plan.followup.id;
    if (plan.followup.action === "create") {
      if (!plan.followup.next_follow_up_at) throw new Error("Next follow-up date missing.");
      followupId = await rpcOrThrow<string>(client.rpc("create_crm_followup", {
        actor_profile_id: actorId,
        requested_lead_id: leadId,
        requested_reason: "general_follow_up",
        requested_reason_details: "WhatsApp customer follow-up",
        requested_instruction: "Review the draft, obtain approval, then send manually in WhatsApp.",
        requested_interest_summary: record.interested_products.slice(0, 1000) || null,
        requested_conversation_summary: plan.summary,
        requested_channel: "whatsapp",
        requested_assigned_to: record.assigned_to || actorId,
        requested_priority: record.urgency === "urgent" ? "urgent" : "normal",
        requested_last_contact_at: record.last_communication_at || null,
        requested_next_follow_up_at: plan.followup.next_follow_up_at,
        requested_status: plan.followup.status,
        requested_manual_review: true,
      }));
    } else if (plan.followup.action === "update" && followupId) {
      await rpcOrThrow(client.rpc("update_crm_followup", {
        actor_profile_id: actorId,
        requested_followup_id: followupId,
        requested_reason: "general_follow_up",
        requested_reason_details: "WhatsApp customer follow-up",
        requested_instruction: "Review the draft, obtain approval, then send manually in WhatsApp.",
        requested_interest_summary: record.interested_products.slice(0, 1000) || null,
        requested_conversation_summary: plan.summary,
        requested_channel: "whatsapp",
        requested_assigned_to: record.assigned_to || actorId,
        requested_priority: record.urgency === "urgent" ? "urgent" : "normal",
        requested_status: plan.followup.status,
        requested_manual_review: true,
      }));
    } else if (plan.followup.action === "complete" && followupId) {
      await rpcOrThrow(client.rpc("complete_crm_followup", {
        actor_profile_id: actorId,
        requested_followup_id: followupId,
        requested_outcome: "Customer purchased product",
        requested_summary: plan.summary,
        requested_channel: "whatsapp",
        requested_customer_response: null,
        requested_schedule_next: false,
        requested_next_follow_up_at: null,
        requested_next_reason: null,
        requested_next_instruction: null,
        requested_next_priority: null,
      }));
    } else if (plan.followup.action === "cancel" && followupId) {
      await rpcOrThrow(client.rpc("cancel_crm_followup", {
        actor_profile_id: actorId,
        requested_followup_id: followupId,
        requested_reason: "WhatsApp follow-up stopped.",
      }));
    }

    return { status: "synced", contact_id: contactId, lead_id: leadId, followup_id: followupId ?? null };
  } catch {
    return whatsappSyncFailure();
  }
}
