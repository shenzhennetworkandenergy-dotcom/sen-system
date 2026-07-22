"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addressFromForm, uuid } from "@/lib/orders/validation";

const target = (kind: "success" | "error", message: string) => `/account/addresses?${kind}=${encodeURIComponent(message)}`;

export async function saveAddressAction(form: FormData) {
  const { profile } = await requireProfile(["customer", "admin"]); const db = createSupabaseAdminClient();
  try {
    const data = addressFromForm(form), id = String(form.get("id") ?? "").trim(), isDefault = form.get("is_default_shipping") === "on";
    if (isDefault) { const cleared = await db.from("customer_addresses").update({ is_default_shipping: false, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("profile_id", profile.id); if (cleared.error) throw new Error("Unable to update the default address."); }
    const payload = { ...data, profile_id: profile.id, is_default_shipping: isDefault, updated_by: profile.id, updated_at: new Date().toISOString() };
    const result = id ? await db.from("customer_addresses").update(payload).eq("id", uuid(id, "Address")).eq("profile_id", profile.id) : await db.from("customer_addresses").insert({ ...payload, created_by: profile.id });
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/account/addresses"); redirect(target("success", id ? "Address updated." : "Address added."));
  } catch (error) { console.error("Address save failed", { message: error instanceof Error ? error.message : "Unknown" }); redirect(target("error", error instanceof Error && /required|invalid|default/i.test(error.message) ? error.message : "Unable to save address.")); }
}

export async function deleteAddressAction(form: FormData) {
  const { profile } = await requireProfile(["customer", "admin"]); const id = uuid(form.get("id"), "Address"), db = createSupabaseAdminClient();
  const { data: used } = await db.from("sales_orders").select("id").eq("shipping_address_id", id).limit(1); if (used?.length) redirect(target("error", "This address is referenced by an order. Keep it for history or add a new address."));
  const { error } = await db.from("customer_addresses").delete().eq("id", id).eq("profile_id", profile.id); if (error) redirect(target("error", "Unable to delete address."));
  revalidatePath("/account/addresses"); redirect(target("success", "Address deleted."));
}
