export type WhatsappProductEvidence = {
  product_id: string;
  variation_id: string | null;
  name: string;
  sku: string;
  model: string | null;
  price: number | null;
  price_max: number | null;
  currency: string;
  availability: "in_stock" | "sourceable";
  description: string | null;
  public_url: string;
  review_warning: string | null;
};

type CatalogueProduct = {
  id: string;
  variationId: string | null;
  name: string;
  slug: string;
  sku: string;
  modelNumber: string | null;
  shortDescription: string | null;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean;
  availability: "in_stock" | "sourceable";
};

export function mapWhatsappProductEvidence(product: CatalogueProduct): WhatsappProductEvidence {
  const missing = [
    product.price === null && "price",
    !product.shortDescription && "description",
  ].filter(Boolean);
  return {
    product_id: product.id,
    variation_id: product.variationId,
    name: product.name,
    sku: product.sku,
    model: product.modelNumber,
    price: product.price,
    price_max: product.priceMax,
    currency: product.currency,
    availability: product.available ? "in_stock" : product.availability,
    description: product.shortDescription,
    public_url: `/products/${product.slug}`,
    review_warning: missing.length ? `Staff must confirm missing ${missing.join(" and ")} before replying.` : null,
  };
}

export async function researchWhatsappProducts(query: string): Promise<WhatsappProductEvidence[]> {
  const { searchProductsForChatbot } = await import("../chatbot/search");
  const result = await searchProductsForChatbot(query.trim());
  if (result.matchType === "none") return [];
  if (result.matchType === "confirmation") return [mapWhatsappProductEvidence(result.product)];
  return result.products.map(mapWhatsappProductEvidence);
}
