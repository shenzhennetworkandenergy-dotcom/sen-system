import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deriveStockStatus, quantity } from "@/lib/inventory/stock";

export type InventorySummary = { active_products: number; simple_products: number; variable_products: number; variations: number; on_hand: number; available: number; reserved: number; low_stock: number; out_of_stock: number; serialized_units: number; warehouses: Array<{ id: string; code: string; name: string; on_hand: number; available: number }> };

export async function getInventorySummary(profileId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("inventory_dashboard_summary", { actor_profile_id: profileId });
  if (error) throw new Error("Unable to load inventory summary.");
  return data as InventorySummary;
}

export async function getInventorySelectors() {
  const db = createSupabaseAdminClient();
  const [{ data: warehouses }, { data: products }, { data: variations }, { data: reasons }, { data: balances }] = await Promise.all([
    db.from("warehouses").select("id,code,name,country_name").eq("is_active", true).order("name"),
    db.from("products").select("id,name,sku,product_type,serial_tracking_required").neq("status", "archived").order("name").limit(500),
    db.from("product_variations").select("id,product_id,sku,combination_key").eq("status", "active").order("sku").limit(1000),
    db.from("stock_adjustment_reasons").select("id,key,name,direction").eq("is_active", true).order("sort_order"),
    db.from("inventory_balances").select("id,warehouse_id,product_id,variation_id,on_hand,reserved,available").order("updated_at", { ascending: false }).limit(1000),
  ]);
  return { warehouses: warehouses ?? [], products: products ?? [], variations: variations ?? [], reasons: reasons ?? [], balances: balances ?? [] };
}

export const inventoryMetrics = ["active_products", "simple_products", "variable_products", "variations", "on_hand", "available", "reserved", "low_stock", "out_of_stock", "serialized_units"] as const;
export type InventoryMetric = (typeof inventoryMetrics)[number];

export function isInventoryMetric(value: string | undefined): value is InventoryMetric {
  return inventoryMetrics.includes(value as InventoryMetric);
}

export async function getInventoryDetailRows(metric?: InventoryMetric) {
  const db = createSupabaseAdminClient();
  const [productsResult, balancesResult, warehousesResult, locationsResult, serialsResult, variationsResult, brandsResult] = await Promise.all([
    db.from("products").select("id,name,sku,model_number,product_type,status,currency,regular_price,sale_price,stock_status,low_stock_threshold,serial_tracking_required,brand_id,updated_at").neq("status", "archived").order("name").limit(500),
    db.from("inventory_balances").select("product_id,warehouse_id,location_id,on_hand,reserved,incoming,damaged,unavailable,available").limit(2000),
    db.from("warehouses").select("id,code,name,country_name").order("name"),
    db.from("warehouse_locations").select("id,warehouse_id,code,name").order("name"),
    db.from("serial_numbers").select("id,product_id,warehouse_id,location_id,status,condition").limit(5000),
    db.from("product_variations").select("id,product_id,status").limit(2000),
    db.from("brands").select("id,name").order("name"),
  ]);
  const firstError = [productsResult, balancesResult, warehousesResult, locationsResult, serialsResult, variationsResult, brandsResult].find((result) => result.error)?.error;
  if (firstError) {
    console.error("Inventory detail query failed", { code: firstError.code, message: firstError.message });
    throw new Error("Unable to load inventory details.");
  }
  const balances = balancesResult.data ?? [], serials = serialsResult.data ?? [], variations = variationsResult.data ?? [];
  const warehouseMap = new Map((warehousesResult.data ?? []).map((item) => [item.id, item]));
  const locationMap = new Map((locationsResult.data ?? []).map((item) => [item.id, item]));
  const brandMap = new Map((brandsResult.data ?? []).map((item) => [item.id, item.name]));
  const rows = (productsResult.data ?? []).map((product) => {
    const productBalances = balances.filter((balance) => balance.product_id === product.id);
    const productSerials = serials.filter((serial) => serial.product_id === product.id);
    const onHand = productBalances.reduce((sum, balance) => sum + quantity(balance.on_hand), 0);
    const reserved = productBalances.reduce((sum, balance) => sum + quantity(balance.reserved), 0);
    const available = productBalances.reduce((sum, balance) => sum + quantity(balance.available), 0);
    const incoming = productBalances.reduce((sum, balance) => sum + quantity(balance.incoming), 0);
    const damaged = productBalances.reduce((sum, balance) => sum + quantity(balance.damaged), 0);
    const unavailable = productBalances.reduce((sum, balance) => sum + quantity(balance.unavailable), 0);
    const currentLocations = productBalances.filter((balance) => quantity(balance.on_hand) > 0).map((balance) => {
      const warehouse = warehouseMap.get(balance.warehouse_id), location = balance.location_id ? locationMap.get(balance.location_id) : null;
      return `${warehouse?.name ?? "Unknown warehouse"}${location ? ` / ${location.name}` : ""} (${quantity(balance.available)} available)`;
    });
    const serialStatuses = Object.fromEntries([...new Set(productSerials.map((serial) => serial.status))].map((status) => [status, productSerials.filter((serial) => serial.status === status).length]));
    return {
      ...product,
      brand: product.brand_id ? brandMap.get(product.brand_id) ?? null : null,
      onHand,
      reserved,
      available,
      incoming,
      damaged,
      unavailable,
      derivedStock: deriveStockStatus(available, quantity(product.low_stock_threshold)),
      variationCount: variations.filter((variation) => variation.product_id === product.id && variation.status === "active").length,
      serialCount: productSerials.length,
      serialStatuses,
      currentLocations,
    };
  });
  if (!metric) return rows;
  return rows.filter((row) => {
    if (metric === "active_products") return row.status === "active";
    if (metric === "simple_products") return row.product_type === "simple";
    if (metric === "variable_products") return row.product_type === "variable";
    if (metric === "variations") return row.variationCount > 0;
    if (metric === "on_hand") return row.onHand > 0;
    if (metric === "available") return row.available > 0;
    if (metric === "reserved") return row.reserved > 0;
    if (metric === "low_stock") return row.derivedStock === "low_stock";
    if (metric === "out_of_stock") return row.derivedStock === "out_of_stock";
    return row.serialCount > 0;
  });
}
