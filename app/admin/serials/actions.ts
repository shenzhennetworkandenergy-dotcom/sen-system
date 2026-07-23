"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidOrNull } from "@/lib/inventory/validation";

const safeSerialError = (message: string) => /brand|model|serial|quantity|warehouse|workplace|permission|expected|reserved|allocated|packed|shipped|delivered/i.test(message) ? message : "Unable to complete the serial operation.";
const values = (form: FormData, key: string) => String(form.get(key) ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 500);

export async function generateSerialBatchAction(productId: string, form: FormData) {
  const { profile } = await requirePermission("serials.generate");
  const warehouse = uuidOrNull(form.get("warehouse_id")), quantity = Number(form.get("quantity"));
  if (!warehouse || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) redirect(`/admin/products/${productId}/serials/new?error=${encodeURIComponent("Choose a warehouse and a whole-number quantity from 1 to 500.")}`);
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("generate_serial_batch", { actor_profile_id: profile.id, requested_product_id: productId, requested_variation_id: uuidOrNull(form.get("variation_id")), requested_warehouse_id: warehouse, requested_quantity: quantity, requested_condition: String(form.get("condition") ?? "new").slice(0, 80), requested_notes: String(form.get("notes") ?? "").slice(0, 1000), requested_manufacturer_serials: values(form, "manufacturer_serials") });
  if (error || !data) { console.error("Serial batch generation failed", { code: error?.code, message: error?.message }); redirect(`/admin/products/${productId}/serials/new?error=${encodeURIComponent(safeSerialError(error?.message ?? "Generation failed"))}`); }
  revalidatePath("/admin/serials"); redirect(`/admin/products/${productId}/serials/new?batch=${data}&success=${encodeURIComponent("Serial batch generated and ready to print.")}`);
}

export async function receiveExpectedSerialBatchAction(form: FormData) {
  const { profile } = await requirePermission("inventory.receive");
  const batchId = uuidOrNull(form.get("batch_id"));
  if (!batchId) redirect(`/admin/serials/batches?error=${encodeURIComponent("Choose a valid serial batch.")}`);
  const db = createSupabaseAdminClient();
  const { data: batch, error: batchError } = await db.from("serial_generation_batches").select("id,product_id,variation_id,expected_warehouse_id,status").eq("id", batchId).maybeSingle();
  if (batchError || !batch || !batch.expected_warehouse_id || batch.status === "received") {
    redirect(`/admin/serials/batches?error=${encodeURIComponent("This serial batch cannot be received.")}`);
  }
  const [{ data: units, error: unitsError }, { data: reason, error: reasonError }] = await Promise.all([
    db.from("serial_numbers").select("id").eq("generation_batch_id", batchId).eq("status", "expected").order("created_at"),
    db.from("stock_adjustment_reasons").select("id").eq("is_active", true).in("direction", ["increase", "both"]).order("sort_order").limit(1).maybeSingle(),
  ]);
  if (unitsError || reasonError || !reason || !units?.length) {
    redirect(`/admin/serials/batches?error=${encodeURIComponent("No receivable expected units or active stock receipt reason was found.")}`);
  }
  const { error } = await db.rpc("admin_adjust_serialized_inventory", {
    actor_profile_id: profile.id,
    requested_warehouse_id: batch.expected_warehouse_id,
    requested_product_id: batch.product_id,
    requested_variation_id: batch.variation_id,
    quantity_change: units.length,
    requested_reason_id: reason.id,
    requested_notes: `Received expected serial batch ${batchId}.`,
    requested_serial_ids: units.map((unit) => unit.id),
    requested_manufacturer_serials: [],
  });
  if (error) {
    console.error("Expected serial batch receipt failed", { code: error.code, message: error.message, batchId });
    redirect(`/admin/serials/batches?error=${encodeURIComponent(safeSerialError(error.message))}`);
  }
  await db.from("serial_generation_batches").update({ status: "received" }).eq("id", batchId);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${batch.product_id}`);
  revalidatePath("/admin/serials");
  revalidatePath("/admin/serials/batches");
  revalidatePath("/products");
  redirect(`/admin/serials/batches?success=${encodeURIComponent(`${units.length} expected serialized unit(s) received into stock.`)}`);
}

export async function regenerateSerialAction(form: FormData) {
  const { profile } = await requirePermission("serials.regenerate");
  const id = uuidOrNull(form.get("serial_id")), reason = String(form.get("reason") ?? "").trim();
  if (!id || !reason) redirect(`/admin/serials?error=${encodeURIComponent("Serial and regeneration reason are required.")}`);
  const { error } = await createSupabaseAdminClient().rpc("regenerate_sen_serial", { actor_profile_id: profile.id, requested_serial_id: id, requested_reason: reason.slice(0, 1000) });
  if (error) redirect(`/admin/serials/${id}?error=${encodeURIComponent(safeSerialError(error.message))}`);
  revalidatePath(`/admin/serials/${id}`); revalidatePath("/admin/serials"); redirect(`/admin/serials/${id}?success=${encodeURIComponent("Expected serial regenerated; the previous value remains in history.")}`);
}

export async function updateManufacturerSerialAction(form: FormData) {
  const { profile } = await requirePermission("serials.correct"); const id = uuidOrNull(form.get("serial_id"));
  if (!id) redirect("/admin/serials");
  const { error } = await createSupabaseAdminClient().rpc("update_manufacturer_serial", { actor_profile_id: profile.id, requested_serial_id: id, requested_value: String(form.get("manufacturer_serial") ?? "").slice(0, 200) });
  if (error) redirect(`/admin/serials/${id}?error=${encodeURIComponent(safeSerialError(error.message))}`);
  revalidatePath(`/admin/serials/${id}`); redirect(`/admin/serials/${id}?success=${encodeURIComponent("Manufacturer serial updated.")}`);
}

export async function receiveSerializedStockAction(productId:string,form:FormData){const{profile}=await requirePermission("inventory.receive"),warehouse=uuidOrNull(form.get("warehouse_id")),quantity=Number(form.get("quantity"));if(!warehouse||!Number.isInteger(quantity)||quantity<1||quantity>200)redirect(`/admin/products/${productId}/stock/add?error=${encodeURIComponent("Choose a warehouse and quantity from 1 to 200.")}`);const manufacturers=String(form.get("manufacturer_serials")??"").split(/\r?\n/).map(x=>x.trim()).slice(0,quantity);while(manufacturers.length<quantity)manufacturers.push("");const db=createSupabaseAdminClient();const{data,error}=await db.rpc("phase3_receive_serialized_stock",{actor_profile_id:profile.id,requested_product_id:productId,requested_variation_id:uuidOrNull(form.get("variation_id")),requested_warehouse_id:warehouse,requested_quantity:quantity,requested_condition:String(form.get("condition")??"new").slice(0,80),requested_reason_id:uuidOrNull(form.get("reason_id")),requested_notes:[String(form.get("reference")??""),String(form.get("notes")??"")].filter(Boolean).join(" · ").slice(0,1000),requested_manufacturer_serials:manufacturers});if(error||!data){console.error("Serialized stock receipt failed",{code:error?.code,message:error?.message});redirect(`/admin/products/${productId}/stock/add?error=${encodeURIComponent(safeSerialError(error?.message??"Receipt failed"))}`)}revalidatePath(`/admin/products/${productId}`);revalidatePath("/admin/inventory");revalidatePath("/admin/serials");redirect(`/admin/products/${productId}/serials/new?batch=${data}&success=${encodeURIComponent(`${quantity} serialized unit(s) received into stock.`)}`);}
