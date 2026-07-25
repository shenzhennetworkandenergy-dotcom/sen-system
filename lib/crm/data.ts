import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { crmLeadStatuses } from "@/lib/crm/types";

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
    db.from("crm_activities").select("id,activity_type,subject,details,due_at,completed_at,created_at,profiles!crm_activities_actor_profile_id_fkey(full_name,email)")
      .eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  safeError("CRM lead query failed", lead.error ?? activities.error);
  if (lead.error || activities.error) throw new Error("Unable to load CRM lead.");
  return { lead: lead.data, activities: activities.data ?? [] };
}
