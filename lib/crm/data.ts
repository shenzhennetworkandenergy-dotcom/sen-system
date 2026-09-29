import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { crmLeadStatuses } from "@/lib/crm/types";
import { classifyFollowup, CRM_TIME_ZONE, followupSortRank, needsFollowupAttention } from "@/lib/crm/followups";

function safeError(context: string, error: { code?: string; message?: string } | null) {
  if (error) console.error(context, { code: error.code, message: error.message });
}

export async function getCrmDashboard(params: Record<string, string | undefined>) {
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number(params.page) || 1);
  const size = 25;
  let query = db.from("crm_leads").select(
    "id,lead_number,title,status,priority,estimated_value,currency,expected_close_date,created_at,crm_companies(name),crm_contacts(full_name),profiles!crm_leads_assigned_to_fkey(full_name,email)",
    { count: "exact" },
  );
  const status = crmLeadStatuses.includes(params.status as (typeof crmLeadStatuses)[number]) ? params.status : undefined;
  if (status) query = query.eq("status", status);
  if (params.q?.trim()) query = query.or(`lead_number.ilike.%${params.q.trim()}%,title.ilike.%${params.q.trim()}%`);
  const [leads, companies, contacts, staff, allLeads] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1),
    db.from("crm_companies").select("id,name,status,country_name,email,phone,created_at").order("name"),
    db.from("crm_contacts").select("id,full_name,email,phone,status,company_id,crm_companies(name)").order("full_name"),
    db.from("profiles").select("id,full_name,email,role").in("role", ["admin", "employee"]).eq("status", "active").order("full_name"),
    db.from("crm_leads").select("status,estimated_value"),
  ]);
  const error = leads.error ?? companies.error ?? contacts.error ?? staff.error ?? allLeads.error;
  safeError("CRM dashboard query failed", error);
  if (error) throw new Error("Unable to load CRM data.");
  const rows = allLeads.data ?? [];
  return {
    leads: leads.data ?? [],
    count: leads.count ?? 0,
    page,
    size,
    companies: companies.data ?? [],
    contacts: contacts.data ?? [],
    staff: staff.data ?? [],
    metrics: {
      companies: companies.data?.length ?? 0,
      contacts: contacts.data?.length ?? 0,
      open: rows.filter((item) => !["won", "lost"].includes(item.status)).length,
      won: rows.filter((item) => item.status === "won").length,
      pipeline: rows.filter((item) => !["won", "lost"].includes(item.status)).reduce((sum, item) => sum + Number(item.estimated_value), 0),
    },
  };
}

export async function getCrmLead(leadId: string) {
  const db = createSupabaseAdminClient();
  const [lead, activities] = await Promise.all([
    db.from("crm_leads").select(
      "*,crm_companies(id,name,email,phone,country_name),crm_contacts(id,full_name,email,phone),profiles!crm_leads_assigned_to_fkey(id,full_name,email)",
    ).eq("id", leadId).maybeSingle(),
    db.from("crm_activities").select("id,followup_id,activity_type,subject,details,due_at,completed_at,created_at,communication_channel,direction,outcome,customer_response,next_follow_up_at,next_instruction,previous_due_at,profiles!crm_activities_actor_profile_id_fkey(full_name,email)")
      .eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  safeError("CRM lead query failed", lead.error ?? activities.error);
  if (lead.error || activities.error) throw new Error("Unable to load CRM lead.");
  return { lead: lead.data, activities: activities.data ?? [] };
}

const followupSelect = "id,lead_id,company_id,contact_id,status,reason,reason_details,instruction,interest_summary,conversation_summary,preferred_channel,assigned_to,priority,last_contact_at,next_follow_up_at,manual_review,completed_at,cancelled_at,completion_outcome,created_at,updated_at,crm_leads(id,lead_number,title,status,do_not_contact,do_not_contact_reason),crm_companies(id,name,phone,email),crm_contacts(id,full_name,phone,email,preferred_contact_method),profiles!crm_followups_assigned_to_fkey(id,full_name,email)";

function dhakaDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CRM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function dhakaDayRange(now = new Date()) {
  const key = dhakaDateKey(now);
  const start = new Date(`${key}T00:00:00+06:00`);
  return { key, start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function validDateKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00+06:00`).getTime()) ? value : null;
}

export async function getCrmFollowupsForLead(leadId: string, actorId: string, canViewAll: boolean) {
  const db = createSupabaseAdminClient();
  let query = db.from("crm_followups").select(followupSelect).eq("lead_id", leadId);
  if (!canViewAll) query = query.eq("assigned_to", actorId);
  const { data, error } = await query.order("created_at", { ascending: false });
  safeError("CRM lead follow-up query failed", error);
  if (error) throw new Error("Unable to load CRM follow-ups.");
  return data ?? [];
}

export async function getCrmFollowupWorkspace(
  actorId: string,
  canViewAll: boolean,
  params: Record<string, string | undefined>,
) {
  const db = createSupabaseAdminClient();
  const { start, end } = dhakaDayRange();
  let query = db.from("crm_followups").select(followupSelect);
  if (!canViewAll || params.mine === "1") query = query.eq("assigned_to", actorId);
  if (params.assigned_to && canViewAll) query = query.eq("assigned_to", params.assigned_to);
  if (params.priority && ["low", "normal", "high", "urgent"].includes(params.priority)) query = query.eq("priority", params.priority);
  if (params.channel && ["whatsapp", "phone", "email", "messenger", "wechat", "other"].includes(params.channel)) query = query.eq("preferred_channel", params.channel);
  if (params.status === "waiting_customer") query = query.eq("status", "waiting_customer");
  else if (params.status === "completed_today") query = query.eq("status", "completed").gte("completed_at", start).lt("completed_at", end);
  else if (params.status === "completed") query = query.eq("status", "completed");
  else if (params.status === "cancelled") query = query.eq("status", "cancelled");
  else if (params.status === "do_not_contact") query = query.eq("status", "do_not_contact");
  else if (params.status === "due" || params.quick === "today") query = query.eq("status", "active").gte("next_follow_up_at", start).lt("next_follow_up_at", end);
  else if (params.status === "overdue" || params.quick === "overdue") query = query.eq("status", "active").lt("next_follow_up_at", start);
  else if (params.status === "upcoming") query = query.eq("status", "active").gte("next_follow_up_at", end);
  else if (params.quick === "week") query = query.in("status", ["active", "waiting_customer"]).gte("next_follow_up_at", start).lt("next_follow_up_at", new Date(new Date(start).getTime() + 7 * 86_400_000).toISOString());
  else query = query.in("status", ["active", "waiting_customer"]);
  const from = validDateKey(params.from);
  const to = validDateKey(params.to);
  if (from) query = query.gte("next_follow_up_at", `${from}T00:00:00+06:00`);
  if (to) query = query.lt("next_follow_up_at", new Date(new Date(`${to}T00:00:00+06:00`).getTime() + 86_400_000).toISOString());

  if (params.q?.trim()) {
    const term = params.q.trim().replace(/[,%()]/g, " ").slice(0, 100);
    const [leadMatches, companyMatches, contactMatches] = await Promise.all([
      db.from("crm_leads").select("id").or(`lead_number.ilike.%${term}%,title.ilike.%${term}%`).limit(200),
      db.from("crm_companies").select("id").or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(200),
      db.from("crm_contacts").select("id").or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(200),
    ]);
    const searchError = leadMatches.error ?? companyMatches.error ?? contactMatches.error;
    safeError("CRM follow-up search failed", searchError);
    if (searchError) throw new Error("Unable to search CRM follow-ups.");
    const leadIds = new Set((leadMatches.data ?? []).map((item) => item.id));
    const companyIds = (companyMatches.data ?? []).map((item) => item.id);
    const contactIds = (contactMatches.data ?? []).map((item) => item.id);
    if (companyIds.length || contactIds.length) {
      const filters = [companyIds.length ? `company_id.in.(${companyIds.join(",")})` : "", contactIds.length ? `contact_id.in.(${contactIds.join(",")})` : ""].filter(Boolean).join(",");
      const related = await db.from("crm_leads").select("id").or(filters).limit(400);
      safeError("CRM related customer search failed", related.error);
      if (related.error) throw new Error("Unable to search CRM follow-ups.");
      for (const item of related.data ?? []) leadIds.add(item.id);
    }
    query = leadIds.size ? query.in("lead_id", [...leadIds]) : query.eq("lead_id", "00000000-0000-0000-0000-000000000000");
  }

  const [{ data, error }, metricResult, staff] = await Promise.all([
    query.order("next_follow_up_at", { ascending: true }).limit(500),
    getCrmFollowupMetricRows(actorId, canViewAll),
    getCrmFollowupStaff(),
  ]);
  safeError("CRM follow-up workspace query failed", error);
  if (error) throw new Error("Unable to load CRM follow-up workspace.");
  const now = new Date();
  let rows = (data ?? []).map((row) => ({
    ...row,
    queue_status: classifyFollowup({ status: row.status, nextFollowupAt: row.next_follow_up_at, priority: row.priority, assignedTo: row.assigned_to, manualReview: row.manual_review }, now),
    needs_attention: needsFollowupAttention({ status: row.status, nextFollowupAt: row.next_follow_up_at, priority: row.priority, assignedTo: row.assigned_to, manualReview: row.manual_review }, now),
  })).sort((a, b) => followupSortRank({ status: a.status, nextFollowupAt: a.next_follow_up_at, priority: a.priority, assignedTo: a.assigned_to, manualReview: a.manual_review }, now) - followupSortRank({ status: b.status, nextFollowupAt: b.next_follow_up_at, priority: b.priority, assignedTo: b.assigned_to, manualReview: b.manual_review }, now) || String(a.next_follow_up_at).localeCompare(String(b.next_follow_up_at)));
  if (params.status === "attention") rows = rows.filter((row) => row.needs_attention);
  return { rows, metrics: metricResult, staff, today: dhakaDateKey() };
}

export async function getCrmFollowupStaff() {
  const { data, error } = await createSupabaseAdminClient().from("profiles").select("id,full_name,email").in("role", ["admin", "employee"]).eq("status", "active").order("full_name");
  safeError("CRM follow-up staff query failed", error);
  if (error) throw new Error("Unable to load CRM staff.");
  return data ?? [];
}

async function getCrmFollowupMetricRows(actorId: string, canViewAll: boolean) {
  const db = createSupabaseAdminClient();
  let query = db.from("crm_followups").select("status,next_follow_up_at,priority,assigned_to,manual_review,completed_at");
  if (!canViewAll) query = query.eq("assigned_to", actorId);
  const { data, error } = await query.limit(5000);
  safeError("CRM follow-up metrics query failed", error);
  if (error) throw new Error("Unable to load CRM follow-up metrics.");
  const now = new Date();
  const { start, end } = dhakaDayRange(now);
  const rows = data ?? [];
  return {
    due: rows.filter((row) => classifyFollowup({ status: row.status, nextFollowupAt: row.next_follow_up_at }, now) === "due").length,
    overdue: rows.filter((row) => classifyFollowup({ status: row.status, nextFollowupAt: row.next_follow_up_at }, now) === "overdue").length,
    upcoming: rows.filter((row) => classifyFollowup({ status: row.status, nextFollowupAt: row.next_follow_up_at }, now) === "upcoming").length,
    waiting: rows.filter((row) => row.status === "waiting_customer").length,
    attention: rows.filter((row) => needsFollowupAttention({ status: row.status, nextFollowupAt: row.next_follow_up_at, priority: row.priority, assignedTo: row.assigned_to, manualReview: row.manual_review }, now)).length,
    completedToday: rows.filter((row) => row.status === "completed" && row.completed_at && row.completed_at >= start && row.completed_at < end).length,
  };
}
