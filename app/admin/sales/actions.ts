"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { addressFromForm, jsonArray, optionalString, uuid } from "@/lib/orders/validation";

const target = (id: string, kind: "success" | "error", message: string) => `/admin/sales/${id}?${kind}=${encodeURIComponent(message)}`;
const safe = (message: string | undefined, fallback: string) => message && /sale|payment|amount|method|stock|draft|serial|document|permission|eligible/i.test(message) ? message : fallback;

export async function createSaleAction(form: FormData) {
  const { profile, permissions } = await requirePermission("sales.create");
  const db = createSupabaseAdminClient(), customerId = uuid(form.get("customer_id"), "Customer"), warehouseId = uuid(form.get("warehouse_id"), "Warehouse");
  const addressId = String(form.get("address_id") ?? "").trim(), items = jsonArray(form, "items");
  if (!items.length) redirect("/admin/sales/new?error=At%20least%20one%20product%20is%20required.");
  const hasPriceOverride = items.some((item) => Boolean(item.price_overridden));
  const hasDiscount = items.some((item) => Number(item.line_discount) > 0) || Number(form.get("discount_amount")) > 0;
  if (profile.role !== "admin" && hasPriceOverride && !permissions.has("sales.change_price")) redirect("/admin/sales/new?error=Price%20override%20permission%20is%20required.");
  if (profile.role !== "admin" && hasDiscount && !permissions.has("sales.apply_discount")) redirect("/admin/sales/new?error=Discount%20permission%20is%20required.");
  const address = addressId ? {} : addressFromForm(form), serviceAmount = Math.max(0, Number(form.get("service_amount") ?? 0));
  const adjustments = items.filter((item) => item.price_overridden || Number(item.line_discount) > 0).map((item) => ({
    order_item_id: null, adjustment_type: item.price_overridden ? "manual_unit_price" : "fixed_line_discount",
    previous_value: Number(item.catalogue_price ?? 0), new_value: item.price_overridden ? Number(item.unit_price) : Number(item.line_discount),
    reason: String(item.adjustment_reason || "Sales price adjustment").slice(0, 500),
  }));
  if (Number(form.get("discount_amount")) > 0) adjustments.push({ order_item_id: null, adjustment_type: "order_discount", previous_value: 0, new_value: Number(form.get("discount_amount")), reason: String(form.get("discount_reason") || "Order discount").slice(0, 500) });
  if (serviceAmount > 0) adjustments.push({ order_item_id: null, adjustment_type: "service_charge", previous_value: 0, new_value: serviceAmount, reason: "Installation or service charge" });
  const billingId = String(form.get("billing_address_id") ?? "").trim();
  const result = await db.rpc("create_minimal_sale", {
    actor_profile_id: profile.id, requested_customer_id: customerId, requested_address_id: addressId || null, requested_address: address,
    requested_billing_address_id: billingId || null, requested_billing_address: addressId ? null : address,
    requested_warehouse_id: warehouseId, requested_source: String(form.get("sales_source") ?? "direct_office"),
    requested_expected_delivery_date: String(form.get("expected_delivery_date") ?? "") || null,
    requested_discount: Number(form.get("discount_amount") ?? 0),
    requested_shipping: Number(form.get("shipping_amount") ?? 0), requested_tax: Number(form.get("tax_amount") ?? 0),
    requested_service: serviceAmount, requested_internal_notes: optionalString(form, "internal_notes", 2000),
    requested_customer_notes: optionalString(form, "customer_notes", 2000), requested_items: items, requested_adjustments: adjustments,
  });
  if (result.error || !result.data) redirect(`/admin/sales/new?error=${encodeURIComponent(safe(result.error?.message, "Unable to create sale."))}`);
  const saleId = String(result.data);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.created", module: "sales", entityType: "sales_order", entityId: saleId, targetProfileId: customerId, description: "Sale created.", newValues: { source: String(form.get("sales_source")), item_count: items.length } });
  revalidatePath("/admin/sales"); redirect(target(saleId, "success", "Draft sale created."));
}

export async function confirmSaleAction(saleId: string) {
  const { profile } = await requirePermission("sales.reserve_stock"), db = createSupabaseAdminClient();
  const result = await db.rpc("confirm_sales_order", { actor_profile_id: profile.id, requested_order_id: saleId });
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to confirm sale.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.confirmed", module: "sales", entityType: "sales_order", entityId: saleId, description: "Sale confirmed and inventory reserved." });
  revalidatePath("/admin/sales"); revalidatePath(`/admin/sales/${saleId}`); redirect(target(saleId, "success", "Sale confirmed and stock reserved."));
}

export async function cancelSaleAction(saleId: string, form: FormData) {
  const { profile } = await requirePermission("sales.cancel"), db = createSupabaseAdminClient(), reason = optionalString(form, "reason", 1000) ?? "Cancelled by staff";
  const result = await db.rpc("cancel_sales_order", { actor_profile_id: profile.id, requested_order_id: saleId, requested_reason: reason });
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to cancel sale.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.cancelled", module: "sales", entityType: "sales_order", entityId: saleId, description: "Sale cancelled and stock reservations released.", newValues: { reason } });
  revalidatePath("/admin/sales"); revalidatePath(`/admin/sales/${saleId}`); redirect(target(saleId, "success", "Sale cancelled and reservations released."));
}

export async function recordPaymentAction(saleId: string, form: FormData) {
  const { profile } = await requirePermission("sales.record_payment"), db = createSupabaseAdminClient();
  const amount = Number(form.get("amount"));
  const result = await db.rpc("record_sale_payment", { actor_profile_id: profile.id, requested_order_id: saleId, requested_amount: amount, requested_date: String(form.get("payment_date") || new Date().toISOString().slice(0, 10)), requested_method: String(form.get("method")), requested_reference: optionalString(form, "reference_number", 200), requested_note: optionalString(form, "internal_note", 1000) });
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to record payment.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.payment_recorded", module: "sales", entityType: "sales_order", entityId: saleId, description: "Customer payment recorded.", newValues: { amount, method: String(form.get("method")) } });
  revalidatePath("/admin/sales"); revalidatePath(`/admin/sales/${saleId}`); redirect(target(saleId, "success", "Payment recorded."));
}

export async function generateSaleDocumentAction(saleId: string, type: "invoice" | "delivery_challan") {
  const permission = type === "invoice" ? "sales.create_invoice" : "sales.create_delivery_challan";
  const { profile } = await requirePermission(permission), db = createSupabaseAdminClient();
  const result = await db.rpc("generate_sale_document", { actor_profile_id: profile.id, requested_order_id: saleId, requested_type: type });
  if (result.error || !result.data) redirect(target(saleId, "error", safe(result.error?.message, "Unable to generate document.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: `sale.${type}_generated`, module: "sales", entityType: "sales_order", entityId: saleId, description: `${type === "invoice" ? "Invoice" : "Delivery challan"} generated.` });
  revalidatePath(`/admin/sales/${saleId}`); redirect(`/admin/sales/${saleId}/documents/${result.data}`);
}

export async function createBasicCustomerAction(form: FormData) {
  const { profile } = await requirePermission("sales.create"), db = createSupabaseAdminClient();
  const email = String(form.get("email") ?? "").trim().toLowerCase(), fullName = String(form.get("full_name") ?? "").trim(), phone = optionalString(form, "phone", 50);
  if (!email || !fullName) redirect("/admin/sales/new?error=Customer%20name%20and%20email%20are%20required.");
  const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName, phone, role: "customer", status: "active" } });
  if (created.error || !created.data.user) redirect(`/admin/sales/new?error=${encodeURIComponent(safe(created.error?.message, "Unable to add customer."))}`);
  await db.from("profiles").update({ full_name: fullName, phone, role: "customer", status: "active" }).eq("id", created.data.user.id);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.customer_created", module: "sales", entityType: "profile", entityId: created.data.user.id, targetProfileId: created.data.user.id, description: "Basic customer created from Sales." });
  revalidatePath("/admin/sales/new"); redirect(`/admin/sales/new?success=${encodeURIComponent(`Customer ${fullName} added. They can use password recovery to set a password.`)}`);
}
