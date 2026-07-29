import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clientIpHash,
  createUpdateToken,
  hashUpdateToken,
  rateLimit,
  readSmallJson,
  safeJsonResponse,
  uuid,
  verifySameOrigin,
} from "@/lib/chatbot/security";

type StartBody = {
  productQuery?: unknown;
  sessionId?: unknown;
  submissionKey?: unknown;
  sourcePage?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  if (!verifySameOrigin(request, true)) return safeJsonResponse({ ok: false }, { status: 403 });
  let body: StartBody;
  try {
    body = (await readSmallJson(request)) as StartBody;
  } catch {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const productQuery = String(body.productQuery ?? "").trim();
  const sessionId = uuid(body.sessionId);
  const submissionKey = uuid(body.submissionKey);
  const requestedSourcePage = String(body.sourcePage ?? "/").trim().slice(0, 500);
  const sourcePage = requestedSourcePage.startsWith("/") && !requestedSourcePage.startsWith("//")
    ? requestedSourcePage
    : "/";
  if (body.website || !sessionId || !submissionKey || productQuery.length < 2 || productQuery.length > 500) {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }

  const ipHash = clientIpHash(request);
  if (
    !rateLimit([`start:session:${sessionId}`], 5, 10 * 60_000) ||
    !rateLimit([`start:ip:${ipHash}`], 15, 10 * 60_000)
  ) {
    return safeJsonResponse({ ok: false }, { status: 429 });
  }
  const db = createSupabaseAdminClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ count: sessionCount }, { count: ipCount }] = await Promise.all([
    db.from("crm_chatbot_inquiries").select("id", { head: true, count: "exact" }).eq("session_id", sessionId).gte("created_at", since),
    db.from("crm_chatbot_inquiries").select("id", { head: true, count: "exact" }).eq("ip_hash", ipHash).gte("created_at", since),
  ]);
  if ((sessionCount ?? 0) >= 5 || (ipCount ?? 0) >= 15) {
    return safeJsonResponse({ ok: false }, { status: 429 });
  }

  const token = createUpdateToken();
  const numberResult = await db.rpc("next_crm_chatbot_inquiry_number");
  if (numberResult.error || !numberResult.data) {
    return safeJsonResponse({ ok: false }, { status: 500 });
  }
  const insert = await db
    .from("crm_chatbot_inquiries")
    .insert({
      inquiry_number: numberResult.data,
      session_id: sessionId,
      submission_key: submissionKey,
      status: "collecting_contact",
      product_query: productQuery,
      source_page: sourcePage || "/",
      language: "bn-en",
      update_token_hash: hashUpdateToken(token),
      ip_hash: ipHash,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    })
    .select("id,inquiry_number")
    .single();
  if (insert.error || !insert.data) {
    return safeJsonResponse({ ok: false }, { status: 500 });
  }
  return safeJsonResponse({
    ok: true,
    inquiryId: insert.data.id,
    inquiryNumber: insert.data.inquiry_number,
    updateToken: token,
  });
}
