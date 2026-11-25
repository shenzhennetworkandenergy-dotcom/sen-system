import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeRecipient } from "@/lib/whatsapp/messages";
import { isWhatsappSameOrigin } from "@/lib/whatsapp/security";
import { hasCompanyWhatsappAccess, isCompanyWhatsappRecipientAllowed, readWhatsappJson, whatsappInboxConfiguration } from "@/lib/whatsapp/server";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!isWhatsappSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const { profile } = await getCurrentProfile();
  if (!profile || !(await hasCompanyWhatsappAccess(profile))) return json({ error: "WhatsApp permission required." }, 403);
  const config = whatsappInboxConfiguration();
  if (!config) return json({ error: "The WhatsApp inbox is not connected yet." }, 503);
  let sender: string | null = null;
  try {
    const payload = await readWhatsappJson(request);
    if (!payload || typeof payload !== "object" || !("from" in payload) || typeof payload.from !== "string" || payload.from.length > 40) {
      throw new Error("Invalid filter");
    }
    if (payload.from.trim()) sender = normalizeRecipient(payload.from);
  } catch {
    return json({ error: "Enter a valid WhatsApp number with country code." }, 400);
  }
  if (!sender && profile.role !== "admin") return json({ error: "Enter a customer's saved WhatsApp number." }, 400);
  try {
    if (sender && !(await isCompanyWhatsappRecipientAllowed(profile, sender))) {
      return json({ error: "This customer is outside your assigned business categories." }, 403);
    }
    const query = createSupabaseAdminClient().from("company_whatsapp_inbox")
      .select("message_id,sender,received_at,body").eq("phone_number_id", config.phoneId)
      .order("received_at", { ascending: false }).order("message_id", { ascending: false }).limit(50);
    if (sender) query.eq("sender", sender);
    const { data, error } = await query;
    if (!error) return json({ messages: data });
  } catch {
    // Fail closed when customer visibility or storage cannot be checked.
  }
  return json({ error: "Could not load WhatsApp messages. Try again." }, 503);
}
