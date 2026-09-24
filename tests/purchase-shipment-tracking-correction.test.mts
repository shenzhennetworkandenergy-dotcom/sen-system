import assert from "node:assert/strict";
import test from "node:test";

type TrackingCorrectionModule = {
  canCorrectSupplierShipmentTracking?: (status: string) => boolean;
  normalizeSupplierShipmentTrackingCorrection?: (
    form: FormData,
    currentTrackingNumber: string | null,
  ) => {
    carrierId: string;
    trackingNumber: string | null;
    reason: string | null;
  };
};

async function loadTrackingCorrection(): Promise<TrackingCorrectionModule> {
  return import("../lib/purchasing/shipment-tracking-correction.ts").catch(() => ({}));
}

test("supplier shipment correction trims metadata and preserves an optional reason", async () => {
  const correctionApi = await loadTrackingCorrection();
  assert.equal(typeof correctionApi.normalizeSupplierShipmentTrackingCorrection, "function");

  const form = new FormData();
  form.set("carrier_id", "9d55eb4e-b847-45cb-952f-e237277b34a9");
  form.set("tracking_number", "  NEW123456789  ");
  form.set("correction_reason", "  Supplier sent a corrected reference.  ");

  assert.deepEqual(
    correctionApi.normalizeSupplierShipmentTrackingCorrection!(form, "OLD123"),
    {
      carrierId: "9d55eb4e-b847-45cb-952f-e237277b34a9",
      trackingNumber: "NEW123456789",
      reason: "Supplier sent a corrected reference.",
    },
  );
});

test("supplier shipment correction cannot clear an existing tracking number", async () => {
  const correctionApi = await loadTrackingCorrection();
  assert.equal(typeof correctionApi.normalizeSupplierShipmentTrackingCorrection, "function");

  const form = new FormData();
  form.set("carrier_id", "9d55eb4e-b847-45cb-952f-e237277b34a9");
  form.set("tracking_number", "   ");

  assert.throws(
    () => correctionApi.normalizeSupplierShipmentTrackingCorrection!(form, "SF6048156141520"),
    /cannot be cleared/i,
  );
});

test("tracking correction is limited to non-cancelled inbound shipment states", async () => {
  const correctionApi = await loadTrackingCorrection();
  assert.equal(typeof correctionApi.canCorrectSupplierShipmentTracking, "function");

  for (const status of ["ready_for_shipment", "shipped", "received", "stock_received"]) {
    assert.equal(correctionApi.canCorrectSupplierShipmentTracking!(status), true, status);
  }
  assert.equal(correctionApi.canCorrectSupplierShipmentTracking!("cancelled"), false);
  assert.equal(correctionApi.canCorrectSupplierShipmentTracking!("unknown"), false);
});
