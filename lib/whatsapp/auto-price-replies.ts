import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { whatsappDirectory } from "./directory";
import { isWhatsappReplyWindowOpen, type WhatsappInboxMessage } from "./messages";
import { sendOnce } from "./outbox";
import { exactWhatsappPriceMatch, isWhatsappPriceInquiry, whatsappPriceText, type WhatsappPriceProduct } from "./price-inquiry";
import { createCloudClient, whatsappConnectionConfiguration, whatsappOutboxDirectory } from "./server";

async function activeCatalogue() {
  const db = createSupabaseAdminClient();
  const products: WhatsappPriceProduct[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("products")
      .select("name,sku,model_number,slug,product_type,currency,regular_price,sale_price")
      .eq("status", "active").eq("public_catalogue_visible", true)
      .order("id").range(offset, offset + 499);
    if (error) throw error;
    products.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return products;
  }
}

export function whatsappAutoPriceEnabled() {
  return process.env.WHATSAPP_AUTO_PRICE_REPLIES === "true";
}

export async function replyToWhatsappPriceInquiries(phoneId: string, messages: WhatsappInboxMessage[]) {
  const outbox = whatsappOutboxDirectory();
  const config = whatsappConnectionConfiguration();
  if (!whatsappAutoPriceEnabled() || !outbox || !config || config.phoneId !== phoneId) return;
  const inquiries = messages.filter((message) =>
    isWhatsappReplyWindowOpen(message.received_at) && isWhatsappPriceInquiry(message.body));
  if (!inquiries.length) return;

  const products = await activeCatalogue();
  const db = createSupabaseAdminClient();
  const cloud = createCloudClient(config);
  for (const inquiry of inquiries) {
    try {
      const match = exactWhatsappPriceMatch(inquiry.body, products);
      if (!match) continue;
      const [contact] = await whatsappDirectory(phoneId, null, { recipient: inquiry.sender });
      if (!contact || contact.ambiguous || !(contact.customer_profile_id || contact.saved_name)) continue;
      const text = whatsappPriceText(match.product, match.price, /[ঀ-৿]/u.test(inquiry.body));
      if (text.length > 4096) continue;
      const hash = createHash("sha256").update("whatsapp-price:" + phoneId + ":" + inquiry.message_id).digest("hex");
      const requestId = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
      const message = { to: inquiry.sender, kind: "text" as const, text };
      const providerId = await sendOnce(outbox, "automatic-price-reply", requestId, message, async () => {
        await cloud.verifySender();
        if (!isWhatsappReplyWindowOpen(inquiry.received_at)) throw new Error("Reply window closed");
        return cloud.send(message);
      });
      const { error } = await db.from("company_whatsapp_price_replies").upsert({
        phone_number_id: phoneId, incoming_message_id: inquiry.message_id, provider_message_id: providerId, body: text,
      }, { onConflict: "phone_number_id,incoming_message_id", ignoreDuplicates: true });
      if (error) console.warn("WhatsApp automatic price reply receipt could not be stored.");
    } catch {
      // The inbound text remains in the Inbox. Uncertain sends are never repeated.
      console.warn("WhatsApp automatic price reply could not be confirmed.");
    }
  }
}
