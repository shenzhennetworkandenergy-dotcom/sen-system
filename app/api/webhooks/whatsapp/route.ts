import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { whatsappInboxConfiguration } from "@/lib/whatsapp/server";
import { isWhatsappWebhookSigned, whatsappInboxMessages, whatsappWebhookChallenge } from "@/lib/whatsapp/webhook";

export const runtime = "nodejs";

export function GET(request: Request) {
  const config = whatsappInboxConfiguration();
  if (!config) return new Response(null, { status: 404 });
  const challenge = whatsappWebhookChallenge(new URL(request.url), config.verifyToken);
  if (challenge === null) return new Response(null, { status: 403 });
  return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const config = whatsappInboxConfiguration();
  if (!config) return new Response(null, { status: 404 });
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature)) return new Response(null, { status: 403 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return new Response(null, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks);
  if (!isWhatsappWebhookSigned(body, signature, config.appSecret)) return new Response(null, { status: 403 });
  let payload: unknown;
  try { payload = JSON.parse(body.toString("utf8")); } catch { return new Response(null, { status: 400 }); }
  const messages = whatsappInboxMessages(payload, config.accountId, config.phoneId);
  if (messages.length) {
    const { error } = await createSupabaseAdminClient().from("company_whatsapp_inbox").upsert(
      messages.map((message) => ({ ...message, phone_number_id: config.phoneId })),
      { onConflict: "phone_number_id,message_id", ignoreDuplicates: true },
    );
    if (error) return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 200 });
}
