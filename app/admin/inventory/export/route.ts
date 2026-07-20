import { requirePermission } from "@/lib/auth/permissions";
import { deriveStockStatus } from "@/lib/inventory/stock";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const csvCell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export async function GET() {
  await requirePermission("inventory.export");
  const db = createSupabaseAdminClient();
  const [{ data: products, error: productError }, { data: balances, error: balanceError }, { data: warehouses }, { data: brands }, { data: assignments }, { data: categories }] = await Promise.all([
    db.from("products").select("id,name,sku,product_type,brand_id,stock_status,low_stock_threshold,allow_backorders,status").order("name").limit(5000),
    db.from("inventory_balances").select("product_id,variation_id,warehouse_id,on_hand,reserved,available").limit(10000),
    db.from("warehouses").select("id,code,name").limit(500), db.from("brands").select("id,name").limit(1000),
    db.from("product_category_assignments").select("product_id,category_id").eq("is_primary", true).limit(5000), db.from("product_categories").select("id,name").limit(5000),
  ]);
  if (productError || balanceError) return Response.json({ error: "Unable to export inventory." }, { status: 500 });
  const warehouseMap = new Map((warehouses ?? []).map((item) => [item.id, `${item.name} (${item.code})`]));
  const brandMap = new Map((brands ?? []).map((item) => [item.id, item.name]));
  const categoryMap = new Map((categories ?? []).map((item) => [item.id, item.name]));
  const primaryCategory = new Map((assignments ?? []).map((item) => [item.product_id, categoryMap.get(item.category_id) ?? ""]));
  const balanceMap = new Map<string, NonNullable<typeof balances>>();
  for (const balance of balances ?? []) balanceMap.set(balance.product_id, [...(balanceMap.get(balance.product_id) ?? []), balance]);
  const header = ["Product", "SKU", "Type", "Category", "Brand", "Warehouse", "Variation ID", "On hand", "Reserved", "Available", "Stock status", "Publication status"];
  const rows: unknown[][] = [];
  for (const product of products ?? []) {
    const productBalances = balanceMap.get(product.id) ?? [];
    const totalAvailable = productBalances.reduce((sum, item) => sum + Number(item.available), 0);
    const stock = deriveStockStatus(totalAvailable, Number(product.low_stock_threshold), product.allow_backorders);
    if (!productBalances.length) rows.push([product.name, product.sku, product.product_type, primaryCategory.get(product.id), product.brand_id ? brandMap.get(product.brand_id) : "", "No balance", "", 0, 0, 0, stock, product.status]);
    for (const balance of productBalances) rows.push([product.name, product.sku, product.product_type, primaryCategory.get(product.id), product.brand_id ? brandMap.get(product.brand_id) : "", warehouseMap.get(balance.warehouse_id) ?? balance.warehouse_id, balance.variation_id, balance.on_hand, balance.reserved, balance.available, stock, product.status]);
  }
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sen-inventory-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
