import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const getUnreadChatbotInquiryCount = cache(async (): Promise<number> => {
  const { count, error } = await createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("Unread chatbot inquiry count unavailable", {
      code: error.code,
      message: error.message,
    });
    return 0;
  }

  return count ?? 0;
});

export async function markChatbotInquiryRead(
  inquiryId: string,
  profileId: string,
) {
  const { error } = await createSupabaseAdminClient()
    .from("crm_chatbot_inquiries")
    .update({
      read_at: new Date().toISOString(),
      read_by: profileId,
    })
    .eq("id", inquiryId)
    .is("read_at", null);

  if (error) {
    console.error("Unable to mark chatbot inquiry as read", {
      code: error.code,
      message: error.message,
      inquiryId,
    });
    throw new Error("Unable to mark this inquiry as read.");
  }
}
