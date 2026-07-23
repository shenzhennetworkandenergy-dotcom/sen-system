"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addressFromForm, jsonArray, optionalString, uuid } from "@/lib/orders/validation";

const orderTarget = (id: string | null, kind: "success" | "error", message: string) => `${id ? `/admin/orders/${id}` : "/admin/orders"}?${kind}=${encodeURIComponent(message)}`;
const safeMessage = (error: unknown, fallback: string) => error instanceof Error && /required|invalid|quantity|stock|serial|draft|confirmed|eligible|address|customer|price|currency|reservation/i.test(error.message) ? error.message : fallback;

export async function createOrderAction(form: FormData) {
  const { profile } = await requirePermission("orders.create");
  try {
    const customerId = uuid(form.get("customer_id"), "Customer"), warehouseId = uuid(form.get("warehouse_id"), "Warehouse"), addressId = String(form.get("address_id") ?? "").trim();
    const requestedAddress = addressId ? {} : addressFromForm(form), items = jsonArray(form, "items");
    if (!items.length) throw new Error("At least one order item is required.");
    const db = createSupabaseAdminClient();
    const { data, error } = await db.rpc("create_sales_order", {
      actor_profile_id: profile.id, requested_customer_id: customerId, requested_address_id: addressId || null, requested_address: requestedAddress,
      requested_warehouse_id: warehouseId, requested_currency: String(form.get("currency") ?? "BDT").slice(0, 3).toUpperCase(),
      requested_discount: Number(form.get("discount_amount") ?? 0), requested_shipping: Number(form.get("shipping_amount") ?? 0), requested_tax: Number(form.get("tax_amount") ?? 0),
      requested_internal_notes: optionalString(form, "internal_notes", 2000), requested_customer_notes: optionalString(form, "customer_notes", 2000), requested_items: items,
    });
    if (error || !data) throw new Error(error?.message ?? "Unable to create order.");
    const orderId = String(data);
    await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.created", module: "orders", entityType: "sales_order", entityId: orderId, targetProfileId: customerId, description: "Customer order created.", newValues: { customer_id: customerId, item_count: items.length } });
    if (form.get("intent") === "confirm") {
      const confirmed = await db.rpc("confirm_sales_order", { actor_profile_id: profile.id, requested_order_id: orderId });
      if (confirmed.error) throw new Error(confirmed.error.message);
      await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.confirmed", module: "orders", entityType: "sales_order", entityId: orderId, description: "Order confirmed and inventory reserved." });
    }
    revalidatePath("/admin/orders"); redirect(orderTarget(orderId, "success", form.get("intent") === "confirm" ? "Order created and confirmed." : "Draft order created."));
  } catch (error) { console.error("Order creation failed", { message: error instanceof Error ? error.message : "Unknown" }); redirect(orderTarget(null, "error", safeMessage(error, "Unable to create order."))); }
}

export async function confirmOrderAction(orderId: string) {
  const { profile } = await requirePermission("orders.confirm"); const db = createSupabaseAdminClient();
  const { error } = await db.rpc("confirm_sales_order", { actor_profile_id: profile.id, requested_order_id: orderId });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to confirm order.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.confirmed", module: "orders", entityType: "sales_order", entityId: orderId, description: "Order confirmed and inventory reserved." });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", "Order confirmed and stock reserved."));
}

export async function cancelOrderAction(orderId: string, form: FormData) {
  const { profile } = await requirePermission("orders.cancel"); const reason = optionalString(form, "reason", 1000) ?? "Cancelled by staff", db = createSupabaseAdminClient();
  const { error } = await db.rpc("cancel_sales_order", { actor_profile_id: profile.id, requested_order_id: orderId, requested_reason: reason });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to cancel order.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.cancelled", module: "orders", entityType: "sales_order", entityId: orderId, description: "Order cancelled and eligible reservations released.", newValues: { reason } });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", "Order cancelled."));
}

export async function allocateSerialsAction(orderId: string, orderItemId: string, form: FormData) {
  const { profile } = await requireAnyPermission(["orders.allocate", "sales.allocate_serials"]); const serialIds = [...new Set(form.getAll("serial_id").map(String))], method = ["manual", "scan", "auto", "replacement"].includes(String(form.get("method"))) ? String(form.get("method")) : "manual", db = createSupabaseAdminClient();
  const { error } = await db.rpc("allocate_order_serials", { actor_profile_id: profile.id, requested_order_item_id: orderItemId, requested_serial_ids: serialIds, requested_method: method });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to allocate serials.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.serials_allocated", module: "orders", entityType: "sales_order_item", entityId: orderItemId, description: "Serialized units allocated to order item.", newValues: { serial_count: serialIds.length, method } });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", `${serialIds.length} serial(s) allocated.`));
}

export async function autoAllocateSerialsAction(orderId: string, orderItemId: string) {
  const { profile } = await requireAnyPermission(["orders.allocate", "sales.allocate_serials"]); const db = createSupabaseAdminClient(); const { data, error } = await db.rpc("auto_allocate_order_serials", { actor_profile_id: profile.id, requested_order_item_id: orderItemId });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to auto-allocate serials.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.serials_auto_allocated", module: "orders", entityType: "sales_order_item", entityId: orderItemId, description: "Eligible serialized units were automatically allocated.", newValues: { count: data } });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", `${data ?? 0} serial(s) auto-allocated.`));
}

export async function releaseAllocationAction(orderId: string, allocationId: string, form: FormData) {
  const { profile } = await requireAnyPermission(["orders.allocate", "sales.allocate_serials"]); const reason = optionalString(form, "reason", 1000) ?? "Released for replacement", db = createSupabaseAdminClient();
  const { error } = await db.rpc("release_order_serial_allocation", { actor_profile_id: profile.id, requested_allocation_id: allocationId, requested_reason: reason });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to release allocation.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.serial_released", module: "orders", entityType: "order_serial_allocation", entityId: allocationId, description: "Serial allocation released.", newValues: { reason } });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", "Allocation released."));
}

export async function savePackingAction(orderId: string, form: FormData) {
  const { profile } = await requireAnyPermission(["orders.pack", "sales.edit"]); const db = createSupabaseAdminClient();
  let dimensions: Record<string, number> = {}; try { dimensions = JSON.parse(String(form.get("dimensions") ?? "{}")); } catch { redirect(orderTarget(orderId, "error", "Package dimensions are invalid.")); }
  const allocations = [...new Set(form.getAll("allocation_id").map(String))], nonserialized = jsonArray(form, "nonserialized_items");
  const { data, error } = await db.rpc("save_order_packing", { actor_profile_id: profile.id, requested_order_id: orderId, requested_package_reference: String(form.get("package_reference") ?? "").trim(), requested_allocation_ids: allocations, requested_nonserialized: nonserialized, requested_complete: form.get("complete") === "on", requested_weight: Number(form.get("weight") || 0) || null, requested_dimensions: dimensions, requested_notes: optionalString(form, "notes", 1000) });
  if (error) redirect(orderTarget(orderId, "error", safeMessage(new Error(error.message), "Unable to save packing.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "order.packing_saved", module: "orders", entityType: "order_package", entityId: String(data), description: "Order package saved.", newValues: { allocation_count: allocations.length, complete: form.get("complete") === "on" } });
  revalidatePath(`/admin/orders/${orderId}`); redirect(orderTarget(orderId, "success", "Packing saved."));
}
