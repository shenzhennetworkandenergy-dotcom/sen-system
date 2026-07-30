"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { wholeNumberFromForm } from "@/lib/validation/numbers";

const listPath = "/admin/supplier-categories";
const optional = (form: FormData, name: string, maximum: number) => {
  const value = String(form.get(name) ?? "").trim();
  return value ? value.slice(0, maximum) : null;
};
const uuidOrNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error("Parent category is invalid.");
  return text;
};
const categoryPayload = (form: FormData, actorId: string) => {
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 160) throw new Error("Category name is required.");
  if (String(form.get("category_type") ?? "normal") !== "normal") throw new Error("Category type is invalid.");
  return {
    name,
    category_type: "normal",
    parent_id: uuidOrNull(form.get("parent_id")),
    description: optional(form, "description", 1000),
    image_url: optional(form, "image_url", 500),
    icon: optional(form, "icon", 80),
    is_active: form.get("is_active") === "on",
    display_order: wholeNumberFromForm(form, "display_order", "Display order", { minimum: 0, maximum: 100000 }) ?? 0,
    updated_by: actorId,
  };
};
const message = (error: unknown) => encodeURIComponent(error instanceof Error ? error.message : "Unable to save supplier category.");

export async function createSupplierCategoryAction(form: FormData) {
  const { profile } = await requirePermission("suppliers.create");
  let payload: ReturnType<typeof categoryPayload>;
  try { payload = categoryPayload(form, profile.id); }
  catch (error) { redirect(`${listPath}?error=${message(error)}`); }
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("supplier_categories").insert({ ...payload, created_by: profile.id }).select("id,category_level").single();
  if (error || !data) {
    console.error("Supplier category creation failed", { code: error?.code, message: error?.message });
    redirect(`${listPath}?error=${encodeURIComponent(error?.code === "23505" ? "A category with this name already exists under the selected parent." : "Unable to create supplier category.")}`);
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "supplier.category_created", module: "suppliers", entityType: "supplier_category", entityId: data.id, description: "Supplier category created.", newValues: { name: payload.name, parent_id: payload.parent_id, category_level: data.category_level } });
  revalidatePath(listPath);
  redirect(`${listPath}/${data.id}?success=Supplier%20category%20created.`);
}

export async function updateSupplierCategoryAction(id: string, form: FormData) {
  const { profile } = await requirePermission("suppliers.edit");
  let payload: ReturnType<typeof categoryPayload>;
  try { payload = categoryPayload(form, profile.id); }
  catch (error) { redirect(`${listPath}/${id}?error=${message(error)}`); }
  const db = createSupabaseAdminClient();
  const old = await db.from("supplier_categories").select("name,parent_id,category_level,is_active").eq("id", id).maybeSingle();
  const { error } = await db.from("supplier_categories").update(payload).eq("id", id);
  if (error) {
    console.error("Supplier category update failed", { code: error.code, message: error.message });
    const safe = /cycle|own parent|duplicate/i.test(error.message) ? error.message : "Unable to update supplier category.";
    redirect(`${listPath}/${id}?error=${encodeURIComponent(safe)}`);
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "supplier.category_updated", module: "suppliers", entityType: "supplier_category", entityId: id, description: "Supplier category updated.", oldValues: old.data, newValues: payload });
  revalidatePath(listPath);
  revalidatePath(`${listPath}/${id}`);
  redirect(`${listPath}/${id}?success=Supplier%20category%20updated.`);
}
