import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const serialStatuses = ["expected","in_transit","received","available","reserved","allocated","packed","shipped","delivered","returned","quarantined","damaged","lost","transferred","disposed","voided","sold","unavailable","removed"] as const;

export async function getSerialGeneratorOptions(productId: string) {
  const db = createSupabaseAdminClient();
  const [{ data: product, error }, { data: warehouses }] = await Promise.all([
    db.from("products").select("id,name,sku,model_number,brand_id,serial_tracking_required,status,brands(name)").eq("id", productId).maybeSingle(),
    db.from("warehouses").select("id,code,name,country_name").eq("is_active", true).order("name"),
  ]);
  if (error) throw new Error("Unable to load the product for serial generation.");
  return { product, warehouses: warehouses ?? [] };
}

export async function getSerialBatch(batchId: string) {
  const db = createSupabaseAdminClient();
  const { data: batch, error } = await db.from("serial_generation_batches").select("id,product_id,variation_id,expected_warehouse_id,quantity,condition,notes,status,generated_at").eq("id", batchId).maybeSingle();
  if (error || !batch) return null;
  const [{ data: units }, { data: product }, { data: warehouse }] = await Promise.all([
    db.from("serial_numbers").select("id,sen_serial,manufacturer_serial,status,condition,created_at").eq("generation_batch_id", batchId).order("created_at"),
    db.from("products").select("id,name,sku,model_number,brands(name)").eq("id", batch.product_id).maybeSingle(),
    batch.expected_warehouse_id ? db.from("warehouses").select("id,name,code").eq("id", batch.expected_warehouse_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { batch, units: units ?? [], product, warehouse };
}
