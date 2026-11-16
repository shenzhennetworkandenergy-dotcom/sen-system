import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  summarizeWarehouseStock,
  type WarehouseReportWarehouse,
  type WarehouseStockBalance,
} from "./warehouse-report";

export async function listStockReportWarehouses(): Promise<WarehouseReportWarehouse[]> {
  const result = await createSupabaseAdminClient()
    .from("warehouses").select("id,code,name,in_charge_name,is_active").order("name").order("id");
  if (result.error) {
    console.error("Warehouse report selection failed", result.error.code);
    throw new Error("Unable to load warehouses for the stock report.");
  }
  return result.data ?? [];
}

export async function getWarehouseStockReport(warehouseId: string) {
  const db = createSupabaseAdminClient();
  const pageSize = 500;
  const balances: WarehouseStockBalance[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await db.from("inventory_balances")
      .select("product_id,variation_id,on_hand,available,products(name,sku,currency,sale_price,regular_price),product_variations!inventory_balances_variation_id_fkey(sku,combination_key,sale_price,regular_price)")
      .eq("warehouse_id", warehouseId).gt("on_hand", 0).order("id")
      .range(offset, offset + pageSize - 1);
    if (result.error) {
      console.error("Warehouse stock report query failed", result.error.code);
      throw new Error("Unable to load current warehouse stock.");
    }
    const rows = (result.data ?? []) as unknown as WarehouseStockBalance[];
    balances.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { stock: summarizeWarehouseStock(balances), asOf: new Date() };
}
