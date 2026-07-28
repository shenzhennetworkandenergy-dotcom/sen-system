"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAllPermissions, requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonArray, optionalString, requiredString, uuid } from "@/lib/orders/validation";

const purchasingPath = "/admin/purchasing";
const target = (id: string | null, kind: "success" | "error", message: string) =>
  `${id ? `${purchasingPath}/${id}` : purchasingPath}?${kind}=${encodeURIComponent(message)}`;
const safeMessage = (message: string | undefined, fallback: string) =>
  message && /purchase|supplier|warehouse|product|variation|quantity|cost|amount|date|draft|approval|ordered|receive|serial|permission|stock/i.test(message)
    ? message
    : fallback;

function purchasePayload(form: FormData) {
  const items = jsonArray(form, "items");
  if (!items.length) throw new Error("At least one purchase item is required.");
  if (items.some((item) => !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1)) throw new Error("Purchase quantity must be a positive whole number.");
  return {
    requested_supplier_id: uuid(form.get("supplier_id"), "Supplier"),
    requested_warehouse_id: uuid(form.get("warehouse_id"), "Warehouse"),
    requested_currency: String(form.get("currency") ?? "BDT").trim().toUpperCase().slice(0, 3),
    requested_order_date: String(form.get("order_date") ?? "") || new Date().toISOString().slice(0, 10),
    requested_expected_date: String(form.get("expected_delivery_date") ?? "") || null,
    requested_supplier_reference: optionalString(form, "supplier_reference", 200),
    requested_payment_terms: Math.max(0, Math.min(365, Number(form.get("payment_terms_days") ?? 0))),
    requested_discount: Math.max(0, Number(form.get("discount_amount") ?? 0)),
    requested_shipping: Math.max(0, Number(form.get("shipping_amount") ?? 0)),
    requested_tax: Math.max(0, Number(form.get("tax_amount") ?? 0)),
    requested_other: Math.max(0, Number(form.get("other_amount") ?? 0)),
    requested_internal_notes: optionalString(form, "internal_notes", 2000),
    requested_supplier_notes: optionalString(form, "supplier_notes", 2000),
    requested_items: items,
  };
}

export async function createPurchaseOrderAction(form: FormData) {
  const { profile } = await requirePermission("purchasing.create");
  let purchaseId: string | null = null, errorMessage: string | null = null;
  try {
    const result = await createSupabaseAdminClient().rpc("create_purchase_order", {
      actor_profile_id: profile.id,
      ...purchasePayload(form),
    });
    if (result.error || !result.data) throw new Error(result.error?.message ?? "Unable to create purchase order.");
    purchaseId = String(result.data);
    await writeAuditLog({
      actorId: profile.id, actorRole: profile.role, action: "purchasing.created", module: "purchasing",
      entityType: "purchase_order", entityId: purchaseId, description: "Purchase order created.",
    });
  } catch (error) {
    console.error("Purchase order creation failed", { message: error instanceof Error ? error.message : "Unknown" });
    errorMessage = safeMessage(error instanceof Error ? error.message : undefined, "Unable to create purchase order.");
  }
  if (errorMessage || !purchaseId) redirect(`/admin/purchasing/new?error=${encodeURIComponent(errorMessage ?? "Unable to create purchase order.")}`);
  revalidatePath(purchasingPath);
  redirect(target(purchaseId, "success", "Draft purchase order created."));
}

export async function updatePurchaseOrderAction(purchaseId: string, form: FormData) {
  const { profile } = await requirePermission("purchasing.edit");
  let errorMessage: string | null = null;
  try {
    const result = await createSupabaseAdminClient().rpc("update_purchase_order", {
      actor_profile_id: profile.id,
      requested_order_id: purchaseId,
      ...purchasePayload(form),
    });
    if (result.error) throw new Error(result.error.message);
    await writeAuditLog({
      actorId: profile.id, actorRole: profile.role, action: "purchasing.updated", module: "purchasing",
      entityType: "purchase_order", entityId: purchaseId, description: "Draft purchase order updated.",
    });
  } catch (error) {
    console.error("Purchase order update failed", { message: error instanceof Error ? error.message : "Unknown", purchaseId });
    errorMessage = safeMessage(error instanceof Error ? error.message : undefined, "Unable to update purchase order.");
  }
  if (errorMessage) redirect(`/admin/purchasing/${purchaseId}/edit?error=${encodeURIComponent(errorMessage)}`);
  revalidatePath(purchasingPath);
  revalidatePath(`${purchasingPath}/${purchaseId}`);
  redirect(target(purchaseId, "success", "Purchase order updated."));
}

export async function transitionPurchaseOrderAction(purchaseId: string, action: "submit" | "approve" | "order" | "close" | "cancel", form: FormData) {
  const permission = action === "approve" || action === "order" ? "purchasing.approve" : action === "cancel" ? "purchasing.cancel" : "purchasing.edit";
  const { profile } = await requirePermission(permission);
  const note = optionalString(form, "note", 1000);
  const result = await createSupabaseAdminClient().rpc("transition_purchase_order", {
    actor_profile_id: profile.id, requested_order_id: purchaseId, requested_action: action, requested_note: note,
  });
  if (result.error) redirect(target(purchaseId, "error", safeMessage(result.error.message, "Unable to update purchase order.")));
  await writeAuditLog({
    actorId: profile.id, actorRole: profile.role, action: `purchasing.${action}`, module: "purchasing",
    entityType: "purchase_order", entityId: purchaseId, description: `Purchase order action completed: ${action}.`,
    newValues: { action, note },
  });
  revalidatePath(purchasingPath);
  revalidatePath(`${purchasingPath}/${purchaseId}`);
  revalidatePath("/admin/inventory");
  redirect(target(purchaseId, "success", `Purchase order ${action} completed.`));
}

export async function receivePurchaseOrderAction(purchaseId: string, form: FormData) {
  const { profile } = await requireAllPermissions(["purchasing.receive", "inventory.receive"]);
  let items: unknown[];
  try { items = jsonArray(form, "items"); }
  catch { redirect(target(purchaseId, "error", "Receipt items are invalid.")); }
  if (!items.length) redirect(target(purchaseId, "error", "Enter at least one received quantity."));
  const result = await createSupabaseAdminClient().rpc("receive_purchase_order", {
    actor_profile_id: profile.id,
    requested_order_id: purchaseId,
    requested_receipt_date: String(form.get("receipt_date") ?? "") || new Date().toISOString().slice(0, 10),
    requested_delivery_reference: optionalString(form, "supplier_delivery_reference", 200),
    requested_invoice_reference: optionalString(form, "supplier_invoice_reference", 200),
    requested_notes: optionalString(form, "notes", 1000),
    requested_items: items,
  });
  if (result.error || !result.data) redirect(target(purchaseId, "error", safeMessage(result.error?.message, "Unable to receive purchase order.")));
  revalidatePath(purchasingPath);
  revalidatePath(`${purchasingPath}/${purchaseId}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin/serials");
  redirect(target(purchaseId, "success", "Purchase receipt confirmed and inventory updated."));
}

export async function createSupplierAction(form: FormData) {
  const { profile } = await requirePermission("suppliers.create");
  let data: ReturnType<typeof supplierPayload>;
  try { data = supplierPayload(form, profile.id, true); }
  catch (error) { redirect(`/admin/suppliers?error=${encodeURIComponent(safeMessage(error instanceof Error ? error.message : undefined, "Unable to create supplier."))}`); }
  const result = await createSupabaseAdminClient().from("suppliers").insert(data).select("id").single();
  if (result.error || !result.data) redirect(`/admin/suppliers?error=${encodeURIComponent(safeMessage(result.error?.message, "Unable to create supplier."))}`);
  await writeAuditLog({
    actorId: profile.id, actorRole: profile.role, action: "supplier.created", module: "suppliers",
    entityType: "supplier", entityId: result.data.id, description: "Supplier created.", newValues: { code: data.code, name: data.name },
  });
  revalidatePath("/admin/suppliers");
  redirect(`/admin/suppliers/${result.data.id}?success=Supplier%20created.`);
}

export async function updateSupplierAction(supplierId: string, form: FormData) {
  const { profile } = await requirePermission("suppliers.edit");
  let data: ReturnType<typeof supplierPayload>;
  try { data = supplierPayload(form, profile.id, false); }
  catch (error) { redirect(`/admin/suppliers/${supplierId}?error=${encodeURIComponent(safeMessage(error instanceof Error ? error.message : undefined, "Unable to update supplier."))}`); }
  const db = createSupabaseAdminClient();
  const old = await db.from("suppliers").select("code,name,status").eq("id", supplierId).maybeSingle();
  const result = await db.from("suppliers").update(data).eq("id", supplierId);
  if (result.error) redirect(`/admin/suppliers/${supplierId}?error=${encodeURIComponent(safeMessage(result.error.message, "Unable to update supplier."))}`);
  await writeAuditLog({
    actorId: profile.id, actorRole: profile.role, action: "supplier.updated", module: "suppliers",
    entityType: "supplier", entityId: supplierId, description: "Supplier updated.", oldValues: old.data, newValues: { code: data.code, name: data.name, status: data.status },
  });
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
  redirect(`/admin/suppliers/${supplierId}?success=Supplier%20updated.`);
}

function supplierPayload(form: FormData, actorId: string, includeCreator: boolean) {
  const type = String(form.get("supplier_type") ?? "distributor");
  const status = String(form.get("status") ?? "active");
  if (!["manufacturer", "distributor", "reseller", "service_provider", "logistics", "other"].includes(type)) throw new Error("Supplier type is invalid.");
  if (!["active", "on_hold", "archived"].includes(status)) throw new Error("Supplier status is invalid.");
  const email = optionalString(form, "email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Supplier email is invalid.");
  const data = {
    code: requiredString(form, "code", 40).toUpperCase().replace(/[^A-Z0-9-]/g, "-"),
    name: requiredString(form, "name", 160),
    supplier_type: type,
    status,
    contact_person: optionalString(form, "contact_person", 160),
    email,
    phone: optionalString(form, "phone", 50),
    website_url: optionalString(form, "website_url", 300),
    country_code: requiredString(form, "country_code", 2).toUpperCase(),
    country_name: requiredString(form, "country_name", 100),
    address: optionalString(form, "address", 500),
    tax_registration: optionalString(form, "tax_registration", 120),
    payment_terms_days: Math.max(0, Math.min(365, Number(form.get("payment_terms_days") ?? 0))),
    default_currency: String(form.get("default_currency") ?? "BDT").trim().toUpperCase().slice(0, 3),
    lead_time_days: Math.max(0, Math.min(3650, Number(form.get("lead_time_days") ?? 0))),
    notes: optionalString(form, "notes", 2000),
    updated_by: actorId,
  };
  return includeCreator ? { ...data, created_by: actorId } : data;
}
