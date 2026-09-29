"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { classifyWhatsappInterest, type WhatsappCatalogueProduct } from "@/lib/crm/whatsapp-category-classifier";
import { INITIAL_WHATSAPP_CATEGORIES } from "@/lib/crm/whatsapp-categories";
import {
  findWhatsappCategoryRow,
  updateWhatsappCategoryRow,
  upsertCategorizedWhatsappCustomer,
} from "@/lib/crm/whatsapp-category-store";
import {
  formatWhatsappConversation,
  isWhatsappFollowupAllowed,
  whatsappCrmStatuses,
  type WhatsappCustomerRecord,
  type WhatsappCrmStatus,
} from "@/lib/crm/whatsapp-records";
import { canAccessWhatsappRecord, syncWhatsappCustomerToCrm } from "@/lib/crm/whatsapp-sync";

const base = "/admin/crm/whatsapp";
const text = (form: FormData, key: string, max = 10_000) => String(form.get(key) ?? "").trim().slice(0, max);
const destination = (customerId?: string) => customerId ? `${base}/${customerId}` : base;

async function catalogueProducts(): Promise<WhatsappCatalogueProduct[]> {
  const { data, error } = await createSupabaseAdminClient().from("products")
    .select("name,slug,sku,model_number,business_categories!products_business_category_id_fkey(slug)")
    .eq("status", "active")
    .eq("public_catalogue_visible", true);
  if (error) throw new Error("Unable to load the product catalogue.");
  return (data ?? []).flatMap((row) => {
    const linked = Array.isArray(row.business_categories) ? row.business_categories[0] : row.business_categories;
    return linked?.slug ? [{
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      modelNumber: row.model_number ?? undefined,
      categorySlug: linked.slug,
    }] : [];
  });
}

async function ownedRecord(profile: { id: string; role: string }, customerId: string) {
  const record = await findWhatsappCategoryRow(customerId);
  if (!record || !canAccessWhatsappRecord(profile, record)) return null;
  return record;
}

export async function upsertWhatsappCustomerAction(form: FormData) {
  const { profile } = await requirePermission("crm.create");
  const requestedStatus = text(form, "status", 40) as WhatsappCrmStatus;
  const assigned = profile.role === "admin" ? text(form, "assigned_to", 36) || profile.id : profile.id;
  let records: WhatsappCustomerRecord[];
  try {
    const interestedProducts = text(form, "interested_products", 1000);
    const quantityRequirements = text(form, "quantity_requirements", 1000);
    const conversationHistory = text(form, "conversation_history", 500_000);
    const assignments = classifyWhatsappInterest({
      interestedProducts,
      quantityRequirements,
      conversationHistory,
    }, await catalogueProducts(), INITIAL_WHATSAPP_CATEGORIES);
    records = await upsertCategorizedWhatsappCustomer({
      messenger_profile_link: text(form, "messenger_profile_link", 4000),
      whatsapp_name: text(form, "whatsapp_name", 160),
      whatsapp_number: text(form, "whatsapp_number", 60),
      interested_products: interestedProducts,
      quantity_requirements: quantityRequirements,
      urgency: text(form, "urgency", 100),
      status: whatsappCrmStatuses.includes(requestedStatus) ? requestedStatus : "new",
      conversation_history: conversationHistory,
      assigned_to: assigned,
    }, assignments);
    for (const record of records) {
      const synced = await syncWhatsappCustomerToCrm(profile.id, record);
      await updateWhatsappCategoryRow(record.customer_id, {
        follow_up_report: synced.status === "synced" ? "CRM synchronized." : synced.message,
      });
    }
  } catch {
    redirect(`${base}?error=Unable%20to%20save%20the%20WhatsApp%20customer.`);
  }
  revalidatePath(base);
  revalidatePath(`${base}/preview`);
  redirect(`${destination(records[0].customer_id)}?success=Customer%20saved.`);
}

export async function syncWhatsappCustomerAction(customerId: string) {
  const { profile } = await requirePermission("crm.edit");
  const record = await ownedRecord(profile, customerId);
  if (!record) redirect(`${base}?error=Customer%20not%20available.`);
  const result = await syncWhatsappCustomerToCrm(profile.id, record);
  await updateWhatsappCategoryRow(record.customer_id, { follow_up_report: result.status === "synced" ? "CRM synchronized." : result.message });
  revalidatePath(destination(customerId));
  redirect(`${destination(customerId)}?${result.status === "synced" ? "success=CRM%20synchronized." : "error=CRM%20synchronization%20needs%20review."}`);
}

export async function saveWhatsappDraftAction(customerId: string, form: FormData) {
  const { profile } = await requirePermission("crm.edit");
  const record = await ownedRecord(profile, customerId);
  if (!record || !canAccessWhatsappRecord(profile, record)) redirect(`${base}?error=Customer%20not%20available.`);
  if (!isWhatsappFollowupAllowed(record)) redirect(`${destination(customerId)}?error=Follow-up%20is%20stopped%20for%20this%20customer.`);
  await updateWhatsappCategoryRow(record.customer_id, { draft_reply: text(form, "draft_reply", 10_000) });
  revalidatePath(destination(customerId));
  redirect(`${destination(customerId)}?success=Draft%20saved%20for%20approval.`);
}

export async function updateWhatsappCustomerStatusAction(customerId: string, form: FormData) {
  const { profile } = await requirePermission("crm.edit");
  const record = await ownedRecord(profile, customerId);
  if (!record || !canAccessWhatsappRecord(profile, record)) redirect(`${base}?error=Customer%20not%20available.`);
  const requested = text(form, "status", 40) as WhatsappCrmStatus;
  if (!whatsappCrmStatuses.includes(requested)) redirect(`${destination(customerId)}?error=Invalid%20status.`);
  const updated = await updateWhatsappCategoryRow(record.customer_id, { status: requested });
  const result = await syncWhatsappCustomerToCrm(profile.id, updated);
  await updateWhatsappCategoryRow(updated.customer_id, {
    follow_up_report: result.status === "synced" ? "CRM synchronized." : result.message,
  });
  revalidatePath(destination(customerId));
  redirect(`${destination(customerId)}?${result.status === "synced" ? "success=Status%20updated." : "error=Status%20saved;%20CRM%20synchronization%20needs%20review."}`);
}

export async function recordApprovedWhatsappSendAction(customerId: string, form: FormData) {
  const { profile } = await requirePermission("crm.edit");
  const record = await ownedRecord(profile, customerId);
  if (!record || !canAccessWhatsappRecord(profile, record)) redirect(`${base}?error=Customer%20not%20available.`);
  if (!isWhatsappFollowupAllowed(record)) redirect(`${destination(customerId)}?error=Follow-up%20is%20stopped%20for%20this%20customer.`);
  const sentText = text(form, "sent_text", 10_000);
  if (!sentText) redirect(`${destination(customerId)}?error=Sent%20text%20is%20required.`);
  const message = formatWhatsappConversation([{ at: new Date().toISOString(), role: "S", text: sentText }]);
  await updateWhatsappCategoryRow(record.customer_id, {
    conversation_history: message,
    draft_reply: "",
    follow_up_report: "Approved reply recorded as manually sent.",
  });
  revalidatePath(destination(customerId));
  redirect(`${destination(customerId)}?success=Manual%20send%20recorded.`);
}
