import { randomUUID } from "node:crypto";
import { getCurrentProfile } from "@/lib/auth/session";
import { WhatsappFailure } from "@/lib/whatsapp/cloud";
import { whatsappDocumentRecipient } from "@/lib/whatsapp/document-delivery";
import { createWhatsappDocumentToken, readDocumentReference, verifyWhatsappDocumentToken, type WhatsappDocument } from "@/lib/whatsapp/document-link";
import { parseMessage } from "@/lib/whatsapp/messages";
import { sendOnce } from "@/lib/whatsapp/outbox";
import { isWhatsappSameOrigin } from "@/lib/whatsapp/security";
import { createCloudClient, hasCompanyWhatsappAccess, hasOpenWhatsappReplyWindow, readWhatsappJson, whatsappConnectionConfiguration, whatsappInboxConfiguration, whatsappOutboxDirectory } from "@/lib/whatsapp/server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function documentUrl(request: Request, token: string) {
  const origin = new URL(request.headers.get("origin")!);
  const local = /^(?:127\.0\.0\.1|localhost)$/.test(origin.hostname)
    && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  return (local ? origin.origin : "https://www.sen.com.bd") + "/whatsapp/documents/" + token;
}

function documentGreeting(document: WhatsappDocument, reference: string) {
  const label = document.kind === "quotation" ? "quotation" : "sales invoice";
  return "Hello, your SEN " + label + " " + reference + " is ready.";
}

const expiryNotice = "This link is valid for 7 days.";

export async function POST(request: Request) {
  if (!isWhatsappSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const { profile } = await getCurrentProfile();
  if (!profile || !(await hasCompanyWhatsappAccess(profile))) return json({ error: "WhatsApp permission required." }, 403);
  const inbox = whatsappInboxConfiguration();
  const config = whatsappConnectionConfiguration();
  const outbox = whatsappOutboxDirectory();
  if (!inbox || !config || config.phoneId !== inbox.phoneId || !outbox) return json({ error: "WhatsApp sending is unavailable." }, 503);
  let input: Record<string, unknown>;
  try {
    const value = await readWhatsappJson(request);
    if (!value || typeof value !== "object") throw new Error();
    input = value as Record<string, unknown>;
  } catch { return json({ error: "Invalid document request." }, 400); }
  const document = readDocumentReference(input.document);
  if (!document || (input.mode !== "prepare" && input.mode !== "send")) return json({ error: "Invalid document request." }, 400);

  try {
    const target = await whatsappDocumentRecipient(profile, document, config.phoneId);
    if (!target) return json({ error: "Issue the document and check that the active customer has a valid, uniquely linked WhatsApp number." }, 422);
    const windowOpen = await hasOpenWhatsappReplyWindow(config.phoneId, target.recipient);
    if (input.mode === "prepare") {
      const token = createWhatsappDocumentToken(document, target.customerId, inbox.appSecret);
      return json({ recipient: target.recipient, name: target.name, greeting: documentGreeting(document, target.reference),
        url: documentUrl(request, token), expiryNotice, token, windowOpen, requestId: randomUUID() });
    }

    const token = typeof input.token === "string" ? input.token : "";
    const prepared = verifyWhatsappDocumentToken(token, inbox.appSecret);
    if (prepared?.id !== document.id || prepared.kind !== document.kind || prepared.customerId !== target.customerId
      || input.recipient !== target.recipient) {
      return json({ error: "The document or customer changed. Close and reopen to review it again.", code: "changed" }, 409);
    }
    if (!windowOpen) return json({ error: "Ask the customer to message SEN on WhatsApp before sending this document.", code: "window" }, 422);
    let message: ReturnType<typeof parseMessage>;
    try {
      message = parseMessage({ requestId: input.requestId, to: target.recipient, kind: "text",
        text: [documentGreeting(document, target.reference), documentUrl(request, token), expiryNotice].join("\n") });
    } catch { return json({ error: "Close and reopen to review the document again.", code: "changed" }, 400); }
    const cloud = createCloudClient(config);
    await cloud.verifySender();
    await sendOnce(outbox, profile.id, message.requestId, message.message, () => cloud.send(message.message));
    return json({ accepted: true });
  } catch (error) {
    if (error instanceof WhatsappFailure) return json({ error: error.message, code: error.code }, error.code === "unknown" ? 409 : 422);
    return json({ error: "Could not confirm the WhatsApp request. Check the conversation before sending again.", code: "unknown" }, 503);
  }
}
