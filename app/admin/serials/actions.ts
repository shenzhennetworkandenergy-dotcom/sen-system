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
