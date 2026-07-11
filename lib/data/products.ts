import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Product = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  category_slug: string;
  image_url: string | null;
  image_alt: string | null;
  featured: boolean;
  published: boolean;
  display_order: number;
};

export type ProductQueryResult = {
  products: Product[];
  source: "supabase" | "empty" | "unavailable";
};

const fallbackProducts: Product[] = [
  { id: "demo-server", slug: "demo-enterprise-server-class", name: "Enterprise rack server class", short_description: "Demo example for high-density compute and virtualization requirements.", description: null, brand: null, model: null, category_slug: "servers", image_url: "/images/home/servers/rack-servers.svg", image_alt: "Abstract enterprise rack server infrastructure visual", featured: true, published: true, display_order: 10 },
  { id: "demo-switch", slug: "demo-core-switch-class", name: "Enterprise core switch class", short_description: "Demo example for data-center, campus and ISP switching projects.", description: null, brand: null, model: null, category_slug: "networking", image_url: "/images/home/networking/fibre-core.svg", image_alt: "Abstract fibre and core network infrastructure visual", featured: true, published: true, display_order: 20 },
  { id: "demo-monitor", slug: "demo-patient-monitor-class", name: "Multiparameter patient monitor class", short_description: "Demo example for clinical monitoring and hospital technology sourcing.", description: null, brand: null, model: null, category_slug: "medical", image_url: "/images/home/medical/diagnostic-suite.svg", image_alt: "Abstract medical diagnostic technology visual", featured: true, published: true, display_order: 30 },
  { id: "demo-ups", slug: "demo-industrial-ups-class", name: "Industrial UPS and power electronics class", short_description: "Demo example for continuity power, inverter and automation projects.", description: null, brand: null, model: null, category_slug: "energy", image_url: "/images/home/energy/power-systems.svg", image_alt: "Abstract energy and power electronics infrastructure visual", featured: true, published: true, display_order: 40 },
];

export async function getFeaturedProducts(limit = 6): Promise<ProductQueryResult> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return { products: fallbackProducts.slice(0, limit), source: "unavailable" };

  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, slug, name, short_description, description, brand, model, category_slug, image_url, image_alt, featured, published, display_order")
      .eq("published", true)
      .eq("featured", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { products: fallbackProducts.slice(0, limit), source: "unavailable" };
    if (!data || data.length === 0) return { products: [], source: "empty" };
    return { products: data as Product[], source: "supabase" };
  } catch {
    return { products: fallbackProducts.slice(0, limit), source: "unavailable" };
  }
}

export async function getPublishedProductsByCategory(categorySlug: string, limit = 12): Promise<ProductQueryResult> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return { products: [], source: "unavailable" };
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, slug, name, short_description, description, brand, model, category_slug, image_url, image_alt, featured, published, display_order")
      .eq("published", true)
      .eq("category_slug", categorySlug)
      .order("display_order", { ascending: true })
      .limit(limit);
    if (error) return { products: [], source: "unavailable" };
    return { products: (data ?? []) as Product[], source: data?.length ? "supabase" : "empty" };
  } catch {
    return { products: [], source: "unavailable" };
  }
}
