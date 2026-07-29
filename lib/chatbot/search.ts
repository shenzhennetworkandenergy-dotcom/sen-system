import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const stopWords = new Set([
  "i","me","my","we","our","need","needs","want","wanted","please","a","an","the","for","to","of",
  "with","and","or","looking","find","show","product","products","require","required","have","do",
  "you","is","are","in","on","some","any","আমার","আমি","একটি","দরকার","চাই","অনুগ্রহ","করে",
]);

export function normalizeProductSearch(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/10\s*(?:gigabit|gbps|gb)\b/g, "10g")
    .replace(/([0-9]+)\s*-\s*port\b/g, "$1 port")
    .replace(/\bnetwork\s+switch\b/g, "switch")
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function terms(value: string) {
  return [...new Set(normalizeProductSearch(value).split(" ").filter((term) => term.length > 1 && !stopWords.has(term)))].slice(0, 12);
}

function relationNames(value: unknown, relation: string, field: string) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (item as Record<string, unknown>)[relation])
    .flatMap((record) => Array.isArray(record) ? record : [record])
    .map((record) => (record as Record<string, unknown> | null)?.[field])
    .filter((name): name is string => typeof name === "string");
}

export type ProductChatSearchResult =
  | { matchType: "exact"; available: true; price: number; currency: string }
  | { matchType: "related"; available: false }
  | { matchType: "none"; available: false };

export async function searchProductsForChatbot(query: string): Promise<ProductChatSearchResult> {
  const normalizedQuery = normalizeProductSearch(query);
  const queryTerms = terms(query);
  if (normalizedQuery.length < 2 || !queryTerms.length) return { matchType: "none", available: false };

  const db = createSupabaseAdminClient();
  const { data: products, error } = await db
    .from("products")
    .select("id,name,sku,model_number,manufacturer_part_number,product_type,short_description,description,specifications,stock_status,allow_backorders,regular_price,sale_price,currency,brands(name),product_category_assignments(product_categories(name)),product_tag_assignments(product_tags(name))")
    .eq("status", "active")
    .eq("public_catalogue_visible", true)
    .limit(1000);
  if (error) throw new Error("product_search_failed");
  if (!products?.length) return { matchType: "none", available: false };

  const productIds = products.map((product) => product.id);
  const [{ data: balances }, { data: variations }] = await Promise.all([
    db
      .from("inventory_balances")
      .select("product_id,variation_id,available,warehouses!inner(country_code,is_active)")
      .in("product_id", productIds)
      .eq("warehouses.is_active", true)
      .in("warehouses.country_code", ["BD", "BGD"]),
    db
      .from("product_variations")
      .select("id,product_id,sku,combination_key,regular_price,sale_price,allow_backorders,status")
      .in("product_id", productIds)
      .eq("status", "active"),
  ]);

  const candidates = products.flatMap((product) => {
    const brand = (product.brands as unknown as { name: string } | null)?.name ?? "";
    const categories = relationNames(product.product_category_assignments, "product_categories", "name");
    const tags = relationNames(product.product_tag_assignments, "product_tags", "name");
    const baseFields = [
      product.name,
      product.sku,
      product.model_number,
      product.manufacturer_part_number,
      brand,
      ...categories,
      ...tags,
      product.short_description,
      product.description,
      JSON.stringify(product.specifications ?? {}),
    ];
    const productAvailable = (balances ?? [])
      .filter((balance) => balance.product_id === product.id && balance.variation_id === null)
      .reduce((sum, balance) => sum + Number(balance.available), 0);
    const parentCandidate = {
      priorityFields: {
        model: normalizeProductSearch(product.model_number ?? ""),
        sku: normalizeProductSearch(product.sku),
        part: normalizeProductSearch(product.manufacturer_part_number ?? ""),
        name: normalizeProductSearch(product.name),
      },
      haystack: normalizeProductSearch(baseFields.filter(Boolean).join(" ")),
      price: Number(product.sale_price ?? product.regular_price ?? 0),
      currency: product.currency,
      available: product.product_type !== "variable" &&
        (productAvailable > 0 || product.allow_backorders),
    };
    const variationCandidates = (variations ?? [])
      .filter((variation) => variation.product_id === product.id)
      .map((variation) => {
        const available = (balances ?? [])
          .filter((balance) => balance.variation_id === variation.id)
          .reduce((sum, balance) => sum + Number(balance.available), 0);
        return {
          priorityFields: {
            model: normalizeProductSearch(product.model_number ?? ""),
            sku: normalizeProductSearch(variation.sku),
            part: normalizeProductSearch(product.manufacturer_part_number ?? ""),
            name: normalizeProductSearch(`${product.name} ${variation.combination_key}`),
          },
          haystack: normalizeProductSearch([...baseFields, variation.sku, variation.combination_key].filter(Boolean).join(" ")),
          price: Number(variation.sale_price ?? variation.regular_price ?? product.sale_price ?? product.regular_price ?? 0),
          currency: product.currency,
          available: available > 0 || variation.allow_backorders,
        };
      });
    return [parentCandidate, ...variationCandidates];
  });

  const available = candidates.filter((candidate) => candidate.available && candidate.price > 0);
  const exactOrder = ["model", "sku", "part", "name"] as const;
  for (const field of exactOrder) {
    const matches = available.filter((candidate) => candidate.priorityFields[field] === normalizedQuery);
    if (matches.length === 1) {
      return { matchType: "exact", available: true, price: matches[0].price, currency: matches[0].currency };
    }
  }

  const nameContains = available.filter((candidate) => candidate.priorityFields.name.includes(normalizedQuery));
  if (nameContains.length === 1) {
    return { matchType: "exact", available: true, price: nameContains[0].price, currency: nameContains[0].currency };
  }

  const ranked = available
    .map((candidate) => {
      const matched = queryTerms.filter((term) => candidate.haystack.split(" ").includes(term));
      return { candidate, matched: matched.length, ratio: matched.length / queryTerms.length };
    })
    .filter((item) => item.matched > 0)
    .sort((left, right) => right.ratio - left.ratio || right.matched - left.matched);
  const top = ranked[0];
  const second = ranked[1];
  const confidentlyDescriptive =
    top &&
    queryTerms.length >= 3 &&
    top.ratio === 1 &&
    top.matched >= 3 &&
    (!second || second.ratio <= top.ratio - 0.34);
  if (confidentlyDescriptive) {
    return {
      matchType: "exact",
      available: true,
      price: top.candidate.price,
      currency: top.candidate.currency,
    };
  }
  if (top && (top.matched >= 2 || top.ratio >= 0.6)) return { matchType: "related", available: false };
  return { matchType: "none", available: false };
}
