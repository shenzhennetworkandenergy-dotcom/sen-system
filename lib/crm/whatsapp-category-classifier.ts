import type { WhatsappCsvCategory } from "./whatsapp-categories.ts";

export type WhatsappCatalogueProduct = {
  name: string;
  slug: string;
  modelNumber?: string;
  sku?: string;
  categorySlug: string;
};

export type WhatsappCategoryAssignment = {
  categorySlug: string;
  interestedProducts: string;
  quantityRequirements: string;
};

export type WhatsappInterestInput = {
  interestedProducts: string;
  quantityRequirements: string;
  conversationHistory?: string;
};

const normalized = (value: string) => value.normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const clauses = (value: string) => value.split(/(?:\r?\n|;)+|(?<=[.!?])\s+/)
  .map((part) => part.trim())
  .filter(Boolean);

function productMatches(text: string, products: readonly WhatsappCatalogueProduct[]) {
  const haystack = ` ${normalized(text)} `;
  return products.filter((product) => [product.name, product.slug, product.modelNumber, product.sku]
    .filter((term): term is string => Boolean(term))
    .some((term) => haystack.includes(` ${normalized(term)} `)));
}

export function classifyWhatsappInterest(
  input: WhatsappInterestInput,
  products: readonly WhatsappCatalogueProduct[],
  categories: readonly Pick<WhatsappCsvCategory, "slug">[],
) {
  const validCategories = new Set(categories.map((category) => category.slug));
  const productClauses = clauses(input.interestedProducts);
  const requirementClauses = clauses(input.quantityRequirements);
  const matchedFromConversation = productMatches(input.conversationHistory ?? "", products);
  const assignments = new Map<string, { products: string[]; requirements: string[] }>();
  const unclassifiedProducts: string[] = [];
  const unclassifiedRequirements: string[] = [];
  const ensure = (categorySlug: string) => {
    const current = assignments.get(categorySlug) ?? { products: [], requirements: [] };
    assignments.set(categorySlug, current);
    return current;
  };

  for (const clause of productClauses) {
    const matches = productMatches(clause, products).filter((product) => validCategories.has(product.categorySlug));
    if (!matches.length) {
      unclassifiedProducts.push(clause);
      continue;
    }
    for (const categorySlug of new Set(matches.map((product) => product.categorySlug))) ensure(categorySlug).products.push(clause);
  }

  for (const product of matchedFromConversation) {
    if (!validCategories.has(product.categorySlug)) continue;
    const assignment = ensure(product.categorySlug);
    if (!assignment.products.length) assignment.products.push(product.name);
  }

  for (const clause of requirementClauses) {
    const matches = productMatches(clause, products).filter((product) => assignments.has(product.categorySlug));
    const categorySlugs = [...new Set(matches.map((product) => product.categorySlug))];
    if (categorySlugs.length) {
      for (const categorySlug of categorySlugs) ensure(categorySlug).requirements.push(clause);
    } else if (assignments.size === 1) {
      assignments.values().next().value!.requirements.push(clause);
    } else {
      unclassifiedRequirements.push(clause);
    }
  }

  if (unclassifiedProducts.length || unclassifiedRequirements.length || !assignments.size) {
    const uncategorized = ensure("uncategorized");
    uncategorized.products.push(...unclassifiedProducts);
    uncategorized.requirements.push(...unclassifiedRequirements);
    if (!uncategorized.products.length && !assignments.size) uncategorized.products.push(input.interestedProducts.trim());
    if (!uncategorized.requirements.length && !assignments.size) uncategorized.requirements.push(input.quantityRequirements.trim());
  }

  return [...assignments.entries()].map(([categorySlug, value]) => ({
    categorySlug,
    interestedProducts: [...new Set(value.products)].filter(Boolean).join("; "),
    quantityRequirements: [...new Set(value.requirements)].filter(Boolean).join(" "),
  }));
}
