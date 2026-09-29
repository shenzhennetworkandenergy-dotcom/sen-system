export type WhatsappCsvCategory = {
  name: string;
  slug: string;
  fileName: string;
  source: "website" | "crm" | "fallback";
};

export function normalizeWhatsappCategorySlug(name: string) {
  const slug = name.trim().normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Enter a valid category name.");
  return slug;
}

export function whatsappCategoryFileName(value: string) {
  return `${normalizeWhatsappCategorySlug(value)}-customers.csv`;
}

const websiteNames = [
  "Networking",
  "Medical Equipment",
  "Energy",
  "Commercial Equipment",
  "Garments",
  "Industrial Automation",
  "Industrial Components",
  "Semiconductors",
] as const;

export const INITIAL_WHATSAPP_CATEGORIES: readonly WhatsappCsvCategory[] = [
  ...websiteNames.map((name) => {
    const slug = normalizeWhatsappCategorySlug(name);
    return { name, slug, fileName: whatsappCategoryFileName(slug), source: "website" as const };
  }),
  { name: "Uncategorized", slug: "uncategorized", fileName: "uncategorized-customers.csv", source: "fallback" },
];

export function createWhatsappCategory(name: string, existing: readonly Pick<WhatsappCsvCategory, "slug">[]) {
  const normalizedName = name.trim();
  const slug = normalizeWhatsappCategorySlug(normalizedName);
  if (existing.some((category) => category.slug === slug)) throw new Error("This category already exists.");
  return { name: normalizedName, slug, fileName: whatsappCategoryFileName(slug), source: "crm" as const };
}
