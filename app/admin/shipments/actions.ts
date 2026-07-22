"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonArray, optionalString, routePoints, uuid } from "@/lib/orders/validation";

const target = (id: string | null, kind: "success" | "error", message: string) => `${id ? `/admin/shipments/${id}` : "/admin/shipments"}?${kind}=${encodeURIComponent(message)}`;
const safe = (message: string) => /shipment|serial|packed|quantity|order|status|route|location|dispatch|eligible/i.test(message) ? message : "The shipment operation could not be completed.";

export async function createShipmentAction(orderId: string, form: FormData) {
  const { profile } = await requirePermission("shipments.create"); const db = createSupabaseAdminClient();
  try {
    const items = jsonArray(form, "items"), points = routePoints(jsonArray(form, "route_points")); if (!items.length) throw new Error("At least one shipment item is required.");
    const location = (prefix: string) => ({ label: String(form.get(`${prefix}_label`) ?? "").slice(0, 160), city: String(form.get(`${prefix}_city`) ?? "").slice(0, 120), country_code: String(form.get(`${prefix}_country_code`) ?? "").slice(0, 2).toUpperCase(), latitude: Number(form.get(`${prefix}_latitude`) || 0) || null, longitude: Number(form.get(`${prefix}_longitude`) || 0) || null });
    const optionalUuid = (key: string) => { const value = String(form.get(key) ?? "").trim(); return value ? uuid(value, key) : null; };
    const { data, error } = await db.rpc("create_order_shipment", { actor_profile_id: profile.id, requested_order_id: orderId, requested_transport_mode: String(form.get("transport_mode")), requested_origin_id: optionalUuid("origin_id"), requested_destination_id: optionalUuid("destination_id"), requested_origin: location("origin"), requested_destination: location("destination"), requested_estimated_departure: String(form.get("estimated_departure") ?? "") || null, requested_estimated_arrival: String(form.get("estimated_arrival") ?? "") || null, requested_package_count: Number(form.get("package_count") || 1), requested_weight: Number(form.get("weight") || 0) || null, requested_dimensions: optionalString(form, "dimensions", 300), requested_internal_notes: optionalString(form, "internal_notes", 2000), requested_customer_note: optionalString(form, "customer_note", 2000), requested_items: items, requested_route_points: points });
    if (error || !data) throw new Error(error?.message ?? "Unable to create shipment.");
    await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "shipment.created", module: "shipments", entityType: "shipment", entityId: String(data), description: "Order shipment created.", newValues: { order_id: orderId, item_count: items.length, transport_mode: form.get("transport_mode") } });
    revalidatePath(`/admin/orders/${orderId}`); redirect(target(String(data), "success", "Draft shipment created."));
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to create shipment."; console.error("Shipment create failed", { message }); redirect(target(null, "error", safe(message))); }
}

async function shipmentRpc(permission: string, action: string, shipmentId: string, rpc: string, message: string) {
  const { profile } = await requirePermission(permission); const db = createSupabaseAdminClient(); const { error } = await db.rpc(rpc, { actor_profile_id: profile.id, requested_shipment_id: shipmentId });
  if (error) redirect(target(shipmentId, "error", safe(error.message))); await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action, module: "shipments", entityType: "shipment", entityId: shipmentId, description: message }); revalidatePath(`/admin/shipments/${shipmentId}`); redirect(target(shipmentId, "success", message));
}
export async function confirmShipmentAction(id: string) { return shipmentRpc("shipments.edit", "shipment.confirmed", id, "confirm_order_shipment", "Shipment confirmed."); }
export async function dispatchShipmentAction(id: string) { return shipmentRpc("shipments.confirm_dispatch", "shipment.dispatched", id, "dispatch_order_shipment", "Shipment dispatched and inventory updated."); }

export async function addTrackingEventAction(shipmentId: string, form: FormData) {
  const { profile } = await requirePermission("shipments.update_status"); const db = createSupabaseAdminClient(); const location = { label: String(form.get("location_label") ?? "").slice(0, 160), latitude: Number(form.get("latitude") || 0) || null, longitude: Number(form.get("longitude") || 0) || null };
  const optionalUuid = (key: string) => { const value = String(form.get(key) ?? "").trim(); return value ? uuid(value, key) : null; };
  const { data, error } = await db.rpc("add_shipment_tracking_event", { actor_profile_id: profile.id, requested_shipment_id: shipmentId, requested_status_id: uuid(form.get("status_id"), "Tracking status"), requested_workplace_id: optionalUuid("workplace_id"), requested_location: location, requested_location_source: String(form.get("location_source") ?? "manual"), requested_internal_note: optionalString(form, "internal_note", 2000), requested_customer_title: optionalString(form, "customer_title", 200), requested_customer_message: optionalString(form, "customer_message", 2000), requested_visibility: String(form.get("visibility") ?? "both"), requested_occurred_at: String(form.get("occurred_at") ?? "") || null, requested_correction_reason: optionalString(form, "correction_reason", 1000), requested_supersedes_event_id: optionalUuid("supersedes_event_id") });
  if (error) redirect(target(shipmentId, "error", safe(error.message))); await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "shipment.tracking_updated", module: "shipments", entityType: "shipment_tracking_event", entityId: String(data), description: "Shipment tracking event recorded.", newValues: { shipment_id: shipmentId, visibility: form.get("visibility") } }); revalidatePath(`/admin/shipments/${shipmentId}`); redirect(target(shipmentId, "success", "Tracking event added."));
}

export async function markDeliveredAction(shipmentId: string, form: FormData) {
  const { profile } = await requirePermission("shipments.confirm_receipt"); const db = createSupabaseAdminClient(); const { error } = await db.rpc("mark_shipment_delivered", { actor_profile_id: profile.id, requested_shipment_id: shipmentId, requested_note: optionalString(form, "note", 1000) });
  if (error) redirect(target(shipmentId, "error", safe(error.message))); await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "shipment.delivered", module: "shipments", entityType: "shipment", entityId: shipmentId, description: "Shipment marked delivered." }); revalidatePath(`/admin/shipments/${shipmentId}`); redirect(target(shipmentId, "success", "Shipment marked delivered."));
}
