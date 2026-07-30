import test from "node:test";
import assert from "node:assert/strict";
import { parseDeviceEvent } from "../lib/hr/device-ingestion.ts";

test("device events require stable identifiers", () => {
  assert.throws(() => parseDeviceEvent({}));
});

test("device events normalize valid input without biometric payloads", () => {
  const result = parseDeviceEvent({
    eventUid: "evt-1",
    employeeExternalId: "EMP-1",
    eventType: "check_in",
    occurredAt: "2026-07-30T08:00:00Z",
  });
  assert.equal(result.eventType, "check_in");
  assert.equal("fingerprintImage" in result, false);
});
