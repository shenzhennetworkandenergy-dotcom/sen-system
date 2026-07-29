import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clientIpHash,
  hashUpdateToken,
  rateLimit,
  readSmallJson,
  safeJsonResponse,
  uuid,
  validPhone,
  verifySameOrigin,
} from "@/lib/chatbot/security";

type UpdateBody = {
  step?: unknown;
  updateToken?: unknown;
  phoneNumber?: unknown;
  whatsapp?: unknown;
  website?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!verifySameOrigin(request, true)) return safeJsonResponse({ ok: false }, { status: 403 });
  const id = uuid((await context.params).id);
  let body: UpdateBody;
  try {
    body = (await readSmallJson(request)) as UpdateBody;
  } catch {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const token = String(body.updateToken ?? "");
  if (!id || body.website || token.length < 32 || token.length > 100) {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const ipHash = clientIpHash(request);
  if (
    !rateLimit([`update:id:${id}`], 20, 10 * 60_000) ||
    !rateLimit([`update:ip:${ipHash}`], 60, 10 * 60_000)
  ) {
    return safeJsonResponse({ ok: false }, { status: 429 });
  }

  const db = createSupabaseAdminClient();
  const { data: inquiry } = await db
    .from("crm_chatbot_inquiries")
    .select("id,status,phone_number,whatsapp")
    .eq("id", id)
    .eq("update_token_hash", hashUpdateToken(token))
    .maybeSingle();
  if (!inquiry || !["collecting_contact", "new"].includes(inquiry.status)) {
    return safeJsonResponse({ ok: false }, { status: 404 });
  }

  const step = String(body.step ?? "");
  let update: Record<string, unknown>;
  if (step === "phone") {
    const phone = validPhone(body.phoneNumber);
    if (!phone || inquiry.status !== "collecting_contact") {
      return safeJsonResponse({ ok: false, field: "phone" }, { status: 400 });
    }
    update = { phone_number: phone };
  } else if (step === "whatsapp") {
    const whatsapp = validPhone(body.whatsapp);
    if (!whatsapp || !inquiry.phone_number || inquiry.status !== "collecting_contact") {
      return safeJsonResponse({ ok: false, field: "whatsapp" }, { status: 400 });
    }
    update = { whatsapp };
  } else if (step === "consent") {
    if (!inquiry.phone_number || !inquiry.whatsapp || inquiry.status !== "collecting_contact") {
      return safeJsonResponse({ ok: false }, { status: 400 });
    }
    update = { consent_to_contact: true, status: "new", completed_at: new Date().toISOString() };
  } else if (step === "cancel") {
    update = { consent_to_contact: false, status: "cancelled", completed_at: new Date().toISOString() };
  } else {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }

  const result = await db.from("crm_chatbot_inquiries").update(update).eq("id", id);
  if (result.error) return safeJsonResponse({ ok: false }, { status: 500 });
  return safeJsonResponse({ ok: true });
}
