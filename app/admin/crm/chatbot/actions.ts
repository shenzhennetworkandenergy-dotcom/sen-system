"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { chatbotInquiryStatuses, type ChatbotInquiryStatus } from "@/lib/chatbot/types";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function updateChatbotInquiryStatusAction(id: string, form: FormData) {
  await requirePermission("crm.edit");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/crm/chatbot?error=Invalid%20inquiry.");
  const requested = String(form.get("status") ?? "") as ChatbotInquiryStatus;
  if (!chatbotInquiryStatuses.includes(requested)) {
    redirect("/admin/crm/chatbot?error=Invalid%20status.");
  }
  const update: { status: ChatbotInquiryStatus; completed_at?: string } = { status: requested };
  if (["converted", "closed", "cancelled", "spam"].includes(requested)) {
    update.completed_at = new Date().toISOString();
  }
  const result = await createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .update(update)
    .eq("id", id);
  if (result.error) redirect("/admin/crm/chatbot?error=Unable%20to%20update%20inquiry.");
  revalidatePath("/admin/crm/chatbot");
  redirect("/admin/crm/chatbot?success=Inquiry%20status%20updated.");
}
