import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
