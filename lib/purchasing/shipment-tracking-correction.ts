const correctableShipmentStatuses = new Set([
  "ready_for_shipment",
  "shipped",
  "received",
  "stock_received",
]);

export function canCorrectSupplierShipmentTracking(status: string) {
  return correctableShipmentStatuses.has(status);
}

export function normalizeSupplierShipmentTrackingCorrection(
  form: FormData,
  currentTrackingNumber: string | null,
) {
  const carrierId = String(form.get("carrier_id") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(carrierId)) {
    throw new Error("Carrier is invalid.");
  }
  const trackingNumber = String(form.get("tracking_number") ?? "").trim().slice(0, 200) || null;
  const reason = String(form.get("correction_reason") ?? "").trim().slice(0, 1000) || null;

  if (currentTrackingNumber?.trim() && !trackingNumber) {
    throw new Error("An existing tracking number cannot be cleared.");
  }

  return { carrierId, trackingNumber, reason };
}
