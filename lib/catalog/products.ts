import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { quantity } from "@/lib/inventory/stock";
import { sanitizeProductHtml } from "@/lib/inventory/html";

const staticImages: Record<string, string> = {
  "dell-poweredge-r630-e5-2680-v4": "/products/servers/dell-r630.png",
  "dell-poweredge-r640-xeon-gold-6138": "/products/servers/dell-r640.png",
  "dell-poweredge-r640-xeon-platinum-8160": "/products/servers/dell-r640.png",
  "dell-poweredge-r730xd": "/products/servers/dell-r730xd.png",
  "dell-poweredge-r740xd": "/products/servers/dell-r740xd.png",
  "dell-poweredge-r750": "/products/servers/dell-r750.png",
  "dell-poweredge-r760": "/products/servers/dell-r760.png",
  "supermicro-sys-2028tp-httr-4-node": "/products/servers/supermicro-sys-2028tp-httr.png",
  "supermicro-sys-2029gp-tr": "/products/servers/supermicro-sys-2029gp-tr.png",
};

export type CatalogueParams = { q?: string; category?: string; sort?: string };

async function signedMediaMap(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const db = createSupabaseAdminClient();
  const { data, error } = await db.storage.from("product-media").createSignedUrls([...new Set(paths)], 3600);
  if (error) console.error("Public product media signing failed", { message: error.message });
  return new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
}

export async function getPublicProducts(params: CatalogueParams = {}) {
  const db = createSupabaseAdminClient();
  let query = db.from("products").select("id,name,slug,sku,short_description,regular_price,sale_price,currency,sen_business_category,brand_id,featured,stock_status,updated_at").eq("status", "active").eq("public_catalogue_visible", true);
  if (params.q?.trim()) query = query.or(`name.ilike.%${params.q.slice(0, 80)}%,sku.ilike.%${params.q.slice(0, 80)}%,short_description.ilike.%${params.q.slice(0, 80)}%`);
  if (params.category) query = query.eq("sen_business_category", params.category);
  query = params.sort === "price_low" ? query.order("sale_price", { ascending: true, nullsFirst: false }) : params.sort === "name" ? query.order("name") : query.order("featured", { ascending: false }).order("updated_at", { ascending: false });
  const { data, error } = await query.limit(100);
  if (error) throw new Error("Unable to load the public product catalogue.");
  const products = data ?? [];
  const ids = products.map((product) => product.id);
  const brandIds = products.map((product) => product.brand_id).filter((id): id is string => Boolean(id));
  const [{ data: brands }, { data: media }, { data: balances }] = ids.length ? await Promise.all([
    brandIds.length ? db.from("brands").select("id,name").in("id", [...new Set(brandIds)]) : Promise.resolve({ data: [] }),
    db.from("product_media").select("product_id,storage_path,alt_text,is_primary,sort_order").in("product_id", ids).eq("media_type", "image").order("sort_order"),
    db.from("inventory_balances").select("product_id,available").in("product_id", ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const signed = await signedMediaMap((media ?? []).map((item) => item.storage_path));
  const brandMap = new Map((brands ?? []).map((brand) => [brand.id, brand.name]));
  return products.map((product) => {
    const image = (media ?? []).find((item) => item.product_id === product.id && item.is_primary) ?? (media ?? []).find((item) => item.product_id === product.id);
    const available = (balances ?? []).filter((balance) => balance.product_id === product.id).reduce((sum, balance) => sum + quantity(balance.available), 0);
    return { ...product, brand: product.brand_id ? brandMap.get(product.brand_id) ?? null : null, imageUrl: image ? signed.get(image.storage_path) ?? staticImages[product.slug] ?? null : staticImages[product.slug] ?? null, imageAlt: image?.alt_text ?? product.name, available };
  });
}

export async function getPublicProduct(slug: string) {
  const db = createSupabaseAdminClient();
  const { data: product, error } = await db.from("products").select("id,name,slug,sku,model_number,barcode,manufacturer_part_number,product_type,short_description,description,specifications,warranty_information,datasheet_url,regular_price,sale_price,currency,weight,length,width,height,country_of_origin,stock_status,allow_backorders,serial_tracking_required,sen_business_category,brand_id,updated_at").eq("slug", slug).eq("status", "active").eq("public_catalogue_visible", true).maybeSingle();
  if (error) throw new Error("Unable to load this product.");
  if (!product) return null;
  const [{ data: brand }, { data: assignments }, { data: media }, { data: variations }, { data: balances }] = await Promise.all([
    product.brand_id ? db.from("brands").select("name,description,website_url").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("product_category_assignments").select("is_primary,product_categories(name,slug)").eq("product_id", product.id),
    db.from("product_media").select("id,storage_path,alt_text,is_primary,sort_order").eq("product_id", product.id).eq("media_type", "image").order("sort_order"),
    db.from("product_variations").select("id,sku,combination_key,regular_price,sale_price,stock_status").eq("product_id", product.id).eq("status", "active").order("created_at"),
    db.from("inventory_balances").select("available,incoming").eq("product_id", product.id),
  ]);
  const signed = await signedMediaMap((media ?? []).map((item) => item.storage_path));
  const images = (media ?? []).map((item) => ({ id: item.id, url: signed.get(item.storage_path) ?? staticImages[product.slug] ?? null, alt: item.alt_text ?? product.name, primary: item.is_primary })).filter((item): item is typeof item & { url: string } => Boolean(item.url));
  if (!images.length && staticImages[product.slug]) images.push({ id: "static", url: staticImages[product.slug], alt: product.name, primary: true });
  const available = (balances ?? []).reduce((sum, balance) => sum + quantity(balance.available), 0);
  const incoming = (balances ?? []).reduce((sum, balance) => sum + quantity(balance.incoming), 0);
  return { ...product, short_description:sanitizeProductHtml(product.short_description),description:sanitizeProductHtml(product.description), brand, categories: (assignments ?? []).map((item) => item.product_categories as unknown as { name: string; slug: string }).filter(Boolean), images, variations: variations ?? [], available, incoming };
}
