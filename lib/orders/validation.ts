import type { AddressSnapshot, RoutePoint } from "@/lib/orders/types";

export function requiredString(form: FormData, key: string, max = 500) {
  const value = String(form.get(key) ?? "").trim().slice(0, max);
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`);
  return value;
}

export function optionalString(form: FormData, key: string, max = 2000) {
  return String(form.get(key) ?? "").trim().slice(0, max) || null;
}

export function uuid(value: FormDataEntryValue | null, field: string) {
  const candidate = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) throw new Error(`${field} is invalid.`);
  return candidate;
}

export function jsonArray(form: FormData, key: string) {
  try { const value = JSON.parse(String(form.get(key) ?? "[]")); if (!Array.isArray(value)) throw new Error(); return value; }
  catch { throw new Error(`${key.replaceAll("_", " ")} is invalid.`); }
}

export function addressFromForm(form: FormData): AddressSnapshot {
  const number = (key: string) => { const raw = String(form.get(key) ?? "").trim(); return raw ? Number(raw) : null; };
  const latitude = number("latitude"), longitude = number("longitude");
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error("Latitude is invalid.");
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error("Longitude is invalid.");
  return {
    recipient_name: requiredString(form, "recipient_name", 160), phone: requiredString(form, "phone", 40),
    alternate_phone: optionalString(form, "alternate_phone", 40) ?? undefined,
    address_line_1: requiredString(form, "address_line_1", 240), address_line_2: optionalString(form, "address_line_2", 240) ?? undefined,
    area: optionalString(form, "area", 120) ?? undefined, city: requiredString(form, "city", 120), region: optionalString(form, "region", 120) ?? undefined,
    postal_code: optionalString(form, "postal_code", 30) ?? undefined, country_code: requiredString(form, "country_code", 2).toUpperCase(),
    delivery_instructions: optionalString(form, "delivery_instructions", 500) ?? undefined, latitude, longitude,
    map_label: optionalString(form, "map_label", 160) ?? undefined,
  };
}

export function routePoints(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((point) => ({
    label: String(point?.label ?? "Route point").slice(0, 160), point_type: String(point?.point_type ?? "estimated"),
    latitude: Number(point?.latitude), longitude: Number(point?.longitude), is_estimated: point?.is_estimated !== false, customer_visible: point?.customer_visible !== false,
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
}

