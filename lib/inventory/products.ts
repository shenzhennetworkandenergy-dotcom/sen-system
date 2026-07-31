import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deriveStockStatus, quantity } from "@/lib/inventory/stock";
import { getBusinessCategories } from "@/lib/catalog/business-categories";

export type ProductListParams = { q?: string; category?: string; brand?: string; type?: string; stock?: string; status?: string; sort?: string; page?: string };

export function productListPageHref(params: ProductListParams, page: number) {
  const search = new URLSearchParams();
  for (const key of ["q", "category", "brand", "type", "stock", "status", "sort"] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  search.set("page", String(Math.max(1, page)));
  return `?${search.toString()}`;
}

export async function getProductOptions() {
  const db = createSupabaseAdminClient();
  const [{ data: categories }, { data: brands }, { data: attributes }, businessCategories] = await Promise.all([
    db.from("product_categories").select("id,name,parent_id,business_category_id").eq("is_active", true).order("name"),
    db.from("brands").select("id,name").eq("is_active", true).order("name"),
    db.from("attributes").select("id,name").eq("is_active", true).order("sort_order"),
    getBusinessCategories({ includeFields: true }),
  ]);
  return { categories: categories ?? [], brands: brands ?? [], attributes: attributes ?? [], businessCategories };
}

export async function getProductList(params: ProductListParams) {
  const db = createSupabaseAdminClient(), page = Math.max(1, Number.parseInt(params.page ?? "1") || 1), size = 25;
  const stockFilter = params.stock && ["in_stock", "low_stock", "out_of_stock", "on_backorder"].includes(params.stock) ? params.stock : null;
  let allowedIds: string[] | null = null;
  if (params.category) {
    const { data } = await db.from("product_category_assignments").select("product_id").eq("category_id", params.category);
    allowedIds = (data ?? []).map((item) => item.product_id);
    if (!allowedIds.length) return { products: [], count: 0, page, size };
  }
  let query = db.from("products").select("id,name,slug,sku,product_type,status,public_catalogue_visible,featured,brand_id,regular_price,sale_price,currency,stock_status,low_stock_threshold,allow_backorders,updated_at", { count: "exact" }).neq("status", "archived");
  if (params.q) query = query.or(`name.ilike.%${params.q.slice(0, 80)}%,sku.ilike.%${params.q.slice(0, 80)}%`);
  if (params.brand) query = query.eq("brand_id", params.brand);
  if (params.type && ["simple", "variable"].includes(params.type)) query = query.eq("product_type", params.type);
  if (params.status && ["draft", "active"].includes(params.status)) query = query.eq("status", params.status);
  if (allowedIds) query = query.in("id", allowedIds);
  const ascending = params.sort === "name";
  const orderedQuery = query.order(ascending ? "name" : "updated_at", { ascending });
  // Stock state is derived from live warehouse balances, so those candidates
  // must be hydrated and filtered before applying list pagination.
  const { data, error, count } = stockFilter
    ? await orderedQuery.limit(1000)
    : await orderedQuery.range((page - 1) * size, page * size - 1);
  if (error) throw new Error("Unable to load products.");
  const ids = (data ?? []).map((item) => item.id);
  const related = ids.length ? await Promise.all([
    db.from("brands").select("id,name").in("id", [...new Set((data ?? []).map((item) => item.brand_id).filter((value): value is string => Boolean(value)))]),
    db.from("inventory_balances").select("product_id,warehouse_id,available").in("product_id", ids),
    db.from("product_category_assignments").select("product_id,category_id,is_primary").in("product_id", ids),
    db.from("product_categories").select("id,name"), db.from("product_media").select("product_id,storage_path,alt_text").in("product_id", ids).eq("is_primary", true),
    db.from("product_variations").select("product_id").in("product_id", ids).eq("status", "active"), db.from("warehouses").select("id,code,name").eq("is_active", true),
  ]) : Array.from({ length: 7 }, () => ({ data: [] }));
  const [brandsResult, balancesResult, assignmentsResult, categoriesResult, mediaResult, variationsResult, warehousesResult] = related;
  const brands = brandsResult.data ?? [], balances = balancesResult.data ?? [], assignments = assignmentsResult.data ?? [], categories = categoriesResult.data ?? [], media = mediaResult.data ?? [], variations = variationsResult.data ?? [], warehouses = warehousesResult.data ?? [];
  const mediaPaths = media.map((item) => item.storage_path);
  const { data: signedMedia } = mediaPaths.length ? await db.storage.from("product-media").createSignedUrls(mediaPaths, 3600) : { data: [] };
  const mediaUrlMap = new Map((signedMedia ?? []).map((item) => [item.path, item.signedUrl]));
  const brandMap = new Map(brands.map((item) => [item.id, item.name])), categoryMap = new Map(categories.map((item) => [item.id, item.name])), warehouseMap = new Map(warehouses.map((item) => [item.id, item.code]));
  const products = (data ?? []).map((product) => {
    const productBalances = balances.filter((item) => item.product_id === product.id), available = productBalances.reduce((sum, item) => sum + quantity(item.available), 0);
    const primary = assignments.find((item) => item.product_id === product.id && item.is_primary) ?? assignments.find((item) => item.product_id === product.id);
    const warehouseSummary = productBalances.length ? productBalances.map((item) => `${warehouseMap.get(item.warehouse_id) ?? "Warehouse"}: ${quantity(item.available)}`).join(", ") : "No balances";
    const primaryMedia = media.find((item) => item.product_id === product.id) ?? null;
    const image = primaryMedia ? { ...primaryMedia, signedUrl: mediaUrlMap.get(primaryMedia.storage_path) ?? null } : null;
    return { ...product, brand: product.brand_id ? brandMap.get(product.brand_id) ?? null : null, category: primary ? categoryMap.get(primary.category_id) ?? null : null, available, warehouseSummary, derivedStock: deriveStockStatus(available, quantity(product.low_stock_threshold), product.allow_backorders), image, variationCount: variations.filter((item) => item.product_id === product.id).length };
  });
  const stockFilteredProducts = stockFilter ? products.filter((item) => item.derivedStock === stockFilter) : products;
  return {
    products: stockFilter ? stockFilteredProducts.slice((page - 1) * size, page * size) : stockFilteredProducts,
    count: stockFilter ? stockFilteredProducts.length : count ?? 0,
    page,
    size,
  };
}
