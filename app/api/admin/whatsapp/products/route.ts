import { getCurrentProfile } from "@/lib/auth/session";
import { searchProductsForChatbot } from "@/lib/chatbot/search";
import { isWhatsappSameOrigin } from "@/lib/whatsapp/security";
import { hasCompanyWhatsappAccess, readWhatsappJson } from "@/lib/whatsapp/server";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!isWhatsappSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const { profile } = await getCurrentProfile();
  if (!profile || !(await hasCompanyWhatsappAccess(profile))) return json({ error: "WhatsApp permission required." }, 403);
  let query: string;
  try {
    const input = await readWhatsappJson(request);
    if (!input || typeof input !== "object" || !("query" in input) || typeof input.query !== "string") {
      throw new Error("Enter a product name or model.");
    }
    query = input.query.trim();
    if (!query || query.length > 120) throw new Error("Enter up to 120 characters.");
  } catch (error) {
    return json({ error: (error as Error).message || "Enter a product name or model." }, 400);
  }
  try {
    const result = await searchProductsForChatbot(query);
    const candidates = result.matchType === "none" ? [] : result.matchType === "confirmation" ? [result.product] : result.products;
    const products = candidates.filter((item) => item.currency === "BDT" && item.price
      && (item.productType !== "variable" || item.variationId))
      .map((item) => ({
        id: item.variationId ?? item.id, name: [item.name, item.variationLabel].filter(Boolean).join(" · "),
        sku: item.sku, slug: item.slug, price: item.price,
      }));
    return json({ products });
  } catch { return json({ error: "Could not look up catalogue prices. Try again." }, 503); }
}
