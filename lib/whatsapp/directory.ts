import "server-only";

import type { Profile } from "@/lib/auth/session";
import { getVisibleCustomerIds } from "@/lib/customers/visibility";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WhatsappContact = {
  recipient: string;
  display_name: string | null;
  company_name: string | null;
  customer_profile_id: string | null;
  saved_name: string | null;
  linked_customer_id: string | null;
  ambiguous: boolean;
  latest_at: string | null;
  message_preview: string | null;
};

export async function whatsappDirectory(
  phoneId: string,
  visibleCustomerIds: string[] | null,
  options: { recent?: boolean; query?: string; recipient?: string; offset?: number } = {},
): Promise<WhatsappContact[]> {
  if (visibleCustomerIds?.length === 0) return [];
  const { data, error } = await createSupabaseAdminClient().rpc("company_whatsapp_directory", {
    p_phone_number_id: phoneId,
    p_visible_customer_ids: visibleCustomerIds,
    p_recent: options.recent ?? false,
    p_query: options.query ?? "",
    p_recipient: options.recipient ?? null,
    p_offset: options.offset ?? 0,
  });
  if (error) throw new Error("The WhatsApp customer directory could not be checked.");
  return data ?? [];
}

export async function whatsappDirectoryForActor(
  actor: Profile, phoneId: string, options: Parameters<typeof whatsappDirectory>[2],
) {
  return whatsappDirectory(phoneId, await getVisibleCustomerIds(actor), options);
}
