export type ProductCategory = "networking" | "energy" | "medical-equipment" | "others" | string;

const categoryFallbacks: Record<string, { src: string; alt: string }> = {
  networking: { src: "/images/products/enterprise-rack-servers.webp", alt: "Representative enterprise server and network rack infrastructure" },
  energy: { src: "/images/products/industrial-ups-inverter.webp", alt: "Representative industrial UPS, inverter and power electronics equipment" },
  "medical-equipment": { src: "/images/products/diagnostic-ultrasound-system.webp", alt: "Representative medical diagnostic and hospital technology equipment" },
  others: { src: "/images/categories/plc-industrial-automation.webp", alt: "Representative PLC automation and industrial control equipment" },
};

export function getProductImage(input: { image_url?: string | null; image_alt?: string | null; category?: ProductCategory | null; title?: string }) {
  if (input.image_url?.startsWith("http") || input.image_url?.startsWith("/")) return { src: input.image_url, alt: input.image_alt || input.title || "Product image" };
  const key = input.category || "others";
  return categoryFallbacks[key] ?? categoryFallbacks.others;
}
