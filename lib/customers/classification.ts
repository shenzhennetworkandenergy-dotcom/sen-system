export type CustomerClassificationOption = {
  code: string;
  name: string;
};

export const CUSTOMER_BUSINESS_CATEGORIES = [
  { id: "networking", name: "Networking", slug: "networking" },
  { id: "energy", name: "Energy", slug: "energy" },
  { id: "medical-equipment", name: "Medical Equipment", slug: "medical-equipment" },
  { id: "commercial-equipment", name: "Commercial Equipment", slug: "commercial-equipment" },
  { id: "garments", name: "Garments", slug: "garments" },
  { id: "industrial-automation", name: "Industrial Automation", slug: "industrial-automation" },
  { id: "industrial-components", name: "Industrial Components", slug: "industrial-components" },
  { id: "semiconductor", name: "Semiconductor", slug: "semiconductor" },
] as const;

const districtNames = [
  "Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur",
  "Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
  "Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira",
  "Jamalpur", "Mymensingh", "Netrokona", "Sherpur",
  "Bogura", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj",
  "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon",
  "Habiganj", "Moulvibazar", "Sunamganj", "Sylhet",
] as const;

export const BANGLADESH_DISTRICTS: CustomerClassificationOption[] = districtNames.map((name) => ({
  code: name === "Dhaka" ? "DHA" : name === "Rangpur" ? "RNG" : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
}));

const districtByCode = new Map<string, CustomerClassificationOption>(
  BANGLADESH_DISTRICTS.map((item) => [item.code.toLowerCase(), item]),
);
const categoryBySlug = new Map<string, { id: string; name: string; slug: string }>(
  CUSTOMER_BUSINESS_CATEGORIES.map((item) => [item.slug, item]),
);

export function validateCustomerClassification(categorySlugs: string[], districtCode: string | null) {
  const categories = [...new Set(categorySlugs.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (!categories.length || !districtCode || !districtByCode.has(districtCode.trim().toLowerCase())) {
    return { ok: false as const, message: "Choose at least one business category and a district." };
  }
  if (categories.some((slug) => !categoryBySlug.has(slug))) {
    return { ok: false as const, message: "Choose only valid active business categories." };
  }
  return { ok: true as const };
}

export function classificationLabel(categorySlugs: string[], districtCode: string | null) {
  const names = categorySlugs
    .map((slug) => categoryBySlug.get(slug.trim().toLowerCase())?.name)
    .filter((name): name is string => Boolean(name));
  const districtName = districtCode
    ? districtByCode.get(districtCode.trim().toLowerCase())?.name ?? "Not Set"
    : "Not Set";
  return `${names.length ? names.join(", ") : "Unclassified"} · ${districtName}`;
}
