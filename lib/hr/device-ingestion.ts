import { createHash } from "node:crypto";
import { isValidTimeZone } from "./attendance.ts";

type DeviceEventInput = Record<string, unknown>;
const clean = (value: unknown, label: string, max = 160) => {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw new Error(`${label} is invalid.`);
  return result;
};

export function hashDeviceKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function parseDeviceEvent(input: DeviceEventInput) {
  const eventUid = clean(input.eventUid, "Event identifier");
  const employeeExternalId = clean(input.employeeExternalId, "Employee identifier", 120);
  const eventType = clean(input.eventType, "Event type", 20);
  if (eventType !== "check_in" && eventType !== "check_out") throw new Error("Event type is invalid.");
  const occurredAt = clean(input.occurredAt, "Event timestamp");
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error("Event timestamp is invalid.");
  const timezoneValue = String(input.timezone ?? "").trim();
  if (timezoneValue && !isValidTimeZone(timezoneValue)) throw new Error("Event timezone is invalid.");
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown> : {};
  return {
    eventUid,
    employeeExternalId,
    eventType,
    occurredAt: new Date(occurredAt).toISOString(),
    timezone: timezoneValue || null,
    metadata,
  };
}
