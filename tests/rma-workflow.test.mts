import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionRma,
  calculateWarrantyEnd,
  isWarrantyEligible,
  rmaResolutions,
  rmaStatuses,
} from "../lib/rma/workflow.ts";

test("RMA lifecycle follows the approved simple workflow", () => {
  assert.deepEqual(rmaStatuses, [
    "submitted",
    "under_review",
    "return_requested",
    "product_received",
    "resolution_in_progress",
    "closed",
  ]);
  assert.equal(canTransitionRma("submitted", "under_review"), true);
  assert.equal(canTransitionRma("under_review", "return_requested"), true);
  assert.equal(canTransitionRma("return_requested", "product_received"), true);
  assert.equal(canTransitionRma("product_received", "resolution_in_progress"), true);
  assert.equal(canTransitionRma("resolution_in_progress", "closed"), true);
  assert.equal(canTransitionRma("submitted", "closed"), false);
});

test("every staff resolution offered by the RMA workspace is database-supported", () => {
  assert.deepEqual(rmaResolutions, [
    "repaired",
    "replaced",
    "refund_approved",
    "credit_issued",
    "claim_rejected",
    "no_fault_found",
    "damaged_beyond_repair_retired",
  ]);
});

test("warranty end preserves calendar behavior", () => {
  assert.equal(calculateWarrantyEnd("2026-01-15", 12), "2027-01-15");
  assert.equal(calculateWarrantyEnd("2024-02-29", 12), "2025-02-28");
});

test("only delivered covered quantities are customer-eligible", () => {
  assert.equal(isWarrantyEligible({ deliveredQuantity: 1, claimedQuantity: 0, warrantyEnd: "2099-01-01", now: "2026-08-01" }), true);
  assert.equal(isWarrantyEligible({ deliveredQuantity: 0, claimedQuantity: 0, warrantyEnd: "2099-01-01", now: "2026-08-01" }), false);
  assert.equal(isWarrantyEligible({ deliveredQuantity: 1, claimedQuantity: 1, warrantyEnd: "2099-01-01", now: "2026-08-01" }), false);
  assert.equal(isWarrantyEligible({ deliveredQuantity: 1, claimedQuantity: 0, warrantyEnd: "2026-07-31", now: "2026-08-01" }), false);
});
