import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const stopWords = new Set([
  "i", "me", "my", "we", "our", "need", "needs", "want", "wanted", "please", "a", "an", "the",
  "for", "to", "of", "with", "and", "or", "looking", "find", "show", "product", "products",
  "require", "required", "have", "do", "you", "is", "are", "in", "on", "some", "any",
  "আমার", "আমি", "একটি", "দরকার", "চাই", "অনুগ্রহ", "করে",
]);

export type ChatbotProductSelection = {
  productId: string;
  variationId?: string | null;
};

export type ChatbotProduct = {
  id: string;
  variationId: string | null;
  name: string;
  slug: string;
  sku: string;
  modelNumber: string | null;
  shortDescription: string | null;
  productType: string;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean;
  availability: "in_stock" | "sourceable";
  variationLabel: string | null;
  attributes: Record<string, string>;
};

export type ProductChatSearchResult =
  | { matchType: "suggestions"; products: ChatbotProduct[] }
  | { matchType: "confirmation"; product: ChatbotProduct }
  | { matchType: "none" };

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  model_number: string | null;
  manufacturer_part_number: string | null;
  product_type: string;
  short_description: string | null;
  description: string | null;
  specifications: unknown;
  allow_backorders: boolean;
  regular_price: number | null;
  sale_price: number | null;
  currency: string;
  brands: unknown;
  product_category_assignments: unknown;
  product_tag_assignments: unknown;
};

type VariationRow = {
  id: string;
  product_id: string;
  sku: string;
  combination_key: string;
  regular_price: number | null;
  sale_price: number | null;
  allow_backorders: boolean;
};

type BalanceRow = {
  product_id: string;
  variation_id: string | null;
  available: number;
};

type CatalogueCandidate = {
  product: ChatbotProduct;
  productId: string;
  normalized: {
    name: string;
    model: string;
    sku: string;
    part: string;
    haystack: string;
  };
};

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

function searchTerms(value: string) {
  return [...new Set(
    normalizeProductSearch(value)
      .split(" ")
      .filter((term) => term.length > 1 && !stopWords.has(term)),
  )].slice(0, 12);
}

function relationNames(value: unknown, relation: string, field: string) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (item as Record<string, unknown>)[relation])
    .flatMap((record) => Array.isArray(record) ? record : [record])
    .map((record) => (record as Record<string, unknown> | null)?.[field])
    .filter((name): name is string => typeof name === "string");
}

function relationName(value: unknown) {
  const record = Array.isArray(value) ? value[0] : value;
  return typeof (record as Record<string, unknown> | null)?.name === "string"
    ? String((record as Record<string, unknown>).name)
    : "";
}

function price(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function variationAttributes(combinationKey: string) {
  return Object.fromEntries(
    combinationKey
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator > 0
          ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
          : ["Option", part];
      }),
  );
}

async function loadCatalogue() {
  const db = createSupabaseAdminClient();
  const { data: products, error } = await db
    .from("products")
    .select("id,name,slug,sku,model_number,manufacturer_part_number,product_type,short_description,description,specifications,allow_backorders,regular_price,sale_price,currency,brands(name),product_category_assignments(product_categories(name)),product_tag_assignments(product_tags(name))")
    .eq("status", "active")
    .eq("public_catalogue_visible", true)
    .limit(1000);
  if (error) throw new Error("product_search_failed");
  if (!products?.length) return [] as CatalogueCandidate[];

  const typedProducts = products as unknown as ProductRow[];
  const productIds = typedProducts.map((product) => product.id);
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
  const typedBalances = (balances ?? []) as unknown as BalanceRow[];
  const typedVariations = (variations ?? []) as unknown as VariationRow[];

  return typedProducts.flatMap((product) => {
    const productVariations = typedVariations.filter((variation) => variation.product_id === product.id);
    const parentBalance = typedBalances
      .filter((balance) => balance.product_id === product.id && balance.variation_id === null)
      .reduce((sum, balance) => sum + Number(balance.available), 0);
    const variationPrices = productVariations
      .map((variation) => price(variation.sale_price ?? variation.regular_price))
      .filter((value): value is number => value !== null);
    const parentPrice = price(product.sale_price ?? product.regular_price);
    const parentAvailable = product.product_type === "variable"
      ? productVariations.some((variation) => {
          const available = typedBalances
            .filter((balance) => balance.variation_id === variation.id)
            .reduce((sum, balance) => sum + Number(balance.available), 0);
          return available > 0 || variation.allow_backorders;
        })
      : parentBalance > 0 || product.allow_backorders;
    const brand = relationName(product.brands);
    const categories = relationNames(product.product_category_assignments, "product_categories", "name");
    const tags = relationNames(product.product_tag_assignments, "product_tags", "name");
    const fields = [
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
    ].filter(Boolean).join(" ");
    const baseProduct: ChatbotProduct = {
      id: product.id,
      variationId: null,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      modelNumber: product.model_number,
      shortDescription: product.short_description,
      productType: product.product_type,
      price: variationPrices.length ? Math.min(...variationPrices) : parentPrice,
      priceMax: variationPrices.length ? Math.max(...variationPrices) : parentPrice,
      currency: product.currency,
      available: parentAvailable,
      availability: parentAvailable ? "in_stock" : "sourceable",
      variationLabel: null,
      attributes: {},
    };
    const parent: CatalogueCandidate = {
      product: baseProduct,
      productId: product.id,
      normalized: {
        name: normalizeProductSearch(product.name),
        model: normalizeProductSearch(product.model_number ?? ""),
        sku: normalizeProductSearch(product.sku),
        part: normalizeProductSearch(product.manufacturer_part_number ?? ""),
        haystack: normalizeProductSearch(fields),
      },
    };
    const variationCandidates = productVariations.map((variation): CatalogueCandidate => {
      const variationBalance = typedBalances
        .filter((balance) => balance.variation_id === variation.id)
        .reduce((sum, balance) => sum + Number(balance.available), 0);
      const available = variationBalance > 0 || variation.allow_backorders;
      const variationPrice = price(variation.sale_price ?? variation.regular_price) ?? parentPrice;
      const label = variation.combination_key;
      return {
        product: {
          ...baseProduct,
          variationId: variation.id,
          name: `${product.name} — ${label}`,
          sku: variation.sku,
          price: variationPrice,
          priceMax: variationPrice,
          available,
          availability: available ? "in_stock" : "sourceable",
          variationLabel: label,
          attributes: variationAttributes(label),
        },
        productId: product.id,
        normalized: {
          name: normalizeProductSearch(`${product.name} ${label}`),
          model: normalizeProductSearch(product.model_number ?? ""),
          sku: normalizeProductSearch(variation.sku),
          part: normalizeProductSearch(product.manufacturer_part_number ?? ""),
          haystack: normalizeProductSearch(`${fields} ${variation.sku} ${label}`),
        },
      };
    });
    return [parent, ...variationCandidates];
  });
}

function distinctParents(candidates: CatalogueCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.productId)) return false;
    seen.add(candidate.productId);
    return candidate.product.variationId === null;
  });
}

export async function getChatbotProductsBySelection(selections: ChatbotProductSelection[]) {
  const candidates = await loadCatalogue();
  return selections.flatMap((selection) => {
    const exact = candidates.find((candidate) =>
      candidate.productId === selection.productId &&
      candidate.product.variationId === (selection.variationId ?? null));
    return exact ? [exact.product] : [];
  });
}

export async function searchProductsForChatbot(query: string): Promise<ProductChatSearchResult> {
  const normalizedQuery = normalizeProductSearch(query);
  const terms = searchTerms(query);
  if (normalizedQuery.length < 2 || !terms.length) return { matchType: "none" };

  const candidates = await loadCatalogue();
  if (!candidates.length) return { matchType: "none" };

  for (const field of ["sku", "model", "part", "name"] as const) {
    const matches = candidates.filter((candidate) => candidate.normalized[field] === normalizedQuery);
    if (matches.length === 1) return { matchType: "confirmation", product: matches[0].product };
  }

  const parentCandidates = distinctParents(candidates);
  const titleContains = parentCandidates.filter((candidate) =>
    candidate.normalized.name.includes(normalizedQuery));
  if (titleContains.length > 1) {
    return { matchType: "suggestions", products: titleContains.slice(0, 6).map((candidate) => candidate.product) };
  }
  if (titleContains.length === 1) {
    return { matchType: "confirmation", product: titleContains[0].product };
  }

  const titleTermMatches = parentCandidates.filter((candidate) => {
    const nameTerms = new Set(candidate.normalized.name.split(" "));
    return terms.every((term) => nameTerms.has(term));
  });
  if (titleTermMatches.length > 1) {
    return { matchType: "suggestions", products: titleTermMatches.slice(0, 6).map((candidate) => candidate.product) };
  }
  if (titleTermMatches.length === 1) {
    return { matchType: "confirmation", product: titleTermMatches[0].product };
  }

  const ranked = parentCandidates
    .map((candidate) => {
      const words = new Set(candidate.normalized.haystack.split(" "));
      const matched = terms.filter((term) => words.has(term)).length;
      return { candidate, matched, ratio: matched / terms.length };
    })
    .filter((item) => item.matched > 0 && (item.matched >= 2 || item.ratio >= 0.6))
    .sort((left, right) => right.ratio - left.ratio || right.matched - left.matched);
  if (ranked.length > 1) {
    return { matchType: "suggestions", products: ranked.slice(0, 6).map((item) => item.candidate.product) };
  }
  if (ranked.length === 1) {
    return { matchType: "confirmation", product: ranked[0].candidate.product };
  }
  return { matchType: "none" };
}
