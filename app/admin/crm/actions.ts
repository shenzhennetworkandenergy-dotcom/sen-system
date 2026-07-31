"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeCurrencyCode } from "@/lib/currency/currencies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { crmActivityTypes, crmLeadPriorities, crmLeadSources, crmLeadStatuses } from "@/lib/crm/types";

const base = "/admin/crm";
const text = (form: FormData, key: string, max = 2000) => String(form.get(key) ?? "").trim().slice(0, max);
const nullable = (form: FormData, key: string, max = 2000) => text(form, key, max) || null;
const selectedUuid = (form: FormData, key: string) => {
  const value = text(form, key, 36);
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null;
};
const safeMessage = (value: string | undefined) =>
  value && /company|contact|lead|activity|name|email|phone|status|permission|assignee|required|invalid/i.test(value)
    ? value
    : "Unable to complete the CRM operation.";

export async function createCrmCompanyAction(form: FormData) {
  const { profile } = await requirePermission("crm.create");
  const result = await createSupabaseAdminClient().rpc("create_crm_company", {
    actor_profile_id: profile.id,
    requested_name: text(form, "name", 180),
    requested_legal_name: nullable(form, "legal_name", 180),
    requested_customer_profile_id: selectedUuid(form, "customer_profile_id"),
    requested_industry: nullable(form, "industry", 120),
    requested_website_url: nullable(form, "website_url", 300),
    requested_email: nullable(form, "email", 200),
    requested_phone: nullable(form, "phone", 60),
    requested_country_code: nullable(form, "country_code", 2),
    requested_country_name: nullable(form, "country_name", 100),
    requested_address: nullable(form, "address", 600),
    requested_status: ["active", "inactive", "prospect"].includes(text(form, "status")) ? text(form, "status") : "active",
    requested_notes: nullable(form, "notes"),
  });
  if (result.error) redirect(`${base}/companies?error=${encodeURIComponent(safeMessage(result.error.message))}`);
  revalidatePath(base);
  redirect(`${base}/companies?success=Company%20created.`);
}

export async function createCrmContactAction(form: FormData) {
  const { profile } = await requirePermission("crm.create");
  const result = await createSupabaseAdminClient().rpc("create_crm_contact", {
    actor_profile_id: profile.id,
    requested_company_id: selectedUuid(form, "company_id"),
    requested_profile_id: selectedUuid(form, "profile_id"),
    requested_full_name: text(form, "full_name", 160),
    requested_job_title: nullable(form, "job_title", 120),
    requested_email: nullable(form, "email", 200),
    requested_phone: nullable(form, "phone", 60),
    requested_preferred_method: ["email", "phone", "whatsapp", "other"].includes(text(form, "preferred_contact_method")) ? text(form, "preferred_contact_method") : "email",
    requested_notes: nullable(form, "notes"),
  });
  if (result.error) redirect(`${base}/contacts?error=${encodeURIComponent(safeMessage(result.error.message))}`);
  revalidatePath(base);
  redirect(`${base}/contacts?success=Contact%20created.`);
}

export async function createCrmLeadAction(form: FormData) {
  const { profile } = await requirePermission("crm.create");
  const source = text(form, "source") as (typeof crmLeadSources)[number];
  const priority = text(form, "priority") as (typeof crmLeadPriorities)[number];
  const result = await createSupabaseAdminClient().rpc("create_crm_lead", {
    actor_profile_id: profile.id,
    requested_title: text(form, "title", 200),
    requested_company_id: selectedUuid(form, "company_id"),
    requested_contact_id: selectedUuid(form, "contact_id"),
    requested_description: nullable(form, "description"),
    requested_source: crmLeadSources.includes(source) ? source : "other",
    requested_priority: crmLeadPriorities.includes(priority) ? priority : "medium",
    requested_estimated_value: Math.max(0, Number(form.get("estimated_value") ?? 0)),
    requested_currency: normalizeCurrencyCode(form.get("currency") ?? "BDT"),
    requested_expected_close_date: nullable(form, "expected_close_date", 10),
    requested_assigned_to: selectedUuid(form, "assigned_to"),
  });
  if (result.error || !result.data) redirect(`${base}/leads/new?error=${encodeURIComponent(safeMessage(result.error?.message))}`);
  revalidatePath(base);
  redirect(`${base}/leads/${result.data}?success=Lead%20created.`);
}

export async function updateCrmLeadStatusAction(leadId: string, form: FormData) {
  const { profile } = await requirePermission("crm.edit");
  const status = text(form, "status") as (typeof crmLeadStatuses)[number];
  if (!crmLeadStatuses.includes(status)) redirect(`${base}/leads/${leadId}?error=Invalid%20lead%20status.`);
  const result = await createSupabaseAdminClient().rpc("update_crm_lead_status", {
    actor_profile_id: profile.id,
    requested_lead_id: leadId,
    requested_status: status,
    requested_lost_reason: nullable(form, "lost_reason", 500),
  });
  if (result.error) redirect(`${base}/leads/${leadId}?error=${encodeURIComponent(safeMessage(result.error.message))}`);
  revalidatePath(base);
  revalidatePath(`${base}/leads/${leadId}`);
  redirect(`${base}/leads/${leadId}?success=Lead%20status%20updated.`);
}

export async function createCrmActivityAction(leadId: string, form: FormData) {
  const { profile } = await requirePermission("crm.edit");
  const activityType = text(form, "activity_type") as (typeof crmActivityTypes)[number];
  const result = await createSupabaseAdminClient().rpc("create_crm_activity", {
    actor_profile_id: profile.id,
    requested_lead_id: leadId,
    requested_company_id: selectedUuid(form, "company_id"),
    requested_contact_id: selectedUuid(form, "contact_id"),
    requested_activity_type: crmActivityTypes.includes(activityType) ? activityType : "note",
    requested_subject: text(form, "subject", 200),
    requested_details: nullable(form, "details"),
    requested_due_at: nullable(form, "due_at", 40),
    requested_completed: form.get("completed") === "on",
  });
  if (result.error) redirect(`${base}/leads/${leadId}?error=${encodeURIComponent(safeMessage(result.error.message))}`);
  revalidatePath(`${base}/leads/${leadId}`);
  redirect(`${base}/leads/${leadId}?success=Activity%20recorded.`);
}
