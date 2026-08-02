import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { quantity } from "@/lib/inventory/stock";
import { sanitizeProductHtml } from "@/lib/inventory/html";
import { fallbackBusinessCategory, toBusinessCategory } from "@/lib/catalog/themes";
import {
  collectAllProductBatches,
  collectRowsByProductIds,
  publicProductEqualityFilters,
  publicProductOrder,
} from "@/lib/catalog/product-query";
import type { BusinessCategoryRow } from "@/types/category";

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
  "siemens-simatic-s7-1200-cpu-1214c": "/products/seed/siemens-s7-1200.svg",
  "contec-cms8000-patient-monitor": "/products/seed/contec-cms8000.svg",
  "sen-build-pvdf-acp-4mm": "/products/seed/sen-build-acp.svg",
};

export type CatalogueParams = { q?: string; category?: string; sort?: string; featuredOnly?: boolean };

function linkedBusinessCategory(value: unknown) {
  const row = (Array.isArray(value) ? value[0] : value) as
    | BusinessCategoryRow
    | null
    | undefined;
  return row ? toBusinessCategory(row) : fallbackBusinessCategory;
}

async function signedMediaMap(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const db = createSupabaseAdminClient();
  const { data, error } = await db.storage.from("product-media").createSignedUrls([...new Set(paths)], 3600);
  if (error) console.error("Public product media signing failed", { message: error.message });
  return new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
}

export async function getPublicProducts(params: CatalogueParams = {}) {
  const db = createSupabaseAdminClient();
  const buildQuery = () => {
    let query = db.from("products").select("id,name,slug,sku,short_description,regular_price,sale_price,currency,sen_business_category,business_category_id,business_categories!products_business_category_id_fkey(id,name,slug,description,tagline,theme_color,icon,image_path,is_active,sort_order,archived_at),brand_id,featured,stock_status,updated_at");
    for (const filter of publicProductEqualityFilters(Boolean(params.featuredOnly))) {
      query = query.eq(filter.column, filter.value);
    }
    if (params.q?.trim()) query = query.or(`name.ilike.%${params.q.slice(0, 80)}%,sku.ilike.%${params.q.slice(0, 80)}%,short_description.ilike.%${params.q.slice(0, 80)}%`);
    if (params.category) query = query.eq("business_category_id", params.category);
    for (const order of publicProductOrder(params.sort)) {
      query = query.order(order.column, {
        ascending: order.ascending,
        ...(order.nullsFirst === undefined ? {} : { nullsFirst: order.nullsFirst }),
      });
    }
    return query;
  };
  const loadRange = async (from: number, to: number) => {
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw new Error("Unable to load the public product catalogue.");
    return data ?? [];
  };
  const products = params.featuredOnly
    ? await collectAllProductBatches(loadRange)
    : await loadRange(0, 99);
  const ids = products.map((product) => product.id);
  const brandIds = [...new Set(products.map((product) => product.brand_id).filter((id): id is string => Boolean(id)))];
  const [brands, media, balances] = ids.length ? await Promise.all([
    collectRowsByProductIds(brandIds, async (batchIds, from, to) => {
      const { data, error } = await db.from("brands").select("id,name").in("id", [...batchIds]).order("id").range(from, to);
      if (error) throw new Error("Unable to load public product brands.");
      return data ?? [];
    }),
    collectRowsByProductIds(ids, async (batchIds, from, to) => {
      const { data, error } = await db.from("product_media").select("id,product_id,storage_path,alt_text,is_primary,sort_order").in("product_id", [...batchIds]).eq("media_type", "image").eq("visibility", "public").order("product_id").order("sort_order").order("id").range(from, to);
      if (error) throw new Error("Unable to load public product media.");
      return data ?? [];
    }),
    collectRowsByProductIds(ids, async (batchIds, from, to) => {
      const { data, error } = await db.from("inventory_balances").select("product_id,variation_id,warehouse_id,available").in("product_id", [...batchIds]).order("product_id").order("warehouse_id").order("variation_id", { nullsFirst: true }).range(from, to);
      if (error) throw new Error("Unable to load public product balances.");
      return data ?? [];
    }),
  ]) : [[], [], []];
  const signed = await signedMediaMap(media.map((item) => item.storage_path));
  const brandMap = new Map(brands.map((brand) => [brand.id, brand.name]));
  return products.map((product) => {
    const image = media.find((item) => item.product_id === product.id && item.is_primary) ?? media.find((item) => item.product_id === product.id);
    const available = balances.filter((balance) => balance.product_id === product.id).reduce((sum, balance) => sum + quantity(balance.available), 0);
    return { ...product, businessCategory: linkedBusinessCategory(product.business_categories), brand: product.brand_id ? brandMap.get(product.brand_id) ?? null : null, imageUrl: image ? signed.get(image.storage_path) ?? staticImages[product.slug] ?? null : staticImages[product.slug] ?? null, imageAlt: image?.alt_text ?? product.name, available };
  });
}

export async function getPublicProduct(slug: string) {
  const db = createSupabaseAdminClient();
  const { data: product, error } = await db.from("products").select("id,name,slug,sku,model_number,barcode,manufacturer_part_number,product_type,short_description,description,specifications,warranty_information,datasheet_url,regular_price,sale_price,currency,weight,length,width,height,country_of_origin,stock_status,allow_backorders,serial_tracking_required,sen_business_category,business_category_id,business_categories!products_business_category_id_fkey(id,name,slug,description,tagline,theme_color,icon,image_path,is_active,sort_order,archived_at),brand_id,updated_at").eq("slug", slug).eq("status", "active").eq("public_catalogue_visible", true).maybeSingle();
  if (error) throw new Error("Unable to load this product.");
  if (!product) return null;
  const [{ data: brand }, { data: assignments }, { data: media }, { data: variations }, { data: balances }] = await Promise.all([
    product.brand_id ? db.from("brands").select("name,description,website_url").eq("id", product.brand_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("product_category_assignments").select("is_primary,product_categories(name,slug)").eq("product_id", product.id),
    db.from("product_media").select("id,storage_path,alt_text,is_primary,sort_order").eq("product_id", product.id).is("variation_id", null).eq("media_type", "image").eq("visibility", "public").order("sort_order"),
    db.from("product_variations").select("id,sku,combination_key,regular_price,sale_price,stock_status").eq("product_id", product.id).eq("status", "active").order("created_at"),
    db.from("inventory_balances").select("variation_id,available,incoming").eq("product_id", product.id),
  ]);
  const signed = await signedMediaMap((media ?? []).map((item) => item.storage_path));
  const images = (media ?? []).map((item) => ({ id: item.id, url: signed.get(item.storage_path) ?? staticImages[product.slug] ?? null, alt: item.alt_text ?? product.name, primary: item.is_primary })).filter((item): item is typeof item & { url: string } => Boolean(item.url));
  if (!images.length && staticImages[product.slug]) images.push({ id: "static", url: staticImages[product.slug], alt: product.name, primary: true });
  const available = (balances ?? []).reduce((sum, balance) => sum + quantity(balance.available), 0);
  const incoming = (balances ?? []).reduce((sum, balance) => sum + quantity(balance.incoming), 0);
  const variationsWithStock = (variations ?? []).map((variation) => {
    const variationBalances = (balances ?? []).filter((balance) => balance.variation_id === variation.id);
    return {
      ...variation,
      available: variationBalances.reduce((sum, balance) => sum + quantity(balance.available), 0),
      incoming: variationBalances.reduce((sum, balance) => sum + quantity(balance.incoming), 0),
    };
  });
  return { ...product, businessCategory: linkedBusinessCategory(product.business_categories), short_description:sanitizeProductHtml(product.short_description),description:sanitizeProductHtml(product.description), brand, categories: (assignments ?? []).map((item) => item.product_categories as unknown as { name: string; slug: string }).filter(Boolean), images, variations: variationsWithStock, available, incoming };
}
