import { randomUUID } from "node:crypto";
import { getCurrentProfile } from "@/lib/auth/session";
import { WhatsappFailure } from "@/lib/whatsapp/cloud";
import { parseMessage } from "@/lib/whatsapp/messages";
import { sendOnce } from "@/lib/whatsapp/outbox";
import { isWhatsappSameOrigin } from "@/lib/whatsapp/security";
import { createCloudClient, hasCompanyWhatsappAccess, hasOpenWhatsappReplyWindow, isCompanyWhatsappRecipientAllowed, readWhatsappJson, whatsappConnectionConfiguration, whatsappInboxConfiguration, whatsappOutboxDirectory, whatsappReplyOnly } from "@/lib/whatsapp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function authorizedSender() {
  const { profile } = await getCurrentProfile();
  return await hasCompanyWhatsappAccess(profile) ? profile : null;
}

export async function GET() {
  if (!(await authorizedSender())) return json({ error: "WhatsApp sending permission required." }, 403);
  const requestId = randomUUID();
  const inboxReady = Boolean(whatsappInboxConfiguration());
  const replyOnly = whatsappReplyOnly();
  const config = whatsappConnectionConfiguration();
  const status = { inboxReady, replyOnly, requestId };
  if (!config) return json({ ...status, ready: false, businessNumber: null, templates: [], error: "The company's WhatsApp number has not been connected yet." });
  try {
    const cloud = createCloudClient(config);
    await cloud.verifySender();
    const templates = replyOnly ? [] : await cloud.templates();
    return json({ ...status, ready: Boolean(whatsappOutboxDirectory()) && (!replyOnly || inboxReady), businessNumber: config.businessNumber, templates });
  } catch (error) {
    return json({ ...status, ready: false, businessNumber: null, templates: [], error: error instanceof WhatsappFailure ? error.message : "The WhatsApp connection is unavailable." });
  }
}

export async function POST(request: Request) {
  if (!isWhatsappSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const profile = await authorizedSender();
  if (!profile) return json({ error: "WhatsApp sending permission required." }, 403);
  const replyOnly = whatsappReplyOnly();
  const outbox = whatsappOutboxDirectory();
  if (!outbox || (replyOnly && !whatsappInboxConfiguration())) return json({ error: "WhatsApp sending is disabled. You can prepare messages while your administrator finishes setup.", code: "paused" }, 503);
  const config = whatsappConnectionConfiguration();
  if (!config) return json({ error: "The company's WhatsApp number has not been connected yet.", code: "unavailable" }, 503);
  let parsed: ReturnType<typeof parseMessage>;
  try { parsed = parseMessage(await readWhatsappJson(request)); }
  catch (error) { return json({ error: error instanceof SyntaxError ? "Invalid message." : (error as Error).message }, 400); }
  if (replyOnly && parsed.message.kind !== "text") {
    return json({ error: "Only replies to recent incoming messages are enabled.", code: "reply_only" }, 422);
  }
  try {
    if (!(await isCompanyWhatsappRecipientAllowed(profile, parsed.message.to, config.phoneId))) return json({ error: "This recipient is not available in your assigned business categories. Ask your administrator to review access.", code: "recipient" }, 403);
    if (replyOnly && !(await hasOpenWhatsappReplyWindow(config.phoneId, parsed.message.to))) {
      return json({ error: "The customer must send a WhatsApp message within the last 24 hours before you can reply.", code: "window" }, 422);
    }
    const cloud = createCloudClient(config);
    await cloud.verifySender();
    await cloud.validateTemplate(parsed.message);
    const messageId = await sendOnce(outbox, profile.id, parsed.requestId, parsed.message, () => cloud.send(parsed.message));
    // An accepted API response is not a delivery/read receipt.
    return json({ accepted: true, messageId });
  } catch (error) {
    if (error instanceof WhatsappFailure) return json({ error: error.message, code: error.code }, error.code === "unknown" ? 409 : 422);
    return json({ error: "The message could not be submitted. Check the WhatsApp connection before sending again.", code: "unavailable" }, 503);
  }
}
