import { searchProductsForChatbot } from "@/lib/chatbot/search";
import {
  clientIpHash,
  rateLimit,
  safeJsonResponse,
  uuid,
  verifySameOrigin,
} from "@/lib/chatbot/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifySameOrigin(request)) return safeJsonResponse({ error: "Request not allowed." }, { status: 403 });
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const sessionId = uuid(url.searchParams.get("sessionId"));
  if (!sessionId || query.length < 2 || query.length > 500 || url.searchParams.get("website")) {
    return safeJsonResponse({ error: "Please enter a valid product request." }, { status: 400 });
  }
  const ipHash = clientIpHash(request);
  if (
    !rateLimit([`search:session:${sessionId}`], 20, 60_000) ||
    !rateLimit([`search:ip:${ipHash}`], 60, 60_000)
  ) {
    return safeJsonResponse({ error: "Please wait a moment before searching again." }, { status: 429 });
  }
  try {
    return safeJsonResponse(await searchProductsForChatbot(query));
  } catch {
    return safeJsonResponse({ error: "Product search is temporarily unavailable." }, { status: 500 });
  }
}
