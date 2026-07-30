import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getChatbotProductsBySelection,
  type ChatbotProductSelection,
} from "@/lib/chatbot/search";
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
  selectedProducts?: unknown;
  searchHistory?: unknown;
  sessionId?: unknown;
  submissionKey?: unknown;
  sourcePage?: unknown;
  website?: unknown;
};

type SearchHistoryInput = {
  query: string;
  resultProductIds: string[];
};

function parseSelections(value: unknown): ChatbotProductSelection[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6) return null;
  const selections = value.map((item) => {
    const record = item as Record<string, unknown>;
    const productId = uuid(record.productId);
    const variationId = record.variationId == null ? null : uuid(record.variationId);
    return productId && (record.variationId == null || variationId)
      ? { productId, variationId }
      : null;
  });
  return selections.includes(null)
    ? null
    : selections as ChatbotProductSelection[];
}

function parseSearchHistory(value: unknown): SearchHistoryInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const events = value.map((item) => {
    const record = item as Record<string, unknown>;
    const query = String(record.query ?? "").trim();
    const ids = record.resultProductIds;
    if (query.length < 2 || query.length > 500 || !Array.isArray(ids) || ids.length > 6) return null;
    const productIds = ids.map(uuid);
    return productIds.every((id): id is string => id !== null)
      ? { query, resultProductIds: productIds }
      : null;
  });
  return events.every((event): event is SearchHistoryInput => event !== null)
    ? events
    : null;
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request, true)) return safeJsonResponse({ ok: false }, { status: 403 });
  let body: StartBody;
  try {
    body = (await readSmallJson(request)) as StartBody;
  } catch {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const productQuery = String(body.productQuery ?? "").trim();
  const selectedProductInputs = parseSelections(body.selectedProducts);
  const searchHistoryInputs = parseSearchHistory(body.searchHistory);
  const sessionId = uuid(body.sessionId);
  const submissionKey = uuid(body.submissionKey);
  const requestedSourcePage = String(body.sourcePage ?? "/").trim().slice(0, 500);
  const sourcePage = requestedSourcePage.startsWith("/") && !requestedSourcePage.startsWith("//")
    ? requestedSourcePage
    : "/";
  if (
    body.website ||
    !sessionId ||
    !submissionKey ||
    !selectedProductInputs ||
    !searchHistoryInputs ||
    productQuery.length < 2 ||
    productQuery.length > 500
  ) {
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

  const selectedProducts = await getChatbotProductsBySelection(selectedProductInputs);
  if (selectedProducts.length !== selectedProductInputs.length) {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const historyProductIds = [...new Set(searchHistoryInputs.flatMap((event) => event.resultProductIds))];
  const historyProducts = await getChatbotProductsBySelection(
    historyProductIds.map((productId) => ({ productId, variationId: null })),
  );
  if (historyProducts.length !== historyProductIds.length) {
    return safeJsonResponse({ ok: false }, { status: 400 });
  }
  const historyProductsById = new Map(historyProducts.map((product) => [product.id, product]));
  const recordedAt = new Date().toISOString();
  const searchHistory = searchHistoryInputs.map((event, sequence) => ({
    sequence,
    query: event.query,
    results: event.resultProductIds.map((id) => ({
      id,
      name: historyProductsById.get(id)?.name,
    })),
    recordedAt,
  }));
  const selectedProductSnapshots = selectedProducts.map((product) => ({
    ...product,
    confirmedAt: recordedAt,
  }));

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
      search_history: searchHistory,
      selected_products: selectedProductSnapshots,
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
